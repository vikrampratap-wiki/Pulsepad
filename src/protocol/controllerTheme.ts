/**
 * Real-time Virtual Controller Theme & Custom Color-Picker Configuration
 * Persisted in localStorage under PULSEPAD_THEME_STORAGE_KEY.
 */

export const PULSEPAD_THEME_STORAGE_KEY = 'pulsepad_controller_theme_v1';

export type ShellSurfaceTheme = 'obsidian' | 'carbon' | 'titanium' | 'arctic';

export interface ControllerThemeConfig {
  id: string;
  name: string;
  /** Primary accent color for Face Buttons (ABXY / DualSense cluster) & active states */
  buttonAccentHex: string;
  /** Accent color for Left & Right Analog Thumbstick rings, caps & directional active states */
  stickAccentHex: string;
  /** Accent color for Bumpers (LB/RB), Analog Triggers (LT/RT), and sliders */
  triggerAccentHex: string;
  /** Controller chassis / shell background surface theme */
  shellTheme: ShellSurfaceTheme;
  /** Glow / border intensity (0 to 100) */
  borderOpacityPercent: number;
}

export const CONTROLLER_THEME_PRESETS: ControllerThemeConfig[] = [
  {
    id: 'xbox-emerald',
    name: 'Xbox Velocity Emerald',
    buttonAccentHex: '#10B981',
    stickAccentHex: '#34D399',
    triggerAccentHex: '#F59E0B',
    shellTheme: 'obsidian',
    borderOpacityPercent: 65,
  },
  {
    id: 'ps5-cobalt',
    name: 'DualSense Cobalt Blue',
    buttonAccentHex: '#38BDF8',
    stickAccentHex: '#60A5FA',
    triggerAccentHex: '#818CF8',
    shellTheme: 'carbon',
    borderOpacityPercent: 70,
  },
  {
    id: 'crimson-elite',
    name: 'Crimson Elite Pro',
    buttonAccentHex: '#F43F5E',
    stickAccentHex: '#FB7185',
    triggerAccentHex: '#F97316',
    shellTheme: 'obsidian',
    borderOpacityPercent: 75,
  },
  {
    id: 'cyber-gold',
    name: 'Solaris Gold & Onyx',
    buttonAccentHex: '#FBBF24',
    stickAccentHex: '#F59E0B',
    triggerAccentHex: '#10B981',
    shellTheme: 'carbon',
    borderOpacityPercent: 80,
  },
  {
    id: 'titanium-ice',
    name: 'Titanium Ice Edition',
    buttonAccentHex: '#06B6D4',
    stickAccentHex: '#22D3EE',
    triggerAccentHex: '#3B82F6',
    shellTheme: 'titanium',
    borderOpacityPercent: 60,
  },
];

export const DEFAULT_CONTROLLER_THEME: ControllerThemeConfig = CONTROLLER_THEME_PRESETS[0];

const HEX_COLOR_REGEX = /^#[0-9A-Fa-f]{6}$/;

export function isValidHexColor(value: unknown): value is string {
  return typeof value === 'string' && HEX_COLOR_REGEX.test(value.trim());
}

/**
 * Converts a #RRGGBB hex string into an rgba(r, g, b, alpha) string for borders and translucent fills.
 */
export function hexToRgba(hex: string, alpha: number): string {
  const clean = isValidHexColor(hex) ? hex.trim().slice(1) : '10B981';
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  const clampedAlpha = Math.max(0, Math.min(1, Number.isFinite(alpha) ? alpha : 1));
  return `rgba(${r}, ${g}, ${b}, ${clampedAlpha})`;
}

/**
 * Validates and normalizes a partial or untrusted theme object (e.g., parsed from localStorage).
 */
