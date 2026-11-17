import React, { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { CloudGamingSandbox } from '../components/CloudGamingSandbox';
import { TouchControllerPad, TouchControllerPadProps } from '../components/TouchControllerPad';
import { BUTTON_METADATA, buildControllerPairUrl } from '../protocol/gamepadProtocol';
import { QrCode, Smartphone, Wifi, Copy, Check } from 'lucide-react';

interface CloudArenaPageProps extends TouchControllerPadProps {
  autostart?: boolean;
  onRumble: (intensity: number, durationMs: number) => void;
}

/**
 * Sub-Page 3: Dedicated Cloud Gaming Test Arena (Mecha Pulse 60fps Game + Live Phone Pairing Dock + Controller)
 */
export const CloudArenaPage: React.FC<CloudArenaPageProps> = ({
  autostart = false,
  onRumble,
  ...controllerProps
}) => {
  const {
    roomCode,
    onRoomCodeChange,
    gamepadState,
    peersCount = 1,
    webrtcConnected = false,
    rttMs,
  } = controllerProps;

  const [roomInput, setRoomInput] = useState(roomCode);
  const [qrDataUrl, setQrDataUrl] = useState('');
  const [copied, setCopied] = useState(false);

  const pairUrl = buildControllerPairUrl(roomCode);
  const isPhoneLinked = peersCount >= 2 || webrtcConnected;

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
    <section aria-label="Cloud Gaming Test Arena" className="flex flex-col gap-5">
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
                  : `WAITING FOR PHONE IN ROOM: ${roomCode}`}
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
              टैबलेट पर यह गेम खोलें और दाईं ओर का QR कोड अपने फ़ोन से स्कैन करके फ़ोन से गेम कंट्रोल करें!
            </span>
          </h2>

          <div className="flex flex-wrap items-center gap-2">
            {onRoomCodeChange && (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (roomInput.trim()) {
                    onRoomCodeChange(roomInput.trim().toUpperCase());
                  }
                }}
                className="inline-flex items-center gap-1.5"
              >
                <label htmlFor="arena-room-input" className="text-xs text-slate-400 font-mono">
                  Room:
                </label>
                <input
                  id="arena-room-input"
                  type="text"
                  maxLength={10}
                  value={roomInput}
                  onChange={(e) => setRoomInput(e.target.value.toUpperCase())}
                  className="w-24 min-h-[36px] px-2.5 rounded-lg bg-slate-950 border border-slate-700 font-mono font-bold text-xs text-amber-400 uppercase"
                />
                <button
                  type="submit"
                  className="min-h-[36px] px-3 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold text-xs whitespace-nowrap shrink-0"
                >
                  Set Room
                </button>
              </form>
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
          <div className="flex flex-col gap-1 text-xs max-w-[155px]">
            <span className="font-mono font-bold text-amber-400">ROOM: {roomCode}</span>
            <span className="text-[11px] text-slate-300 leading-snug">
              फ़ोन से स्कैन करते ही आपका फ़ोन इस गेम का रिमोट बन जाएगा।
            </span>
          </div>
        </div>
      </div>

      {/* 60fps Mecha Pulse Game Canvas */}
      <CloudGamingSandbox
        gamepadState={controllerProps.gamepadState}
        onRumble={onRumble}
        autostart={autostart}
      />

      {/* Virtual Controller Pad below for local testing or hybrid control */}
      <TouchControllerPad {...controllerProps} />
    </section>
  );
};
