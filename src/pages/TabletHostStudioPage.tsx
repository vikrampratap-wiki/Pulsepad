import React from 'react';
import { TabletReceiverTelemetry } from '../components/TabletReceiverTelemetry';
import { TouchControllerPadProps } from '../components/TouchControllerPad';
import { PeerInfo } from '../hooks/usePulsePadTransport';
import { resolveAppBaseUrl } from '../protocol/gamepadProtocol';
import { Gamepad2, ExternalLink } from 'lucide-react';

interface TabletHostStudioPageProps extends TouchControllerPadProps {
  jitterMs: number;
  packetsPerSec: number;
  peers: PeerInfo[];
  lastHexPacket: string[];
  onSwitchToControllerMode: () => void;
}

/**
 * Dedicated Sub-Page 3: Tablet Host & QR + Xbox Cloud Direct Connect Page (`/?mode=studio`)
 * Separated from the Virtual Controller so the Tablet Host screen stays clean and focused.
 */
export const TabletHostStudioPage: React.FC<TabletHostStudioPageProps> = ({
  roomCode,
  onRoomCodeChange,
  onGenerateNewRoomId,
  gamepadState,
  wsConnected = false,
  webrtcConnected = false,
  rttMs,
  jitterMs,
  packetsPerSec,
  peers,
  lastHexPacket,
  onSwitchToControllerMode,
}) => {
  const standaloneStudioUrl = `${resolveAppBaseUrl()}/?mode=studio&room=${encodeURIComponent(roomCode)}`;

  return (
    <section
      aria-label="Tablet Receiver and Pairing Studio"
      data-testid="standalone-studio-page"
      className="flex flex-col gap-5"
    >
      {/* Dedicated Page Header Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-800">
        <div>
          <span className="text-[11px] font-mono uppercase tracking-wider text-sky-400">
            Dedicated Page 03 · /?mode=studio
          </span>
          <h1 className="text-lg sm:text-xl font-display font-bold text-white">
            Tablet Host, QR Pairing & Xbox Cloud Direct Connect
          </h1>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={onSwitchToControllerMode}
            className="min-h-[36px] px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-700 hover:border-amber-400 text-xs font-semibold text-slate-200 flex items-center gap-1.5"
          >
            <Gamepad2 className="w-3.5 h-3.5 text-amber-400" />
            <span>Controller Remote पेज पर जाएं</span>
          </button>
          <a
            href={standaloneStudioUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="min-h-[36px] px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-700 hover:border-sky-400 text-xs font-medium text-sky-300 flex items-center gap-1.5"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            <span>अलग टैब में खोलें (Standalone URL)</span>
          </a>
        </div>
      </div>

      <TabletReceiverTelemetry
        roomCode={roomCode}
        onRoomCodeChange={onRoomCodeChange || (() => {})}
        onGenerateNewRoomId={onGenerateNewRoomId}
        gamepadState={gamepadState}
        wsConnected={wsConnected}
        webrtcConnected={webrtcConnected}
        rttMs={rttMs}
        jitterMs={jitterMs}
        packetsPerSec={packetsPerSec}
        peers={peers}
        lastHexPacket={lastHexPacket}
        onSwitchToControllerMode={onSwitchToControllerMode}
      />
    </section>
  );
};
