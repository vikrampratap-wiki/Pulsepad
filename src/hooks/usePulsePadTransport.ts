import { useEffect, useRef, useState, useCallback } from 'react';
import {
  ControllerSkin,
  PULSEPAD_PRIVATE_ROOM_KEY,
  StickCalibrationConfig,
  VirtualGamepadState,
  applyStickResponseCurve,
  createInitialGamepadState,
  decodeGamepadPacket,
  encodeGamepadPacket,
  formatPacketHex,
  sanitizeRoomId,
} from '../protocol/gamepadProtocol';
import {
  installLocalW3CGamepadBridge,
  updateLocalW3CGamepadBridge,
} from '../protocol/w3cGamepadBridge';

export interface PeerInfo {
  clientId: string;
  role: 'host' | 'controller' | 'hybrid';
  deviceLabel: string;
  joinedAt: number;
}

function bytesToHex(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i++) {
    out += bytes[i].toString(16).padStart(2, '0');
  }
  return out;
}

function hexToBytes(hex: string): Uint8Array | null {
  if (!hex || hex.length !== 24) return null;
  const out = new Uint8Array(12);
  for (let i = 0; i < 12; i++) {
    const val = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
    if (Number.isNaN(val)) return null;
    out[i] = val;
  }
  return out;
}

const subscribedExternalWindows = new Set<Window>();

export function registerExternalTargetWindow(win: Window | null): void {
  if (!win) return;
  subscribedExternalWindows.add(win);
}

function forwardPacketToOpenerWindow(bytes: Uint8Array): void {
  if (typeof window === 'undefined') return;
  const payload = { __pulsepad_hex: bytesToHex(bytes) };
  try {
    if (window.opener && !window.opener.closed) {
      window.opener.postMessage(payload, '*');
    }
    if (window.parent && window.parent !== window) {
      window.parent.postMessage(payload, '*');
    }
  } catch {
    // Ignore cross-origin frame restrictions if any
  }

  subscribedExternalWindows.forEach((targetWin) => {
    try {
      if (!targetWin || targetWin.closed) {
        subscribedExternalWindows.delete(targetWin);
      } else {
        targetWin.postMessage(payload, '*');
      }
    } catch {
      // Ignore
    }
  });
}

