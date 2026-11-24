import { useEffect, useRef, useState } from 'react';
import { motion } from 'motion/react';
import {
  AlertCircle,
  CheckCircle2,
  Download,
  FolderArchive,
  FolderUp,
  Gauge,
  Loader2,
  Minimize2,
  Pause,
  Play,
  SlidersHorizontal,
  Square,
  Trash2,
  Upload,
} from 'lucide-react';
import type {
  CompressionGoal,
  CompressionOptions,
  CompressionStats,
  ConversionJob,
  IdentifiedFileMetadata,
  SavedPreset,
  ToolKind,
} from '../shared/types';
import { buildCompressionPresetOptions } from '../utils/processingIntelligence';
import { formatBytes } from '../utils/formatters';
import { SPRING_SNAPPY } from '../utils/motion';
import { PreviewPanel } from './PreviewPanel';
import { ToolHandoffBar } from './ToolHandoffBar';
import { GlassSurface } from './glass/GlassSurface';
import { GlassDropdown } from './glass/GlassDropdown';

interface CompressBatchItem {
  localId: string;
  uploadToken: string;
  info: IdentifiedFileMetadata;
  status: 'queued' | 'processing' | 'completed' | 'failed' | 'cancelled';
  excluded?: boolean;
  overrideOptions?: Partial<CompressionOptions>;
  job?: ConversionJob;
  stats?: CompressionStats;
  error?: string;
}

interface FileCompressorViewProps {
  promotedInput?: { uploadToken: string; info: IdentifiedFileMetadata } | null;
  promotedBatchInputs?: { uploadToken: string; info: IdentifiedFileMetadata }[] | null;
  appliedPreset?: Record<string, unknown> | null;
  presets?: SavedPreset[];
  onClearPromotedInput?: () => void;
  onRefreshJobs: () => Promise<void>;
  onPromoteToTool: (jobId: string, targetTool: Exclude<ToolKind, 'workflow'>) => Promise<void>;
  onSavePreset: (preset: Omit<SavedPreset, 'id' | 'createdAt'>) => Promise<void>;
  onShowToast: (msg: string, kind?: 'info' | 'error') => void;
}

const GOALS: { id: CompressionGoal; label: string; desc: string }[] = [
  { id: 'balanced', label: 'Balanced', desc: 'High visual fidelity with strong byte reduction' },
  { id: 'smallest', label: 'Smallest File', desc: 'Aggressive compaction & metadata removal' },
  { id: 'best-quality', label: 'Best Quality', desc: 'Near-transparent preservation with light savings' },
  { id: 'lossless', label: 'Lossless', desc: 'Zero generational loss (deflate / PNG / FLAC)' },
  { id: 'target-size', label: 'Target Size (KB)', desc: 'Adaptive bitrate/quality budget solver' },
];

