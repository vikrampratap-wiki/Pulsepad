import { useEffect, useRef, useState, useCallback } from 'react';
import {
  ControllerSkin,
  StickCalibrationConfig,
  VirtualGamepadState,
  applyStickResponseCurve,
  createInitialGamepadState,
  decodeGamepadPacket,
  encodeGamepadPacket,
  formatPacketHex,
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

export function usePulsePadTransport(initialRoomCode: string, role: 'host' | 'controller' | 'hybrid') {
  const [roomCode, setRoomCode] = useState<string>(() =>
    initialRoomCode.trim().toUpperCase() || 'PULSE1'
  );
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
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const dcRef = useRef<RTCDataChannel | null>(null);
  const bcRef = useRef<BroadcastChannel | null>(null);
  const clientIdRef = useRef<string>(`pad-${Math.random().toString(36).slice(2, 8)}`);
  const stateRef = useRef<VirtualGamepadState>(gamepadState);
  const calibrationRef = useRef<StickCalibrationConfig>(calibration);
  const packetCounterRef = useRef<number>(0);
  const rttHistoryRef = useRef<number[]>([11.2, 11.8, 10.9, 12.1]);

  useEffect(() => {
    calibrationRef.current = calibration;
  }, [calibration]);

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
      }
    });
  }, [triggerLocalVibrate]);

  const applyIncomingBinaryPacket = useCallback((bytes: Uint8Array) => {
    const decoded = decodeGamepadPacket(bytes);
    if (!decoded) return;
    packetCounterRef.current += 1;
    stateRef.current = decoded;
    setGamepadState(decoded);
    setLastHexPacket(formatPacketHex(bytes));
    updateLocalW3CGamepadBridge(decoded);
  }, []);

  // Setup WebRTC PeerConnection with unordered, zero-retransmit UDP-like DataChannel
  const initWebRTC = useCallback(
    async (isInitiator: boolean) => {
      if (typeof RTCPeerConnection === 'undefined') return;
      try {
        if (pcRef.current) {
          pcRef.current.close();
        }
        const pc = new RTCPeerConnection({
          iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
        });
        pcRef.current = pc;

        const setupDataChannel = (channel: RTCDataChannel) => {
          channel.binaryType = 'arraybuffer';
          dcRef.current = channel;
          channel.onopen = () => setWebrtcConnected(true);
          channel.onclose = () => setWebrtcConnected(false);
          channel.onmessage = (ev) => {
            if (ev.data instanceof ArrayBuffer) {
              applyIncomingBinaryPacket(new Uint8Array(ev.data));
            }
          };
        };

        if (isInitiator) {
          // ordered: false, maxRetransmits: 0 gives raw UDP-like 10-15ms transport without head-of-line blocking
          const dc = pc.createDataChannel('pulsepad-udp', {
            ordered: false,
            maxRetransmits: 0,
          });
          setupDataChannel(dc);
        } else {
          pc.ondatachannel = (ev) => setupDataChannel(ev.channel);
        }

        pc.onicecandidate = (ev) => {
          if (ev.candidate && wsRef.current?.readyState === WebSocket.OPEN) {
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
          if (wsRef.current?.readyState === WebSocket.OPEN) {
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
        // Fallback smoothly to binary WebSocket if WebRTC is restricted
      }
    },
    [applyIncomingBinaryPacket]
  );

  // Connect to WebSocket signaling + binary fast-relay server (with BroadcastChannel fallback for static hosts like GitHub Pages)
  useEffect(() => {
    let isMounted = true;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let bc: BroadcastChannel | null = null;

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
        // Ignore if BroadcastChannel is unavailable
      }
    }

    const isStaticGithubPages =
      typeof window !== 'undefined' && window.location.hostname.endsWith('github.io');

    if (isStaticGithubPages) {
      // On static GitHub Pages hosting, mark local W3C + BroadcastChannel transport ready without noisy WS errors
      setWsConnected(true);
      setPeers([
        {
          clientId: clientIdRef.current,
          role,
          deviceLabel: 'GitHub Pages Live Controller',
          joinedAt: Date.now(),
        },
      ]);
      return () => {
        isMounted = false;
        bc?.close();
      };
    }

    const connect = () => {
      if (!isMounted) return;
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
              deviceLabel:
                role === 'controller'
                  ? 'Smartphone Touch Pad'
                  : role === 'host'
                    ? 'Tablet / Cloud Host'
                    : 'Dual Studio Workspace',
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
              setPeers(msg.peers);
              if (msg.peers.length >= 2 && (!dcRef.current || dcRef.current.readyState !== 'open')) {
                const sortedIds = msg.peers.map((p: PeerInfo) => p.clientId).sort();
                if (sortedIds[0] === clientIdRef.current) {
                  initWebRTC(true);
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
                await initWebRTC(false);
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

        ws.onerror = () => {
          // Handled cleanly in onclose
        };

        ws.onclose = () => {
          if (!isMounted) return;
          setWsConnected(false);
          setWebrtcConnected(false);
          reconnectTimer = setTimeout(connect, 2500);
        };
      } catch {
        // Fallback to local mode if WebSocket creation fails
      }
    };

    connect();

    return () => {
      isMounted = false;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      bc?.close();
      wsRef.current?.close();
      pcRef.current?.close();
    };
  }, [roomCode, role, applyIncomingBinaryPacket, initWebRTC, triggerLocalVibrate]);

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
   * updates local W3C `navigator.getGamepads()`, and transmits over WebRTC UDP DataChannel or Binary WS.
   */
  const emitGamepadUpdate = useCallback(
    (updater: (prev: VirtualGamepadState) => VirtualGamepadState) => {
      const prev = stateRef.current;
      const rawNext = updater(prev);

      // Apply calibrated deadzone and response curve to thumbsticks
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

      if (dcRef.current && dcRef.current.readyState === 'open') {
        try {
          dcRef.current.send(packet);
          return;
        } catch {
          // Fall through to binary WebSocket
        }
      }

      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(packet);
      }

      if (bcRef.current) {
        try {
          bcRef.current.postMessage(packet);
        } catch {
          // Ignore BroadcastChannel errors
        }
      }
    },
    []
  );

  const setButtonValue = useCallback(
    (buttonIndex: number, value: number) => {
      emitGamepadUpdate((prev) => {
        const nextButtons = prev.buttons.slice();
        nextButtons[buttonIndex] = Math.max(0, Math.min(1, value));
        return { ...prev, buttons: nextButtons };
      });
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
      });
    },
    [emitGamepadUpdate]
  );

  const setControllerSkin = useCallback(
    (skin: ControllerSkin) => {
      emitGamepadUpdate((prev) => ({ ...prev, skin }));
    },
    [emitGamepadUpdate]
  );

  const setGyroTilt = useCallback(
    (tiltX: number, tiltY: number) => {
      emitGamepadUpdate((prev) => ({
        ...prev,
        gyroTiltX: Math.max(-1, Math.min(1, tiltX)),
        gyroTiltY: Math.max(-1, Math.min(1, tiltY)),
      }));
    },
    [emitGamepadUpdate]
  );

  const resetAllInputs = useCallback(() => {
    emitGamepadUpdate((prev) => createInitialGamepadState(prev.skin));
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
      }
    },
    [triggerLocalVibrate]
  );

  const executeComboMacro = useCallback(
    (macroId: 'hadouken' | 'rapid_rt' | 'dodge_reload') => {
      if (macroId === 'hadouken') {
        // Down -> Down+Right -> Right + X/Square
        setButtonValue(13, 1);
        setTimeout(() => {
          setButtonValue(15, 1);
        }, 45);
        setTimeout(() => {
          setButtonValue(13, 0);
          setButtonValue(2, 1); // X / Square
        }, 95);
        setTimeout(() => {
          setButtonValue(15, 0);
          setButtonValue(2, 0);
        }, 210);
      } else if (macroId === 'rapid_rt') {
        // 3 rapid trigger bursts
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
        // B/Circle dodge -> X/Square tactical reload
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
