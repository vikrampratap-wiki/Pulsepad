import React, { useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import {
  ControllerSkin,
  StickCalibrationConfig,
  VirtualGamepadState,
  buildControllerPairUrl,
  formatRoomIdDisplay,
  resolveRelayBackendOrigin,
  sanitizeRoomId,
} from '../protocol/gamepadProtocol';
import {
  ControllerThemeConfig,
  getShellThemeClasses,
  hexToRgba,
  loadControllerThemeFromStorage,
  saveControllerThemeToStorage,
} from '../protocol/controllerTheme';
import {
  ALL_MODULE_IDS,
  ControllerLayoutMap,
  CustomizableModuleId,
  MODULE_LABELS,
  ModulePositionOffset,
  clampOffset,
  loadControllerLayoutFromStorage,
  saveControllerLayoutToStorage,
} from '../protocol/controllerLayoutPositions';
import { ControllerThemePickerDrawer } from './controller/ControllerThemePickerDrawer';
import { ControllerLayoutEditorDrawer } from './controller/ControllerLayoutEditorDrawer';
import { ControllerOptionsDrawer } from './controller/ControllerOptionsDrawer';
import { ExternalGamingBridgeDrawer } from './controller/ExternalGamingBridgeDrawer';
import { ActiveWorkspaceTab } from '../App';
import {
  Compass,
  Zap,
  Settings2,
  Maximize2,
  Minimize2,
  Globe,
  Palette,
  Move,
  Wifi,
  Smartphone,
  RefreshCw,
  X,
} from 'lucide-react';

export type ControllerGripLayout = 'console_shell' | 'split_edge' | 'arcade_fightpad';

export interface TouchControllerPadProps {
  roomCode: string;
  onRoomCodeChange?: (nextRoom: string) => void;
  onGenerateNewRoomId?: () => void;
  gamepadState: VirtualGamepadState;
  calibration: StickCalibrationConfig;
  onCalibrationChange: React.Dispatch<React.SetStateAction<StickCalibrationConfig>>;
  onButtonChange: (index: number, value: number) => void;
  onStickChange: (stick: 'left' | 'right', x: number, y: number) => void;
  onSkinChange: (skin: ControllerSkin) => void;
  onGyroChange: (tiltX: number, tiltY: number) => void;
  onResetAll: () => void;
  onMacroTrigger: (macroId: 'hadouken' | 'rapid_rt' | 'dodge_reload') => void;
  onHapticTest: () => void;
  rttMs: number;
  wsConnected?: boolean;
  webrtcConnected?: boolean;
  peersCount?: number;
  isPureControllerOnly?: boolean;
  onTogglePureControllerOnly?: () => void;
  activeTab?: ActiveWorkspaceTab;
  onNavigateTab?: (tab: ActiveWorkspaceTab) => void;
}

export const TouchControllerPad: React.FC<TouchControllerPadProps> = ({
  roomCode,
  onRoomCodeChange,
  onGenerateNewRoomId,
  gamepadState,
  calibration,
  onCalibrationChange,
  onButtonChange,
  onStickChange,
  onSkinChange,
  onGyroChange,
  onResetAll,
  onMacroTrigger,
  onHapticTest,
  rttMs,
  wsConnected = true,
  webrtcConnected = false,
  peersCount = 1,
  isPureControllerOnly = false,
  onTogglePureControllerOnly,
  onNavigateTab,
}) => {
  const leftStickRef = useRef<HTMLDivElement | null>(null);
  const rightStickRef = useRef<HTMLDivElement | null>(null);

  const [holdLockMode, setHoldLockMode] = useState<boolean>(false);
  const [quickRoomInput, setQuickRoomInput] = useState<string>(roomCode);

  useEffect(() => {
    setQuickRoomInput(roomCode);
  }, [roomCode]);

  // Load saved gripLayout and custom drag-and-drop module positions from localStorage
  const [savedLayoutState, setSavedLayoutState] = useState(() =>
    loadControllerLayoutFromStorage()
  );

  const gripLayout = savedLayoutState.gripLayout;
  const modulePositions = savedLayoutState.modules;

  const [showThemePicker, setShowThemePicker] = useState<boolean>(false);
  const [showLayoutEditor, setShowLayoutEditor] = useState<boolean>(false);
  const [isDragModeActive, setIsDragModeActive] = useState<boolean>(false);
  const [selectedModule, setSelectedModule] = useState<CustomizableModuleId>('faceButtons');
  const [showOptionsDrawer, setShowOptionsDrawer] = useState<boolean>(false);
  const [showExternalSiteModal, setShowExternalSiteModal] = useState<boolean>(false);
  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const [wakeLockActive, setWakeLockActive] = useState<boolean>(false);

  // Active pointer drag state for drag-and-drop repositioning
  const activeDragRef = useRef<{
    moduleId: CustomizableModuleId;
    pointerId: number;
    startClientX: number;
    startClientY: number;
    initialDx: number;
    initialDy: number;
  } | null>(null);

  const [theme, setTheme] = useState<ControllerThemeConfig>(() =>
    loadControllerThemeFromStorage()
  );

  useEffect(() => {
    saveControllerThemeToStorage(theme);
  }, [theme]);

  useEffect(() => {
    saveControllerLayoutToStorage(savedLayoutState);
  }, [savedLayoutState]);

  const setGripLayout = (nextGrip: ControllerGripLayout) => {
    setSavedLayoutState((prev) => ({
      ...prev,
      gripLayout: nextGrip,
    }));
  };

  const updateModuleOffset = (
    id: CustomizableModuleId,
    patch: Partial<ModulePositionOffset>
  ) => {
    setSavedLayoutState((prev) => {
      const current = prev.modules[id] ?? { dx: 0, dy: 0, scale: 1 };
      const updated = clampOffset({ ...current, ...patch });
      return {
        ...prev,
        modules: {
          ...prev.modules,
          [id]: updated,
        },
      };
    });
  };

  const applyLayoutPreset = (nextMap: ControllerLayoutMap) => {
    setSavedLayoutState((prev) => ({
      ...prev,
      modules: nextMap,
    }));
  };

  const updateThemeField = <K extends keyof ControllerThemeConfig>(
    key: K,
    value: ControllerThemeConfig[K]
  ) => {
    setTheme((prev) => ({
      ...prev,
      id: 'custom',
      name: 'Custom User Theme',
      [key]: value,
    }));
  };

  const skin = gamepadState.skin;
  const isPS = skin === 'playstation';
  const shellClasses = getShellThemeClasses(theme.shellTheme);
  const borderAlpha = theme.borderOpacityPercent / 100;
  const isTabletPaired = peersCount >= 2 || webrtcConnected;
  const formattedRoomId = formatRoomIdDisplay(roomCode);

  const appOrigin = resolveRelayBackendOrigin();
  const controllerPairUrl = buildControllerPairUrl(roomCode);

  useEffect(() => {
    let active = true;
    QRCode.toDataURL(controllerPairUrl, {
      width: 148,
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
  }, [controllerPairUrl]);

  useEffect(() => {
    let wakeLockObj: { release?: () => Promise<void> } | null = null;
    if (typeof navigator !== 'undefined' && 'wakeLock' in navigator) {
      (
        navigator as unknown as {
          wakeLock: { request: (t: string) => Promise<{ release: () => Promise<void> }> };
        }
      ).wakeLock
        .request('screen')
        .then((sentinel) => {
          wakeLockObj = sentinel;
          setWakeLockActive(true);
        })
        .catch(() => {
          setWakeLockActive(false);
        });
    }
    return () => {
      wakeLockObj?.release?.().catch(() => {});
    };
  }, []);

  const handleButtonPress = (index: number, targetValue = 1) => {
    if (isDragModeActive) return;
    if (holdLockMode) {
      const current = gamepadState.buttons[index] ?? 0;
      onButtonChange(index, current > 0.2 ? 0 : targetValue);
      return;
    }
    onButtonChange(index, targetValue);
  };

  const handleButtonRelease = (index: number) => {
    if (isDragModeActive || holdLockMode) return;
    onButtonChange(index, 0);
  };

  const computeStickFromPointer = (
    e: React.PointerEvent<HTMLDivElement>,
    stick: 'left' | 'right',
    ref: React.RefObject<HTMLDivElement | null>
  ) => {
    if (isDragModeActive) return;
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const maxRadius = rect.width * 0.42;

    const dx = e.clientX - centerX;
    const dy = e.clientY - centerY;
    const dist = Math.hypot(dx, dy);
    const scale = dist > maxRadius ? maxRadius / dist : 1;

    const normX = Math.round(((dx * scale) / maxRadius) * 100) / 100;
    const normY = Math.round(((dy * scale) / maxRadius) * 100) / 100;
    onStickChange(stick, normX, normY);
  };

  // Dynamic CSS for both real-time color themes and drag-and-drop module positions
  const moduleTransformRules = ALL_MODULE_IDS.map((id) => {
    const pos = modulePositions[id] ?? { dx: 0, dy: 0, scale: 1 };
    return `
      .pad-pos-${id} {
        transform: translate3d(${pos.dx}px, ${pos.dy}px, 0) scale(${pos.scale});
        transform-origin: center center;
      }
    `;
  }).join('\n');

  const dynamicThemeCss = `
    .pad-btn-themed {
      border-color: ${hexToRgba(theme.buttonAccentHex, borderAlpha)};
      color: ${theme.buttonAccentHex};
    }
    .pad-btn-themed:hover {
      border-color: ${theme.buttonAccentHex};
    }
    .pad-btn-themed-active {
      background-color: ${theme.buttonAccentHex};
      border-color: #FFFFFF;
      color: #090D16;
    }
    .pad-stick-ring-themed {
      border-color: ${hexToRgba(theme.stickAccentHex, borderAlpha)};
    }
    .pad-stick-cap-themed {
      border-color: ${theme.stickAccentHex};
      color: ${theme.stickAccentHex};
      background-color: ${hexToRgba(theme.stickAccentHex, 0.14)};
    }
    .pad-stick-cap-active {
      background-color: ${theme.stickAccentHex};
      border-color: #FFFFFF;
      color: #090D16;
    }
    .pad-trigger-themed {
      border-color: ${hexToRgba(theme.triggerAccentHex, borderAlpha)};
      color: ${theme.triggerAccentHex};
    }
    .pad-trigger-themed-active {
      background-color: ${theme.triggerAccentHex};
      border-color: #FFFFFF;
      color: #090D16;
    }
    .pad-slider-themed {
      accent-color: ${theme.triggerAccentHex};
    }
    .pad-stick-left-pos {
      transform: translate3d(${(gamepadState.axes[0] * 24).toFixed(1)}px, ${(gamepadState.axes[1] * 24).toFixed(1)}px, 0);
    }
    .pad-stick-right-pos {
      transform: translate3d(${(gamepadState.axes[2] * 24).toFixed(1)}px, ${(gamepadState.axes[3] * 24).toFixed(1)}px, 0);
    }
    .pad-deadzone-ring {
      width: ${Math.max(12, Math.round(calibration.deadzone * 100))}%;
      height: ${Math.max(12, Math.round(calibration.deadzone * 100))}%;
      border-color: ${hexToRgba(theme.stickAccentHex, 0.45)};
    }
    ${moduleTransformRules}
  `;

  // Wrapper that makes any controller module draggable and applies its saved (dx, dy, scale)
  const renderDraggableModule = (
    moduleId: CustomizableModuleId,
    children: React.ReactNode,
    extraClassName = ''
  ) => {
    const offset = modulePositions[moduleId] ?? { dx: 0, dy: 0, scale: 1 };
    const isSelected = selectedModule === moduleId && (showLayoutEditor || isDragModeActive);

    return (
      <div
        data-testid={`layout-module-${moduleId}`}
        data-dx={offset.dx}
        data-dy={offset.dy}
        data-scale={offset.scale}
        onPointerDownCapture={(e) => {
          if (!isDragModeActive) return;
          e.stopPropagation();
          setSelectedModule(moduleId);
          e.currentTarget.setPointerCapture(e.pointerId);
          activeDragRef.current = {
            moduleId,
            pointerId: e.pointerId,
            startClientX: e.clientX,
            startClientY: e.clientY,
            initialDx: offset.dx,
            initialDy: offset.dy,
          };
        }}
        onPointerMoveCapture={(e) => {
          if (!isDragModeActive) return;
          const drag = activeDragRef.current;
          if (!drag || drag.moduleId !== moduleId || drag.pointerId !== e.pointerId) return;
          e.stopPropagation();
          const deltaX = Math.round(e.clientX - drag.startClientX);
          const deltaY = Math.round(e.clientY - drag.startClientY);
          updateModuleOffset(moduleId, {
            dx: drag.initialDx + deltaX,
            dy: drag.initialDy + deltaY,
          });
        }}
        onPointerUpCapture={(e) => {
          if (!isDragModeActive) return;
          const drag = activeDragRef.current;
          if (drag && drag.moduleId === moduleId && drag.pointerId === e.pointerId) {
            e.stopPropagation();
            activeDragRef.current = null;
          }
        }}
        className={`relative transition-shadow pad-pos-${moduleId} ${extraClassName} ${
          isDragModeActive
            ? `cursor-move select-none rounded-2xl p-1 border-2 border-dashed ${
                isSelected
                  ? 'border-amber-400 bg-amber-500/10 z-30 shadow-lg'
                  : 'border-amber-500/50 bg-slate-950/40 z-20 hover:border-amber-400'
              }`
            : ''
        }`}
      >
        {isDragModeActive && (
          <div className="flex items-center justify-between gap-1 px-1.5 py-0.5 mb-0.5 rounded bg-amber-500 text-slate-950 text-[9px] font-mono font-bold pointer-events-none">
            <span className="truncate">{MODULE_LABELS[moduleId]}</span>
            <span className="tabular-nums shrink-0">
              {offset.dx > 0 ? `+${offset.dx}` : offset.dx},{offset.dy > 0 ? `+${offset.dy}` : offset.dy}
            </span>
          </div>
        )}
        <div className={isDragModeActive ? 'pointer-events-none' : ''}>{children}</div>
      </div>
    );
  };

  const renderAnalogStick = (
    stick: 'left' | 'right',
    label: string,
    clickButtonIndex: number,
    ref: React.RefObject<HTMLDivElement | null>
  ) => {
    const x = stick === 'left' ? gamepadState.axes[0] : gamepadState.axes[2];
    const y = stick === 'left' ? gamepadState.axes[1] : gamepadState.axes[3];
    const stickClicked = (gamepadState.buttons[clickButtonIndex] ?? 0) > 0.5;
    const isLarge = gripLayout === 'split_edge';

    return (
      <div className="flex flex-col items-center gap-1 w-full">
        {/* Compact Single Header Row: Stick Label + Axis Readout + Center(0,0) + L3/R3 Click */}
        <div className="flex items-center justify-between gap-1 w-full px-0.5 text-[10px] text-slate-400">
          <span className="font-semibold text-slate-300 truncate">{label}</span>
          <div className="flex items-center gap-1 shrink-0">
            <span className="hidden sm:inline font-mono tabular-nums text-[9px] text-slate-400">
              {x.toFixed(1)},{y.toFixed(1)}
            </span>
            <button
              type="button"
              onClick={() => onStickChange(stick, 0, 0)}
              className={`min-h-[20px] px-1.5 text-[9px] font-mono rounded border whitespace-nowrap shrink-0 ${shellClasses.moduleSurface} text-slate-400 hover:text-white`}
              aria-label={`${label} Center`}
            >
              0,0
            </button>
            <button
              type="button"
              onClick={() =>
                onButtonChange(
                  clickButtonIndex,
                  (gamepadState.buttons[clickButtonIndex] ?? 0) > 0.5 ? 0 : 1
                )
              }
              className={`min-h-[20px] px-1.5 text-[9px] font-mono rounded border whitespace-nowrap shrink-0 ${
                stickClicked
                  ? 'pad-stick-cap-active font-bold'
                  : `${shellClasses.moduleSurface} text-slate-300 hover:border-slate-600`
              }`}
              aria-label={`Click ${stick === 'left' ? 'L3' : 'R3'}`}
            >
              {stick === 'left' ? 'L3' : 'R3'}
            </button>
          </div>
        </div>

        <div
          ref={ref}
          data-testid={`analog-stick-${stick}`}
          data-stick-color={theme.stickAccentHex}
          onPointerDown={(e) => {
            if (isDragModeActive) return;
            e.currentTarget.setPointerCapture(e.pointerId);
            computeStickFromPointer(e, stick, ref);
          }}
          onPointerMove={(e) => {
            if (isDragModeActive) return;
            if (e.buttons > 0) {
              computeStickFromPointer(e, stick, ref);
            }
          }}
          onPointerUp={() => {
            if (isDragModeActive) return;
            if (!holdLockMode) {
              onStickChange(stick, 0, 0);
            }
          }}
          className={`relative ${
            isLarge
              ? 'w-20 h-20 sm:w-32 sm:h-32 lg:w-36 lg:h-36'
              : 'w-[74px] h-[74px] sm:w-28 sm:h-28 lg:w-32 lg:h-32'
          } rounded-full border-2 transition-colors controller-surface flex items-center justify-center cursor-grab active:cursor-grabbing ${shellClasses.moduleSurface} pad-stick-ring-themed shadow-inner`}
        >
          <div className="absolute inset-1.5 rounded-full border border-slate-800/90 pointer-events-none" />
          <div className="absolute w-full h-px bg-slate-800/80 pointer-events-none" />
          <div className="absolute h-full w-px bg-slate-800/80 pointer-events-none" />
          <div className="rounded-full border border-dashed pointer-events-none pad-deadzone-ring" />

          <div
            className={`w-9 h-9 sm:w-12 sm:h-12 rounded-full border-2 flex flex-col items-center justify-center pointer-events-none transition-transform duration-75 ${
              stick === 'left' ? 'pad-stick-left-pos' : 'pad-stick-right-pos'
            } ${stickClicked ? 'pad-stick-cap-active scale-95' : 'pad-stick-cap-themed'}`}
          >
            <span className="text-[9px] sm:text-[11px] font-mono font-bold">
              {stick === 'left' ? (isPS ? 'L3' : 'LS') : isPS ? 'R3' : 'RS'}
            </span>
          </div>
        </div>
      </div>
    );
  };

  const renderDPad = () => {
    const up = (gamepadState.buttons[12] ?? 0) > 0.5;
    const down = (gamepadState.buttons[13] ?? 0) > 0.5;
    const left = (gamepadState.buttons[14] ?? 0) > 0.5;
    const right = (gamepadState.buttons[15] ?? 0) > 0.5;

    const btnBase =
      'w-9 h-9 sm:w-11 sm:h-11 flex items-center justify-center rounded-xl border font-mono text-xs font-bold transition-transform active:scale-95 controller-surface';

    return (
      <div className="flex flex-col items-center gap-0.5">
        <span className="text-[10px] text-slate-400">D-Pad</span>
        <div
          className={`grid grid-cols-3 gap-1 p-1 sm:p-2 rounded-2xl border ${shellClasses.moduleSurface}`}
        >
          <div />
          <button
            type="button"
            aria-label="D-Pad Up"
            onPointerDown={() => handleButtonPress(12, 1)}
            onPointerUp={() => handleButtonRelease(12)}
            onPointerLeave={() => handleButtonRelease(12)}
            className={`${btnBase} ${
              up ? 'pad-btn-themed-active' : 'bg-slate-900 pad-btn-themed'
            }`}
          >
            ▲
          </button>
          <div />

          <button
            type="button"
            aria-label="D-Pad Left"
            onPointerDown={() => handleButtonPress(14, 1)}
            onPointerUp={() => handleButtonRelease(14)}
            onPointerLeave={() => handleButtonRelease(14)}
            className={`${btnBase} ${
              left ? 'pad-btn-themed-active' : 'bg-slate-900 pad-btn-themed'
            }`}
          >
            ◀
          </button>
          <div className="w-9 h-9 sm:w-11 sm:h-11 rounded-lg bg-slate-900/70 border border-slate-800 flex items-center justify-center text-[8px] font-mono text-slate-400">
            DPAD
          </div>
          <button
            type="button"
            aria-label="D-Pad Right"
            onPointerDown={() => handleButtonPress(15, 1)}
            onPointerUp={() => handleButtonRelease(15)}
            onPointerLeave={() => handleButtonRelease(15)}
            className={`${btnBase} ${
              right ? 'pad-btn-themed-active' : 'bg-slate-900 pad-btn-themed'
            }`}
          >
            ▶
          </button>

          <div />
          <button
            type="button"
            aria-label="D-Pad Down"
            onPointerDown={() => handleButtonPress(13, 1)}
            onPointerUp={() => handleButtonRelease(13)}
            onPointerLeave={() => handleButtonRelease(13)}
            className={`${btnBase} ${
              down ? 'pad-btn-themed-active' : 'bg-slate-900 pad-btn-themed'
            }`}
          >
            ▼
          </button>
          <div />
        </div>
      </div>
    );
  };

  const renderFaceButtons = () => {
    const b0 = (gamepadState.buttons[0] ?? 0) > 0.5;
    const b1 = (gamepadState.buttons[1] ?? 0) > 0.5;
    const b2 = (gamepadState.buttons[2] ?? 0) > 0.5;
    const b3 = (gamepadState.buttons[3] ?? 0) > 0.5;
    const b5 = (gamepadState.buttons[5] ?? 0) > 0.5;
    const b7 = (gamepadState.buttons[7] ?? 0) > 0.25;

    if (gripLayout === 'arcade_fightpad') {
      return (
        <div className="flex flex-col items-center gap-0.5">
          <span className="text-[10px] text-slate-400">6-Btn Fightpad</span>
          <div
            data-testid="face-buttons-cluster"
            data-button-accent={theme.buttonAccentHex}
            className={`grid grid-cols-3 gap-1 sm:gap-2 p-1.5 sm:p-2.5 rounded-2xl border ${shellClasses.moduleSurface}`}
          >
            <button
              type="button"
              aria-label={isPS ? 'Button Square' : 'Button X'}
              onPointerDown={() => handleButtonPress(2, 1)}
              onPointerUp={() => handleButtonRelease(2)}
              onPointerLeave={() => handleButtonRelease(2)}
              className={`w-9 h-9 sm:w-12 sm:h-12 rounded-full border-2 font-display font-bold text-xs sm:text-sm flex items-center justify-center ${
                b2 ? 'pad-btn-themed-active' : 'bg-slate-900 pad-btn-themed'
              }`}
            >
              {isPS ? '□' : 'X'}
            </button>
            <button
              type="button"
              aria-label={isPS ? 'Button Triangle' : 'Button Y'}
              onPointerDown={() => handleButtonPress(3, 1)}
              onPointerUp={() => handleButtonRelease(3)}
              onPointerLeave={() => handleButtonRelease(3)}
              className={`w-9 h-9 sm:w-12 sm:h-12 rounded-full border-2 font-display font-bold text-xs sm:text-sm flex items-center justify-center ${
                b3 ? 'pad-btn-themed-active' : 'bg-slate-900 pad-btn-themed'
              }`}
            >
              {isPS ? '△' : 'Y'}
            </button>
            <button
              type="button"
              aria-label={isPS ? 'Arcade R1' : 'Arcade RB'}
              onPointerDown={() => handleButtonPress(5, 1)}
              onPointerUp={() => handleButtonRelease(5)}
              onPointerLeave={() => handleButtonRelease(5)}
              className={`w-9 h-9 sm:w-12 sm:h-12 rounded-full border-2 font-display font-bold text-[10px] flex items-center justify-center ${
                b5 ? 'pad-trigger-themed-active' : 'bg-slate-900 pad-trigger-themed'
              }`}
            >
              {isPS ? 'R1' : 'RB'}
            </button>

            <button
              type="button"
              aria-label={isPS ? 'Button Cross' : 'Button A'}
              onPointerDown={() => handleButtonPress(0, 1)}
              onPointerUp={() => handleButtonRelease(0)}
              onPointerLeave={() => handleButtonRelease(0)}
              className={`w-9 h-9 sm:w-12 sm:h-12 rounded-full border-2 font-display font-bold text-xs sm:text-sm flex items-center justify-center ${
                b0 ? 'pad-btn-themed-active' : 'bg-slate-900 pad-btn-themed'
              }`}
            >
              {isPS ? '✕' : 'A'}
            </button>
            <button
              type="button"
              aria-label={isPS ? 'Button Circle' : 'Button B'}
              onPointerDown={() => handleButtonPress(1, 1)}
              onPointerUp={() => handleButtonRelease(1)}
              onPointerLeave={() => handleButtonRelease(1)}
              className={`w-9 h-9 sm:w-12 sm:h-12 rounded-full border-2 font-display font-bold text-xs sm:text-sm flex items-center justify-center ${
                b1 ? 'pad-btn-themed-active' : 'bg-slate-900 pad-btn-themed'
              }`}
            >
              {isPS ? '○' : 'B'}
            </button>
            <button
              type="button"
              aria-label={isPS ? 'Arcade R2' : 'Arcade RT'}
              onPointerDown={() => handleButtonPress(7, 1)}
              onPointerUp={() => handleButtonRelease(7)}
              onPointerLeave={() => handleButtonRelease(7)}
              className={`w-9 h-9 sm:w-12 sm:h-12 rounded-full border-2 font-display font-bold text-[10px] flex items-center justify-center ${
                b7 ? 'pad-trigger-themed-active' : 'bg-slate-900 pad-trigger-themed'
              }`}
            >
              {isPS ? 'R2' : 'RT'}
            </button>
          </div>
        </div>
      );
    }

    const sizeClass =
      skin === 'pro_claw' || gripLayout === 'split_edge'
        ? 'w-10 h-10 sm:w-12 sm:h-12 text-xs sm:text-sm'
        : 'w-9 h-9 sm:w-11 sm:h-11 text-xs sm:text-sm';

    return (
      <div className="flex flex-col items-center gap-0.5">
        <span className="text-[10px] text-slate-400">
          {isPS ? 'Action Buttons' : 'ABXY Buttons'}
        </span>
        <div
          data-testid="face-buttons-cluster"
          data-button-accent={theme.buttonAccentHex}
          className={`grid grid-cols-3 gap-1 sm:gap-1.5 p-1 sm:p-2 rounded-2xl border ${shellClasses.moduleSurface}`}
        >
          <div />
          <button
            type="button"
            aria-label={isPS ? 'Button Triangle' : 'Button Y'}
            onPointerDown={() => handleButtonPress(3, 1)}
            onPointerUp={() => handleButtonRelease(3)}
            onPointerLeave={() => handleButtonRelease(3)}
            className={`${sizeClass} rounded-full border-2 font-display font-bold flex items-center justify-center transition-transform active:scale-95 controller-surface ${
              b3 ? 'pad-btn-themed-active' : 'bg-slate-900 pad-btn-themed'
            }`}
          >
            {isPS ? '△' : 'Y'}
          </button>
          <div />

          <button
            type="button"
            aria-label={isPS ? 'Button Square' : 'Button X'}
            onPointerDown={() => handleButtonPress(2, 1)}
            onPointerUp={() => handleButtonRelease(2)}
            onPointerLeave={() => handleButtonRelease(2)}
            className={`${sizeClass} rounded-full border-2 font-display font-bold flex items-center justify-center transition-transform active:scale-95 controller-surface ${
              b2 ? 'pad-btn-themed-active' : 'bg-slate-900 pad-btn-themed'
            }`}
          >
            {isPS ? '□' : 'X'}
          </button>

          <div className="w-9 h-9 sm:w-11 sm:h-11 rounded-full bg-slate-900 border border-slate-800 flex items-center justify-center text-[8px] font-mono text-slate-400">
            {isPS ? 'PS5' : 'XBOX'}
          </div>

          <button
            type="button"
            aria-label={isPS ? 'Button Circle' : 'Button B'}
            onPointerDown={() => handleButtonPress(1, 1)}
            onPointerUp={() => handleButtonRelease(1)}
            onPointerLeave={() => handleButtonRelease(1)}
            className={`${sizeClass} rounded-full border-2 font-display font-bold flex items-center justify-center transition-transform active:scale-95 controller-surface ${
              b1 ? 'pad-btn-themed-active' : 'bg-slate-900 pad-btn-themed'
            }`}
          >
            {isPS ? '○' : 'B'}
          </button>

          <div />
          <button
            type="button"
            aria-label={isPS ? 'Button Cross' : 'Button A'}
            onPointerDown={() => handleButtonPress(0, 1)}
            onPointerUp={() => handleButtonRelease(0)}
            onPointerLeave={() => handleButtonRelease(0)}
            className={`${sizeClass} rounded-full border-2 font-display font-bold flex items-center justify-center transition-transform active:scale-95 controller-surface ${
              b0 ? 'pad-btn-themed-active' : 'bg-slate-900 pad-btn-themed'
            }`}
          >
            {isPS ? '✕' : 'A'}
          </button>
          <div />
        </div>
      </div>
    );
  };

  const renderCenterBridgeContent = () => (
    <div
      className={`flex flex-wrap lg:flex-col items-center justify-between gap-1.5 sm:gap-2.5 p-1.5 sm:p-3 rounded-2xl border ${shellClasses.moduleSurface}`}
    >
      {/* System Menu Buttons: View / Guide / Menu */}
      <div className="flex items-center justify-center gap-1.5 w-full lg:w-auto">
        <button
          type="button"
          aria-label={isPS ? 'Button Create' : 'Button View'}
          onPointerDown={() => handleButtonPress(8, 1)}
          onPointerUp={() => handleButtonRelease(8)}
          onPointerLeave={() => handleButtonRelease(8)}
          className={`min-h-[30px] sm:min-h-[36px] px-2.5 rounded-xl border text-[11px] font-medium transition-colors whitespace-nowrap shrink-0 ${
            (gamepadState.buttons[8] ?? 0) > 0.5
              ? 'pad-btn-themed-active font-bold'
              : 'bg-slate-900 text-slate-300 border-slate-800 hover:border-slate-600'
          }`}
        >
          {isPS ? 'Create' : 'View'}
        </button>

        <button
          type="button"
          aria-label={isPS ? 'PlayStation Home Button' : 'Xbox Guide Button'}
          onPointerDown={() => handleButtonPress(16, 1)}
          onPointerUp={() => handleButtonRelease(16)}
          onPointerLeave={() => handleButtonRelease(16)}
          className={`min-w-[36px] min-h-[32px] sm:min-w-[44px] sm:min-h-[42px] px-2.5 rounded-full border-2 font-display font-bold text-[11px] transition-transform active:scale-95 whitespace-nowrap shrink-0 ${
            (gamepadState.buttons[16] ?? 0) > 0.5
              ? 'pad-btn-themed-active'
              : 'bg-slate-900 pad-btn-themed'
          }`}
        >
          {isPS ? 'PS' : 'XBOX'}
        </button>

        <button
          type="button"
          aria-label={isPS ? 'Button Options' : 'Button Menu'}
          onPointerDown={() => handleButtonPress(9, 1)}
          onPointerUp={() => handleButtonRelease(9)}
          onPointerLeave={() => handleButtonRelease(9)}
          className={`min-h-[30px] sm:min-h-[36px] px-2.5 rounded-xl border text-[11px] font-medium transition-colors whitespace-nowrap shrink-0 ${
            (gamepadState.buttons[9] ?? 0) > 0.5
              ? 'pad-btn-themed-active font-bold'
              : 'bg-slate-900 text-slate-300 border-slate-800 hover:border-slate-600'
          }`}
        >
          {isPS ? 'Options' : 'Menu / Start'}
        </button>

        {/* Compact Gyro Toggle Pill right next to Start on Mobile */}
        <button
          type="button"
          onClick={() =>
            onCalibrationChange((prev) => ({
              ...prev,
              gyroEnabled: !prev.gyroEnabled,
            }))
          }
          className={`min-h-[30px] px-2 rounded-xl text-[10px] font-mono font-semibold flex items-center gap-1 transition-colors whitespace-nowrap shrink-0 ${
            calibration.gyroEnabled
              ? 'bg-emerald-500 text-slate-950'
              : 'bg-slate-900 border border-slate-800 text-slate-400 hover:text-white'
          }`}
        >
          <Compass className="w-3 h-3" />
          <span>{calibration.gyroEnabled ? 'GYRO ON' : 'GYRO'}</span>
        </button>
      </div>

      {/* Gyro Slider (Desktop/Tablet or when Gyro Enabled) & 1-Row Quick Macros */}
      <div className="w-full flex flex-wrap lg:flex-col items-center justify-between gap-1.5">
        <div
          className={`${
            calibration.gyroEnabled ? 'flex' : 'hidden sm:flex'
          } w-full items-center gap-2 px-2 py-1 rounded-xl bg-slate-900 border border-slate-800`}
        >
          <label
            htmlFor="gyro-steer-slider"
            className="text-[10px] font-mono text-slate-400 shrink-0"
          >
            Tilt X
          </label>
          <input
            id="gyro-steer-slider"
            type="range"
            min={-1}
            max={1}
            step={0.05}
            value={gamepadState.gyroTiltX}
            onChange={(e) => {
              const val = parseFloat(e.target.value);
              if (!calibration.gyroEnabled) {
                onCalibrationChange((prev) => ({ ...prev, gyroEnabled: true }));
              }
              onGyroChange(val, gamepadState.gyroTiltY);
            }}
            className="w-full cursor-pointer pad-slider-themed"
          />
          <span className="text-[10px] font-mono tabular-nums text-slate-300 w-7 text-right">
            {Math.round(gamepadState.gyroTiltX * 45)}°
          </span>
        </div>

        <div className="w-full grid grid-cols-3 gap-1">
          <button
            type="button"
            onClick={() => onMacroTrigger('hadouken')}
            className="min-h-[28px] sm:min-h-[32px] px-1.5 py-0.5 rounded-lg bg-slate-900 border border-slate-800 hover:border-amber-500/60 text-[10px] font-medium text-slate-200 transition-colors whitespace-nowrap shrink-0 truncate flex items-center justify-center gap-1"
          >
            <Zap className="w-2.5 h-2.5 text-amber-400 shrink-0" />
            <span>Hadouken</span>
          </button>
          <button
            type="button"
            onClick={() => onMacroTrigger('rapid_rt')}
            className="min-h-[28px] sm:min-h-[32px] px-1.5 py-0.5 rounded-lg bg-slate-900 border border-slate-800 hover:border-amber-500/60 text-[10px] font-medium text-slate-200 transition-colors whitespace-nowrap shrink-0 truncate"
          >
            Turbo RT
          </button>
          <button
            type="button"
            onClick={() => onMacroTrigger('dodge_reload')}
            className="min-h-[28px] sm:min-h-[32px] px-1.5 py-0.5 rounded-lg bg-slate-900 border border-slate-800 hover:border-amber-500/60 text-[10px] font-medium text-slate-200 transition-colors whitespace-nowrap shrink-0 truncate"
          >
            Dodge+Reload
          </button>
        </div>
      </div>
    </div>
  );

  const hasOpenModalDrawer = showThemePicker || showOptionsDrawer || showExternalSiteModal;

  return (
    <div
      data-testid="virtual-controller-shell"
      data-shell-theme={theme.shellTheme}
      data-grip-layout={gripLayout}
      data-single-screen={isPureControllerOnly ? 'true' : 'false'}
      className={`relative rounded-2xl sm:rounded-3xl border-2 ${shellClasses.outerShell} ${
        shellClasses.textPrimary
      } ${
        isPureControllerOnly
          ? 'flex-1 h-full min-h-0 p-1.5 sm:p-3 flex flex-col justify-between gap-1 sm:gap-2 overflow-hidden select-none'
          : 'p-2 sm:p-4 flex flex-col gap-1.5 sm:gap-2.5 overflow-hidden'
      } transition-colors`}
    >
      <style>{dynamicThemeCss}</style>

      {/* Row 1: Ultra-Compact All-in-One Room ID & Mode Command Bar */}
      <div className="flex flex-wrap items-center justify-between gap-1 px-2 py-1 rounded-xl bg-slate-950/90 border border-slate-800 shrink-0">
        {/* Left: Unique 10-Digit Room ID + Input + New Secret ID Generator */}
        <div className="flex flex-wrap items-center gap-1">
          <span
            data-testid="live-pairing-badge"
            className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] sm:text-[11px] font-mono font-semibold border ${
              isTabletPaired
                ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300'
                : 'bg-amber-500/15 border-amber-500/40 text-amber-300'
            }`}
          >
            <Wifi className="w-3 h-3 shrink-0" />
            <span>
              {isTabletPaired
                ? `LINKED (${peersCount} · ${rttMs.toFixed(0)}ms)`
                : `ID: ${formattedRoomId}`}
            </span>
          </span>

          {onRoomCodeChange && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const clean = sanitizeRoomId(quickRoomInput);
                if (clean) {
                  onRoomCodeChange(clean);
                }
              }}
              className="inline-flex items-center gap-1"
            >
              <label htmlFor="quick-pad-room-input" className="sr-only">
                Room Code
              </label>
              <input
                id="quick-pad-room-input"
                type="text"
                maxLength={14}
                value={quickRoomInput}
                onChange={(e) => setQuickRoomInput(e.target.value.toUpperCase())}
                aria-label="Room Code"
                className="w-24 sm:w-28 min-h-[26px] px-1.5 rounded-md bg-slate-900 border border-slate-700 font-mono font-bold text-[10px] sm:text-[11px] text-amber-400 uppercase"
              />
              <button
                type="submit"
                className="min-h-[26px] px-2 rounded-md bg-slate-800 hover:bg-slate-700 text-[10px] font-semibold text-white whitespace-nowrap shrink-0"
              >
                Join
              </button>
              {onGenerateNewRoomId && (
                <button
                  type="button"
                  data-testid="generate-new-room-btn"
                  onClick={onGenerateNewRoomId}
                  title="Generate New 10-Digit Secret Numeric ID"
                  className="min-h-[26px] px-1.5 rounded-md bg-slate-900 border border-slate-700 hover:border-amber-400 text-[10px] font-semibold text-amber-300 flex items-center gap-0.5 whitespace-nowrap shrink-0"
                >
                  <RefreshCw className="w-2.5 h-2.5" />
                  <span>नया ID</span>
                </button>
              )}
            </form>
          )}
        </div>

        {/* Right: Skin + Grip + Single-Screen Toggle + Utility Triggers */}
        <div className="flex flex-wrap items-center gap-1">
          {/* Console Skin Selector */}
          <div className="flex items-center gap-0.5 p-0.5 bg-slate-900 rounded-lg border border-slate-800">
            <button
              type="button"
              onClick={() => onSkinChange('xbox')}
              className={`min-h-[24px] px-1.5 py-0.5 text-[10px] font-semibold rounded transition-colors whitespace-nowrap shrink-0 ${
                skin === 'xbox'
                  ? 'bg-emerald-500 text-slate-950'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              Xbox Series X|S
            </button>
            <button
              type="button"
              onClick={() => onSkinChange('playstation')}
              className={`min-h-[24px] px-1.5 py-0.5 text-[10px] font-semibold rounded transition-colors whitespace-nowrap shrink-0 ${
                skin === 'playstation'
                  ? 'bg-sky-500 text-slate-950'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              PS5 DualSense
            </button>
            <button
              type="button"
              onClick={() => onSkinChange('pro_claw')}
              className={`min-h-[24px] px-1.5 py-0.5 text-[10px] font-semibold rounded transition-colors whitespace-nowrap shrink-0 ${
                skin === 'pro_claw'
                  ? 'bg-amber-500 text-slate-950'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              Pro Claw + Gyro
            </button>
          </div>

          {/* Ergonomic Grip Selector (Desktop / Tablet inline) */}
          <div className="hidden md:flex items-center gap-0.5 p-0.5 bg-slate-900 rounded-lg border border-slate-800">
            <button
              type="button"
              onClick={() => setGripLayout('console_shell')}
              className={`min-h-[24px] px-1.5 py-0.5 text-[10px] font-medium rounded transition-colors whitespace-nowrap shrink-0 ${
                gripLayout === 'console_shell'
                  ? 'bg-slate-800 text-white'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Console Grip
            </button>
            <button
              type="button"
              onClick={() => setGripLayout('split_edge')}
              className={`min-h-[24px] px-1.5 py-0.5 text-[10px] font-medium rounded transition-colors whitespace-nowrap shrink-0 ${
                gripLayout === 'split_edge'
                  ? 'bg-slate-800 text-white'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Split Thumb-Edge
            </button>
            <button
              type="button"
              onClick={() => setGripLayout('arcade_fightpad')}
              className={`min-h-[24px] px-1.5 py-0.5 text-[10px] font-medium rounded transition-colors whitespace-nowrap shrink-0 ${
                gripLayout === 'arcade_fightpad'
                  ? 'bg-slate-800 text-white'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              6-Btn Fightpad
            </button>
          </div>

          {/* Utility Drawer Triggers */}
          <button
            type="button"
            data-testid="open-layout-editor-btn"
            onClick={() => {
              const nextOpen = !showLayoutEditor;
              setShowLayoutEditor(nextOpen);
              setIsDragModeActive(nextOpen);
            }}
            className={`min-h-[26px] px-1.5 py-0.5 text-[10px] font-semibold rounded-md border flex items-center gap-1 transition-colors whitespace-nowrap shrink-0 ${
              showLayoutEditor || isDragModeActive
                ? 'bg-amber-500 text-slate-950 border-amber-400'
                : 'bg-slate-900 border-slate-700 text-slate-200 hover:border-slate-500'
            }`}
          >
            <Move className="w-3 h-3" />
            <span>Edit Layout (Drag)</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setShowThemePicker((v) => !v);
              setShowOptionsDrawer(false);
              setShowExternalSiteModal(false);
            }}
            className={`min-h-[26px] px-1.5 py-0.5 text-[10px] font-semibold rounded-md border flex items-center gap-1 transition-colors whitespace-nowrap shrink-0 ${
              showThemePicker
                ? 'bg-amber-500 text-slate-950 border-amber-400'
                : 'bg-slate-900 border-slate-700 text-slate-200 hover:border-slate-500'
            }`}
          >
            <Palette className="w-3 h-3" />
            <span>Theme & Colors</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setShowOptionsDrawer((v) => !v);
              setShowThemePicker(false);
              setShowExternalSiteModal(false);
            }}
            className={`min-h-[26px] px-1.5 py-0.5 text-[10px] font-semibold rounded-md border flex items-center gap-1 transition-colors whitespace-nowrap shrink-0 ${
              showOptionsDrawer
                ? 'bg-amber-500 text-slate-950 border-amber-400'
                : 'bg-slate-900 border-slate-700 text-slate-200 hover:border-slate-500'
            }`}
          >
            <Settings2 className="w-3 h-3" />
            <span>Options & QR</span>
          </button>

          <button
            type="button"
            data-testid="open-external-bridge-btn"
            onClick={() => {
              setShowExternalSiteModal((v) => !v);
              setShowThemePicker(false);
              setShowOptionsDrawer(false);
            }}
            className={`min-h-[26px] px-1.5 py-0.5 text-[10px] font-semibold rounded-md border flex items-center gap-1 transition-colors whitespace-nowrap shrink-0 ${
              showExternalSiteModal
                ? 'bg-emerald-500 text-slate-950 border-emerald-400'
                : 'bg-slate-900 border-emerald-500/50 text-emerald-300 hover:border-emerald-400'
            }`}
          >
            <Globe className="w-3 h-3" />
            <span>अन्य गेमिंग साइट (Xbox)</span>
          </button>

          {onTogglePureControllerOnly && (
            <button
              type="button"
              data-testid="single-screen-mode-btn"
              onClick={onTogglePureControllerOnly}
              className={`min-h-[26px] px-2 py-0.5 text-[10px] font-bold rounded-md border flex items-center gap-1 whitespace-nowrap shrink-0 transition-colors ${
                isPureControllerOnly
                  ? 'bg-amber-500 text-slate-950 border-amber-400'
                  : 'bg-slate-900 border-amber-500/50 text-amber-300 hover:border-amber-400'
              }`}
            >
              {isPureControllerOnly ? (
                <>
                  <Minimize2 className="w-3 h-3" />
                  <span>एक-स्क्रीन ON (सभी टैब दिखाएं)</span>
                </>
              ) : (
                <>
                  <Maximize2 className="w-3 h-3" />
                  <span>एक-स्क्रीन मोड (No Scroll)</span>
                </>
              )}
            </button>
          )}
        </div>
      </div>

      {/* Modular Drawer 0: Drag-and-Drop Button & Stick Layout Studio */}
      {showLayoutEditor && (
        <div
          className={
            isPureControllerOnly
              ? 'max-h-[34dvh] overflow-y-auto rounded-xl border border-amber-500/50 shrink-0'
              : ''
          }
        >
          <ControllerLayoutEditorDrawer
            isDragModeActive={isDragModeActive}
            onToggleDragMode={() => setIsDragModeActive((v) => !v)}
            selectedModule={selectedModule}
            onSelectModule={setSelectedModule}
            modules={modulePositions}
            onUpdateModuleOffset={updateModuleOffset}
            onApplyPreset={applyLayoutPreset}
          />
        </div>
      )}

      {/* Floating Overlay Modal Wrapper when in Single-Screen Mode so drawers never push controller buttons off-screen! */}
      {hasOpenModalDrawer && (
        <div
          className={
            isPureControllerOnly
              ? 'fixed inset-x-2 top-12 z-50 max-h-[84dvh] overflow-y-auto rounded-2xl shadow-2xl border border-slate-700 bg-slate-950/95 p-2 flex flex-col gap-2'
              : 'flex flex-col gap-2'
          }
        >
          {isPureControllerOnly && (
            <div className="flex items-center justify-between px-2 py-1 border-b border-slate-800">
              <span className="text-xs font-semibold text-amber-400">
                कंट्रोलर सेटिंग्स (1-Screen Overlay)
              </span>
              <button
                type="button"
                onClick={() => {
                  setShowThemePicker(false);
                  setShowOptionsDrawer(false);
                  setShowExternalSiteModal(false);
                }}
                className="min-h-[26px] px-2 rounded-lg bg-slate-800 text-white text-xs font-semibold flex items-center gap-1"
              >
                <X className="w-3.5 h-3.5" />
                <span>बंद करें (Close)</span>
              </button>
            </div>
          )}

          {showThemePicker && (
            <ControllerThemePickerDrawer
              theme={theme}
              onSelectTheme={setTheme}
              onUpdateField={updateThemeField}
            />
          )}

          {showOptionsDrawer && (
            <ControllerOptionsDrawer
              roomCode={roomCode}
              onRoomCodeChange={onRoomCodeChange}
              onGenerateNewRoomId={onGenerateNewRoomId}
              peersCount={peersCount}
              wsConnected={wsConnected}
              webrtcConnected={webrtcConnected}
              qrDataUrl={qrDataUrl}
              calibration={calibration}
              onCalibrationChange={onCalibrationChange}
              holdLockMode={holdLockMode}
              onToggleHoldLock={() => setHoldLockMode((v) => !v)}
              wakeLockActive={wakeLockActive}
              onHapticTest={onHapticTest}
              onResetAll={onResetAll}
            />
          )}

          {showExternalSiteModal && (
            <ExternalGamingBridgeDrawer roomCode={roomCode} appOrigin={appOrigin} />
          )}
        </div>
      )}

      {/* Row 2: Shoulder Bumpers (LB/RB or L1/R1) & Triggers (LT/RT or L2/R2) — Single Compact Horizontal Strip! */}
      <div className="grid grid-cols-2 gap-1.5 sm:gap-3 shrink-0">
        {renderDraggableModule(
          'leftShoulder',
          <div
            className={`flex items-center justify-between gap-1 sm:gap-2 p-1 sm:p-2 rounded-xl sm:rounded-2xl border ${shellClasses.moduleSurface}`}
          >
            <button
              type="button"
              aria-label={isPS ? 'Left Bumper L1' : 'Left Bumper LB'}
              onPointerDown={() => handleButtonPress(4, 1)}
              onPointerUp={() => handleButtonRelease(4)}
              onPointerLeave={() => handleButtonRelease(4)}
              className={`flex-1 sm:flex-none min-h-[34px] sm:min-h-[42px] px-2.5 sm:px-4 rounded-xl font-display font-bold text-xs border transition-colors whitespace-nowrap shrink-0 ${
                (gamepadState.buttons[4] ?? 0) > 0.5
                  ? 'pad-trigger-themed-active'
                  : 'bg-slate-900 pad-trigger-themed'
              }`}
            >
              {isPS ? 'L1' : 'LB'}
            </button>

            <div className="hidden sm:flex flex-1 min-w-[65px] flex-col gap-0.5 px-1">
              <div className="flex items-center justify-between text-[10px] font-mono text-slate-400">
                <label htmlFor="lt-analog-slider">{isPS ? 'L2' : 'LT'}</label>
                <span className="tabular-nums">
                  {Math.round((gamepadState.buttons[6] ?? 0) * 100)}%
                </span>
              </div>
              <input
                id="lt-analog-slider"
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={gamepadState.buttons[6] ?? 0}
                onChange={(e) => onButtonChange(6, parseFloat(e.target.value))}
                className="w-full cursor-pointer pad-slider-themed"
              />
            </div>

            <button
              type="button"
              aria-label={isPS ? 'Left Trigger L2' : 'Left Trigger LT'}
              onPointerDown={() => handleButtonPress(6, 1)}
              onPointerUp={() => handleButtonRelease(6)}
              onPointerLeave={() => handleButtonRelease(6)}
              className={`flex-1 sm:flex-none min-h-[34px] sm:min-h-[42px] px-2.5 sm:px-3.5 rounded-xl font-mono font-bold text-xs border transition-colors whitespace-nowrap shrink-0 ${
                (gamepadState.buttons[6] ?? 0) > 0.2
                  ? 'pad-trigger-themed-active'
                  : 'bg-slate-900 pad-trigger-themed'
              }`}
            >
              {isPS ? 'L2 100%' : 'LT 100%'}
            </button>
          </div>
        )}

        {renderDraggableModule(
          'rightShoulder',
          <div
            className={`flex items-center justify-between gap-1 sm:gap-2 p-1 sm:p-2 rounded-xl sm:rounded-2xl border ${shellClasses.moduleSurface}`}
          >
            <button
              type="button"
              aria-label={isPS ? 'Right Trigger R2' : 'Right Trigger RT'}
              onPointerDown={() => handleButtonPress(7, 1)}
              onPointerUp={() => handleButtonRelease(7)}
              onPointerLeave={() => handleButtonRelease(7)}
              className={`flex-1 sm:flex-none min-h-[34px] sm:min-h-[42px] px-2.5 sm:px-3.5 rounded-xl font-mono font-bold text-xs border transition-colors whitespace-nowrap shrink-0 ${
                (gamepadState.buttons[7] ?? 0) > 0.2
                  ? 'pad-trigger-themed-active'
                  : 'bg-slate-900 pad-trigger-themed'
              }`}
            >
              {isPS ? 'R2 100%' : 'RT 100%'}
            </button>

            <div className="hidden sm:flex flex-1 min-w-[65px] flex-col gap-0.5 px-1">
              <div className="flex items-center justify-between text-[10px] font-mono text-slate-400">
                <label htmlFor="rt-analog-slider">{isPS ? 'R2' : 'RT'}</label>
                <span className="tabular-nums">
                  {Math.round((gamepadState.buttons[7] ?? 0) * 100)}%
                </span>
              </div>
              <input
                id="rt-analog-slider"
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={gamepadState.buttons[7] ?? 0}
                onChange={(e) => onButtonChange(7, parseFloat(e.target.value))}
                className="w-full cursor-pointer pad-slider-themed"
              />
            </div>

            <button
              type="button"
              aria-label={isPS ? 'Right Bumper R1' : 'Right Bumper RB'}
              onPointerDown={() => handleButtonPress(5, 1)}
              onPointerUp={() => handleButtonRelease(5)}
              onPointerLeave={() => handleButtonRelease(5)}
              className={`flex-1 sm:flex-none min-h-[34px] sm:min-h-[42px] px-2.5 sm:px-4 rounded-xl font-display font-bold text-xs border transition-colors whitespace-nowrap shrink-0 ${
                (gamepadState.buttons[5] ?? 0) > 0.5
                  ? 'pad-trigger-themed-active'
                  : 'bg-slate-900 pad-trigger-themed'
              }`}
            >
              {isPS ? 'R1' : 'RB'}
            </button>
          </div>
        )}
      </div>

      {/* Row 3: Main Ergonomic Gamepad Deck — Fits 100% in Single Screen with Zero Vertical Scrolling! */}
      <div className="flex-1 min-h-0 grid grid-cols-2 lg:grid-cols-12 gap-1.5 sm:gap-3 items-stretch">
        {/* Left Thumb Wing (Always Left Column on Mobile & Desktop) */}
        <div
          className={`col-span-1 lg:col-span-4 flex flex-col items-center justify-evenly gap-1.5 sm:gap-2.5 p-1.5 sm:p-3 rounded-2xl sm:rounded-3xl border ${shellClasses.wingSurface}`}
        >
          {isPS || gripLayout === 'arcade_fightpad' ? (
            <>
              {renderDraggableModule('dpad', renderDPad())}
              {renderDraggableModule(
                'leftStick',
                renderAnalogStick('left', 'Left Stick (L3)', 10, leftStickRef)
              )}
            </>
          ) : (
            <>
              {renderDraggableModule(
                'leftStick',
                renderAnalogStick('left', 'Left Stick (LS)', 10, leftStickRef)
              )}
              {renderDraggableModule('dpad', renderDPad())}
            </>
          )}
        </div>

        {/* Center Bridge (Middle on Desktop lg:order-none, Compact Bottom Strip on Mobile order-last lg:order-none) */}
        <div className="col-span-2 lg:col-span-4 order-last lg:order-none flex flex-col justify-center shrink-0">
          {renderDraggableModule('centerBridge', renderCenterBridgeContent())}
        </div>

        {/* Right Thumb Wing (Always Right Column on Mobile & Desktop) */}
        <div
          className={`col-span-1 lg:col-span-4 flex flex-col items-center justify-evenly gap-1.5 sm:gap-2.5 p-1.5 sm:p-3 rounded-2xl sm:rounded-3xl border ${shellClasses.wingSurface}`}
        >
          {renderDraggableModule('faceButtons', renderFaceButtons())}
          {renderDraggableModule(
            'rightStick',
            renderAnalogStick('right', 'Right Stick (R3)', 11, rightStickRef)
          )}
        </div>
      </div>

      {/* Row 4 (Only when in Single-Screen Mode): Ultra-Slim Quick Navigation Strip so user can switch to Game Arena or QR without scrolling */}
      {isPureControllerOnly && onNavigateTab && (
        <div className="flex items-center justify-between gap-1 px-2 py-1 rounded-xl bg-slate-950/90 border border-slate-800/80 text-[10px] shrink-0">
          <span className="text-slate-400 flex items-center gap-1 truncate">
            <Smartphone className="w-3 h-3 text-emerald-400 shrink-0" />
            <span>एक-स्क्रीन मोड सक्रिय (Zero-Swipe Lock)</span>
          </span>
          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              onClick={() => onNavigateTab('arena')}
              className="px-2 py-0.5 rounded bg-slate-900 border border-slate-700 hover:border-amber-400 text-slate-200 font-medium whitespace-nowrap"
            >
              Cloud Arena (गेम)
            </button>
            <button
              type="button"
              onClick={() => onNavigateTab('studio')}
              className="px-2 py-0.5 rounded bg-slate-900 border border-slate-700 hover:border-amber-400 text-slate-200 font-medium whitespace-nowrap"
            >
              Tablet QR
            </button>
            <button
              type="button"
              onClick={() => onNavigateTab('lab')}
              className="px-2 py-0.5 rounded bg-slate-900 border border-slate-700 hover:border-amber-400 text-slate-200 font-medium whitespace-nowrap"
            >
              Protocol Lab
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