export function sanitizeControllerTheme(raw: unknown): ControllerThemeConfig {
  if (!raw || typeof raw !== 'object') {
    return { ...DEFAULT_CONTROLLER_THEME };
  }
  const obj = raw as Record<string, unknown>;

  const buttonAccentHex = isValidHexColor(obj.buttonAccentHex)
    ? obj.buttonAccentHex.toUpperCase()
    : DEFAULT_CONTROLLER_THEME.buttonAccentHex;

  const stickAccentHex = isValidHexColor(obj.stickAccentHex)
    ? obj.stickAccentHex.toUpperCase()
    : DEFAULT_CONTROLLER_THEME.stickAccentHex;

  const triggerAccentHex = isValidHexColor(obj.triggerAccentHex)
    ? obj.triggerAccentHex.toUpperCase()
    : DEFAULT_CONTROLLER_THEME.triggerAccentHex;

  const validShells: ShellSurfaceTheme[] = ['obsidian', 'carbon', 'titanium', 'arctic'];
  const shellTheme: ShellSurfaceTheme = validShells.includes(obj.shellTheme as ShellSurfaceTheme)
    ? (obj.shellTheme as ShellSurfaceTheme)
    : DEFAULT_CONTROLLER_THEME.shellTheme;

  const rawOpacity = Number(obj.borderOpacityPercent);
  const borderOpacityPercent = Number.isFinite(rawOpacity)
    ? Math.max(20, Math.min(100, Math.round(rawOpacity)))
    : DEFAULT_CONTROLLER_THEME.borderOpacityPercent;

  return {
    id: typeof obj.id === 'string' && obj.id.trim() ? obj.id.trim() : 'custom',
    name: typeof obj.name === 'string' && obj.name.trim() ? obj.name.trim() : 'Custom User Theme',
    buttonAccentHex,
    stickAccentHex,
    triggerAccentHex,
    shellTheme,
    borderOpacityPercent,
  };
}

export function loadControllerThemeFromStorage(
  storage?: Pick<Storage, 'getItem'> | null
): ControllerThemeConfig {
  try {
    const targetStorage =
      storage !== undefined
        ? storage
        : typeof window !== 'undefined' && window.localStorage
          ? window.localStorage
          : null;
    if (!targetStorage) return { ...DEFAULT_CONTROLLER_THEME };
    const raw = targetStorage.getItem(PULSEPAD_THEME_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_CONTROLLER_THEME };
    return sanitizeControllerTheme(JSON.parse(raw));
  } catch {
    return { ...DEFAULT_CONTROLLER_THEME };
  }
}

export function saveControllerThemeToStorage(
  theme: ControllerThemeConfig,
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
    const clean = sanitizeControllerTheme(theme);
    targetStorage.setItem(PULSEPAD_THEME_STORAGE_KEY, JSON.stringify(clean));
  } catch {
    // Ignore storage quota or private browsing errors
  }
}

export function getShellThemeClasses(shellTheme: ShellSurfaceTheme): {
  outerShell: string;
  wingSurface: string;
  moduleSurface: string;
  textPrimary: string;
} {
  switch (shellTheme) {
    case 'carbon':
      return {
        outerShell: 'bg-zinc-900 border-zinc-700/90',
        wingSurface: 'bg-zinc-950/80 border-zinc-800',
        moduleSurface: 'bg-zinc-950 border-zinc-800',
        textPrimary: 'text-zinc-100',
      };
    case 'titanium':
      return {
        outerShell: 'bg-slate-800 border-slate-600',
        wingSurface: 'bg-slate-900/90 border-slate-700',
        moduleSurface: 'bg-slate-900 border-slate-700',
        textPrimary: 'text-slate-100',
      };
    case 'arctic':
      return {
        outerShell: 'bg-slate-900/90 border-cyan-500/30',
        wingSurface: 'bg-slate-950/90 border-cyan-900/50',
        moduleSurface: 'bg-slate-950 border-slate-800',
        textPrimary: 'text-cyan-50',
      };
    case 'obsidian':
    default:
      return {
        outerShell: 'bg-slate-900 border-slate-800',
        wingSurface: 'bg-slate-950/60 border-slate-800/80',
        moduleSurface: 'bg-slate-950 border-slate-800',
        textPrimary: 'text-slate-100',
      };
  }
}
