import { useEffect, useRef, useState } from 'react';
import { motion } from 'motion/react';
import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  Download,
  Eraser,
  FolderArchive,
  FolderUp,
  ImagePlus,
  Loader2,
  Paintbrush,
  Pause,
  Play,
  RotateCcw,
  SlidersHorizontal,
  Sparkles,
  SplitSquareHorizontal,
  Square,
  Trash2,
  Upload,
} from 'lucide-react';
import type {
  BgBackgroundMode,
  BgRemovalAnalysis,
  BgRemovalOptions,
  ConversionJob,
  IdentifiedFileMetadata,
  SavedPreset,
  ToolKind,
} from '../shared/types';
import { formatBytes } from '../utils/formatters';
import { SPRING_SNAPPY } from '../utils/motion';
import { GlassSurface } from './glass/GlassSurface';
import { GlassDropdown } from './glass/GlassDropdown';
import { ToolHandoffBar } from './ToolHandoffBar';

export const DEFAULT_BG_OPTIONS: BgRemovalOptions = {
  modelPrecision: 'fast',
  outputFormat: 'png',
  quality: 92,
  featherRadius: 1,
  edgeRefinement: 0,
  backgroundMode: 'transparent',
  backgroundColor: '#ffffff',
  gradientFrom: '#141414',
  gradientTo: '#e4e4e7',
  gradientAngle: 135,
  backgroundBlurRadius: 18,
  shadowEnabled: false,
  shadowOpacity: 0.35,
  shadowBlur: 14,
  subjectScale: 1,
  offsetX: 0,
  offsetY: 0,
  cropAspect: 'original',
  brightness: 1,
  contrast: 1,
  saturation: 1,
};

interface BgBatchItem {
  localId: string;
  uploadToken: string;
  info: IdentifiedFileMetadata;
  status: 'queued' | 'processing' | 'completed' | 'failed' | 'cancelled';
  excluded?: boolean;
  overrideOptions?: Partial<BgRemovalOptions>;
  job?: ConversionJob;
  error?: string;
}

