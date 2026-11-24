import { useState } from 'react';
import { Archive, ArrowRight, BookmarkPlus, Check, Eraser, Layers, Minimize2 } from 'lucide-react';
import type { ConversionJob, SavedPreset, ToolKind } from '../shared/types';

interface ToolHandoffBarProps {
  job: ConversionJob;
  currentTool: Exclude<ToolKind, 'workflow'>;
  onPromoteToTool: (jobId: string, targetTool: Exclude<ToolKind, 'workflow'>) => Promise<void>;
  presetConfig?: Record<string, unknown>;
  presetDescription?: string;
  onSavePreset?: (preset: Omit<SavedPreset, 'id' | 'createdAt'>) => Promise<void>;
}

const IMAGE_EXTS = new Set(['png', 'jpg', 'jpeg', 'webp', 'avif', 'gif', 'bmp', 'tiff', 'tif', 'svg']);

export function ToolHandoffBar({
  job,
  currentTool,
  onPromoteToTool,
  presetConfig,
  presetDescription,
  onSavePreset,
}: ToolHandoffBarProps) {
  const [busyTool, setBusyTool] = useState<string | null>(null);
  const [savingPreset, setSavingPreset] = useState(false);
  const [presetName, setPresetName] = useState('');
  const [presetSaved, setPresetSaved] = useState(false);

  const isImageOutput = IMAGE_EXTS.has(job.targetExt.toLowerCase());

  const targets: {
    tool: Exclude<ToolKind, 'workflow'>;
    label: string;
    icon: typeof Layers;
    enabled: boolean;
  }[] = [
    {
      tool: 'converter',
      label: 'Send to Converter',
      icon: Layers,
      enabled: currentTool !== 'converter' && job.targetExt !== 'zip' && job.targetExt !== '7z',
    },
    {
      tool: 'bg-remover',
      label: 'Send to BG Remover',
      icon: Eraser,
      enabled: currentTool !== 'bg-remover' && isImageOutput,
    },
    {
      tool: 'compressor',
      label: 'Send to Compressor',
      icon: Minimize2,
      enabled: currentTool !== 'compressor',
    },
    {
      tool: 'archive',
      label: 'Pack in Archive Manager',
      icon: Archive,
      enabled: currentTool !== 'archive',
    },
  ];

  const handleHandoff = async (target: Exclude<ToolKind, 'workflow'>) => {
    setBusyTool(target);
    try {
      await onPromoteToTool(job.id, target);
    } finally {
      setBusyTool(null);
    }
  };

  const handlePresetSubmit = async () => {
    if (!onSavePreset || !presetConfig || !presetName.trim()) return;
    await onSavePreset({
      name: presetName.trim(),
      tool: currentTool,
      kind: 'tool',
      description: presetDescription || `${currentTool} configuration`,
      config: presetConfig,
    });
    setPresetName('');
    setSavingPreset(false);
    setPresetSaved(true);
    setTimeout(() => setPresetSaved(false), 2500);
  };

  return (
    <div className="pt-4 mt-4 border-t border-black/10 dark:border-white/10 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs font-medium text-[var(--text-muted)]">Continue in Another Tool</span>
        {onSavePreset && presetConfig && (
          <button
            type="button"
            onClick={() => setSavingPreset((v) => !v)}
            className="glass-interactive inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs text-[var(--text-primary)] cursor-pointer whitespace-nowrap"
          >
            {presetSaved ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <BookmarkPlus className="w-3.5 h-3.5" />}
            {presetSaved ? 'Preset Saved' : 'Save Current Settings as Preset'}
          </button>
        )}
      </div>

      {savingPreset && (
        <div className="flex flex-wrap items-center gap-2 p-2.5 rounded-xl border border-black/10 dark:border-white/12 bg-black/4 dark:bg-black/40">
          <input
            type="text"
            value={presetName}
            onChange={(e) => setPresetName(e.target.value)}
            placeholder="Preset name (e.g. WebP 80% Strip EXIF)"
            className="flex-1 min-w-[180px] rounded-lg border border-[var(--control-border)] bg-[var(--input-bg)] px-3 py-1.5 text-xs text-[var(--text-primary)] focus:outline-none"
          />
          <button
            type="button"
            disabled={!presetName.trim()}
            onClick={handlePresetSubmit}
            className="rounded-lg bg-zinc-900 text-white dark:bg-white dark:text-black px-3 py-1.5 text-xs font-medium disabled:opacity-40 cursor-pointer whitespace-nowrap"
          >
            Save Preset
          </button>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {targets
          .filter((t) => t.enabled)
          .map((t) => {
            const Icon = t.icon;
            return (
              <button
                key={t.tool}
                type="button"
                disabled={busyTool !== null}
                onClick={() => handleHandoff(t.tool)}
                className="glass-interactive inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs text-[var(--text-primary)] disabled:opacity-40 cursor-pointer whitespace-nowrap"
              >
                <Icon className="w-3.5 h-3.5 text-[var(--text-muted)]" />
                <span>{busyTool === t.tool ? 'Transferring...' : t.label}</span>
                <ArrowRight className="w-3 h-3 text-[var(--text-secondary)]" />
              </button>
            );
          })}
      </div>
    </div>
  );
}
