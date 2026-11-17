/**
 * Drag-and-Drop Controller Module Position & Scale Persistence
 * Stores custom (dx, dy, scale) offsets and grip layout in localStorage.
 */

export const PULSEPAD_LAYOUT_POSITIONS_KEY = 'pulsepad_layout_positions_v1';

export type CustomizableModuleId =
  | 'leftShoulder'
  | 'rightShoulder'
  | 'leftStick'
  | 'dpad'
  | 'centerBridge'
  | 'faceButtons'
  | 'rightStick';

export interface ModulePositionOffset {
  /** Horizontal offset in pixels (-220 to +220) */
  dx: number;
  /** Vertical offset in pixels (-180 to +180) */
  dy: number;
  /** Scale multiplier (0.80 to 1.25) */
  scale: number;
}

export type ControllerLayoutMap = Record<CustomizableModuleId, ModulePositionOffset>;

export interface SavedControllerLayoutState {
  gripLayout: 'console_shell' | 'split_edge' | 'arcade_fightpad';
  modules: ControllerLayoutMap;
}

export const MODULE_LABELS: Record<CustomizableModuleId, string> = {
  leftShoulder: 'Left Shoulder (LB / LT)',
  rightShoulder: 'Right Shoulder (RB / RT)',
  leftStick: 'Left Analog Stick (LS/L3)',
  dpad: 'Directional Pad (D-Pad)',
  centerBridge: 'Center Bridge & Macros',
  faceButtons: 'Action Buttons (ABXY / PS)',
  rightStick: 'Right Analog Stick (RS/R3)',
};

export const ALL_MODULE_IDS: CustomizableModuleId[] = [
  'leftShoulder',
  'rightShoulder',
  'leftStick',
  'dpad',
  'centerBridge',
  'faceButtons',
  'rightStick',
];

export function createDefaultLayoutMap(): ControllerLayoutMap {
  return {
    leftShoulder: { dx: 0, dy: 0, scale: 1 },
    rightShoulder: { dx: 0, dy: 0, scale: 1 },
    leftStick: { dx: 0, dy: 0, scale: 1 },
    dpad: { dx: 0, dy: 0, scale: 1 },
    centerBridge: { dx: 0, dy: 0, scale: 1 },
    faceButtons: { dx: 0, dy: 0, scale: 1 },
    rightStick: { dx: 0, dy: 0, scale: 1 },
  };
}

export function createPresetLayoutMap(
  preset: 'default' | 'claw_ergonomic' | 'compact_thumb'
): ControllerLayoutMap {
  if (preset === 'claw_ergonomic') {
    return {
      leftShoulder: { dx: 12, dy: 8, scale: 1.05 },
      rightShoulder: { dx: -12, dy: 8, scale: 1.05 },
      leftStick: { dx: 18, dy: -14, scale: 1.08 },
      dpad: { dx: 10, dy: 12, scale: 1.0 },
      centerBridge: { dx: 0, dy: 16, scale: 0.95 },
      faceButtons: { dx: -24, dy: -18, scale: 1.12 },
      rightStick: { dx: -14, dy: 14, scale: 1.05 },
    };
  }
  if (preset === 'compact_thumb') {
    return {
      leftShoulder: { dx: 24, dy: 6, scale: 0.95 },
      rightShoulder: { dx: -24, dy: 6, scale: 0.95 },
      leftStick: { dx: 32, dy: -8, scale: 0.95 },
      dpad: { dx: 28, dy: -6, scale: 0.95 },
      centerBridge: { dx: 0, dy: 0, scale: 0.92 },
      faceButtons: { dx: -32, dy: -8, scale: 0.95 },
      rightStick: { dx: -28, dy: -6, scale: 0.95 },
    };
  }
  return createDefaultLayoutMap();
}

export function clampOffset(offset: Partial<ModulePositionOffset> | undefined): ModulePositionOffset {
  const rawDx = Number(offset?.dx);
  const rawDy = Number(offset?.dy);
  const rawScale = Number(offset?.scale);

  const dx = Number.isFinite(rawDx) ? Math.max(-220, Math.min(220, Math.round(rawDx))) : 0;
  const dy = Number.isFinite(rawDy) ? Math.max(-180, Math.min(180, Math.round(rawDy))) : 0;
  const scale = Number.isFinite(rawScale)
    ? Math.round(Math.max(0.8, Math.min(1.25, rawScale)) * 100) / 100
    : 1;

  return { dx, dy, scale };
}

export function sanitizeControllerLayoutState(raw: unknown): SavedControllerLayoutState {
  const fallback: SavedControllerLayoutState = {
    gripLayout: 'console_shell',
    modules: createDefaultLayoutMap(),
  };

  if (!raw || typeof raw !== 'object') return fallback;
  const obj = raw as Record<string, unknown>;

  const validGrips = ['console_shell', 'split_edge', 'arcade_fightpad'] as const;
  const gripLayout = validGrips.includes(obj.gripLayout as (typeof validGrips)[number])
    ? (obj.gripLayout as SavedControllerLayoutState['gripLayout'])
    : 'console_shell';

  const rawModules =
    obj.modules && typeof obj.modules === 'object'
      ? (obj.modules as Record<string, Partial<ModulePositionOffset>>)
      : {};

  const modules = createDefaultLayoutMap();
  for (const id of ALL_MODULE_IDS) {
    modules[id] = clampOffset(rawModules[id]);
  }

  return { gripLayout, modules };
}

export function loadControllerLayoutFromStorage(
  storage?: Pick<Storage, 'getItem'> | null
): SavedControllerLayoutState {
  try {
    const targetStorage =
      storage !== undefined
        ? storage
        : typeof window !== 'undefined' && window.localStorage
          ? window.localStorage
          : null;
    if (!targetStorage) return sanitizeControllerLayoutState(null);
    const raw = targetStorage.getItem(PULSEPAD_LAYOUT_POSITIONS_KEY);
    if (!raw) return sanitizeControllerLayoutState(null);
    return sanitizeControllerLayoutState(JSON.parse(raw));
  } catch {
    return sanitizeControllerLayoutState(null);
  }
}

export function saveControllerLayoutToStorage(
  state: SavedControllerLayoutState,
  storage?: Pick<Storage, 'setItem'> | null
): void {
  try {
    const targetStorage =
      storage !== undefined
        ? storage
        : typeof window !== 'undefined' && window.localStorage
          ? window.localStorage
          : null;
    if (!targetStorage) return;
    const clean = sanitizeControllerLayoutState(state);
    targetStorage.setItem(PULSEPAD_LAYOUT_POSITIONS_KEY, JSON.stringify(clean));
  } catch {
    // Ignore storage quota errors
  }
}
