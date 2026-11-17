import { useState } from 'react';
import { usePulsePadTransport } from './hooks/usePulsePadTransport';
import { ControllerRemotePage } from './pages/ControllerRemotePage';
import { TabletHostStudioPage } from './pages/TabletHostStudioPage';
import { CloudArenaPage } from './pages/CloudArenaPage';
import { ProtocolLabPage } from './pages/ProtocolLabPage';

export type ActiveWorkspaceTab = 'controller' | 'studio' | 'arena' | 'lab';

export default function App() {
  const params =
    typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;
  const initialRoom = params?.get('room') || 'PULSE1';
  const initialModeParam = params?.get('mode');
  const autostartArena = params?.get('autostart') === '1';

  const [activeTab, setActiveTab] = useState<ActiveWorkspaceTab>(() => {
    if (initialModeParam === 'studio') return 'studio';
    if (initialModeParam === 'arena' || autostartArena) return 'arena';
    if (initialModeParam === 'lab') return 'lab';
    return 'controller';
  });

  const [pureControllerOnly, setPureControllerOnly] = useState<boolean>(
    () => initialModeParam === 'controller'
  );

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

  const sharedControllerProps = {
    roomCode,
    onRoomCodeChange: setRoomCode,
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
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
      {/* Strict 3-Zone Top Bar Contract (Hidden when user enables 100% Pure Controller-Only Mode) */}
      {!pureControllerOnly && (
        <header className="flex items-center justify-between gap-8 px-6 py-3.5 border-b border-slate-800 bg-slate-950">
          {/* Zone 1: Single text element wordmark */}
          <a
            href="./"
            onClick={(e) => {
              e.preventDefault();
              setActiveTab('controller');
            }}
            className="text-lg font-display font-bold tracking-tight text-white whitespace-nowrap shrink-0"
          >
            PulsePad
          </a>

          {/* Zone 2: 4 clean single-line text navigation links */}
          <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-300">
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
              href="#arena"
              onClick={(e) => {
                e.preventDefault();
                setActiveTab('arena');
              }}
              className={`hover:text-white hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0 ${
                activeTab === 'arena' ? 'text-white underline' : ''
              }`}
            >
              Cloud Arena
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
          <div className="flex items-center gap-3 shrink-0">
            <button
              type="button"
              onClick={() => {
                setActiveTab('controller');
                setPureControllerOnly(true);
              }}
              className="px-4 py-2 text-xs font-semibold text-slate-950 bg-amber-500 rounded-lg hover:bg-amber-400 transition-colors whitespace-nowrap shrink-0"
            >
              Pure Controller Mode
            </button>
          </div>
        </header>
      )}

      {/* Main Content Container Routing Across Separated Sub-Pages */}
      <main
        className={`flex-1 w-full max-w-7xl mx-auto px-3 sm:px-6 ${
          pureControllerOnly ? 'py-3' : 'py-5'
        } flex flex-col gap-5`}
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
