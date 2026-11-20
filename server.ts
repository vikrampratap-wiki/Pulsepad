import express from 'express';
import { createServer } from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import { WebSocketServer, WebSocket } from 'ws';
import { createServer as createViteServer } from 'vite';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface ClientMeta {
  ws: WebSocket;
  clientId: string;
  roomCode: string;
  role: 'host' | 'controller' | 'hybrid';
  deviceLabel: string;
  joinedAt: number;
}

const rooms = new Map<string, Map<string, ClientMeta>>();
const roomLastBinaryFrame = new Map<string, Uint8Array>();

function getOrCreateRoom(roomCode: string): Map<string, ClientMeta> {
  const normalized = roomCode.trim().toUpperCase();
  let room = rooms.get(normalized);
  if (!room) {
    room = new Map();
    rooms.set(normalized, room);
  }
  return room;
}

function broadcastPresence(roomCode: string) {
  const normalized = roomCode.trim().toUpperCase();
  const room = rooms.get(normalized);
  if (!room) return;

  const peers = Array.from(room.values()).map((c) => ({
    clientId: c.clientId,
    role: c.role,
    deviceLabel: c.deviceLabel,
    joinedAt: c.joinedAt,
  }));

  const payload = JSON.stringify({
    type: 'room:presence',
    roomCode: normalized,
    peers,
    timestamp: Date.now(),
  });

  for (const peer of room.values()) {
    if (peer.ws.readyState === WebSocket.OPEN) {
      peer.ws.send(payload);
    }
  }
}

