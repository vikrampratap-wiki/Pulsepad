import { useState } from 'react';
import { usePulsePadTransport } from './hooks/usePulsePadTransport';
import {
  formatRoomIdDisplay,
  generateSecureNumericRoomId,
  getOrCreatePersistentRoomId,
} from './protocol/gamepadProtocol';
import { ControllerRemotePage } from './pages/ControllerRemotePage';
import { TabletHostStudioPage } from './pages/TabletHostStudioPage';
import { CloudArenaPage } from './pages/CloudArenaPage';
import { ProtocolLabPage } from './pages/ProtocolLabPage';

export type ActiveWorkspaceTab = 'controller' | 'studio' | 'arena' | 'lab';

export default function App() {
  const params =
    typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;
  const initialRoom = getOrCreatePersistentRoomId(params?.get('room'));
  const initialModeParam = params?.get('mode');
  const autostartArena = params?.get('autostart') === '1';
  const isBridgeRelayPopup = params?.get('bridge') === '1';

  const [activeTab, setActiveTab] = useState<ActiveWorkspaceTab>(() => {
    if (initialModeParam === 'studio') return 'studio';
    if (initialModeParam === 'arena' || autostartArena) return 'arena';
    if (initialModeParam === 'lab') return 'lab';
    return 'controller';
  });

  // Single-Screen Controller Lock Mode (1-Screen Full Mode: zero vertical scroll on mobile!)
  // Automatically enabled when opened via QR (?mode=controller) or on mobile phone screens (<768px)
  const [pureControllerOnly, setPureControllerOnly] = useState<boolean>(() => {
    if (initialModeParam === 'controller') return true;
    if (
      typeof window !== 'undefined' &&
      !initialModeParam &&
      !autostartArena &&
      window.innerWidth < 768
    ) {
      return true;
    }
    return false;
  });

  const {
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
    setButtonValue,
    setStickAxes,
    setControllerSkin,
    setGyroTilt,
    resetAllInputs,
    sendHapticPulse,
    executeComboMacro,
  } = usePulsePadTransport(
    initialRoom,
    initialModeParam === 'controller' ? 'controller' : 'hybrid'
  );

  const handleGenerateNewRoomId = () => {
    const nextRoom = generateSecureNumericRoomId();
    setRoomCode(nextRoom);
  };

  const sharedControllerProps = {
    roomCode,
    onRoomCodeChange: setRoomCode,
    onGenerateNewRoomId: handleGenerateNewRoomId,
    gamepadState,
    calibration,
    onCalibrationChange: setCalibration,
    onButtonChange: setButtonValue,
    onStickChange: setStickAxes,
    onSkinChange: setControllerSkin,
    onGyroChange: setGyroTilt,
    onResetAll: resetAllInputs,
    onMacroTrigger: executeComboMacro,
    onHapticTest: () => sendHapticPulse(0.85, 160),
    rttMs,
    wsConnected,
    webrtcConnected,
    peersCount: Math.max(1, peers.length),
    activeTab,
    onNavigateTab: (tab: ActiveWorkspaceTab) => {
      setActiveTab(tab);
      if (tab !== 'controller') {
        setPureControllerOnly(false);
      }
    },
  };

  const isSingleScreenController = activeTab === 'controller' && pureControllerOnly;

  return (
    <div
      className={`${
        isSingleScreenController
          ? 'h-[100dvh] w-screen overflow-hidden'
          : 'min-h-screen'
      } bg-slate-950 text-slate-100 flex flex-col`}
    >
      {/* Xbox Cloud Gaming / External Site CSP-Bypass Relay Popup Banner */}
      {isBridgeRelayPopup && (
        <div
          data-testid="xbox-bridge-relay-banner"
          className="px-3 py-1.5 bg-emerald-500 text-slate-950 text-xs font-mono font-bold flex items-center justify-between gap-2 shrink-0"
        >
          <span>
            XBOX CLOUD / EXTERNAL BRIDGE RELAY ACTIVE · ID: {formatRoomIdDisplay(roomCode)}
          </span>
          <span>
            {peers.length >= 2 || webrtcConnected
              ? `PHONE LINKED (${rttMs.toFixed(1)}ms)`
              : 'WAITING FOR PHONE INPUT...'}
          </span>
        </div>
      )}

      {/* Strict 3-Zone Top Bar Contract (Hidden when user is in 1-Screen Lock Mode) */}
      {!isSingleScreenController && (
        <header className="flex flex-wrap items-center justify-between gap-2 sm:gap-3 px-3 sm:px-6 py-2.5 border-b border-slate-800 bg-slate-950 shrink-0">
          {/* Zone 1: Single text element wordmark */}
          <a
            href="./"
            onClick={(e) => {
              e.preventDefault();
              setActiveTab('controller');
            }}
            className="text-base sm:text-lg font-display font-bold tracking-tight text-white whitespace-nowrap shrink-0"
          >
            PulsePad
          </a>

          {/* Zone 2: 4 clean single-line text navigation links */}
          <nav className="flex flex-wrap items-center gap-3 sm:gap-6 text-xs sm:text-sm font-medium text-slate-300">
            <a
              href="#controller"
              onClick={(e) => {
                e.preventDefault();
                setActiveTab('controller');
              }}
              className={`hover:text-white hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0 ${
                activeTab === 'controller' ? 'text-white underline' : ''
              }`}
            >
              Controller Remote
            </a>
            <a
              href="#arena"
              onClick={(e) => {
                e.preventDefault();
                setActiveTab('arena');
              }}
              className={`hover:text-white hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0 ${
                activeTab === 'arena' ? 'text-white underline' : ''
              }`}
            >
              Cloud Arena (Game)
            </a>
            <a
              href="#studio"
              onClick={(e) => {
                e.preventDefault();
                setActiveTab('studio');
              }}
              className={`hover:text-white hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0 ${
                activeTab === 'studio' ? 'text-white underline' : ''
              }`}
            >
              Tablet Host & QR
            </a>
            <a
              href="#lab"
              onClick={(e) => {
                e.preventDefault();
                setActiveTab('lab');
              }}
              className={`hover:text-white hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0 ${
                activeTab === 'lab' ? 'text-white underline' : ''
              }`}
            >
              Protocol Lab
            </a>
          </nav>

          {/* Zone 3: 1 primary action */}
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => {
                setActiveTab('controller');
                setPureControllerOnly(true);
              }}
              className="px-3 py-1.5 text-xs font-semibold text-slate-950 bg-amber-500 rounded-lg hover:bg-amber-400 transition-colors whitespace-nowrap shrink-0"
            >
              एक-स्क्रीन मोड (1-Screen Pad)
            </button>
          </div>
        </header>
      )}

      {/* Main Content Container Routing Across Separated Sub-Pages */}
      <main
        className={
          isSingleScreenController
            ? 'flex-1 w-full h-full min-h-0 overflow-hidden p-1 sm:p-2 flex flex-col'
            : 'flex-1 w-full max-w-7xl mx-auto px-2.5 sm:px-6 py-3 sm:py-5 flex flex-col gap-4'
        }
      >
        {activeTab === 'controller' && (
          <ControllerRemotePage
            {...sharedControllerProps}
            isPureControllerOnly={pureControllerOnly}
            onTogglePureControllerOnly={() => setPureControllerOnly((v) => !v)}
          />
        )}

        {activeTab === 'studio' && (
          <TabletHostStudioPage
            {...sharedControllerProps}
            jitterMs={jitterMs}
            packetsPerSec={packetsPerSec}
            peers={peers}
            lastHexPacket={lastHexPacket}
            onSwitchToControllerMode={() => setActiveTab('controller')}
          />
        )}

        {activeTab === 'arena' && (
          <CloudArenaPage
            {...sharedControllerProps}
            autostart={autostartArena}
            onRumble={(intensity, durationMs) => sendHapticPulse(intensity, durationMs)}
          />
        )}

        {activeTab === 'lab' && (
          <ProtocolLabPage
            gamepadState={gamepadState}
            lastHexPacket={lastHexPacket}
            calibration={calibration}
            onCalibrationChange={setCalibration}
            onButtonToggle={(idx, val) => setButtonValue(idx, val)}
          />
        )}
      </main>
    </div>
  );
}