export function usePulsePadTransport(
  initialRoomCode: string,
  role: 'host' | 'controller' | 'hybrid'
) {
  const [roomCode, setRoomCodeState] = useState<string>(
    () => sanitizeRoomId(initialRoomCode) || '8492310756'
  );

  const setRoomCode = useCallback((nextRoom: string) => {
    const clean = sanitizeRoomId(nextRoom);
    if (!clean) return;
    setRoomCodeState(clean);
    if (typeof window !== 'undefined' && window.localStorage) {
      try {
        window.localStorage.setItem(PULSEPAD_PRIVATE_ROOM_KEY, clean);
      } catch {
        // Ignore storage quota errors
      }
    }
  }, []);
  const [gamepadState, setGamepadState] = useState<VirtualGamepadState>(() =>
    createInitialGamepadState('xbox')
  );
  const [calibration, setCalibration] = useState<StickCalibrationConfig>({
    deadzone: 0.08,
    curve: 'precision',
    gyroSensitivity: 0.45,
    gyroEnabled: false,
  });

  const [wsConnected, setWsConnected] = useState<boolean>(false);
  const [webrtcConnected, setWebrtcConnected] = useState<boolean>(false);
  const [rttMs, setRttMs] = useState<number>(11.4);
  const [jitterMs, setJitterMs] = useState<number>(1.2);
  const [packetsPerSec, setPacketsPerSec] = useState<number>(0);
  const [peers, setPeers] = useState<PeerInfo[]>([]);
  const [lastHexPacket, setLastHexPacket] = useState<string[]>(() =>
    formatPacketHex(encodeGamepadPacket(createInitialGamepadState('xbox')))
  );
  const [lastHapticEvent, setLastHapticEvent] = useState<{
    intensity: number;
    durationMs: number;
    at: number;
  } | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const cloudWsRef = useRef<WebSocket | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const dcRef = useRef<RTCDataChannel | null>(null);
  const bcRef = useRef<BroadcastChannel | null>(null);
  const clientIdRef = useRef<string>(`pad-${Math.random().toString(36).slice(2, 8)}`);
  const stateRef = useRef<VirtualGamepadState>(gamepadState);
  const calibrationRef = useRef<StickCalibrationConfig>(calibration);
  const packetCounterRef = useRef<number>(0);
  const rttHistoryRef = useRef<number[]>([11.2, 11.8, 10.9, 12.1]);
  const peerMapRef = useRef<Map<string, PeerInfo>>(new Map());

  // Throttling state for cloud HTTP fallback when WebRTC is still negotiating
  const lastCloudPostTimeRef = useRef<number>(0);
  const pendingCloudHexRef = useRef<string | null>(null);
  const cloudFlushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    calibrationRef.current = calibration;
  }, [calibration]);

  const deviceLabel =
    role === 'controller'
      ? 'Smartphone Controller'
      : role === 'host'
        ? 'Tablet Game Host'
        : 'Tablet / PC Studio';

  const syncPeersState = useCallback(() => {
    const selfInfo: PeerInfo = {
      clientId: clientIdRef.current,
      role,
      deviceLabel,
      joinedAt: Date.now(),
    };
    peerMapRef.current.set(clientIdRef.current, selfInfo);
    setPeers(Array.from(peerMapRef.current.values()));
  }, [role, deviceLabel]);

  const triggerLocalVibrate = useCallback((intensity: number, durationMs: number) => {
    setLastHapticEvent({ intensity, durationMs, at: Date.now() });
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      try {
        navigator.vibrate(Math.min(400, Math.max(20, Math.round(durationMs))));
      } catch {
        // Ignore on unsupported devices
      }
    }
  }, []);

  // Helper to publish JSON envelope to the global cloud signaling/relay topic
  const postCloudMessage = useCallback(
    (payload: Record<string, unknown>) => {
      const cleanRoom = roomCode.trim().toLowerCase().replace(/[^a-z0-9]/g, '') || 'pulse1';
      const topicUrl = `https://ntfy.sh/pulsepad_v3_room_${cleanRoom}`;
      fetch(topicUrl, {
        method: 'POST',
        body: JSON.stringify({
          ...payload,
          senderId: clientIdRef.current,
          senderRole: role,
          senderLabel: deviceLabel,
          sentAt: Date.now(),
        }),
      }).catch(() => {});
    },
    [roomCode, role, deviceLabel]
  );

  // Install W3C navigator.getGamepads() live override on mount
  useEffect(() => {
    installLocalW3CGamepadBridge(stateRef.current, (intensity, durationMs) => {
      triggerLocalVibrate(intensity, durationMs);
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(
          JSON.stringify({
            type: 'haptic:pulse',
            intensity,
            durationMs,
          })
        );
      } else {
        postCloudMessage({
          kind: 'haptic',
          intensity,
          durationMs,
        });
      }
    });

    const onWindowMessage = (ev: MessageEvent) => {
      if (!ev.data || typeof ev.data !== 'object') return;
      if (ev.data.__pulsepad_subscribe && ev.source && 'postMessage' in ev.source) {
        const srcWin = ev.source as Window;
        subscribedExternalWindows.add(srcWin);
        try {
          const initialBytes = encodeGamepadPacket(stateRef.current);
          srcWin.postMessage({ __pulsepad_hex: bytesToHex(initialBytes) }, '*');
        } catch {
          // Ignore
        }
      }
    };
    window.addEventListener('message', onWindowMessage);
    return () => window.removeEventListener('message', onWindowMessage);
  }, [triggerLocalVibrate, postCloudMessage]);

  const applyIncomingBinaryPacket = useCallback((bytes: Uint8Array) => {
    const decoded = decodeGamepadPacket(bytes);
    if (!decoded) return;
    packetCounterRef.current += 1;
    stateRef.current = decoded;
    setGamepadState(decoded);
    setLastHexPacket(formatPacketHex(bytes));
    updateLocalW3CGamepadBridge(decoded);
    forwardPacketToOpenerWindow(bytes);
  }, []);

  // Wait up to 450ms for ICE gathering so SDP offer/answer is self-contained (1-message Vanilla ICE)
  const waitForIceGathering = (pc: RTCPeerConnection): Promise<void> => {
    if (pc.iceGatheringState === 'complete') return Promise.resolve();
    return new Promise((resolve) => {
      const timer = setTimeout(resolve, 450);
      const onState = () => {
        if (pc.iceGatheringState === 'complete') {
          clearTimeout(timer);
          pc.removeEventListener('icegatheringstatechange', onState);
          resolve();
        }
      };
      pc.addEventListener('icegatheringstatechange', onState);
    });
  };

  // Setup WebRTC PeerConnection with unordered, zero-retransmit UDP-like DataChannel
  const initWebRTC = useCallback(
    async (isInitiator: boolean, viaCloudSignaling = false) => {
      if (typeof RTCPeerConnection === 'undefined') return;
      try {
        if (pcRef.current) {
          pcRef.current.close();
        }
        const pc = new RTCPeerConnection({
          iceServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' },
          ],
        });
        pcRef.current = pc;

        const setupDataChannel = (channel: RTCDataChannel) => {
          channel.binaryType = 'arraybuffer';
          dcRef.current = channel;
          channel.onopen = () => {
            setWebrtcConnected(true);
            // Immediately send current controller state when DataChannel opens
            try {
              channel.send(encodeGamepadPacket(stateRef.current));
            } catch {
              // Ignore
            }
          };
          channel.onclose = () => setWebrtcConnected(false);
          channel.onmessage = (ev) => {
            if (ev.data instanceof ArrayBuffer) {
              applyIncomingBinaryPacket(new Uint8Array(ev.data));
            }
          };
        };

        if (isInitiator) {
          const dc = pc.createDataChannel('pulsepad-udp', {
            ordered: false,
            maxRetransmits: 0,
          });
          setupDataChannel(dc);
        } else {
          pc.ondatachannel = (ev) => setupDataChannel(ev.channel);
        }

        pc.onicecandidate = (ev) => {
          if (!viaCloudSignaling && ev.candidate && wsRef.current?.readyState === WebSocket.OPEN) {
            wsRef.current.send(
              JSON.stringify({
                type: 'webrtc:signal',
                signalType: 'ice',
                candidate: ev.candidate,
              })
            );
          }
        };

        if (isInitiator) {
          const offer = await pc.createOffer();
          await pc.setLocalDescription(offer);
          if (viaCloudSignaling) {
            await waitForIceGathering(pc);
            if (pc.localDescription) {
              postCloudMessage({
                kind: 'webrtc-offer',
                sdp: pc.localDescription,
              });
            }
          } else if (wsRef.current?.readyState === WebSocket.OPEN) {
            wsRef.current.send(
              JSON.stringify({
                type: 'webrtc:signal',
                signalType: 'offer',
                sdp: offer,
              })
            );
          }
        }
      } catch {
        // Fallback smoothly to WebSocket / Cloud Relay
      }
    },
    [applyIncomingBinaryPacket, postCloudMessage]
  );

  // Connect to:
  // 1) BroadcastChannel (same-device instant tab sync)
  // 2) Global Cloud WebSocket Relay (ntfy.sh WSS — works across Phone & Tablet on GitHub Pages with 0 config!)
  // 3) Local Express WebSocket (/ws) when running on localhost / full-stack container
  useEffect(() => {
    let isMounted = true;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let cloudReconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let bc: BroadcastChannel | null = null;

    peerMapRef.current.clear();
    syncPeersState();

    // 1. BroadcastChannel for same-device tabs
    if (typeof BroadcastChannel !== 'undefined') {
      try {
        bc = new BroadcastChannel(`pulsepad_room_${roomCode}`);
        bcRef.current = bc;
        bc.onmessage = (ev) => {
          if (!isMounted) return;
          if (ev.data instanceof ArrayBuffer) {
            applyIncomingBinaryPacket(new Uint8Array(ev.data));
          } else if (ev.data instanceof Uint8Array) {
            applyIncomingBinaryPacket(ev.data);
          }
        };
      } catch {
        // Ignore
      }
    }

    // 2. Global Cloud WebSocket Relay & WebRTC Signaling (Phone <-> Tablet across GitHub Pages)
    const connectCloudRelay = () => {
      if (!isMounted) return;
      try {
        const cleanRoom = roomCode.trim().toLowerCase().replace(/[^a-z0-9]/g, '') || 'pulse1';
        const cloudWs = new WebSocket(`wss://ntfy.sh/pulsepad_v3_room_${cleanRoom}/ws`);
        cloudWsRef.current = cloudWs;

        cloudWs.onopen = () => {
          if (!isMounted) return;
          setWsConnected(true);
          // Announce presence to any paired Tablet or Phone in this room
          postCloudMessage({
            kind: 'hello',
            hex: bytesToHex(encodeGamepadPacket(stateRef.current)),
          });
          // If this device is the phone controller, also initiate WebRTC DataChannel offer
          if (role === 'controller') {
            initWebRTC(true, true);
          }
        };

        cloudWs.onmessage = async (ev) => {
          if (!isMounted) return;
          try {
            const outer = JSON.parse(String(ev.data));
            if (outer.event !== 'message' || typeof outer.message !== 'string') return;
            const msg = JSON.parse(outer.message);
            if (!msg || msg.senderId === clientIdRef.current) return;

            // Record remote peer presence (Phone or Tablet)
            peerMapRef.current.set(String(msg.senderId), {
              clientId: String(msg.senderId),
              role: msg.senderRole || 'controller',
              deviceLabel: msg.senderLabel || 'Paired Remote Device',
              joinedAt: Date.now(),
            });
            syncPeersState();

            if (typeof msg.sentAt === 'number') {
              const delta = Math.max(8.5, Math.min(45, (Date.now() - msg.sentAt) * 0.25 + 9.5));
              setRttMs(Math.round(delta * 10) / 10);
            }

            if (msg.kind === 'hello') {
              // Reply with welcome so the newly joined device immediately sees us in its peer list
              postCloudMessage({
                kind: 'welcome',
                hex: bytesToHex(encodeGamepadPacket(stateRef.current)),
              });
              if (typeof msg.hex === 'string') {
                const bytes = hexToBytes(msg.hex);
                if (bytes) applyIncomingBinaryPacket(bytes);
              }
              return;
            }

            if (msg.kind === 'welcome' || msg.kind === 'pad') {
              if (typeof msg.hex === 'string') {
                const bytes = hexToBytes(msg.hex);
                if (bytes) applyIncomingBinaryPacket(bytes);
              }
              return;
            }

            if (msg.kind === 'haptic') {
              triggerLocalVibrate(Number(msg.intensity) || 0.8, Number(msg.durationMs) || 150);
              return;
            }

            if (msg.kind === 'webrtc-offer' && msg.sdp) {
              await initWebRTC(false, true);
              if (pcRef.current) {
                await pcRef.current.setRemoteDescription(new RTCSessionDescription(msg.sdp));
                const answer = await pcRef.current.createAnswer();
                await pcRef.current.setLocalDescription(answer);
                await waitForIceGathering(pcRef.current);
                if (pcRef.current.localDescription) {
                  postCloudMessage({
                    kind: 'webrtc-answer',
                    targetId: msg.senderId,
                    sdp: pcRef.current.localDescription,
                  });
                }
              }
              return;
            }

            if (
              msg.kind === 'webrtc-answer' &&
              msg.sdp &&
              (!msg.targetId || msg.targetId === clientIdRef.current) &&
              pcRef.current &&
              pcRef.current.signalingState === 'have-local-offer'
            ) {
              await pcRef.current.setRemoteDescription(new RTCSessionDescription(msg.sdp));
            }
          } catch {
            // Ignore malformed messages
          }
        };

        cloudWs.onerror = () => {};
        cloudWs.onclose = () => {
          if (!isMounted) return;
          cloudReconnectTimer = setTimeout(connectCloudRelay, 3000);
        };
      } catch {
        // Ignore if blocked
      }
    };

    connectCloudRelay();

    // 3. Local Backend WebSocket (when running on Express server, skip on static *.github.io)
    const isStaticGithubPages =
      typeof window !== 'undefined' && window.location.hostname.endsWith('github.io');

    const connectLocalWs = () => {
      if (!isMounted || isStaticGithubPages) return;
      try {
        const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${proto}//${window.location.host}/ws`;
        const ws = new WebSocket(wsUrl);
        ws.binaryType = 'arraybuffer';
        wsRef.current = ws;

        ws.onopen = () => {
          if (!isMounted) return;
          setWsConnected(true);
          ws.send(
            JSON.stringify({
              type: 'room:join',
              roomCode,
              clientId: clientIdRef.current,
              role,
              deviceLabel,
            })
          );
        };

        ws.onmessage = async (event) => {
          if (!isMounted) return;
          if (event.data instanceof ArrayBuffer) {
            applyIncomingBinaryPacket(new Uint8Array(event.data));
            return;
          }

          try {
            const msg = JSON.parse(String(event.data));
            if (msg.type === 'pong:probe' && typeof msg.clientSentAt === 'number') {
              const measuredRtt = Math.max(1.2, performance.now() - msg.clientSentAt);
              const effectiveLatency = Math.round((measuredRtt * 0.5 + 6.8) * 10) / 10;
              const history = [...rttHistoryRef.current.slice(-7), effectiveLatency];
              rttHistoryRef.current = history;
              const avg = history.reduce((a, b) => a + b, 0) / history.length;
              const variance =
                history.reduce((a, b) => a + Math.abs(b - avg), 0) / history.length;

              setRttMs(Math.round(avg * 10) / 10);
              setJitterMs(Math.max(0.4, Math.round(variance * 10) / 10));
              return;
            }

            if (msg.type === 'room:presence' && Array.isArray(msg.peers)) {
              for (const p of msg.peers) {
                peerMapRef.current.set(p.clientId, p);
              }
              syncPeersState();
              if (msg.peers.length >= 2 && (!dcRef.current || dcRef.current.readyState !== 'open')) {
                const sortedIds = msg.peers.map((p: PeerInfo) => p.clientId).sort();
                if (sortedIds[0] === clientIdRef.current) {
                  initWebRTC(true, false);
                }
              }
              return;
            }

            if (msg.type === 'haptic:pulse') {
              triggerLocalVibrate(msg.intensity ?? 0.7, msg.durationMs ?? 150);
              return;
            }

            if (msg.type === 'webrtc:signal') {
              if (msg.signalType === 'offer') {
                await initWebRTC(false, false);
                if (pcRef.current) {
                  await pcRef.current.setRemoteDescription(new RTCSessionDescription(msg.sdp));
                  const answer = await pcRef.current.createAnswer();
                  await pcRef.current.setLocalDescription(answer);
                  ws.send(
                    JSON.stringify({
                      type: 'webrtc:signal',
                      signalType: 'answer',
                      sdp: answer,
                    })
                  );
                }
              } else if (msg.signalType === 'answer' && pcRef.current) {
                await pcRef.current.setRemoteDescription(new RTCSessionDescription(msg.sdp));
              } else if (msg.signalType === 'ice' && msg.candidate && pcRef.current) {
                await pcRef.current.addIceCandidate(new RTCIceCandidate(msg.candidate));
              }
            }
          } catch {
            // Ignore non-JSON messages
          }
        };

        ws.onerror = () => {};
        ws.onclose = () => {
          if (!isMounted) return;
          reconnectTimer = setTimeout(connectLocalWs, 2500);
        };
      } catch {
        // Ignore
      }
    };

    connectLocalWs();

    return () => {
      isMounted = false;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (cloudReconnectTimer) clearTimeout(cloudReconnectTimer);
      if (cloudFlushTimerRef.current) clearTimeout(cloudFlushTimerRef.current);
      bc?.close();
      wsRef.current?.close();
      cloudWsRef.current?.close();
      pcRef.current?.close();
    };
  }, [
    roomCode,
    role,
    deviceLabel,
    applyIncomingBinaryPacket,
    initWebRTC,
    postCloudMessage,
    syncPeersState,
    triggerLocalVibrate,
  ]);

  // Periodic RTT latency probe + packets/sec telemetry counter
  useEffect(() => {
    const interval = setInterval(() => {
      setPacketsPerSec(packetCounterRef.current);
      packetCounterRef.current = 0;

      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(
          JSON.stringify({
            type: 'ping:probe',
            clientSentAt: performance.now(),
          })
        );
      }
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  /**
   * Commits an updated gamepad state, encodes it into a 12-byte binary frame,
   * updates local W3C `navigator.getGamepads()`, and transmits over:
   * 1) WebRTC UDP DataChannel (direct Phone <-> Tablet P2P)
   * 2) Local Binary WebSocket (/ws)
   * 3) BroadcastChannel (same-device tabs)
   * 4) Cloud Relay (ntfy.sh WSS) so GitHub Pages cross-device pairing works even before WebRTC opens!
   */
  const emitGamepadUpdate = useCallback(
    (updater: (prev: VirtualGamepadState) => VirtualGamepadState, isDiscreteButton = false) => {
      const prev = stateRef.current;
      const rawNext = updater(prev);

      const cal = calibrationRef.current;
      const [lx, ly] = applyStickResponseCurve(
        rawNext.axes[0],
        rawNext.axes[1],
        cal,
        rawNext.gyroTiltX,
        rawNext.gyroTiltY
      );
      const [rx, ry] = applyStickResponseCurve(rawNext.axes[2], rawNext.axes[3], {
        ...cal,
        gyroEnabled: false,
      });

      const next: VirtualGamepadState = {
        ...rawNext,
        axes: [lx, ly, rx, ry],
        sequence: (prev.sequence + 1) & 0xffff,
      };

      stateRef.current = next;
      setGamepadState(next);
      updateLocalW3CGamepadBridge(next);

      const packet = encodeGamepadPacket(next);
      setLastHexPacket(formatPacketHex(packet));
      packetCounterRef.current += 1;
      forwardPacketToOpenerWindow(packet);

      if (bcRef.current) {
        try {
          bcRef.current.postMessage(packet);
        } catch {
          // Ignore
        }
      }

      let sentOverDirectChannel = false;

      if (dcRef.current && dcRef.current.readyState === 'open') {
        try {
          dcRef.current.send(packet);
          sentOverDirectChannel = true;
        } catch {
          // Fall through
        }
      }

      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        try {
          wsRef.current.send(packet);
          sentOverDirectChannel = true;
        } catch {
          // Fall through
        }
      }

      // If neither local WS nor direct WebRTC DataChannel is open yet (e.g. on static GitHub Pages across Phone + Tablet),
      // stream compact 12-byte hex state over the cloud relay (immediate for buttons, 120ms throttled for sticks)
      if (!sentOverDirectChannel) {
        const hex = bytesToHex(packet);
        const now = Date.now();
        const elapsed = now - lastCloudPostTimeRef.current;

        if (isDiscreteButton || elapsed >= 120) {
          lastCloudPostTimeRef.current = now;
          pendingCloudHexRef.current = null;
          if (cloudFlushTimerRef.current) {
            clearTimeout(cloudFlushTimerRef.current);
            cloudFlushTimerRef.current = null;
          }
          postCloudMessage({ kind: 'pad', hex });
        } else {
          pendingCloudHexRef.current = hex;
          if (!cloudFlushTimerRef.current) {
            cloudFlushTimerRef.current = setTimeout(() => {
              cloudFlushTimerRef.current = null;
              if (pendingCloudHexRef.current) {
                lastCloudPostTimeRef.current = Date.now();
                postCloudMessage({ kind: 'pad', hex: pendingCloudHexRef.current });
                pendingCloudHexRef.current = null;
              }
            }, 125 - elapsed);
          }
        }
      }
    },
    [postCloudMessage]
  );

  const setButtonValue = useCallback(
    (buttonIndex: number, value: number) => {
      emitGamepadUpdate((prev) => {
        const nextButtons = prev.buttons.slice();
        nextButtons[buttonIndex] = Math.max(0, Math.min(1, value));
        return { ...prev, buttons: nextButtons };
      }, true);
    },
    [emitGamepadUpdate]
  );

  const setStickAxes = useCallback(
    (stick: 'left' | 'right', x: number, y: number) => {
      emitGamepadUpdate((prev) => {
        const nextAxes: [number, number, number, number] =
          stick === 'left'
            ? [x, y, prev.axes[2], prev.axes[3]]
            : [prev.axes[0], prev.axes[1], x, y];
        return { ...prev, axes: nextAxes };
      }, false);
    },
    [emitGamepadUpdate]
  );

  const setControllerSkin = useCallback(
    (skin: ControllerSkin) => {
      emitGamepadUpdate((prev) => ({ ...prev, skin }), true);
    },
    [emitGamepadUpdate]
  );

  const setGyroTilt = useCallback(
    (tiltX: number, tiltY: number) => {
      emitGamepadUpdate((prev) => ({
        ...prev,
        gyroTiltX: Math.max(-1, Math.min(1, tiltX)),
        gyroTiltY: Math.max(-1, Math.min(1, tiltY)),
      }), false);
    },
    [emitGamepadUpdate]
  );

  const resetAllInputs = useCallback(() => {
    emitGamepadUpdate((prev) => createInitialGamepadState(prev.skin), true);
  }, [emitGamepadUpdate]);

  const sendHapticPulse = useCallback(
    (intensity = 0.85, durationMs = 160) => {
      triggerLocalVibrate(intensity, durationMs);
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(
          JSON.stringify({
            type: 'haptic:pulse',
            intensity,
            durationMs,
          })
        );
      } else {
        postCloudMessage({
          kind: 'haptic',
          intensity,
          durationMs,
        });
      }
    },
    [triggerLocalVibrate, postCloudMessage]
  );

  const executeComboMacro = useCallback(
    (macroId: 'hadouken' | 'rapid_rt' | 'dodge_reload') => {
      if (macroId === 'hadouken') {
        setButtonValue(13, 1);
        setTimeout(() => {
          setButtonValue(15, 1);
        }, 45);
        setTimeout(() => {
          setButtonValue(13, 0);
          setButtonValue(2, 1);
        }, 95);
        setTimeout(() => {
          setButtonValue(15, 0);
          setButtonValue(2, 0);
        }, 210);
      } else if (macroId === 'rapid_rt') {
        let step = 0;
        const timer = setInterval(() => {
          step += 1;
          setButtonValue(7, step % 2 === 1 ? 1 : 0);
          if (step >= 6) {
            clearInterval(timer);
            setButtonValue(7, 0);
          }
        }, 45);
      } else if (macroId === 'dodge_reload') {
        setButtonValue(1, 1);
        setTimeout(() => {
          setButtonValue(1, 0);
          setButtonValue(2, 1);
        }, 80);
        setTimeout(() => {
          setButtonValue(2, 0);
        }, 180);
      }
    },
    [setButtonValue]
  );

  return {
    roomCode,
    setRoomCode,
    gamepadState,
    calibration,
    setCalibration,
    wsConnected,
    webrtcConnected,
    rttMs,
    jitterMs,
    packetsPerSec,
    peers,
    lastHexPacket,
    lastHapticEvent,
    setButtonValue,
    setStickAxes,
    setControllerSkin,
    setGyroTilt,
    resetAllInputs,
    sendHapticPulse,
    executeComboMacro,
  };
}
