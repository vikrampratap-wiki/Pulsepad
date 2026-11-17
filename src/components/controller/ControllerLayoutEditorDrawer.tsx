import React from 'react';
import {
  ALL_MODULE_IDS,
  ControllerLayoutMap,
  CustomizableModuleId,
  MODULE_LABELS,
  ModulePositionOffset,
  createDefaultLayoutMap,
  createPresetLayoutMap,
} from '../../protocol/controllerLayoutPositions';
import { Move, RotateCcw, CheckCircle2, Maximize, Hand } from 'lucide-react';

export interface ControllerLayoutEditorDrawerProps {
  isDragModeActive: boolean;
  onToggleDragMode: () => void;
  selectedModule: CustomizableModuleId;
  onSelectModule: (id: CustomizableModuleId) => void;
  modules: ControllerLayoutMap;
  onUpdateModuleOffset: (
    id: CustomizableModuleId,
    patch: Partial<ModulePositionOffset>
  ) => void;
  onApplyPreset: (nextMap: ControllerLayoutMap) => void;
}

export const ControllerLayoutEditorDrawer: React.FC<ControllerLayoutEditorDrawerProps> = ({
  isDragModeActive,
  onToggleDragMode,
  selectedModule,
  onSelectModule,
  modules,
  onUpdateModuleOffset,
  onApplyPreset,
}) => {
  const activeOffset = modules[selectedModule] ?? { dx: 0, dy: 0, scale: 1 };

  return (
    <div
      data-testid="layout-editor-drawer"
      className="p-4 rounded-2xl bg-slate-950/95 border border-amber-500/40 flex flex-col gap-4 shadow-xl"
    >
      <div className="flex flex-wrap items-center justify-between gap-2 pb-2.5 border-b border-slate-800">
        <div className="flex items-center gap-2">
          <Move className="w-4 h-4 text-amber-400" />
          <div>
            <h3 className="text-sm font-display font-bold text-white">
              Drag-and-Drop Button & Stick Layout Studio (बटन स्थान संपादक)
            </h3>
            <p className="text-xs text-slate-400">
              Drag any controller module directly on the pad or fine-tune X/Y coordinates & scale. Automatically saved to localStorage across reloads.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-emerald-500/10 border border-emerald-500/30 text-[11px] font-mono text-emerald-300">
            <CheckCircle2 className="w-3 h-3" />
            <span>Auto-Saved in localStorage</span>
          </span>

          <button
            type="button"
            onClick={onToggleDragMode}
            data-testid="toggle-interactive-drag-btn"
            className={`min-h-[36px] px-3 py-1.5 rounded-lg text-xs font-semibold border flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 ${
              isDragModeActive
                ? 'bg-amber-500 text-slate-950 border-amber-400'
                : 'bg-slate-900 text-slate-200 border-slate-700 hover:border-slate-500'
            }`}
          >
            <Hand className="w-3.5 h-3.5" />
            <span>{isDragModeActive ? 'Touch Dragging: ON' : 'Enable Touch Dragging'}</span>
          </button>

          <button
            type="button"
            onClick={() => onApplyPreset(createDefaultLayoutMap())}
            data-testid="reset-layout-positions-btn"
            className="min-h-[36px] px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-700 text-xs font-medium text-slate-200 flex items-center gap-1.5 whitespace-nowrap shrink-0"
          >
            <RotateCcw className="w-3.5 h-3.5 text-amber-400" />
            <span>Reset All Positions</span>
          </button>
        </div>
      </div>

      {/* Quick Ergonomic Position Presets */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider mr-1">
            Ergonomic Position Presets:
          </span>
          <button
            type="button"
            data-testid="preset-claw-ergonomic-btn"
            onClick={() => onApplyPreset(createPresetLayoutMap('claw_ergonomic'))}
            className="min-h-[34px] px-3 py-1 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-800 hover:border-amber-500/50 text-xs font-medium text-slate-200 transition-colors"
          >
            Claw High-Action Offset
          </button>
          <button
            type="button"
            data-testid="preset-compact-thumb-btn"
            onClick={() => onApplyPreset(createPresetLayoutMap('compact_thumb'))}
            className="min-h-[34px] px-3 py-1 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-800 hover:border-amber-500/50 text-xs font-medium text-slate-200 transition-colors"
          >
            Compact Thumb Reach
          </button>
          <button
            type="button"
            data-testid="preset-default-factory-btn"
            onClick={() => onApplyPreset(createPresetLayoutMap('default'))}
            className="min-h-[34px] px-3 py-1 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-800 hover:border-slate-600 text-xs font-medium text-slate-300 transition-colors"
          >
            Factory Zero (0, 0)
          </button>
        </div>
      </div>

      {/* Module Selector & Fine Coordinate Sliders */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-center">
        {/* Module Pills */}
        <div className="lg:col-span-5 flex flex-col gap-1.5">
          <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
            1. Select Controller Cluster to Adjust
          </span>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-2 gap-1.5">
            {ALL_MODULE_IDS.map((id) => {
              const offset = modules[id];
              const isSelected = selectedModule === id;
              const isMoved = offset.dx !== 0 || offset.dy !== 0 || offset.scale !== 1;
              return (
                <button
                  key={id}
                  type="button"
                  data-testid={`select-module-${id}`}
                  onClick={() => onSelectModule(id)}
                  className={`min-h-[38px] px-2.5 py-1.5 rounded-xl border text-left transition-colors flex items-center justify-between gap-1 ${
                    isSelected
                      ? 'bg-amber-500/15 border-amber-400 text-white'
                      : 'bg-slate-900/90 border-slate-800 text-slate-300 hover:border-slate-700'
                  }`}
                >
                  <span className="text-xs font-medium truncate">{MODULE_LABELS[id]}</span>
                  <span
                    className={`text-[10px] font-mono tabular-nums shrink-0 ${
                      isMoved ? 'text-amber-400 font-semibold' : 'text-slate-500'
                    }`}
                  >
                    {offset.dx},{offset.dy}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* X / Y / Scale Sliders for Selected Module */}
        <div className="lg:col-span-7 grid grid-cols-1 sm:grid-cols-3 gap-3 p-3.5 rounded-xl bg-slate-900/90 border border-slate-800">
          {/* Horizontal Offset (dx) */}
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between text-xs">
              <label htmlFor="module-dx-slider" className="text-slate-300 font-medium">
                X Position (Horizontal)
              </label>
              <span
                data-testid="selected-module-dx-val"
                className="font-mono tabular-nums text-amber-400 font-semibold"
              >
                {activeOffset.dx > 0 ? `+${activeOffset.dx}` : activeOffset.dx}px
              </span>
            </div>
            <input
              id="module-dx-slider"
              data-testid="module-dx-slider"
              type="range"
              min={-220}
              max={220}
              step={2}
              value={activeOffset.dx}
              onChange={(e) =>
                onUpdateModuleOffset(selectedModule, { dx: parseInt(e.target.value, 10) })
              }
              className="w-full accent-amber-400 cursor-pointer"
            />
            <div className="flex justify-between text-[10px] font-mono text-slate-500">
              <span>-220px (Left)</span>
              <button
                type="button"
                onClick={() => onUpdateModuleOffset(selectedModule, { dx: 0 })}
                className="text-slate-400 hover:text-white underline"
              >
                Center X
              </button>
              <span>+220px (Right)</span>
            </div>
          </div>

          {/* Vertical Offset (dy) */}
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between text-xs">
              <label htmlFor="module-dy-slider" className="text-slate-300 font-medium">
                Y Position (Vertical)
              </label>
              <span
                data-testid="selected-module-dy-val"
                className="font-mono tabular-nums text-amber-400 font-semibold"
              >
                {activeOffset.dy > 0 ? `+${activeOffset.dy}` : activeOffset.dy}px
              </span>
            </div>
            <input
              id="module-dy-slider"
              data-testid="module-dy-slider"
              type="range"
              min={-180}
              max={180}
              step={2}
              value={activeOffset.dy}
              onChange={(e) =>
                onUpdateModuleOffset(selectedModule, { dy: parseInt(e.target.value, 10) })
              }
              className="w-full accent-amber-400 cursor-pointer"
            />
            <div className="flex justify-between text-[10px] font-mono text-slate-500">
              <span>-180px (Up)</span>
              <button
                type="button"
                onClick={() => onUpdateModuleOffset(selectedModule, { dy: 0 })}
                className="text-slate-400 hover:text-white underline"
              >
                Center Y
              </button>
              <span>+180px (Down)</span>
            </div>
          </div>

          {/* Scale Multiplier */}
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between text-xs">
              <label
                htmlFor="module-scale-slider"
                className="text-slate-300 font-medium flex items-center gap-1"
              >
                <Maximize className="w-3 h-3 text-amber-400" />
                <span>Cluster Size</span>
              </label>
              <span
                data-testid="selected-module-scale-val"
                className="font-mono tabular-nums text-amber-400 font-semibold"
              >
                {Math.round(activeOffset.scale * 100)}%
              </span>
            </div>
            <input
              id="module-scale-slider"
              data-testid="module-scale-slider"
              type="range"
              min={0.8}
              max={1.25}
              step={0.05}
              value={activeOffset.scale}
              onChange={(e) =>
                onUpdateModuleOffset(selectedModule, { scale: parseFloat(e.target.value) })
              }
              className="w-full accent-amber-400 cursor-pointer"
            />
            <div className="flex justify-between text-[10px] font-mono text-slate-500">
              <span>80%</span>
              <button
                type="button"
                onClick={() => onUpdateModuleOffset(selectedModule, { scale: 1 })}
                className="text-slate-400 hover:text-white underline"
              >
                100%
              </button>
              <span>125%</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
