import React from 'react';
import {
  CONTROLLER_THEME_PRESETS,
  ControllerThemeConfig,
  DEFAULT_CONTROLLER_THEME,
  ShellSurfaceTheme,
} from '../../protocol/controllerTheme';
import { RotateCcw } from 'lucide-react';

interface ControllerThemePickerDrawerProps {
  theme: ControllerThemeConfig;
  onSelectTheme: (nextTheme: ControllerThemeConfig) => void;
  onUpdateField: <K extends keyof ControllerThemeConfig>(
    key: K,
    value: ControllerThemeConfig[K]
  ) => void;
}

export const ControllerThemePickerDrawer: React.FC<ControllerThemePickerDrawerProps> = ({
  theme,
  onSelectTheme,
  onUpdateField,
}) => {
  return (
    <div
      data-testid="theme-color-picker-panel"
      className="p-4 sm:p-5 rounded-2xl bg-slate-950 border border-slate-800 flex flex-col gap-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-display font-bold text-white">
            Real-Time Controller Color-Picker & Shell Theme Studio
          </h3>
          <p className="text-xs text-slate-400">
            बटन, एनालॉग थंबस्टिक्स, और ट्रिगर्स का रंग अपनी पसंद के अनुसार बदलें (यह आपके ब्राउज़र के{' '}
            <code className="text-amber-300">localStorage</code> में स्वतः सेव हो जाता है)।
          </p>
        </div>

        <button
          type="button"
          onClick={() => onSelectTheme({ ...DEFAULT_CONTROLLER_THEME })}
          className="min-h-[36px] px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-700 hover:border-slate-500 text-xs font-medium text-slate-200 flex items-center gap-1.5 whitespace-nowrap shrink-0"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          <span>Reset Default Colors</span>
        </button>
      </div>

      {/* Preset Themes Bar */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-slate-400 mr-1">Presets:</span>
        {CONTROLLER_THEME_PRESETS.map((preset) => {
          const isSelected = theme.id === preset.id;
          return (
            <button
              key={preset.id}
              type="button"
              onClick={() => onSelectTheme({ ...preset })}
              className={`min-h-[36px] px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                isSelected
                  ? 'bg-white text-slate-950 border-white font-bold'
                  : 'bg-slate-900 border-slate-800 text-slate-300 hover:border-slate-600'
              }`}
            >
              {preset.name}
            </button>
          );
        })}
      </div>

      {/* 3 Custom Hex Color Pickers + Shell Theme + Border Intensity */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
        {/* Picker 1: Face Buttons & D-Pad Accent */}
        <div className="p-3 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-between gap-3">
          <div className="flex flex-col">
            <label
              htmlFor="picker-button-accent"
              className="text-xs font-semibold text-white cursor-pointer"
            >
              Buttons Accent
            </label>
            <span className="text-[11px] font-mono text-slate-400 uppercase">
              {theme.buttonAccentHex}
            </span>
          </div>
          <input
            id="picker-button-accent"
            aria-label="Button Accent Color"
            type="color"
            value={theme.buttonAccentHex}
            onChange={(e) => onUpdateField('buttonAccentHex', e.target.value.toUpperCase())}
            className="w-10 h-10 rounded-lg cursor-pointer bg-transparent border border-slate-700 shrink-0"
          />
        </div>

        {/* Picker 2: Analog Thumbsticks Ring & Cap */}
        <div className="p-3 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-between gap-3">
          <div className="flex flex-col">
            <label
              htmlFor="picker-stick-accent"
              className="text-xs font-semibold text-white cursor-pointer"
            >
              Sticks & Caps
            </label>
            <span className="text-[11px] font-mono text-slate-400 uppercase">
              {theme.stickAccentHex}
            </span>
          </div>
          <input
            id="picker-stick-accent"
            aria-label="Thumbstick Accent Color"
            type="color"
            value={theme.stickAccentHex}
            onChange={(e) => onUpdateField('stickAccentHex', e.target.value.toUpperCase())}
            className="w-10 h-10 rounded-lg cursor-pointer bg-transparent border border-slate-700 shrink-0"
          />
        </div>

        {/* Picker 3: Triggers & Bumpers Accent */}
        <div className="p-3 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-between gap-3">
          <div className="flex flex-col">
            <label
              htmlFor="picker-trigger-accent"
              className="text-xs font-semibold text-white cursor-pointer"
            >
              Triggers & LB/RB
            </label>
            <span className="text-[11px] font-mono text-slate-400 uppercase">
              {theme.triggerAccentHex}
            </span>
          </div>
          <input
            id="picker-trigger-accent"
            aria-label="Trigger Accent Color"
            type="color"
            value={theme.triggerAccentHex}
            onChange={(e) => onUpdateField('triggerAccentHex', e.target.value.toUpperCase())}
            className="w-10 h-10 rounded-lg cursor-pointer bg-transparent border border-slate-700 shrink-0"
          />
        </div>

        {/* Picker 4: Controller Chassis Surface Theme */}
        <div className="p-3 rounded-xl bg-slate-900 border border-slate-800 flex flex-col justify-between gap-1.5">
          <label htmlFor="select-shell-theme" className="text-xs font-semibold text-white">
            Chassis Theme
          </label>
          <select
            id="select-shell-theme"
            aria-label="Controller Shell Theme"
            value={theme.shellTheme}
            onChange={(e) =>
              onUpdateField('shellTheme', e.target.value as ShellSurfaceTheme)
            }
            className="min-h-[34px] px-2 rounded-lg bg-slate-950 border border-slate-700 text-xs text-slate-200 font-medium"
          >
            <option value="obsidian">Obsidian Dark</option>
            <option value="carbon">Carbon Matte</option>
            <option value="titanium">Titanium Slate</option>
            <option value="arctic">Arctic Cyan</option>
          </select>
        </div>

        {/* Picker 5: Border Contrast / Intensity */}
        <div className="p-3 rounded-xl bg-slate-900 border border-slate-800 flex flex-col justify-between gap-1.5">
          <div className="flex items-center justify-between text-xs">
            <label htmlFor="slider-border-opacity" className="font-semibold text-white">
              Ring Contrast
            </label>
            <span className="font-mono tabular-nums text-slate-300">
              {theme.borderOpacityPercent}%
            </span>
          </div>
          <input
            id="slider-border-opacity"
            aria-label="Ring Contrast Percentage"
            type="range"
            min={25}
            max={100}
            step={5}
            value={theme.borderOpacityPercent}
            onChange={(e) =>
              onUpdateField('borderOpacityPercent', parseInt(e.target.value, 10))
            }
            className="w-full cursor-pointer pad-slider-themed"
          />
        </div>
      </div>
    </div>
  );
};
