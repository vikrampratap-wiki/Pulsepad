import React, { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { CloudGamingSandbox } from '../components/CloudGamingSandbox';
import { TouchControllerPadProps } from '../components/TouchControllerPad';
import {
  BUTTON_METADATA,
  buildControllerPairUrl,
  formatRoomIdDisplay,
  resolveAppBaseUrl,
  sanitizeRoomId,
} from '../protocol/gamepadProtocol';
import {
  QrCode,
  Smartphone,
  Wifi,
  Copy,
  Check,
  RefreshCw,
  Gamepad2,
  ExternalLink,
} from 'lucide-react';

interface CloudArenaPageProps extends TouchControllerPadProps {
  autostart?: boolean;
  onRumble: (intensity: number, durationMs: number) => void;
}

/**
 * Dedicated Sub-Page 2: Cloud Arena (Game) Page (`/?mode=arena`)
 * Standalone 60fps Mecha Pulse Cloud Game + Live Phone Pairing Bar (separated from the Virtual Controller page).
 */
export const CloudArenaPage: React.FC<CloudArenaPageProps> = ({
  autostart = false,
  onRumble,
  ...controllerProps
}) => {
  const {
    roomCode,
    onRoomCodeChange,
    onGenerateNewRoomId,
    gamepadState,
    peersCount = 1,
    webrtcConnected = false,
    rttMs,
    onNavigateTab,
  } = controllerProps;

  const [roomInput, setRoomInput] = useState(roomCode);
  const [qrDataUrl, setQrDataUrl] = useState('');
  const [copied, setCopied] = useState(false);

  const pairUrl = buildControllerPairUrl(roomCode);
  const standaloneArenaUrl = `${resolveAppBaseUrl()}/?mode=arena&room=${encodeURIComponent(roomCode)}`;
  const isPhoneLinked = peersCount >= 2 || webrtcConnected;
  const formattedRoom = formatRoomIdDisplay(roomCode);

  useEffect(() => {
    setRoomInput(roomCode);
  }, [roomCode]);

  useEffect(() => {
    let active = true;
    QRCode.toDataURL(pairUrl, {
      width: 112,
      margin: 1,
      color: {
        dark: '#F8FAFC',
        light: '#090D16',
      },
    })
      .then((url) => {
        if (active) setQrDataUrl(url);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [pairUrl]);

  const activeButtonsList = BUTTON_METADATA.filter(
    (b) => (gamepadState.buttons[b.index] ?? 0) > 0.2
  ).map((b) => (gamepadState.skin === 'playstation' ? b.psLabel : b.xboxLabel));

  return (
    <section
      aria-label="Cloud Gaming Test Arena"
      data-testid="standalone-arena-page"
      className="flex flex-col gap-5"
    >
      {/* Dedicated Page Header Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-800">
        <div>
          <span className="text-[11px] font-mono uppercase tracking-wider text-emerald-400">
            Dedicated Page 02 · /?mode=arena
          </span>
          <h1 className="text-lg sm:text-xl font-display font-bold text-white">
            Cloud Arena (60fps Game Host Page)
          </h1>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {onNavigateTab && (
            <button
              type="button"
              onClick={() => onNavigateTab('controller')}
              className="min-h-[36px] px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-700 hover:border-amber-400 text-xs font-semibold text-slate-200 flex items-center gap-1.5"
            >
              <Gamepad2 className="w-3.5 h-3.5 text-amber-400" />
              <span>Controller Remote पेज पर जाएं</span>
            </button>
          )}
          <a
            href={standaloneArenaUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="min-h-[36px] px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-700 hover:border-emerald-400 text-xs font-medium text-emerald-300 flex items-center gap-1.5"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            <span>अलग टैब में खोलें (Standalone URL)</span>
          </a>
        </div>
      </div>

      {/* Tablet Game + Phone Controller Pairing Bar */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900 p-4 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="flex flex-col gap-2 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-mono font-bold border ${
                isPhoneLinked
                  ? 'bg-emerald-500/20 border-emerald-400 text-emerald-300'
                  : 'bg-amber-500/15 border-amber-500/40 text-amber-300'
              }`}
            >
              <Wifi className="w-3.5 h-3.5" />
              <span>
                {isPhoneLinked
                  ? `PHONE CONTROLLER CONNECTED (${peersCount} Devices · ${rttMs.toFixed(1)}ms)`
                  : `WAITING FOR PHONE IN PRIVATE ROOM ID: ${formattedRoom}`}
              </span>
            </span>

            <span className="text-xs font-mono text-slate-400">
              Left Stick: {gamepadState.axes[0].toFixed(2)}, {gamepadState.axes[1].toFixed(2)} ·
              Pressed: {activeButtonsList.length > 0 ? activeButtonsList.join(', ') : 'None'}
            </span>
          </div>

          <h2 className="text-base sm:text-lg font-display font-bold text-white flex items-center gap-2">
            <Smartphone className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>
              टैबलेट पर यह अलग गेम पेज खुला रखें और दाईं ओर का QR कोड अपने फ़ोन से स्कैन करके फ़ोन से गेम कंट्रोल करें!
            </span>
          </h2>

          <div className="flex flex-wrap items-center gap-2">
            {onRoomCodeChange && (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const clean = sanitizeRoomId(roomInput);
                  if (clean) {
                    onRoomCodeChange(clean);
                  }
                }}
                className="inline-flex items-center gap-1.5"
              >
                <label htmlFor="arena-room-input" className="text-xs text-slate-400 font-mono">
                  10-Digit ID:
                </label>
                <input
                  id="arena-room-input"
                  type="text"
                  maxLength={14}
                  value={roomInput}
                  onChange={(e) => setRoomInput(e.target.value.toUpperCase())}
                  className="w-32 min-h-[36px] px-2.5 rounded-lg bg-slate-950 border border-slate-700 font-mono font-bold text-xs text-amber-400 uppercase"
                />
                <button
                  type="submit"
                  className="min-h-[36px] px-3 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold text-xs whitespace-nowrap shrink-0"
                >
                  Set ID
                </button>
              </form>
            )}

            {onGenerateNewRoomId && (
              <button
                type="button"
                onClick={onGenerateNewRoomId}
                className="min-h-[36px] px-3 rounded-lg bg-slate-950 border border-slate-700 hover:border-amber-400 text-amber-300 text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap shrink-0"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>नया गुप्त ID (New 10-Digit ID)</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => {
                if (typeof navigator !== 'undefined' && navigator.clipboard) {
                  navigator.clipboard.writeText(pairUrl).catch(() => {});
                }
                setCopied(true);
                setTimeout(() => setCopied(false), 1800);
              }}
              className="min-h-[36px] px-3 rounded-lg bg-slate-950 border border-slate-700 hover:border-slate-500 text-slate-200 text-xs font-medium flex items-center gap-1.5 whitespace-nowrap shrink-0"
            >
              {copied ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Phone URL Copied!</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" />
                  <span>Copy Phone Link</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Scannable QR Code right inside the Game Arena */}
        <div className="shrink-0 flex items-center gap-3 p-2.5 rounded-xl bg-slate-950 border border-slate-800">
          {qrDataUrl ? (
            <img
              src={qrDataUrl}
              alt={`Scan on phone to join room ${roomCode}`}
              referrerPolicy="no-referrer"
              className="w-24 h-24 rounded-lg"
            />
          ) : (
            <div className="w-24 h-24 rounded-lg bg-slate-900 flex items-center justify-center">
              <QrCode className="w-7 h-7 text-amber-400" />
            </div>
          )}
          <div className="flex flex-col gap-1 text-xs max-w-[165px]">
            <span className="font-mono font-bold text-amber-400">ID: {formattedRoom}</span>
            <span className="text-[11px] text-slate-300 leading-snug">
              फ़ोन से स्कैन करते ही आपका फ़ोन इस गुप्त ID के साथ गेम का रिमोट बन जाएगा।
            </span>
          </div>
        </div>
      </div>

      {/* 60fps Mecha Pulse Game Canvas (Dedicated to Cloud Arena Page) */}
      <CloudGamingSandbox
        gamepadState={controllerProps.gamepadState}
        onRumble={onRumble}
        autostart={autostart}
      />
    </section>
  );
};