interface BackgroundRemoverViewProps {
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

const SOLID_SWATCHES = ['#ffffff', '#000000', '#18181b', '#e4e4e7', '#f4f4f5', '#27272a'];

export function BackgroundRemoverView({
  promotedInput,
  promotedBatchInputs,
  appliedPreset,
  presets = [],
  onClearPromotedInput,
  onRefreshJobs,
  onPromoteToTool,
  onSavePreset,
  onShowToast,
}: BackgroundRemoverViewProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const batchInputRef = useRef<HTMLInputElement | null>(null);
  const batchFolderInputRef = useRef<HTMLInputElement | null>(null);
  const customBgInputRef = useRef<HTMLInputElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const isDrawingRef = useRef(false);

  const [mode, setMode] = useState<'single' | 'batch'>('single');
  const [staged, setStaged] = useState<{ uploadToken: string; info: IdentifiedFileMetadata } | null>(null);
  const [options, setOptions] = useState<BgRemovalOptions>(DEFAULT_BG_OPTIONS);
  const [customBgFile, setCustomBgFile] = useState<File | null>(null);
  const [customBgPreviewUrl, setCustomBgPreviewUrl] = useState<string | null>(null);

  const [processing, setProcessing] = useState(false);
  const [resultJob, setResultJob] = useState<ConversionJob | null>(null);
  const [analysis, setAnalysis] = useState<BgRemovalAnalysis | null>(null);
  const [geminiLoading, setGeminiLoading] = useState(false);
  const [geminiError, setGeminiError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [stageTab, setStageTab] = useState<'compare' | 'brush' | 'original'>('compare');
  const [splitPct, setSplitPct] = useState(52);
  const [brushMode, setBrushMode] = useState<'restore' | 'erase'>('restore');
  const [brushSize, setBrushSize] = useState(24);
  const [hasMaskStrokes, setHasMaskStrokes] = useState(false);
  const [refineOpen, setRefineOpen] = useState(true);

  const [batchItems, setBatchItems] = useState<BgBatchItem[]>([]);
  const [batchRunning, setBatchRunning] = useState(false);
  const [batchPaused, setBatchPaused] = useState(false);
  const [expandedOverrideId, setExpandedOverrideId] = useState<string | null>(null);
  const batchPauseRef = useRef(false);
  const batchCancelRef = useRef(false);

  // Accept single handoff from another tool
  useEffect(() => {
    if (promotedInput) {
      setMode('single');
      setStaged(promotedInput);
      setResultJob(null);
      setAnalysis(null);
      setError(null);
      setHasMaskStrokes(false);
      setOptions((prev) => ({ ...prev, maskOverlayDataUrl: undefined }));
      onClearPromotedInput?.();
    }
  }, [promotedInput, onClearPromotedInput]);

  // Accept multi-file handoff from Workspace / Explorer
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

  // Accept preset launched from Saved Presets
  useEffect(() => {
    if (appliedPreset) {
      setOptions((prev) => ({ ...prev, ...(appliedPreset as Partial<BgRemovalOptions>) }));
    }
  }, [appliedPreset]);

  const identifyFileUpload = async (file: File) => {
    const form = new FormData();
    form.append('file', file);
    const res = await fetch('/api/identify', { method: 'POST', body: form });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to inspect image.');
    return data as { uploadToken: string; info: IdentifiedFileMetadata };
  };

  const handleStageSingle = async (file: File) => {
    setError(null);
    try {
      const identified = await identifyFileUpload(file);
      setStaged(identified);
      setResultJob(null);
      setAnalysis(null);
      setGeminiError(null);
      setHasMaskStrokes(false);
      setOptions((prev) => ({ ...prev, maskOverlayDataUrl: undefined }));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed.');
    }
  };

  const handleLoadSample = async (preset: 'product' | 'portrait' | 'badge') => {
    setError(null);
    try {
      const res = await fetch(`/api/bg-remove/sample/${preset}`);
      if (!res.ok) throw new Error('Sample generation failed.');
      const blob = await res.blob();
      const file = new File([blob], `sample_${preset}.png`, { type: 'image/png' });
      await handleStageSingle(file);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load sample.');
    }
  };

  const handleClearBrush = () => {
    const canvas = canvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext('2d');
      ctx?.clearRect(0, 0, canvas.width, canvas.height);
    }
    setHasMaskStrokes(false);
    setOptions((prev) => ({ ...prev, maskOverlayDataUrl: undefined }));
  };

  const paintOnCanvas = (clientX: number, clientY: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const x = (clientX - rect.left) * scaleX;
    const y = (clientY - rect.top) * scaleY;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.fillStyle = brushMode === 'restore' ? 'rgba(255, 255, 255, 0.92)' : 'rgba(0, 0, 0, 0.92)';
    ctx.beginPath();
    ctx.arc(x, y, (brushSize * scaleX) / 2, 0, Math.PI * 2);
    ctx.fill();
    setHasMaskStrokes(true);
  };

  const handleProcessSingle = async () => {
    if (!staged) return;
    setProcessing(true);
    setError(null);
    try {
      let effectiveOptions = { ...options };
      if (canvasRef.current && hasMaskStrokes) {
        effectiveOptions.maskOverlayDataUrl = canvasRef.current.toDataURL('image/png');
      }
      const form = new FormData();
      form.append('uploadToken', staged.uploadToken);
      form.append('originalName', staged.info.originalName);
      form.append('options', JSON.stringify(effectiveOptions));
      if (effectiveOptions.backgroundMode === 'custom' && customBgFile) {
        form.append('customBackground', customBgFile);
      }

      const res = await fetch('/api/bg-remove/process', { method: 'POST', body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Background removal failed.');
      setResultJob(data.job);
      setAnalysis(data.analysis);
      setStageTab('compare');
      await onRefreshJobs();
      onShowToast('Background cutout rendered cleanly.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Background removal failed.');
    } finally {
      setProcessing(false);
    }
  };

  const handleGeminiEdgeAudit = async () => {
    if (!staged) return;
    setGeminiLoading(true);
    setGeminiError(null);
    try {
      const res = await fetch('/api/bg-remove/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ uploadToken: staged.uploadToken }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Gemini Vision audit unavailable.');
      setAnalysis((prev) => (prev ? { ...prev, geminiInsights: data.insights } : prev));
    } catch (err) {
      setGeminiError(err instanceof Error ? err.message : 'Edge audit unavailable.');
    } finally {
      setGeminiLoading(false);
    }
  };

  const handleAddBatchFiles = async (files: File[]) => {
    try {
      const queued: BgBatchItem[] = [];
      for (const f of files) {
        const identified = await identifyFileUpload(f);
        queued.push({
          localId: `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
          uploadToken: identified.uploadToken,
          info: identified.info,
          status: 'queued',
        });
      }
      setBatchItems((prev) => [...prev, ...queued]);
    } catch (err) {
      onShowToast(err instanceof Error ? err.message : 'Failed to queue batch images.', 'error');
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
        const effOptions: BgRemovalOptions = {
          ...options,
          ...(item.overrideOptions || {}),
          maskOverlayDataUrl: undefined,
        };
        const form = new FormData();
        form.append('uploadToken', item.uploadToken);
        form.append('originalName', item.info.originalName);
        form.append('options', JSON.stringify(effOptions));
        if (effOptions.backgroundMode === 'custom' && customBgFile) {
          form.append('customBackground', customBgFile);
        }
        const res = await fetch('/api/bg-remove/process', { method: 'POST', body: form });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed');
        setBatchItems((prev) =>
          prev.map((x) => (x.localId === item.localId ? { ...x, status: 'completed', job: data.job } : x))
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
    onShowToast(batchCancelRef.current ? 'Batch background removal stopped.' : 'Batch background removal completed.');
  };

  const handleBatchDownloadZip = async () => {
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
    a.download = `omnifiles_cutouts_${Date.now()}.zip`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const bgPresets = presets.filter((p) => p.tool === 'bg-remover');
  const activeBatchItems = batchItems.filter((i) => !i.excluded);
  const stagedUrl = staged ? `/api/uploads/${staged.uploadToken}/preview` : '';
  const outputUrl = resultJob?.previewUrl ? `${resultJob.previewUrl}?t=${encodeURIComponent(resultJob.completedAt || '')}` : '';

  return (
    <div className="space-y-6">
      {/* Studio Header Bar */}
      <GlassSurface as="div" className="rounded-[22px] p-5 flex flex-wrap items-center justify-between gap-4 overflow-visible relative z-20">
        <div>
          <h2 className="font-display text-lg font-semibold text-[var(--text-primary)]">AI Background Remover</h2>
          <p className="text-xs text-[var(--text-muted)] mt-0.5">
            Local neural ISNet subject segmentation · Interactive brush matte editing · Individual batch overrides
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          {bgPresets.length > 0 && (
            <div className="w-44">
              <GlassDropdown
                size="sm"
                ariaLabel="Apply Background Remover Preset"
                placeholder="Apply preset..."
                value=""
                onChange={(id) => {
                  const found = bgPresets.find((p) => p.id === id);
                  if (found) {
                    setOptions((prev) => ({ ...prev, ...(found.config as Partial<BgRemovalOptions>) }));
                    onShowToast(`Configured "${found.name}".`);
                  }
                }}
                options={[
                  { value: '', label: 'Apply preset...' },
                  ...bgPresets.map((p) => ({ value: p.id, label: p.name })),
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
                  className="relative px-3 py-1.5 rounded-lg text-xs font-medium capitalize cursor-pointer whitespace-nowrap"
                >
                  {active && (
                    <motion.span
                      layoutId="bg-mode-pill"
                      transition={SPRING_SNAPPY}
                      className="absolute inset-0 rounded-lg bg-zinc-900 dark:bg-white"
                    />
                  )}
                  <span
                    className={`relative z-10 ${
                      active ? 'text-white dark:text-black' : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                    }`}
                  >
                    {m === 'single' ? 'Single Studio' : `Batch Queue (${batchItems.length})`}
                  </span>
                </button>
              );
            })}
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
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
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const files = Array.from(e.target.files || []);
              if (files.length > 0) handleAddBatchFiles(files);
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
              const files = Array.from(e.target.files || []).filter((f) => f.type.startsWith('image/'));
              if (files.length > 0) handleAddBatchFiles(files);
              e.target.value = '';
            }}
          />

          <button
            type="button"
            onClick={() => (mode === 'single' ? fileInputRef.current?.click() : batchInputRef.current?.click())}
            className="inline-flex items-center gap-2 rounded-xl bg-zinc-900 text-white dark:bg-white dark:text-black px-4 py-2 text-xs font-medium hover:opacity-90 cursor-pointer whitespace-nowrap"
          >
            <Upload className="w-3.5 h-3.5" />
            {mode === 'single' ? 'Upload Image' : 'Add Batch Images'}
          </button>
        </div>
      </GlassSurface>

      {mode === 'batch' ? (
        <GlassSurface as="section" className="rounded-[22px] p-6 space-y-5 overflow-visible relative z-10">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="font-display text-base font-semibold text-[var(--text-primary)]">
                Batch Background Removal ({activeBatchItems.length}/{batchItems.length} active)
              </h3>
              <p className="text-xs text-[var(--text-muted)] mt-0.5">
                Global defaults: {options.modelPrecision} · {options.backgroundMode} · {options.outputFormat.toUpperCase()} — customize any individual image below.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => batchInputRef.current?.click()}
                className="glass-interactive rounded-xl px-3 py-2 text-xs text-[var(--text-primary)] cursor-pointer"
              >
                Add Images
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
                    onClick={handleBatchDownloadZip}
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
                  Remove Backgrounds ({activeBatchItems.length})
                </button>
              )}
            </div>
          </div>

          {batchItems.length === 0 ? (
            <div className="py-10 text-center border border-dashed border-black/12 dark:border-white/14 rounded-xl space-y-3">
              <ImagePlus className="w-7 h-7 text-[var(--text-secondary)] mx-auto" />
              <p className="text-xs text-[var(--text-muted)]">Select multiple PNG, JPG, or WebP files or a folder for bulk segmentation.</p>
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
                  const effMode = item.overrideOptions?.backgroundMode ?? options.backgroundMode;
                  const effFormat = item.overrideOptions?.outputFormat ?? options.outputFormat;
                  const effAspect = item.overrideOptions?.cropAspect ?? options.cropAspect;

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
                              {formatBytes(item.info.sizeBytes)} · {item.excluded ? 'excluded' : item.status}
                              {item.error ? ` · ${item.error}` : ''}
                            </p>
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
                              Download {item.job.targetExt.toUpperCase()}
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
                          <div className="flex flex-wrap items-end gap-3">
                            <div className="w-36">
                              <label className="block text-[11px] text-[var(--text-muted)] mb-1">Backdrop</label>
                              <GlassDropdown
                                size="sm"
                                ariaLabel={`Backdrop for ${item.info.originalName}`}
                                value={effMode}
                                onChange={(v) =>
                                  setBatchItems((prev) =>
                                    prev.map((x) =>
                                      x.localId === item.localId
                                        ? { ...x, overrideOptions: { ...x.overrideOptions, backgroundMode: v as BgBackgroundMode } }
                                        : x
                                    )
                                  )
                                }
                                options={[
                                  { value: 'transparent', label: 'Transparent' },
                                  { value: 'solid', label: 'Solid Color' },
                                  { value: 'gradient', label: 'Gradient' },
                                  { value: 'blur', label: 'Blur BG' },
                                ]}
                              />
                            </div>
                            <div className="w-28">
                              <label className="block text-[11px] text-[var(--text-muted)] mb-1">Format</label>
                              <GlassDropdown
                                size="sm"
                                ariaLabel={`Format for ${item.info.originalName}`}
                                value={effFormat}
                                onChange={(v) =>
                                  setBatchItems((prev) =>
                                    prev.map((x) =>
                                      x.localId === item.localId
                                        ? { ...x, overrideOptions: { ...x.overrideOptions, outputFormat: v as 'png' | 'webp' } }
                                        : x
                                    )
                                  )
                                }
                                options={[
                                  { value: 'png', label: 'PNG' },
                                  { value: 'webp', label: 'WEBP' },
                                ]}
                              />
                            </div>
                            <div className="w-32">
                              <label className="block text-[11px] text-[var(--text-muted)] mb-1">Crop</label>
                              <GlassDropdown
                                size="sm"
                                ariaLabel={`Crop for ${item.info.originalName}`}
                                value={effAspect}
                                onChange={(v) =>
                                  setBatchItems((prev) =>
                                    prev.map((x) =>
                                      x.localId === item.localId
                                        ? {
                                            ...x,
                                            overrideOptions: {
                                              ...x.overrideOptions,
                                              cropAspect: v as BgRemovalOptions['cropAspect'],
                                            },
                                          }
                                        : x
                                    )
                                  )
                                }
                                options={[
                                  { value: 'original', label: 'Original' },
                                  { value: '1:1', label: '1:1 Square' },
                                  { value: '4:3', label: '4:3' },
                                  { value: '16:9', label: '16:9' },
                                  { value: '3:4', label: '3:4' },
                                ]}
                              />
                            </div>
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
          <Eraser className="w-8 h-8 text-[var(--text-muted)] mx-auto" />
          <h3 className="font-display text-lg font-medium text-[var(--text-primary)]">
            Drop an image for instant AI background removal
          </h3>
          <p className="text-xs text-[var(--text-muted)] max-w-md mx-auto leading-relaxed">
            Runs real ISNet segmentation locally with transparent PNG/WebP output, interactive mask brush refinement, custom backdrops, and edge diagnostics.
          </p>
          <div className="flex flex-wrap justify-center gap-2.5 pt-2">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="rounded-xl bg-zinc-900 text-white dark:bg-white dark:text-black px-5 py-2.5 text-xs font-medium hover:opacity-90 cursor-pointer"
            >
              Select Image File
            </button>
            <button
              type="button"
              onClick={() => handleLoadSample('product')}
              className="glass-interactive rounded-xl px-4 py-2.5 text-xs text-[var(--text-primary)] cursor-pointer"
            >
              Sample: Product Watch
            </button>
            <button
              type="button"
              onClick={() => handleLoadSample('portrait')}
              className="glass-interactive rounded-xl px-4 py-2.5 text-xs text-[var(--text-primary)] cursor-pointer"
            >
              Sample: Studio Portrait
            </button>
            <button
              type="button"
              onClick={() => handleLoadSample('badge')}
              className="glass-interactive rounded-xl px-4 py-2.5 text-xs text-[var(--text-primary)] cursor-pointer"
            >
              Sample: Emblem
            </button>
          </div>
          {error && <p className="text-xs text-red-500 pt-2">{error}</p>}
        </GlassSurface>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left Studio Canvas & Quality Analysis */}
          <div className="lg:col-span-7 space-y-5">
            <GlassSurface as="section" className="rounded-[22px] p-5 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs text-[var(--text-secondary)] truncate">{staged.info.originalName}</p>
                  <p className="text-xs text-[var(--text-muted)] tabular-nums">
                    {staged.info.detectedExt.toUpperCase()} · {formatBytes(staged.info.sizeBytes)}
                    {staged.info.details.width ? ` · ${staged.info.details.width}×${staged.info.details.height}` : ''}
                  </p>
                </div>

                <div className="inline-flex gap-1 p-1 rounded-xl border border-black/10 dark:border-white/12 bg-black/4 dark:bg-black/35">
                  {(
                    [
                      { id: 'compare', label: 'Before / After', icon: SplitSquareHorizontal },
                      { id: 'brush', label: 'Mask Brush', icon: Paintbrush },
                      { id: 'original', label: 'Original', icon: ImagePlus },
                    ] as const
                  ).map((t) => {
                    const Icon = t.icon;
                    const active = stageTab === t.id;
                    return (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => setStageTab(t.id)}
                        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium cursor-pointer whitespace-nowrap ${
                          active
                            ? 'bg-zinc-900 text-white dark:bg-white dark:text-black'
                            : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                        }`}
                      >
                        <Icon className="w-3.5 h-3.5" />
                        {t.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Stage Display */}
              <div className="relative rounded-2xl border border-black/10 dark:border-white/12 overflow-hidden bg-[#ececf0] dark:bg-[#0b0b0d] min-h-[340px] flex items-center justify-center bg-[radial-gradient(#c4c4cc_1px,transparent_1px)] dark:bg-[radial-gradient(#242428_1px,transparent_1px)] [background-size:14px_14px]">
                {stageTab === 'original' && (
                  <img src={stagedUrl} alt="Original upload" className="max-h-[420px] max-w-full object-contain select-none" />
                )}

                {stageTab === 'compare' && (
                  <>
                    {!outputUrl ? (
                      <div className="text-center p-6 space-y-3">
                        <img src={stagedUrl} alt="Source preview" className="max-h-[340px] max-w-full object-contain mx-auto rounded" />
                        <p className="text-xs text-[var(--text-muted)]">
                          Click &ldquo;Remove Background &amp; Render&rdquo; to generate the interactive before/after comparison.
                        </p>
                      </div>
                    ) : (
                      <div className="relative w-full h-[380px] select-none overflow-hidden flex items-center justify-center">
                        {/* After (Full Backdrop Result) */}
                        <img
                          src={outputUrl}
                          alt="Background removed output"
                          className="max-h-[360px] max-w-full object-contain pointer-events-none"
                        />
                        {/* Before overlay clipped by splitPct */}
                        <div
                          className="absolute inset-0 flex items-center justify-center overflow-hidden pointer-events-none"
                          style={{ clipPath: `inset(0 ${100 - splitPct}% 0 0)` }}
                        >
                          <img src={stagedUrl} alt="Original before" className="max-h-[360px] max-w-full object-contain" />
                        </div>
                        {/* Divider line */}
                        <div
                          className="absolute top-0 bottom-0 w-0.5 bg-zinc-900 dark:bg-white shadow pointer-events-none"
                          style={{ left: `${splitPct}%` }}
                        />
                        <span className="absolute top-3 left-3 text-[11px] font-mono px-2 py-0.5 rounded bg-black/70 text-white">
                          Original
                        </span>
                        <span className="absolute top-3 right-3 text-[11px] font-mono px-2 py-0.5 rounded bg-black/70 text-white">
                          Cutout
                        </span>
                      </div>
                    )}
                  </>
                )}

                {stageTab === 'brush' && (
                  <div className="relative inline-block">
                    <img
                      src={outputUrl || stagedUrl}
                      alt="Brush edit target"
                      onLoad={(e) => {
                        const img = e.currentTarget;
                        if (canvasRef.current) {
                          canvasRef.current.width = img.naturalWidth || 760;
                          canvasRef.current.height = img.naturalHeight || 580;
                        }
                      }}
                      className="max-h-[380px] max-w-full object-contain select-none pointer-events-none"
                    />
                    <canvas
                      ref={canvasRef}
                      onMouseDown={(e) => {
                        isDrawingRef.current = true;
                        paintOnCanvas(e.clientX, e.clientY);
                      }}
                      onMouseMove={(e) => {
                        if (isDrawingRef.current) paintOnCanvas(e.clientX, e.clientY);
                      }}
                      onMouseUp={() => {
                        isDrawingRef.current = false;
                      }}
                      onMouseLeave={() => {
                        isDrawingRef.current = false;
                      }}
                      className="absolute inset-0 w-full h-full cursor-crosshair"
                    />
                  </div>
                )}
              </div>

              {/* Comparison Slider or Brush Controls */}
              {stageTab === 'compare' && outputUrl && (
                <div className="flex items-center gap-3 text-xs">
                  <span className="text-[var(--text-muted)] whitespace-nowrap">Split Compare</span>
                  <input
                    type="range"
                    aria-label="Before and after split comparison slider"
                    min={0}
                    max={100}
                    value={splitPct}
                    onChange={(e) => setSplitPct(Number(e.target.value))}
                    className="flex-1 accent-zinc-900 dark:accent-white cursor-pointer"
                  />
                  <span className="font-mono tabular-nums text-[var(--text-primary)] w-10 text-right">{splitPct}%</span>
                </div>
              )}

              {stageTab === 'brush' && (
                <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setBrushMode('restore')}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium cursor-pointer ${
                        brushMode === 'restore'
                          ? 'bg-zinc-900 text-white dark:bg-white dark:text-black'
                          : 'glass-interactive text-[var(--text-muted)]'
                      }`}
                    >
                      Restore Subject
                    </button>
                    <button
                      type="button"
                      onClick={() => setBrushMode('erase')}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium cursor-pointer ${
                        brushMode === 'erase'
                          ? 'bg-zinc-900 text-white dark:bg-white dark:text-black'
                          : 'glass-interactive text-[var(--text-muted)]'
                      }`}
                    >
                      Erase Region
                    </button>
                  </div>
                  <div className="flex items-center gap-2 text-xs">
                    <span className="text-[var(--text-muted)]">Size ({brushSize}px)</span>
                    <input
                      type="range"
                      min={8}
                      max={64}
                      value={brushSize}
                      onChange={(e) => setBrushSize(Number(e.target.value))}
                      className="w-24 accent-zinc-900 dark:accent-white cursor-pointer"
                    />
                    <button
                      type="button"
                      onClick={handleClearBrush}
                      className="glass-interactive inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs text-[var(--text-primary)] cursor-pointer"
                    >
                      <RotateCcw className="w-3 h-3" />
                      Clear
                    </button>
                  </div>
                </div>
              )}
            </GlassSurface>

            {/* Alpha Quality & Difficult Edge Diagnostics */}
            {analysis && (
              <GlassSurface as="section" className="rounded-[22px] p-5 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h4 className="font-display text-sm font-semibold text-[var(--text-primary)]">
                      Cutout Quality &amp; Boundary Diagnostics
                    </h4>
                    <p className="text-xs text-[var(--text-muted)] mt-0.5">{analysis.qualityScoreLabel}</p>
                  </div>
                  <button
                    type="button"
                    disabled={geminiLoading}
                    onClick={handleGeminiEdgeAudit}
                    className="glass-interactive inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs text-[var(--text-primary)] cursor-pointer whitespace-nowrap"
                  >
                    {geminiLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                    AI Edge Audit
                  </button>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                  <div className="rounded-xl border border-black/10 dark:border-white/10 p-3">
                    <span className="text-[var(--text-secondary)]">Subject Area</span>
                    <p className="font-mono text-sm font-semibold text-[var(--text-primary)] mt-1 tabular-nums">
                      {analysis.foregroundCoveragePct}%
                    </p>
                  </div>
                  <div className="rounded-xl border border-black/10 dark:border-white/10 p-3">
                    <span className="text-[var(--text-secondary)]">Edge Fringe</span>
                    <p className="font-mono text-sm font-semibold text-[var(--text-primary)] mt-1 tabular-nums">
                      {analysis.semiTransparentEdgePct}%
                    </p>
                  </div>
                  <div className="rounded-xl border border-black/10 dark:border-white/10 p-3">
                    <span className="text-[var(--text-secondary)]">Edge Detail</span>
                    <p className="text-sm font-semibold text-[var(--text-primary)] mt-1 capitalize">
                      {analysis.edgeComplexityLabel}
                    </p>
                  </div>
                  <div className="rounded-xl border border-black/10 dark:border-white/10 p-3">
                    <span className="text-[var(--text-secondary)]">Subject Risk</span>
                    <p className="text-sm font-semibold text-[var(--text-primary)] mt-1 capitalize">
                      {analysis.subjectLossRisk}
                    </p>
                  </div>
                </div>

                {analysis.warnings.map((w, i) => (
                  <p key={i} className="text-xs text-amber-600 dark:text-amber-300 flex items-start gap-2">
                    <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                    <span>{w}</span>
                  </p>
                ))}

                {analysis.geminiInsights && (
                  <div className="rounded-xl border border-black/10 dark:border-white/12 p-3.5 space-y-1.5 text-xs">
                    <p className="font-medium text-[var(--text-primary)]">
                      Subject: {analysis.geminiInsights.subjectSummary}
                    </p>
                    <p className="text-[var(--text-muted)]">
                      Challenging boundaries: {analysis.geminiInsights.difficultEdgesDetected.join(', ') || 'None detected'}
                    </p>
                    <p className="text-[var(--text-soft)]">Tip: {analysis.geminiInsights.recommendation}</p>
                  </div>
                )}

                {geminiError && (
                  <p className="text-xs text-[var(--text-secondary)]">{geminiError}</p>
                )}
              </GlassSurface>
            )}
          </div>

          {/* Right Inspector: Background Studio, Refinement & Export */}
          <div className="lg:col-span-5 space-y-5">
            <section className="glass-secondary glass-rim rounded-[22px] p-6 space-y-5 overflow-visible">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-[var(--text-muted)] mb-1.5">AI Precision Model</label>
                  <GlassDropdown
                    size="sm"
                    ariaLabel="AI Precision Model"
                    value={options.modelPrecision}
                    onChange={(v) => setOptions((p) => ({ ...p, modelPrecision: v as 'fast' | 'high' }))}
                    options={[
                      { value: 'fast', label: 'Fast ISNet', sublabel: 'Low latency' },
                      { value: 'high', label: 'High Detail', sublabel: 'Medium ONNX' },
                    ]}
                  />
                </div>
                <div>
                  <label className="block text-xs text-[var(--text-muted)] mb-1.5">Export Format</label>
                  <GlassDropdown
                    size="sm"
                    ariaLabel="Export Format"
                    value={options.outputFormat}
                    onChange={(v) => setOptions((p) => ({ ...p, outputFormat: v as 'png' | 'webp' }))}
                    options={[
                      { value: 'png', label: 'PNG', sublabel: 'Lossless alpha' },
                      { value: 'webp', label: 'WebP', sublabel: 'Compact alpha' },
                    ]}
                  />
                </div>
              </div>

              {/* Background Replacement Studio */}
              <div className="space-y-3 pt-3 border-t border-black/10 dark:border-white/10">
                <span className="block text-xs font-medium text-[var(--text-primary)]">Background Replacement</span>
                <div className="grid grid-cols-3 sm:grid-cols-5 gap-1.5">
                  {(
                    [
                      { id: 'transparent', label: 'Clear' },
                      { id: 'solid', label: 'Solid' },
                      { id: 'gradient', label: 'Gradient' },
                      { id: 'blur', label: 'Blur BG' },
                      { id: 'custom', label: 'Custom' },
                    ] as { id: BgBackgroundMode; label: string }[]
                  ).map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => setOptions((p) => ({ ...p, backgroundMode: m.id }))}
                      className={`py-1.5 px-2 rounded-lg text-xs font-medium cursor-pointer transition-colors ${
                        options.backgroundMode === m.id
                          ? 'bg-zinc-900 text-white dark:bg-white dark:text-black'
                          : 'glass-interactive text-[var(--text-muted)]'
                      }`}
                    >
                      {m.label}
                    </button>
                  ))}
                </div>

                {options.backgroundMode === 'solid' && (
                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    {SOLID_SWATCHES.map((hex) => (
                      <button
                        key={hex}
                        type="button"
                        aria-label={`Color ${hex}`}
                        onClick={() => setOptions((p) => ({ ...p, backgroundColor: hex }))}
                        style={{ backgroundColor: hex }}
                        className={`w-6 h-6 rounded-md border cursor-pointer ${
                          options.backgroundColor === hex
                            ? 'ring-2 ring-zinc-900 dark:ring-white border-transparent'
                            : 'border-black/20 dark:border-white/25'
                        }`}
                      />
                    ))}
                    <input
                      type="color"
                      aria-label="Custom solid background color"
                      value={options.backgroundColor}
                      onChange={(e) => setOptions((p) => ({ ...p, backgroundColor: e.target.value }))}
                      className="w-7 h-7 rounded cursor-pointer bg-transparent"
                    />
                  </div>
                )}

                {options.backgroundMode === 'gradient' && (
                  <div className="grid grid-cols-3 gap-2 pt-1 text-xs">
                    <div>
                      <span className="text-[var(--text-secondary)]">From</span>
                      <input
                        type="color"
                        value={options.gradientFrom}
                        onChange={(e) => setOptions((p) => ({ ...p, gradientFrom: e.target.value }))}
                        className="w-full h-7 rounded mt-1 cursor-pointer bg-transparent"
                      />
                    </div>
                    <div>
                      <span className="text-[var(--text-secondary)]">To</span>
                      <input
                        type="color"
                        value={options.gradientTo}
                        onChange={(e) => setOptions((p) => ({ ...p, gradientTo: e.target.value }))}
                        className="w-full h-7 rounded mt-1 cursor-pointer bg-transparent"
                      />
                    </div>
                    <div>
                      <span className="text-[var(--text-secondary)]">Angle {options.gradientAngle}°</span>
                      <input
                        type="range"
                        min={0}
                        max={360}
                        value={options.gradientAngle}
                        onChange={(e) => setOptions((p) => ({ ...p, gradientAngle: Number(e.target.value) }))}
                        className="w-full accent-zinc-900 dark:accent-white mt-2 cursor-pointer"
                      />
                    </div>
                  </div>
                )}

                {options.backgroundMode === 'blur' && (
                  <div className="text-xs space-y-1">
                    <span className="text-[var(--text-muted)]">Backdrop Blur ({options.backgroundBlurRadius}px)</span>
                    <input
                      type="range"
                      min={4}
                      max={40}
                      value={options.backgroundBlurRadius}
                      onChange={(e) => setOptions((p) => ({ ...p, backgroundBlurRadius: Number(e.target.value) }))}
                      className="w-full accent-zinc-900 dark:accent-white cursor-pointer"
                    />
                  </div>
                )}

                {options.backgroundMode === 'custom' && (
                  <div className="flex items-center gap-3">
                    <input
                      ref={customBgInputRef}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) {
                          setCustomBgFile(f);
                          setCustomBgPreviewUrl(URL.createObjectURL(f));
                        }
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => customBgInputRef.current?.click()}
                      className="glass-interactive rounded-xl px-3 py-1.5 text-xs text-[var(--text-primary)] cursor-pointer"
                    >
                      {customBgFile ? customBgFile.name : 'Choose Backdrop Image'}
                    </button>
                    {customBgPreviewUrl && (
                      <img src={customBgPreviewUrl} alt="Custom backdrop" className="w-8 h-8 rounded object-cover" />
                    )}
                  </div>
                )}
              </div>

              {/* Matte, Shadow & Framing Controls */}
              <div className="pt-3 border-t border-black/10 dark:border-white/10">
                <button
                  type="button"
                  onClick={() => setRefineOpen((v) => !v)}
                  className="w-full flex items-center justify-between text-xs font-medium text-[var(--text-primary)] cursor-pointer"
                >
                  <span className="inline-flex items-center gap-2">
                    <SlidersHorizontal className="w-3.5 h-3.5 text-[var(--text-muted)]" />
                    Edge Refinement, Shadow &amp; Framing
                  </span>
                  <ChevronDown className={`w-4 h-4 transition-transform ${refineOpen ? 'rotate-180' : ''}`} />
                </button>

                {refineOpen && (
                  <div className="pt-3 space-y-3 text-xs">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <span className="text-[var(--text-muted)]">Feather ({options.featherRadius}px)</span>
                        <input
                          type="range"
                          min={0}
                          max={12}
                          value={options.featherRadius}
                          onChange={(e) => setOptions((p) => ({ ...p, featherRadius: Number(e.target.value) }))}
                          className="w-full accent-zinc-900 dark:accent-white mt-1 cursor-pointer"
                        />
                      </div>
                      <div>
                        <span className="text-[var(--text-muted)]">Edge Choke/Expand ({options.edgeRefinement})</span>
                        <input
                          type="range"
                          min={-2}
                          max={2}
                          step={0.5}
                          value={options.edgeRefinement}
                          onChange={(e) => setOptions((p) => ({ ...p, edgeRefinement: Number(e.target.value) }))}
                          className="w-full accent-zinc-900 dark:accent-white mt-1 cursor-pointer"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <span className="text-[var(--text-muted)]">Subject Scale ({options.subjectScale}×)</span>
                        <input
                          type="range"
                          min={0.5}
                          max={1.4}
                          step={0.05}
                          value={options.subjectScale}
                          onChange={(e) => setOptions((p) => ({ ...p, subjectScale: Number(e.target.value) }))}
                          className="w-full accent-zinc-900 dark:accent-white mt-1 cursor-pointer"
                        />
                      </div>
                      <div>
                        <span className="text-[var(--text-muted)]">Aspect Crop</span>
                        <GlassDropdown
                          size="sm"
                          ariaLabel="Aspect Crop"
                          value={options.cropAspect}
                          onChange={(v) =>
                            setOptions((p) => ({ ...p, cropAspect: v as BgRemovalOptions['cropAspect'] }))
                          }
                          options={[
                            { value: 'original', label: 'Original Ratio' },
                            { value: '1:1', label: '1:1 Square' },
                            { value: '4:3', label: '4:3 Standard' },
                            { value: '16:9', label: '16:9 Wide' },
                            { value: '3:4', label: '3:4 Portrait' },
                          ]}
                        />
                      </div>
                    </div>

                    <label className="flex items-center gap-2 text-[var(--text-soft)] cursor-pointer pt-1">
                      <input
                        type="checkbox"
                        checked={options.shadowEnabled}
                        onChange={(e) => setOptions((p) => ({ ...p, shadowEnabled: e.target.checked }))}
                        className="accent-zinc-900 dark:accent-white cursor-pointer"
                      />
                      Generate soft studio drop shadow under subject
                    </label>

                    <div className="grid grid-cols-3 gap-2">
                      <div>
                        <span className="text-[var(--text-secondary)]">Bright {Math.round(options.brightness * 100)}%</span>
                        <input
                          type="range"
                          min={0.6}
                          max={1.4}
                          step={0.05}
                          value={options.brightness}
                          onChange={(e) => setOptions((p) => ({ ...p, brightness: Number(e.target.value) }))}
                          className="w-full accent-zinc-900 dark:accent-white mt-1 cursor-pointer"
                        />
                      </div>
                      <div>
                        <span className="text-[var(--text-secondary)]">Contrast {Math.round(options.contrast * 100)}%</span>
                        <input
                          type="range"
                          min={0.6}
                          max={1.4}
                          step={0.05}
                          value={options.contrast}
                          onChange={(e) => setOptions((p) => ({ ...p, contrast: Number(e.target.value) }))}
                          className="w-full accent-zinc-900 dark:accent-white mt-1 cursor-pointer"
                        />
                      </div>
                      <div>
                        <span className="text-[var(--text-secondary)]">Sat {Math.round(options.saturation * 100)}%</span>
                        <input
                          type="range"
                          min={0}
                          max={1.8}
                          step={0.05}
                          value={options.saturation}
                          onChange={(e) => setOptions((p) => ({ ...p, saturation: Number(e.target.value) }))}
                          className="w-full accent-zinc-900 dark:accent-white mt-1 cursor-pointer"
                        />
                      </div>
                    </div>
                  </div>
                )}
              </div>

              <button
                type="button"
                disabled={processing}
                onClick={handleProcessSingle}
                className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-zinc-900 text-white dark:bg-white dark:text-black px-5 py-3 text-sm font-medium hover:opacity-90 disabled:opacity-45 cursor-pointer"
              >
                {processing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Eraser className="w-4 h-4" />}
                {processing ? 'Running AI Segmentation...' : 'Remove Background & Render'}
              </button>

              {error && (
                <p className="text-xs text-red-500 dark:text-red-400 flex items-center gap-1.5">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  {error}
                </p>
              )}
            </section>

            {/* Export & Handoff Card */}
            {resultJob && (
              <GlassSurface as="section" className="rounded-[22px] p-5 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-start gap-2.5">
                    <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0 mt-0.5" />
                    <div>
                      <h4 className="font-display text-sm font-semibold text-[var(--text-primary)]">
                        Cutout Ready · {resultJob.targetExt.toUpperCase()}
                      </h4>
                      <p className="text-xs text-[var(--text-muted)] tabular-nums">
                        {formatBytes(resultJob.outputSizeBytes)} · {resultJob.durationMs} ms · {resultJob.engineUsed}
                      </p>
                    </div>
                  </div>
                  {resultJob.downloadUrl && (
                    <a
                      href={resultJob.downloadUrl}
                      className="inline-flex items-center gap-1.5 rounded-xl bg-zinc-900 text-white dark:bg-white dark:text-black px-4 py-2 text-xs font-medium hover:opacity-90 whitespace-nowrap"
                    >
                      <Download className="w-3.5 h-3.5" />
                      Download {resultJob.targetExt.toUpperCase()}
                    </a>
                  )}
                </div>

                <ToolHandoffBar
                  job={resultJob}
                  currentTool="bg-remover"
                  onPromoteToTool={onPromoteToTool}
                  presetConfig={options as unknown as Record<string, unknown>}
                  presetDescription={`${options.modelPrecision} AI cutout, ${options.backgroundMode} backdrop`}
                  onSavePreset={onSavePreset}
                />
              </GlassSurface>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
