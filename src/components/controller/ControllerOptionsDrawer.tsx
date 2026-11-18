import React, { useState, useEffect } from 'react';
import {
  StickCalibrationConfig,
  StickCurveType,
  formatRoomIdDisplay,
  sanitizeRoomId,
} from '../../protocol/gamepadProtocol';
import { QrCode, ShieldCheck, Vibrate, RotateCcw, RefreshCw, Lock } from 'lucide-react';

interface ControllerOptionsDrawerProps {
  roomCode: string;
  onRoomCodeChange?: (nextRoom: string) => void;
  onGenerateNewRoomId?: () => void;
  peersCount: number;
  wsConnected: boolean;
  webrtcConnected: boolean;
  qrDataUrl: string;
  calibration: StickCalibrationConfig;
  onCalibrationChange: React.Dispatch<React.SetStateAction<StickCalibrationConfig>>;
  holdLockMode: boolean;
  onToggleHoldLock: () => void;
  wakeLockActive: boolean;
  onHapticTest: () => void;
  onResetAll: () => void;
}

export const ControllerOptionsDrawer: React.FC<ControllerOptionsDrawerProps> = ({
  roomCode,
  onRoomCodeChange,
  onGenerateNewRoomId,
  peersCount,
  wsConnected,
  webrtcConnected,
  qrDataUrl,
  calibration,
  onCalibrationChange,
  holdLockMode,
  onToggleHoldLock,
  wakeLockActive,
  onHapticTest,
  onResetAll,
}) => {
  const [roomDraft, setRoomDraft] = useState<string>(roomCode);

  useEffect(() => {
    setRoomDraft(roomCode);
  }, [roomCode]);

  return (
    <div className="p-3 sm:p-4 rounded-2xl bg-slate-950 border border-slate-800 grid grid-cols-1 md:grid-cols-3 gap-3 sm:gap-4">
      {/* Col 1: Private 10-Digit Numeric Room Pairing & QR */}
      <div className="flex items-center justify-between gap-3 p-3 rounded-xl bg-slate-900 border border-slate-800">
        <div className="flex flex-col gap-1.5 flex-1">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-white">
            <Lock className="w-3.5 h-3.5 text-amber-400 shrink-0" />
            <span>गुप्त 10-अंक रूम ID ({peersCount} जुड़ा)</span>
          </div>
          <div className="text-[11px] font-mono text-amber-300 font-bold">
            ID: {formatRoomIdDisplay(roomCode)}
          </div>
          <div className="text-[10px] text-slate-400">
            {webrtcConnected
              ? 'WebRTC Direct UDP Active'
              : wsConnected
                ? '12-Byte Binary Relay Active'
                : 'Reconnecting...'}
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const clean = sanitizeRoomId(roomDraft);
              if (clean && onRoomCodeChange) {
                onRoomCodeChange(clean);
              }
            }}
            className="flex flex-wrap items-center gap-1.5 pt-0.5"
          >
            <label htmlFor="pad-room-input" className="sr-only">
              Room Code
            </label>
            <input
              id="pad-room-input"
              type="text"
              maxLength={14}
              value={roomDraft}
              onChange={(e) => setRoomDraft(e.target.value.toUpperCase())}
              placeholder="10-Digit ID"
              className="w-28 min-h-[34px] px-2 rounded-lg bg-slate-950 border border-slate-700 font-mono font-bold text-xs text-amber-400 uppercase"
            />
            <button
              type="submit"
              className="min-h-[34px] px-2.5 rounded-lg bg-amber-500 text-slate-950 font-semibold text-xs whitespace-nowrap shrink-0"
            >
              Join ID
            </button>
            {onGenerateNewRoomId && (
              <button
                type="button"
                onClick={onGenerateNewRoomId}
                className="min-h-[34px] px-2.5 rounded-lg bg-slate-950 border border-slate-700 hover:border-amber-400 text-slate-200 font-medium text-xs flex items-center gap-1 whitespace-nowrap shrink-0"
                title="Generate New 10-Digit Secret Numeric Room ID"
              >
                <RefreshCw className="w-3 h-3 text-amber-400" />
                <span>नया ID</span>
              </button>
            )}
          </form>
        </div>
        {qrDataUrl ? (
          <img
            src={qrDataUrl}
            alt={`QR Code for room ${roomCode}`}
            referrerPolicy="no-referrer"
            className="w-20 h-20 rounded-lg shrink-0"
          />
        ) : (
          <div className="w-20 h-20 rounded-lg bg-slate-950 flex items-center justify-center shrink-0">
            <QrCode className="w-6 h-6 text-amber-400" />
          </div>
        )}
      </div>

      {/* Col 2: Deadzone & Aim Response Curve */}
      <div className="flex flex-col justify-between gap-2 p-3 rounded-xl bg-slate-900 border border-slate-800">
        <div className="flex items-center justify-between text-xs">
          <span className="font-semibold text-white">Stick Aim Curve & Deadzone</span>
          <span className="font-mono text-sky-400">
            DZ: {Math.round(calibration.deadzone * 100)}%
          </span>
        </div>
        <div className="flex items-center gap-1">
          {(['linear', 'precision', 'aggressive'] as StickCurveType[]).map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => onCalibrationChange((p) => ({ ...p, curve: c }))}
              className={`flex-1 min-h-[34px] px-2 rounded text-[11px] font-semibold capitalize whitespace-nowrap shrink-0 ${
                calibration.curve === c
                  ? 'bg-sky-500 text-slate-950'
                  : 'bg-slate-950 text-slate-300'
              }`}
            >
              {c}
            </button>
          ))}
        </div>
        <input
          aria-label="Controller Deadzone Slider"
          type="range"
          min={0}
          max={0.25}
          step={0.01}
          value={calibration.deadzone}
          onChange={(e) =>
            onCalibrationChange((p) => ({ ...p, deadzone: parseFloat(e.target.value) }))
          }
          className="w-full pad-slider-themed"
        />
      </div>

      {/* Col 3: Sticky Hold, Haptic Rumble, WakeLock & Reset */}
      <div className="flex flex-col justify-between gap-2 p-3 rounded-xl bg-slate-900 border border-slate-800">
        <div className="flex items-center justify-between text-xs">
          <span className="font-semibold text-white">Tactile & Hardware Controls</span>
          <span className="text-[11px] font-mono text-emerald-400 flex items-center gap-1">
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>{wakeLockActive ? 'WakeLock ON' : 'Always Ready'}</span>
          </span>
        </div>
        <div className="grid grid-cols-3 gap-1.5">
          <button
            type="button"
            onClick={onToggleHoldLock}
            className={`min-h-[36px] px-2 rounded-lg border text-xs font-medium whitespace-nowrap shrink-0 ${
              holdLockMode
                ? 'bg-amber-500 text-slate-950 border-amber-300 font-bold'
                : 'bg-slate-950 border-slate-800 text-slate-300'
            }`}
          >
            {holdLockMode ? 'Hold: ON' : 'Hold: OFF'}
          </button>
          <button
            type="button"
            onClick={onHapticTest}
            className="min-h-[36px] px-2 rounded-lg bg-slate-950 border border-slate-800 text-slate-200 text-xs font-medium flex items-center justify-center gap-1 whitespace-nowrap shrink-0"
          >
            <Vibrate className="w-3.5 h-3.5 text-amber-400" />
            <span>Rumble</span>
          </button>
          <button
            type="button"
            onClick={onResetAll}
            className="min-h-[36px] px-2 rounded-lg bg-slate-950 border border-slate-800 text-slate-200 text-xs font-medium flex items-center justify-center gap-1 whitespace-nowrap shrink-0"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Reset</span>
          </button>
        </div>
      </div>
    </div>
  );
};
