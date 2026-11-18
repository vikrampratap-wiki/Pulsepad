import React from 'react';
import { EngineeringLatencyLab } from '../components/EngineeringLatencyLab';
import {
  StickCalibrationConfig,
  VirtualGamepadState,
  resolveAppBaseUrl,
} from '../protocol/gamepadProtocol';
import { Gamepad2, ExternalLink } from 'lucide-react';

interface ProtocolLabPageProps {
  roomCode?: string;
  gamepadState: VirtualGamepadState;
  lastHexPacket: string[];
  calibration: StickCalibrationConfig;
  onCalibrationChange: React.Dispatch<React.SetStateAction<StickCalibrationConfig>>;
  onButtonToggle: (buttonIndex: number, nextVal: number) => void;
  onSwitchToControllerMode?: () => void;
}

/**
 * Dedicated Sub-Page 4: 10-15ms Engineering & Binary Protocol Lab Page (`/?mode=lab`)
 */
export const ProtocolLabPage: React.FC<ProtocolLabPageProps> = ({
  roomCode = '',
  onSwitchToControllerMode,
  ...props
}) => {
  const standaloneLabUrl = `${resolveAppBaseUrl()}/?mode=lab${
    roomCode ? `&room=${encodeURIComponent(roomCode)}` : ''
  }`;

  return (
    <section
      aria-label="Low Latency Engineering Protocol Lab"
      data-testid="standalone-lab-page"
      className="flex flex-col gap-5"
    >
      {/* Dedicated Page Header Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-800">
        <div>
          <span className="text-[11px] font-mono uppercase tracking-wider text-amber-400">
            Dedicated Page 04 · /?mode=lab
          </span>
          <h1 className="text-lg sm:text-xl font-display font-bold text-white">
            Protocol Lab (12-Byte Binary Wire & Latency Simulator)
          </h1>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {onSwitchToControllerMode && (
            <button
              type="button"
              onClick={onSwitchToControllerMode}
              className="min-h-[36px] px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-700 hover:border-amber-400 text-xs font-semibold text-slate-200 flex items-center gap-1.5"
            >
              <Gamepad2 className="w-3.5 h-3.5 text-amber-400" />
              <span>Controller Remote पेज पर जाएं</span>
            </button>
          )}
          <a
            href={standaloneLabUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="min-h-[36px] px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-700 hover:border-amber-400 text-xs font-medium text-amber-300 flex items-center gap-1.5"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            <span>अलग टैब में खोलें (Standalone URL)</span>
          </a>
        </div>
      </div>

      <EngineeringLatencyLab {...props} />
    </section>
  );
};