export function FileCompressorView({
  promotedInput,
  promotedBatchInputs,
  appliedPreset,
  presets = [],
  onClearPromotedInput,
  onRefreshJobs,
  onPromoteToTool,
  onSavePreset,
  onShowToast,
}: FileCompressorViewProps) {
  const singleInputRef = useRef<HTMLInputElement | null>(null);
  const batchInputRef = useRef<HTMLInputElement | null>(null);
  const batchFolderInputRef = useRef<HTMLInputElement | null>(null);

  const [mode, setMode] = useState<'single' | 'batch'>('single');
  const [staged, setStaged] = useState<{ uploadToken: string; info: IdentifiedFileMetadata } | null>(null);
  const [options, setOptions] = useState<CompressionOptions>({ goal: 'balanced', quality: 78, stripMetadata: true });
  const [targetKbInput, setTargetKbInput] = useState('120');

  const [running, setRunning] = useState(false);
  const [resultJob, setResultJob] = useState<ConversionJob | null>(null);
  const [stats, setStats] = useState<CompressionStats | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [batchItems, setBatchItems] = useState<CompressBatchItem[]>([]);
  const [batchRunning, setBatchRunning] = useState(false);
  const [batchPaused, setBatchPaused] = useState(false);
  const [expandedOverrideId, setExpandedOverrideId] = useState<string | null>(null);
  const batchPauseRef = useRef(false);
  const batchCancelRef = useRef(false);

  useEffect(() => {
    if (promotedInput) {
      setMode('single');
      setStaged(promotedInput);
      setResultJob(null);
      setStats(null);
      setError(null);
      setOptions(buildCompressionPresetOptions(promotedInput.info.category, options.goal, Number(targetKbInput) || undefined));
      onClearPromotedInput?.();
    }
  }, [promotedInput, onClearPromotedInput]);

  useEffect(() => {
    if (promotedBatchInputs && promotedBatchInputs.length > 0) {
      setMode('batch');
      setBatchItems((prev) => [
        ...prev,
        ...promotedBatchInputs.map((item) => ({
          localId: `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
          uploadToken: item.uploadToken,
          info: item.info,
          status: 'queued' as const,
        })),
      ]);
      onClearPromotedInput?.();
    }
  }, [promotedBatchInputs, onClearPromotedInput]);

  useEffect(() => {
    if (appliedPreset) {
      setOptions((prev) => ({ ...prev, ...(appliedPreset as Partial<CompressionOptions>) }));
    }
  }, [appliedPreset]);

  const identifyFileUpload = async (file: File) => {
    const form = new FormData();
    form.append('file', file);
    const res = await fetch('/api/identify', { method: 'POST', body: form });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to inspect file.');
    return data as { uploadToken: string; info: IdentifiedFileMetadata };
  };

  const handleStageSingle = async (file: File) => {
    setError(null);
    try {
      const identified = await identifyFileUpload(file);
      setStaged(identified);
      setResultJob(null);
      setStats(null);
      const nextOpts = buildCompressionPresetOptions(
        identified.info.category,
        options.goal,
        Number(targetKbInput) || undefined
      );
      setOptions(nextOpts);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed.');
    }
  };

  const handleLoadSample = async (ext: string) => {
    setError(null);
    try {
      const res = await fetch(`/api/sample/${encodeURIComponent(ext)}`);
      if (!res.ok) throw new Error('Sample load failed.');
      const blob = await res.blob();
      await handleStageSingle(new File([blob], `sample.${ext}`, { type: blob.type }));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load sample.');
    }
  };

  const handleSelectGoal = (goal: CompressionGoal) => {
    const kb = Number(targetKbInput) || 120;
    const cat = staged?.info.category || 'image';
    setOptions(buildCompressionPresetOptions(cat, goal, kb));
  };

  const handleCompressSingle = async () => {
    if (!staged) return;
    setRunning(true);
    setError(null);
    try {
      const payloadOpts: CompressionOptions = {
        ...options,
        targetSizeKb: options.goal === 'target-size' ? Math.max(5, Number(targetKbInput) || 120) : undefined,
      };
      const res = await fetch('/api/compress', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          uploadToken: staged.uploadToken,
          originalName: staged.info.originalName,
          options: payloadOpts,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Compression failed.');
      setResultJob(data.job);
      setStats(data.stats);
      await onRefreshJobs();
      onShowToast('File compression completed.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Compression failed.');
    } finally {
      setRunning(false);
    }
  };

  const handleAddBatch = async (files: File[]) => {
    try {
      const added: CompressBatchItem[] = [];
      for (const f of files) {
        const identified = await identifyFileUpload(f);
        added.push({
          localId: `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
          uploadToken: identified.uploadToken,
          info: identified.info,
          status: 'queued',
        });
      }
      setBatchItems((prev) => [...prev, ...added]);
    } catch (err) {
      onShowToast(err instanceof Error ? err.message : 'Failed to queue batch files.', 'error');
    }
  };

  const handleRunBatch = async () => {
    setBatchRunning(true);
    setBatchPaused(false);
    batchPauseRef.current = false;
    batchCancelRef.current = false;

    for (const item of batchItems) {
      if (item.excluded || item.status === 'completed') continue;
      if (batchCancelRef.current) {
        setBatchItems((prev) =>
          prev.map((x) => (x.localId === item.localId && x.status === 'queued' ? { ...x, status: 'cancelled' } : x))
        );
        continue;
      }
      while (batchPauseRef.current && !batchCancelRef.current) {
        await new Promise((r) => setTimeout(r, 200));
      }
      if (batchCancelRef.current) continue;

      setBatchItems((prev) =>
        prev.map((x) => (x.localId === item.localId ? { ...x, status: 'processing', error: undefined } : x))
      );
      try {
        const effOpts: CompressionOptions = {
          ...options,
          ...(item.overrideOptions || {}),
        };
        if (effOpts.goal === 'target-size') {
          effOpts.targetSizeKb = Math.max(5, Number(effOpts.targetSizeKb || targetKbInput) || 120);
        }
        const res = await fetch('/api/compress', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            uploadToken: item.uploadToken,
            originalName: item.info.originalName,
            options: effOpts,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed');
        setBatchItems((prev) =>
          prev.map((x) =>
            x.localId === item.localId ? { ...x, status: 'completed', job: data.job, stats: data.stats } : x
          )
        );
      } catch (err) {
        setBatchItems((prev) =>
          prev.map((x) =>
            x.localId === item.localId
              ? { ...x, status: 'failed', error: err instanceof Error ? err.message : 'Failed' }
              : x
          )
        );
      }
    }
    setBatchRunning(false);
    setBatchPaused(false);
    await onRefreshJobs();
    onShowToast(batchCancelRef.current ? 'Batch compression stopped.' : 'Batch compression complete.');
  };

  const handleBatchZip = async () => {
    const jobIds = batchItems.filter((i) => i.status === 'completed' && i.job?.id).map((i) => i.job!.id);
    if (jobIds.length === 0) return;
    const res = await fetch('/api/jobs/batch-zip', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jobIds }),
    });
    if (!res.ok) return;
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `omnifiles_compressed_${Date.now()}.zip`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const cmpPresets = presets.filter((p) => p.tool === 'compressor');
  const activeBatchItems = batchItems.filter((i) => !i.excluded);
  const cat = staged?.info.category || 'image';

  return (
    <div className="space-y-6">
      <GlassSurface as="div" className="rounded-[22px] p-5 flex flex-wrap items-center justify-between gap-4 overflow-visible relative z-20">
        <div>
          <h2 className="font-display text-lg font-semibold text-[var(--text-primary)]">Advanced File Compressor</h2>
          <p className="text-xs text-[var(--text-muted)] mt-0.5">
            Goal-driven compression &amp; target-KB solver across images, PDFs, media, documents, and individual batch overrides
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          {cmpPresets.length > 0 && (
            <div className="w-44">
              <GlassDropdown
                size="sm"
                ariaLabel="Apply Compressor Preset"
                placeholder="Apply preset..."
                value=""
                onChange={(id) => {
                  const found = cmpPresets.find((p) => p.id === id);
                  if (found) {
                    setOptions((prev) => ({ ...prev, ...(found.config as Partial<CompressionOptions>) }));
                    onShowToast(`Configured "${found.name}".`);
                  }
                }}
                options={[
                  { value: '', label: 'Apply preset...' },
                  ...cmpPresets.map((p) => ({ value: p.id, label: p.name })),
                ]}
              />
            </div>
          )}

          <div className="inline-flex gap-1 p-1 rounded-xl border border-black/10 dark:border-white/12 bg-black/4 dark:bg-black/35">
            {(['single', 'batch'] as const).map((m) => {
              const active = mode === m;
              return (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMode(m)}
                  className="relative px-3 py-1.5 rounded-lg text-xs font-medium cursor-pointer whitespace-nowrap"
                >
                  {active && (
                    <motion.span
                      layoutId="cmp-mode-pill"
                      transition={SPRING_SNAPPY}
                      className="absolute inset-0 rounded-lg bg-zinc-900 dark:bg-white"
                    />
                  )}
                  <span
                    className={`relative z-10 ${
                      active ? 'text-white dark:text-black' : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                    }`}
                  >
                    {m === 'single' ? 'Single File' : `Batch Compressor (${batchItems.length})`}
                  </span>
                </button>
              );
            })}
          </div>

          <input
            ref={singleInputRef}
            type="file"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleStageSingle(f);
              e.target.value = '';
            }}
          />
          <input
            ref={batchInputRef}
            type="file"
            multiple
            className="hidden"
            onChange={(e) => {
              const files = Array.from(e.target.files || []);
              if (files.length > 0) handleAddBatch(files);
              e.target.value = '';
            }}
          />
          <input
            ref={batchFolderInputRef}
            type="file"
            multiple
            {...({ webkitdirectory: '' } as Record<string, string>)}
            className="hidden"
            onChange={(e) => {
              const files = Array.from(e.target.files || []);
              if (files.length > 0) handleAddBatch(files);
              e.target.value = '';
            }}
          />

          <button
            type="button"
            onClick={() => (mode === 'single' ? singleInputRef.current?.click() : batchInputRef.current?.click())}
            className="inline-flex items-center gap-2 rounded-xl bg-zinc-900 text-white dark:bg-white dark:text-black px-4 py-2 text-xs font-medium hover:opacity-90 cursor-pointer whitespace-nowrap"
          >
            <Upload className="w-3.5 h-3.5" />
            {mode === 'single' ? 'Upload File' : 'Add Batch Files'}
          </button>
        </div>
      </GlassSurface>

      {mode === 'batch' ? (
        <GlassSurface as="section" className="rounded-[22px] p-6 space-y-5 overflow-visible relative z-10">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="font-display text-base font-semibold text-[var(--text-primary)]">
                Batch File Compression ({activeBatchItems.length}/{batchItems.length} active · {options.goal})
              </h3>
              <p className="text-xs text-[var(--text-muted)] mt-0.5">
                Compress files together or customize goal, quality, and KB targets per file.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => batchInputRef.current?.click()}
                className="glass-interactive rounded-xl px-3 py-2 text-xs text-[var(--text-primary)] cursor-pointer"
              >
                Add Files
              </button>
              <button
                type="button"
                onClick={() => batchFolderInputRef.current?.click()}
                className="glass-interactive inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs text-[var(--text-primary)] cursor-pointer"
              >
                <FolderUp className="w-3.5 h-3.5" />
                Add Folder
              </button>
              {batchItems.some((i) => i.status === 'completed') && (
                <>
                  <button
                    type="button"
                    onClick={handleBatchZip}
                    className="glass-interactive inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs text-[var(--text-primary)] cursor-pointer"
                  >
                    <FolderArchive className="w-3.5 h-3.5" />
                    Download ZIP
                  </button>
                  <button
                    type="button"
                    onClick={() => setBatchItems((prev) => prev.filter((x) => x.status !== 'completed'))}
                    className="glass-interactive rounded-xl px-3 py-2 text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer"
                  >
                    Clear Completed
                  </button>
                </>
              )}
              {batchRunning ? (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      batchPauseRef.current = !batchPauseRef.current;
                      setBatchPaused(batchPauseRef.current);
                    }}
                    className="glass-interactive inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs text-[var(--text-primary)] cursor-pointer"
                  >
                    {batchPaused ? <Play className="w-3.5 h-3.5" /> : <Pause className="w-3.5 h-3.5" />}
                    {batchPaused ? 'Resume' : 'Pause'}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      batchCancelRef.current = true;
                    }}
                    className="glass-interactive inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs text-[var(--text-primary)] cursor-pointer"
                  >
                    <Square className="w-3.5 h-3.5" />
                    Stop
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  disabled={activeBatchItems.length === 0}
                  onClick={handleRunBatch}
                  className="inline-flex items-center gap-2 rounded-xl bg-zinc-900 text-white dark:bg-white dark:text-black px-4 py-2 text-xs font-medium disabled:opacity-40 cursor-pointer"
                >
                  <Play className="w-3.5 h-3.5" />
                  Compress Active ({activeBatchItems.length})
                </button>
              )}
            </div>
          </div>

          {batchItems.length === 0 ? (
            <div className="py-10 text-center border border-dashed border-black/12 dark:border-white/14 rounded-xl">
              <p className="text-xs text-[var(--text-muted)]">Add multiple files or folders to run batch compression.</p>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center justify-between text-xs text-[var(--text-secondary)]">
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setBatchItems((prev) => prev.map((x) => ({ ...x, excluded: false })))}
                    className="hover:text-[var(--text-primary)] cursor-pointer"
                  >
                    Select All
                  </button>
                  <span aria-hidden="true">·</span>
                  <button
                    type="button"
                    onClick={() => setBatchItems((prev) => prev.map((x) => ({ ...x, excluded: true })))}
                    className="hover:text-[var(--text-primary)] cursor-pointer"
                  >
                    Deselect All
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => setBatchItems([])}
                  className="hover:text-[var(--text-primary)] cursor-pointer"
                >
                  Clear All
                </button>
              </div>

              <div className="divide-y divide-black/8 dark:divide-white/8">
                {batchItems.map((item) => {
                  const hasOverride = Boolean(item.overrideOptions && Object.keys(item.overrideOptions).length > 0);
                  const isOpen = expandedOverrideId === item.localId;
                  const effGoal = item.overrideOptions?.goal ?? options.goal;
                  const effQuality = item.overrideOptions?.quality ?? options.quality ?? 78;

                  return (
                    <div key={item.localId} className={`py-3 space-y-2.5 text-xs ${item.excluded ? 'opacity-50' : ''}`}>
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <label className="flex items-center gap-2.5 min-w-0 cursor-pointer flex-1">
                          <input
                            type="checkbox"
                            checked={!item.excluded}
                            disabled={item.status === 'processing'}
                            onChange={(e) =>
                              setBatchItems((prev) =>
                                prev.map((x) => (x.localId === item.localId ? { ...x, excluded: !e.target.checked } : x))
                              )
                            }
                            className="accent-zinc-900 dark:accent-white rounded"
                          />
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <p className="font-medium text-[var(--text-primary)] truncate">{item.info.originalName}</p>
                              {hasOverride && (
                                <span className="font-mono text-[10px] text-[var(--text-primary)] underline shrink-0">
                                  Customized
                                </span>
                              )}
                            </div>
                            <p className="text-[var(--text-secondary)] tabular-nums">
                              {formatBytes(item.info.sizeBytes)}
                              {item.stats
                                ? ` → ${formatBytes(item.stats.outputBytes)} (${item.stats.percentDelta > 0 ? '+' : ''}${item.stats.percentDelta}%)`
                                : ` · ${item.excluded ? 'excluded' : item.status}`}
                            </p>
                            {item.error && <p className="text-red-500 mt-0.5">{item.error}</p>}
                          </div>
                        </label>
                        <div className="flex items-center gap-2.5 shrink-0">
                          <button
                            type="button"
                            onClick={() => setExpandedOverrideId(isOpen ? null : item.localId)}
                            className="glass-interactive inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer"
                          >
                            <SlidersHorizontal className="w-3 h-3" />
                            Override
                          </button>
                          {item.job?.downloadUrl && (
                            <a href={item.job.downloadUrl} className="inline-flex items-center gap-1 text-[var(--text-primary)] underline">
                              <Download className="w-3.5 h-3.5" />
                              Download
                            </a>
                          )}
                          <button
                            type="button"
                            onClick={() => setBatchItems((prev) => prev.filter((x) => x.localId !== item.localId))}
                            className="text-[var(--text-secondary)] hover:text-[var(--text-primary)] cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      {isOpen && (
                        <div className="ml-6 rounded-xl border border-black/10 dark:border-white/12 bg-black/4 dark:bg-black/40 p-3 flex flex-wrap items-end justify-between gap-3">
                          <div className="flex flex-wrap items-end gap-4">
                            <div className="w-40">
                              <label className="block text-[11px] text-[var(--text-muted)] mb-1">Compression Goal</label>
                              <GlassDropdown
                                size="sm"
                                ariaLabel={`Goal for ${item.info.originalName}`}
                                value={effGoal}
                                onChange={(v) =>
                                  setBatchItems((prev) =>
                                    prev.map((x) =>
                                      x.localId === item.localId
                                        ? { ...x, overrideOptions: { ...x.overrideOptions, goal: v as CompressionGoal } }
                                        : x
                                    )
                                  )
                                }
                                options={GOALS.map((g) => ({ value: g.id, label: g.label }))}
                              />
                            </div>
                            <div className="flex items-center gap-2 pb-1">
                              <span className="text-[var(--text-muted)]">Quality ({effQuality}%):</span>
                              <input
                                type="range"
                                min={15}
                                max={100}
                                value={effQuality}
                                onChange={(e) =>
                                  setBatchItems((prev) =>
                                    prev.map((x) =>
                                      x.localId === item.localId
                                        ? { ...x, overrideOptions: { ...x.overrideOptions, quality: Number(e.target.value) } }
                                        : x
                                    )
                                  )
                                }
                                className="w-24 accent-zinc-900 dark:accent-white cursor-pointer"
                              />
                            </div>
                            {effGoal === 'target-size' && (
                              <div>
                                <label className="block text-[11px] text-[var(--text-muted)] mb-1">Target KB</label>
                                <input
                                  type="number"
                                  min={5}
                                  value={item.overrideOptions?.targetSizeKb || Number(targetKbInput) || 120}
                                  onChange={(e) =>
                                    setBatchItems((prev) =>
                                      prev.map((x) =>
                                        x.localId === item.localId
                                          ? {
                                              ...x,
                                              overrideOptions: {
                                                ...x.overrideOptions,
                                                targetSizeKb: Number(e.target.value) || 120,
                                              },
                                            }
                                          : x
                                      )
                                    )
                                  }
                                  className="w-24 rounded-xl border border-[var(--control-border)] bg-[var(--input-bg)] px-2.5 py-1 text-xs font-mono text-[var(--text-primary)] tabular-nums"
                                />
                              </div>
                            )}
                          </div>

                          {hasOverride && (
                            <button
                              type="button"
                              onClick={() =>
                                setBatchItems((prev) =>
                                  prev.map((x) => (x.localId === item.localId ? { ...x, overrideOptions: undefined } : x))
                                )
                              }
                              className="glass-interactive rounded-lg px-2.5 py-1 text-[11px] text-[var(--text-primary)] cursor-pointer"
                            >
                              Reset to Global
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </GlassSurface>
      ) : !staged ? (
        <GlassSurface as="section" className="rounded-[24px] p-12 text-center space-y-4">
          <Minimize2 className="w-8 h-8 text-[var(--text-muted)] mx-auto" />
          <h3 className="font-display text-lg font-medium text-[var(--text-primary)]">
            Drop any file to compress with real byte-delta telemetry
          </h3>
          <p className="text-xs text-[var(--text-muted)] max-w-md mx-auto leading-relaxed">
            Supports PNG/JPG/WebP/AVIF, PDF documents (Ghostscript), MP4/WebM video &amp; audio (FFmpeg), DOCX/XLSX/PPTX/EPUB media stripping, and SVGO/Terser/CleanCSS minification.
          </p>
          <div className="flex flex-wrap justify-center gap-2 pt-2">
            <button
              type="button"
              onClick={() => singleInputRef.current?.click()}
              className="rounded-xl bg-zinc-900 text-white dark:bg-white dark:text-black px-5 py-2.5 text-xs font-medium hover:opacity-90 cursor-pointer"
            >
              Select File
            </button>
            {[
              { ext: 'png', label: 'Sample PNG' },
              { ext: 'pdf', label: 'Sample PDF' },
              { ext: 'wav', label: 'Sample WAV' },
              { ext: 'mp4', label: 'Sample MP4' },
              { ext: 'docx', label: 'Sample DOCX' },
            ].map((s) => (
              <button
                key={s.ext}
                type="button"
                onClick={() => handleLoadSample(s.ext)}
                className="glass-interactive rounded-xl px-3.5 py-2 text-xs text-[var(--text-primary)] cursor-pointer"
              >
                {s.label}
              </button>
            ))}
          </div>
          {error && <p className="text-xs text-red-500 pt-2">{error}</p>}
        </GlassSurface>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left Column: File Info + Before Preview + Honest Results Panel */}
          <div className="lg:col-span-5 space-y-5">
            <GlassSurface as="section" className="rounded-[22px] p-5 space-y-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-xs text-[var(--text-secondary)]">Compression Source</p>
                  <h3 className="font-display text-base font-semibold text-[var(--text-primary)] truncate mt-0.5">
                    {staged.info.originalName}
                  </h3>
                  <p className="text-xs text-[var(--text-muted)] mt-1 tabular-nums">
                    {staged.info.detectedExt.toUpperCase()} · {formatBytes(staged.info.sizeBytes)} ·{' '}
                    <span className="capitalize">{staged.info.category}</span>
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => singleInputRef.current?.click()}
                  className="glass-interactive rounded-lg px-2.5 py-1 text-xs text-[var(--text-primary)] cursor-pointer shrink-0"
                >
                  Change File
                </button>
              </div>
              <PreviewPanel
                kind={staged.info.previewKind}
                url={`/api/uploads/${staged.uploadToken}/preview`}
                data={staged.info.previewData}
                label={staged.info.originalName}
                ext={staged.info.detectedExt}
              />
            </GlassSurface>

            {stats && resultJob && (
              <GlassSurface as="section" className="rounded-[22px] p-5 space-y-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-2.5">
                    <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0 mt-0.5" />
                    <div>
                      <h4 className="font-display text-sm font-semibold text-[var(--text-primary)]">
                        Compression Result
                      </h4>
                      <p className="text-xs text-[var(--text-muted)] mt-0.5">{stats.strategyUsed}</p>
                    </div>
                  </div>
                  {resultJob.downloadUrl && (
                    <a
                      href={resultJob.downloadUrl}
                      className="inline-flex items-center gap-1.5 rounded-xl bg-zinc-900 text-white dark:bg-white dark:text-black px-3.5 py-2 text-xs font-medium hover:opacity-90 whitespace-nowrap"
                    >
                      <Download className="w-3.5 h-3.5" />
                      Download
                    </a>
                  )}
                </div>

                {/* Truthful Metrics Grid */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-xs">
                  <div className="rounded-xl border border-black/10 dark:border-white/10 p-3">
                    <span className="text-[var(--text-secondary)]">Original</span>
                    <p className="font-mono font-semibold text-[var(--text-primary)] mt-1 tabular-nums">
                      {formatBytes(stats.originalBytes)}
                    </p>
                  </div>
                  <div className="rounded-xl border border-black/10 dark:border-white/10 p-3">
                    <span className="text-[var(--text-secondary)]">Compressed</span>
                    <p className="font-mono font-semibold text-[var(--text-primary)] mt-1 tabular-nums">
                      {formatBytes(stats.outputBytes)}
                    </p>
                  </div>
                  <div className="rounded-xl border border-black/10 dark:border-white/10 p-3">
                    <span className="text-[var(--text-secondary)]">Exact Delta</span>
                    <p className="font-mono font-semibold text-[var(--text-primary)] mt-1 tabular-nums">
                      {stats.percentDelta > 0 ? `+${stats.percentDelta}%` : `${stats.percentDelta}%`}
                    </p>
                  </div>
                  <div className="rounded-xl border border-black/10 dark:border-white/10 p-3">
                    <span className="text-[var(--text-secondary)]">Elapsed</span>
                    <p className="font-mono font-semibold text-[var(--text-primary)] mt-1 tabular-nums">
                      {stats.durationMs} ms
                    </p>
                  </div>
                </div>

                {stats.savedBytes < 0 && (
                  <p className="text-xs text-amber-600 dark:text-amber-300">
                    Note: Source file is already tightly encoded for this lossless/quality setting (+{formatBytes(Math.abs(stats.savedBytes))}). Try &ldquo;Smallest File&rdquo; or &ldquo;Target Size (KB)&rdquo; for stronger reduction.
                  </p>
                )}

                {options.goal === 'target-size' && (
                  <p className="text-xs text-[var(--text-muted)]">
                    Target Budget ({options.targetSizeKb} KB):{' '}
                    <span className="font-medium text-[var(--text-primary)]">
                      {stats.targetAchieved ? 'Achieved within budget' : 'Closest achievable size without severe corruption'}
                    </span>
                  </p>
                )}

                {resultJob.previewKind && resultJob.previewKind !== 'none' && (
                  <PreviewPanel
                    kind={resultJob.previewKind}
                    url={resultJob.previewUrl}
                    label={resultJob.originalName}
                    ext={resultJob.targetExt}
                  />
                )}

                <ToolHandoffBar
                  job={resultJob}
                  currentTool="compressor"
                  onPromoteToTool={onPromoteToTool}
                  presetConfig={options as unknown as Record<string, unknown>}
                  presetDescription={`${options.goal} compression preset`}
                  onSavePreset={onSavePreset}
                />
              </GlassSurface>
            )}
          </div>

          {/* Right Column: Smart Compression Intelligence & Parameters */}
          <div className="lg:col-span-7 space-y-5">
            <section className="glass-secondary glass-rim rounded-[22px] p-6 space-y-5 overflow-visible">
              <div className="space-y-2.5">
                <div className="flex items-center gap-2 text-xs text-[var(--text-muted)]">
                  <Gauge className="w-3.5 h-3.5 text-[var(--text-primary)]" />
                  <span>Compression Goal</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  {GOALS.map((g) => {
                    const active = options.goal === g.id;
                    return (
                      <button
                        key={g.id}
                        type="button"
                        onClick={() => handleSelectGoal(g.id)}
                        className={`rounded-xl border p-3 text-left cursor-pointer transition-all ${
                          active
                            ? 'border-zinc-900 bg-black/8 dark:border-white dark:bg-white/14'
                            : 'glass-interactive'
                        }`}
                      >
                        <p className="text-xs font-semibold text-[var(--text-primary)]">{g.label}</p>
                        <p className="text-[11px] text-[var(--text-secondary)] mt-0.5 line-clamp-2">{g.desc}</p>
                      </button>
                    );
                  })}
                </div>
              </div>

              {options.goal === 'target-size' && (
                <div className="rounded-xl border border-black/10 dark:border-white/12 bg-black/4 dark:bg-black/35 p-4 flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <label htmlFor="target-kb-input" className="text-xs font-medium text-[var(--text-primary)]">
                      Target File Size Budget (KB)
                    </label>
                    <p className="text-[11px] text-[var(--text-secondary)]">
                      Iteratively solves quality/resolution or calculates target bitrate to stay under this budget.
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      id="target-kb-input"
                      type="number"
                      min={5}
                      max={100000}
                      value={targetKbInput}
                      onChange={(e) => {
                        setTargetKbInput(e.target.value);
                        setOptions((p) => ({ ...p, targetSizeKb: Number(e.target.value) || 120 }));
                      }}
                      className="w-28 rounded-xl border border-[var(--control-border)] bg-[var(--input-bg)] px-3 py-1.5 text-xs font-mono text-[var(--text-primary)] tabular-nums"
                    />
                    <span className="text-xs font-mono text-[var(--text-muted)]">KB</span>
                  </div>
                </div>
              )}

              {/* Category-Specific Tuning */}
              <div className="pt-4 border-t border-black/10 dark:border-white/10 space-y-4 text-xs">
                {(cat === 'image' || cat === 'vector') && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <span className="text-[var(--text-muted)]">Quality ({options.quality ?? 78}%)</span>
                      <input
                        type="range"
                        min={15}
                        max={100}
                        value={options.quality ?? 78}
                        onChange={(e) => setOptions((p) => ({ ...p, quality: Number(e.target.value) }))}
                        className="w-full accent-zinc-900 dark:accent-white mt-1.5 cursor-pointer"
                      />
                    </div>
                    <div>
                      <label className="block text-[var(--text-muted)] mb-1">Max Width Cap (px, optional)</label>
                      <input
                        type="number"
                        placeholder="Original width"
                        value={options.maxWidth || ''}
                        onChange={(e) =>
                          setOptions((p) => ({ ...p, maxWidth: e.target.value ? Number(e.target.value) : undefined }))
                        }
                        className="w-full rounded-xl border border-[var(--control-border)] bg-[var(--input-bg)] px-3 py-1.5 text-xs text-[var(--text-primary)]"
                      />
                    </div>
                  </div>
                )}

                {cat === 'video' && (
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <label className="block text-[var(--text-muted)] mb-1">Video Codec</label>
                      <GlassDropdown
                        size="sm"
                        ariaLabel="Video Codec"
                        value={options.videoCodec || 'libx264'}
                        onChange={(v) => setOptions((p) => ({ ...p, videoCodec: v as 'libx264' | 'libvpx-vp9' }))}
                        options={[
                          { value: 'libx264', label: 'H.264 (AVC)' },
                          { value: 'libvpx-vp9', label: 'VP9' },
                        ]}
                      />
                    </div>
                    <div>
                      <span className="text-[var(--text-muted)]">CRF Factor ({options.videoCrf ?? 26})</span>
                      <input
                        type="range"
                        min={18}
                        max={36}
                        value={options.videoCrf ?? 26}
                        onChange={(e) => setOptions((p) => ({ ...p, videoCrf: Number(e.target.value) }))}
                        className="w-full accent-zinc-900 dark:accent-white mt-2 cursor-pointer"
                      />
                    </div>
                    <div>
                      <label className="block text-[var(--text-muted)] mb-1">Max Resolution</label>
                      <GlassDropdown
                        size="sm"
                        ariaLabel="Max Resolution"
                        value={options.videoResolution || 'original'}
                        onChange={(v) => setOptions((p) => ({ ...p, videoResolution: v }))}
                        options={[
                          { value: 'original', label: 'Original' },
                          { value: '1920x1080', label: '1080p' },
                          { value: '1280x720', label: '720p' },
                          { value: '854x480', label: '480p' },
                        ]}
                      />
                    </div>
                  </div>
                )}

                {cat === 'audio' && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-[var(--text-muted)] mb-1">Target Bitrate</label>
                      <GlassDropdown
                        size="sm"
                        ariaLabel="Target Bitrate"
                        value={options.audioBitrate || '128k'}
                        onChange={(v) => setOptions((p) => ({ ...p, audioBitrate: v }))}
                        options={[
                          { value: '64k', label: '64 kbps (Voice)' },
                          { value: '96k', label: '96 kbps' },
                          { value: '128k', label: '128 kbps (Standard)' },
                          { value: '192k', label: '192 kbps' },
                          { value: '256k', label: '256 kbps' },
                        ]}
                      />
                    </div>
                    <div>
                      <label className="block text-[var(--text-muted)] mb-1">Sample Rate</label>
                      <GlassDropdown
                        size="sm"
                        ariaLabel="Sample Rate"
                        value={String(options.audioSampleRate || 44100)}
                        onChange={(v) => setOptions((p) => ({ ...p, audioSampleRate: Number(v) }))}
                        options={[
                          { value: '48000', label: '48 kHz' },
                          { value: '44100', label: '44.1 kHz' },
                          { value: '22050', label: '22.05 kHz' },
                        ]}
                      />
                    </div>
                  </div>
                )}

                {cat === 'document' && staged.info.detectedExt === 'pdf' && (
                  <div>
                    <label className="block text-[var(--text-muted)] mb-1">Ghostscript PDF Profile</label>
                    <GlassDropdown
                      size="sm"
                      ariaLabel="Ghostscript PDF Profile"
                      value={options.pdfPreset || 'ebook'}
                      onChange={(v) => setOptions((p) => ({ ...p, pdfPreset: v as CompressionOptions['pdfPreset'] }))}
                      options={[
                        { value: 'screen', label: '/screen (72 DPI — Smallest)' },
                        { value: 'ebook', label: '/ebook (150 DPI — Balanced)' },
                        { value: 'printer', label: '/printer (300 DPI — High)' },
                        { value: 'prepress', label: '/prepress (Color Preserving)' },
                      ]}
                    />
                  </div>
                )}

                <label className="flex items-center gap-2 text-[var(--text-soft)] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={options.stripMetadata !== false}
                    onChange={(e) => setOptions((p) => ({ ...p, stripMetadata: e.target.checked }))}
                    className="accent-zinc-900 dark:accent-white cursor-pointer"
                  />
                  Strip EXIF, camera tags, and non-essential embedded metadata
                </label>
              </div>

              <button
                type="button"
                disabled={running}
                onClick={handleCompressSingle}
                className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-zinc-900 text-white dark:bg-white dark:text-black px-5 py-3 text-sm font-medium hover:opacity-90 disabled:opacity-45 cursor-pointer"
              >
                {running ? <Loader2 className="w-4 h-4 animate-spin" /> : <Minimize2 className="w-4 h-4" />}
                {running ? 'Compressing File...' : 'Run Compression'}
              </button>

              {error && (
                <p className="text-xs text-red-500 dark:text-red-400 flex items-center gap-1.5">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  {error}
                </p>
              )}
            </section>
          </div>
        </div>
      )}
    </div>
  );
}
