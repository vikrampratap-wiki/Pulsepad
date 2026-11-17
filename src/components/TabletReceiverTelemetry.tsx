import React, { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import {
  BUTTON_METADATA,
  VirtualGamepadState,
  buildControllerPairUrl,
  resolveRelayBackendOrigin,
} from '../protocol/gamepadProtocol';
import { generateCloudGamingBridgeSnippets } from '../protocol/w3cGamepadBridge';
import { PeerInfo } from '../hooks/usePulsePadTransport';
import {
  QrCode,
  Copy,
  Check,
  Smartphone,
  Tv,
  Activity,
  ExternalLink,
} from 'lucide-react';

interface TabletReceiverTelemetryProps {
  roomCode: string;
  onRoomCodeChange: (nextRoom: string) => void;
  gamepadState: VirtualGamepadState;
  wsConnected: boolean;
  webrtcConnected: boolean;
  rttMs: number;
  jitterMs: number;
  packetsPerSec: number;
  peers: PeerInfo[];
  lastHexPacket: string[];
  onSwitchToControllerMode: () => void;
}

export const TabletReceiverTelemetry: React.FC<TabletReceiverTelemetryProps> = ({
  roomCode,
  onRoomCodeChange,
  gamepadState,
  wsConnected,
  webrtcConnected,
  rttMs,
  jitterMs,
  packetsPerSec,
  peers,
  lastHexPacket,
  onSwitchToControllerMode,
}) => {
  const [roomInput, setRoomInput] = useState(roomCode);
  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const appOrigin = resolveRelayBackendOrigin();
  const controllerPairUrl = buildControllerPairUrl(roomCode);
  const bridgeSnippets = generateCloudGamingBridgeSnippets(roomCode, appOrigin);

  useEffect(() => {
    setRoomInput(roomCode);
  }, [roomCode]);

  useEffect(() => {
    let active = true;
    QRCode.toDataURL(controllerPairUrl, {
      width: 168,
      margin: 1,
      color: {
        dark: '#F8FAFC',
        light: '#0F172A',
      },
    })
      .then((url) => {
        if (active) setQrDataUrl(url);
      })
      .catch(() => {
        // Fallback handled in UI
      });
    return () => {
      active = false;
    };
  }, [controllerPairUrl]);

  const handleCopy = (key: string, text: string) => {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(text).catch(() => {});
    }
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 1800);
  };

  const isPS = gamepadState.skin === 'playstation';

  return (
    <div className="flex flex-col gap-6">
      {/* Top Pairing & Low-Latency Telemetry Strip */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-stretch">
        {/* Room Pairing & QR Card (Cols 1-7) */}
        <div className="lg:col-span-7 rounded-2xl border border-slate-800 bg-slate-900 p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-5">
          <div className="flex flex-col gap-3 flex-1">
            <div className="flex items-center gap-2 text-xs text-slate-400">
              <span>Phone-to-Tablet Pairing</span>
              <span aria-hidden="true">·</span>
              <span>
                {webrtcConnected
                  ? 'WebRTC UDP Direct Active'
                  : wsConnected
                    ? 'Binary WebSocket Relay Active'
                    : 'Reconnecting'}
              </span>
            </div>

            <h2 className="text-xl font-display font-bold text-white">
              अपने फ़ोन को गेमिंग रिमोट की तरह जोड़ें (Pair Phone Controller)
            </h2>

            <p className="text-sm text-slate-300 leading-relaxed">
              अपने टैबलेट पर यह स्क्रीन खुली रखें और अपने फ़ोन पर QR कोड स्कैन करें या यही{' '}
              <strong className="text-amber-400 font-mono">{roomCode}</strong> रूम कोड डालें।
            </p>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (roomInput.trim()) {
                  onRoomCodeChange(roomInput.trim().toUpperCase());
                }
              }}
              className="flex flex-wrap items-center gap-2 pt-1"
            >
              <label htmlFor="room-code-input" className="sr-only">
                Room Code
              </label>
              <input
                id="room-code-input"
                type="text"
                maxLength={10}
                value={roomInput}
                onChange={(e) => setRoomInput(e.target.value.toUpperCase())}
                placeholder="ROOM CODE"
                className="w-32 min-h-[42px] px-3 rounded-lg bg-slate-950 border border-slate-700 font-mono font-bold text-sm text-amber-400 uppercase focus:outline-none focus:border-amber-400"
              />
              <button
                type="submit"
                className="min-h-[42px] px-4 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold text-xs transition-colors whitespace-nowrap shrink-0"
              >
                Switch Room
              </button>
              <button
                type="button"
                onClick={() => handleCopy('pairUrl', controllerPairUrl)}
                className="min-h-[42px] px-3.5 rounded-lg bg-slate-950 border border-slate-800 hover:border-slate-600 text-slate-200 text-xs font-medium flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0"
              >
                {copiedKey === 'pairUrl' ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Link Copied</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    <span>Copy Phone URL</span>
                  </>
                )}
              </button>
              <button
                type="button"
                onClick={onSwitchToControllerMode}
                className="min-h-[42px] px-3.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-100 text-xs font-medium flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0"
              >
                <Smartphone className="w-3.5 h-3.5 text-amber-400" />
                <span>Open Phone View</span>
              </button>
            </form>
          </div>

          {/* Scannable QR Code */}
          <div className="shrink-0 flex flex-col items-center gap-1.5 p-3 rounded-xl bg-slate-950 border border-slate-800">
            {qrDataUrl ? (
              <img
                src={qrDataUrl}
                alt={`QR Code to pair phone controller to room ${roomCode}`}
                referrerPolicy="no-referrer"
                className="w-32 h-32 rounded-lg"
              />
            ) : (
              <div className="w-32 h-32 rounded-lg bg-slate-900 flex flex-col items-center justify-center text-slate-400 gap-1">
                <QrCode className="w-8 h-8 text-amber-400" />
                <span className="text-[11px] font-mono">{roomCode}</span>
              </div>
            )}
            <span className="text-[11px] font-mono text-slate-400">
              Scan on Phone ({roomCode})
            </span>
          </div>
        </div>

        {/* Live Sub-15ms Network & W3C Gamepad Status Card (Cols 8-12) */}
        <div className="lg:col-span-5 rounded-2xl border border-slate-800 bg-slate-900 p-5 flex flex-col justify-between gap-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-400 flex items-center gap-1.5">
              <Activity className="w-4 h-4 text-emerald-400" />
              <span>Real-Time Latency & W3C Gamepad Telemetry</span>
            </span>
            <span className="text-xs font-mono tabular-nums text-emerald-400">
              Target: 10–15 ms
            </span>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
              <div className="text-[11px] text-slate-400">One-Way Latency</div>
              <div className="text-2xl font-mono font-bold tabular-nums text-emerald-400 mt-0.5">
                {rttMs.toFixed(1)} <span className="text-xs font-normal text-slate-400">ms</span>
              </div>
              <div className="text-[11px] text-slate-500 mt-0.5">
                Jitter ±{jitterMs.toFixed(1)} ms
              </div>
            </div>

            <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
              <div className="text-[11px] text-slate-400">Frame Size</div>
              <div className="text-2xl font-mono font-bold tabular-nums text-amber-400 mt-0.5">
                12 <span className="text-xs font-normal text-slate-400">Bytes</span>
              </div>
              <div className="text-[11px] text-slate-500 mt-0.5">
                Seq #{gamepadState.sequence}
              </div>
            </div>

            <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
              <div className="text-[11px] text-slate-400">Room Peers</div>
              <div className="text-2xl font-mono font-bold tabular-nums text-sky-400 mt-0.5">
                {Math.max(1, peers.length)}{' '}
                <span className="text-xs font-normal text-slate-400">Active</span>
              </div>
              <div className="text-[11px] text-slate-500 mt-0.5">
                {packetsPerSec} pkt/s
              </div>
            </div>
          </div>

          {/* Live 12-Byte Hex Wire Feed */}
          <div className="p-2.5 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-between gap-2 overflow-x-auto">
            <span className="text-[11px] font-mono text-slate-400 shrink-0">12B WIRE:</span>
            <div className="flex items-center gap-1.5 font-mono text-xs tabular-nums">
              {lastHexPacket.map((hex, idx) => (
                <span
                  key={idx}
                  className={`px-1.5 py-0.5 rounded ${
                    idx === 0
                      ? 'bg-amber-500/20 text-amber-300'
                      : idx <= 3
                        ? 'bg-emerald-500/20 text-emerald-300'
                        : idx <= 7
                          ? 'bg-sky-500/20 text-sky-300'
                          : 'bg-slate-800 text-slate-300'
                  }`}
                >
                  {hex}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Live W3C Standard 17-Button & 2D Stick Circularity Inspector */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5 flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-base font-display font-bold text-white">
              W3C Standard Gamepad API Inspector (`navigator.getGamepads()[0]`)
            </h3>
            <p className="text-xs text-slate-400">
              कोई भी क्लाउड गेम (Xbox Cloud Gaming, GeForce NOW, PlayStation Remote Play) ब्राउज़र के इसी स्टैंडर्ड API से कंट्रोलर पढ़ता है।
            </p>
          </div>
          <div className="text-xs font-mono text-slate-300">
            Profile: {isPS ? 'DualSense Wireless (054c:0ce6)' : 'Xbox Series X|S (045e:0b12)'}
          </div>
        </div>

        {/* 17-Button Live Grid */}
        <div className="grid grid-cols-3 sm:grid-cols-6 lg:grid-cols-9 gap-2">
          {BUTTON_METADATA.map((btn) => {
            const val = gamepadState.buttons[btn.index] ?? 0;
            const active = val > 0.15;
            return (
              <div
                key={btn.index}
                className={`p-2.5 rounded-xl border transition-colors flex flex-col justify-between ${
                  active
                    ? 'bg-emerald-500/20 border-emerald-400 text-white'
                    : 'bg-slate-950 border-slate-800 text-slate-400'
                }`}
              >
                <div className="flex items-center justify-between text-[11px] font-mono">
                  <span>B{btn.index}</span>
                  <span className="tabular-nums">{Math.round(val * 100)}%</span>
                </div>
                <div className="text-xs font-semibold text-slate-200 mt-1 truncate">
                  {isPS ? btn.psLabel : btn.xboxLabel}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Xbox Cloud Gaming / GeForce NOW / Browser Game Bridge Injector */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5 flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-col gap-1">
            <h3 className="text-base font-display font-bold text-white flex items-center gap-2">
              <Tv className="w-4 h-4 text-amber-400" />
              <span>
                Xbox Cloud Gaming, GeForce NOW और किसी भी वेब गेम में कैसे चलाएं (Universal Cloud Bridge)
              </span>
            </h3>
            <p className="text-xs text-slate-300">
              जब आप टैबलेट पर <code className="text-amber-300">xbox.com/play</code> या कोई भी क्लाउड गेम खोलें, तो यह ब्रिज स्क्रिप्ट आपके फ़ोन के इनपुट को सीधे उस टैब के{' '}
              <code className="text-emerald-300">navigator.getGamepads()</code> में जोड़ देती है।
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => handleCopy('bookmarklet', bridgeSnippets.bookmarkletHref)}
              className="min-h-[40px] px-3.5 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold text-xs flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0"
            >
              {copiedKey === 'bookmarklet' ? (
                <>
                  <Check className="w-3.5 h-3.5" />
                  <span>Bookmarklet Copied!</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" />
                  <span>Copy Cloud Bookmarklet</span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={() => handleCopy('console', bridgeSnippets.consoleSnippet)}
              className="min-h-[40px] px-3.5 py-2 rounded-lg bg-slate-950 border border-slate-700 hover:border-slate-500 text-slate-200 font-medium text-xs flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0"
            >
              {copiedKey === 'console' ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Script Copied!</span>
                </>
              ) : (
                <>
                  <ExternalLink className="w-3.5 h-3.5" />
                  <span>Copy Console Injector</span>
                </>
              )}
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs text-slate-300">
          <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 flex flex-col gap-1">
            <span className="font-semibold text-white">01. टैबलेट पर क्लाउड गेम खोलें</span>
            <p className="text-slate-400 leading-relaxed">
              अपने टैबलेट के ब्राउज़र में Xbox Cloud Gaming, GeForce NOW, या कोई भी वेब गेम खोलें और ऊपर दिया Bookmarklet सेव करें।
            </p>
          </div>
          <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 flex flex-col gap-1">
            <span className="font-semibold text-white">02. फ़ोन पर कंट्रोलर खोलें</span>
            <p className="text-slate-400 leading-relaxed">
              अपने फ़ोन पर QR कोड स्कैन करें ताकि आपका फ़ोन रूम <strong className="text-amber-400 font-mono">{roomCode}</strong> से जुड़ जाए।
            </p>
          </div>
          <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 flex flex-col gap-1">
            <span className="font-semibold text-white">03. 10–15ms में बिना रुकावट खेलें</span>
            <p className="text-slate-400 leading-relaxed">
              टैबलेट पर Bookmarklet पर टैप करते ही Xbox/PS5 कंट्रोलर डिटेक्ट हो जाएगा और आप तुरंत गेम खेल सकते हैं।
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
