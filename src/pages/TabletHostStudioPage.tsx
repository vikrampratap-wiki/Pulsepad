import React from 'react';
import { TabletReceiverTelemetry } from '../components/TabletReceiverTelemetry';
import { TouchControllerPad, TouchControllerPadProps } from '../components/TouchControllerPad';
import { PeerInfo } from '../hooks/usePulsePadTransport';

interface TabletHostStudioPageProps extends TouchControllerPadProps {
  jitterMs: number;
  packetsPerSec: number;
  peers: PeerInfo[];
  lastHexPacket: string[];
  onSwitchToControllerMode: () => void;
}

/**
 * Sub-Page 2: Dedicated Tablet Host, QR Pairing & W3C Gamepad API Telemetry Page
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
  ...controllerProps
}) => {
  return (
    <section aria-label="Tablet Receiver and Pairing Studio" className="flex flex-col gap-6">
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

      <TouchControllerPad
        roomCode={roomCode}
        onRoomCodeChange={onRoomCodeChange}
        onGenerateNewRoomId={onGenerateNewRoomId}
        gamepadState={gamepadState}
        wsConnected={wsConnected}
        webrtcConnected={webrtcConnected}
        rttMs={rttMs}
        {...controllerProps}
      />
    </section>
  );
};