async function startServer() {
  const app = express();
  const httpServer = createServer(app);
  const PORT = Number(process.env.PORT) || 3000;

  app.use(express.json());

  // Health & room stats endpoint
  app.get('/api/health', (_req, res) => {
    res.json({
      status: 'ok',
      activeRooms: rooms.size,
      transport: 'WebRTC-DataChannel + Binary-WS-12Byte',
    });
  });

  // External Cloud Gaming W3C Gamepad Bridge script for Xbox Cloud Gaming / GeForce NOW / Web Games
  app.get('/api/bridge.js', (req, res) => {
    const room = String(req.query.room || 'PULSE1').toUpperCase().replace(/[^A-Z0-9]/g, '');
    const hostHeader = req.get('host') || `localhost:${PORT}`;
    const proto = req.headers['x-forwarded-proto'] === 'https' ? 'wss' : 'ws';
    const wsUrl = `${proto}://${hostHeader}/ws`;

    res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.send(`
(function() {
  if (window.__PULSEPAD_BRIDGE_ACTIVE__) {
    console.log('[PulsePad] Bridge already active for room ${room}');
    return;
  }
  window.__PULSEPAD_BRIDGE_ACTIVE__ = true;
  const ROOM = ${JSON.stringify(room)};
  const WS_URL = ${JSON.stringify(wsUrl)};
  const state = {
    buttons: Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 })),
    axes: [0, 0, 0, 0],
    timestamp: performance.now(),
    skin: 'xbox'
  };

  function createVirtualGamepad() {
    return {
      id: 'Xbox Series X|S Wireless Controller (STANDARD GAMEPAD Vendor: 045e Product: 0b12)',
      index: 0,
      connected: true,
      mapping: 'standard',
      timestamp: state.timestamp,
      axes: state.axes.slice(),
      buttons: state.buttons.map(b => ({ pressed: b.pressed, touched: b.touched, value: b.value })),
      vibrationActuator: {
        type: 'dual-rumble',
        playEffect: function() { return Promise.resolve('complete'); }
      }
    };
  }

  navigator.getGamepads = function() {
    return [createVirtualGamepad(), null, null, null];
  };

  const ws = new WebSocket(WS_URL);
  ws.binaryType = 'arraybuffer';
  ws.onopen = function() {
    ws.send(JSON.stringify({
      type: 'room:join',
      roomCode: ROOM,
      clientId: 'cloud-bridge-' + Math.random().toString(36).slice(2, 7),
      role: 'host',
      deviceLabel: 'Xbox Cloud / Browser Game Bridge'
    }));
    const ev = new Event('gamepadconnected');
    ev.gamepad = createVirtualGamepad();
    window.dispatchEvent(ev);
    console.log('[PulsePad] Virtual Xbox Controller Connected to Room: ' + ROOM);
  };
  ws.onmessage = function(event) {
    if (event.data instanceof ArrayBuffer && event.data.byteLength >= 12) {
      const view = new DataView(event.data);
      if (view.getUint8(0) !== 0x50) return;
      const flags = view.getUint8(1);
      const mask = view.getUint16(2, true);
      for (let i = 0; i < 16; i++) {
        const pressed = (mask & (1 << i)) !== 0;
        state.buttons[i] = { pressed, touched: pressed, value: pressed ? 1 : 0 };
      }
      const lt = view.getUint8(8) / 255;
      const rt = view.getUint8(9) / 255;
      state.buttons[6] = { pressed: lt > 0.1, touched: lt > 0.05, value: lt };
      state.buttons[7] = { pressed: rt > 0.1, touched: rt > 0.05, value: rt };
      const guide = (flags & 1) !== 0;
      state.buttons[16] = { pressed: guide, touched: guide, value: guide ? 1 : 0 };
      state.axes[0] = view.getInt8(4) / 127;
      state.axes[1] = view.getInt8(5) / 127;
      state.axes[2] = view.getInt8(6) / 127;
      state.axes[3] = view.getInt8(7) / 127;
      state.timestamp = performance.now();
    }
  };
})();
    `.trim());
  });

  // WebSocket Server on /ws for sub-15ms binary relay + WebRTC P2P signaling
  const wss = new WebSocketServer({ server: httpServer, path: '/ws' });

  // WebSocket Server on port 8088 (explicitly whitelisted by play.xbox.com CSP connect-src)
  let ws8088: WebSocketServer | null = null;
  try {
    ws8088 = new WebSocketServer({ port: 8088 });
    ws8088.on('connection', (ws) => {
      ws.on('message', (data, isBinary) => {
        const bytes =
          data instanceof Buffer
            ? new Uint8Array(data.buffer, data.byteOffset, data.byteLength)
            : new Uint8Array(data as ArrayBuffer);
        if (bytes.length !== 12 || bytes[0] !== 0x50) return;
        if (ws8088) {
          const hex = Buffer.from(bytes).toString('hex');
          for (const client of ws8088.clients) {
            if (client !== ws && client.readyState === WebSocket.OPEN) {
              client.send(hex);
            }
          }
        }
        for (const room of rooms.values()) {
          for (const peer of room.values()) {
            if (peer.ws.readyState === WebSocket.OPEN) {
              peer.ws.send(bytes, { binary: true });
            }
          }
        }
      });
    });
    ws8088.on('error', () => {
      ws8088 = null;
    });
  } catch {
    ws8088 = null;
  }

  wss.on('connection', (ws) => {
    let currentMeta: ClientMeta | null = null;

    ws.on('message', (data, isBinary) => {
      // Fast-path: 12-byte binary gamepad packet -> zero-copy broadcast to room peers
      if (isBinary) {
        if (!currentMeta) return;
        const room = rooms.get(currentMeta.roomCode);
        if (!room) return;

        const bytes =
          data instanceof Buffer
            ? new Uint8Array(data.buffer, data.byteOffset, data.byteLength)
            : new Uint8Array(data as ArrayBuffer);

        roomLastBinaryFrame.set(currentMeta.roomCode, bytes);

        for (const peer of room.values()) {
          if (peer.clientId !== currentMeta.clientId && peer.ws.readyState === WebSocket.OPEN) {
            peer.ws.send(bytes, { binary: true });
          }
        }

        if (ws8088) {
          const hex = Buffer.from(bytes).toString('hex');
          for (const client of ws8088.clients) {
            if (client.readyState === WebSocket.OPEN) {
              client.send(hex);
            }
          }
        }
        return;
      }

      // Control / Signaling JSON messages
      try {
        const msg = JSON.parse(data.toString());

        if (msg.type === 'ping:probe') {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(
              JSON.stringify({
                type: 'pong:probe',
                clientSentAt: msg.clientSentAt,
                serverTime: Date.now(),
              })
            );
          }
          return;
        }

        if (msg.type === 'room:join') {
          const roomCode = String(msg.roomCode || 'PULSE1').trim().toUpperCase();
          const clientId = String(msg.clientId || `peer-${Math.random().toString(36).slice(2, 8)}`);
          const role = msg.role === 'controller' || msg.role === 'host' ? msg.role : 'hybrid';
          const deviceLabel = String(msg.deviceLabel || 'Web Device');

          // Remove from previous room if switching
          if (currentMeta && currentMeta.roomCode !== roomCode) {
            const oldRoom = rooms.get(currentMeta.roomCode);
            if (oldRoom) {
              oldRoom.delete(currentMeta.clientId);
              broadcastPresence(currentMeta.roomCode);
            }
          }

          const room = getOrCreateRoom(roomCode);
          currentMeta = {
            ws,
            clientId,
            roomCode,
            role,
            deviceLabel,
            joinedAt: Date.now(),
          };
          room.set(clientId, currentMeta);

          // Send latest binary state if available so new joins are immediately synced
          const lastBinary = roomLastBinaryFrame.get(roomCode);
          if (lastBinary && ws.readyState === WebSocket.OPEN) {
            ws.send(lastBinary, { binary: true });
          }

          broadcastPresence(roomCode);
          return;
        }

        // Forward WebRTC SDP Offers/Answers/ICE candidates & Haptic Rumble to room peers
        if (
          currentMeta &&
          (msg.type === 'webrtc:signal' ||
            msg.type === 'haptic:pulse' ||
            msg.type === 'macro:trigger')
        ) {
          const room = rooms.get(currentMeta.roomCode);
          if (!room) return;
          const outbound = JSON.stringify({
            ...msg,
            senderId: currentMeta.clientId,
          });
          for (const peer of room.values()) {
            if (peer.clientId !== currentMeta.clientId && peer.ws.readyState === WebSocket.OPEN) {
              peer.ws.send(outbound);
            }
          }
        }
      } catch {
        // Ignore malformed control payloads
      }
    });

    ws.on('close', () => {
      if (currentMeta) {
        const room = rooms.get(currentMeta.roomCode);
        if (room) {
          room.delete(currentMeta.clientId);
          if (room.size === 0) {
            rooms.delete(currentMeta.roomCode);
            roomLastBinaryFrame.delete(currentMeta.roomCode);
          } else {
            broadcastPresence(currentMeta.roomCode);
          }
        }
      }
    });
  });

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`PulsePad Low-Latency Server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer();
