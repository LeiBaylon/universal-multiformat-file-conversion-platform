import { useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'motion/react';
import {
  AlertTriangle,
  Archive,
  ArrowDown,
  ArrowUp,
  BookmarkPlus,
  CheckCircle2,
  Copy,
  Download,
  FolderUp,
  GripVertical,
  Loader2,
  Pause,
  Play,
  Plus,
  RotateCcw,
  Settings2,
  Square,
  Trash2,
  Upload,
  XCircle,
} from 'lucide-react';
import type {
  ConversionJob,
  IdentifiedFileMetadata,
  SavedPreset,
  WorkflowOperationTool,
  WorkflowStep,
} from '../shared/types';
import {
  analyzeWorkflowCompatibility,
  createWorkflowStep,
  moveWorkflowStep,
  reorderWorkflowSteps,
  WORKFLOW_OPERATION_CATALOG,
} from '../utils/workflowEngine';
import { formatBytes } from '../utils/formatters';
import { MOTION_EASE } from '../utils/motion';
import { GlassSurface } from './glass/GlassSurface';
import { GlassDropdown } from './glass/GlassDropdown';
import { GlassModal } from './glass/GlassModal';

interface WorkflowFileItem {
  localId: string;
  uploadToken: string;
  info: IdentifiedFileMetadata;
  selected: boolean;
  status: 'waiting' | 'ready' | 'processing' | 'completed' | 'failed' | 'cancelled';
  currentStepLabel?: string;
  progress: number;
  job?: ConversionJob;
  stepReports?: { tool: string; summary: string; sizeBytes: number }[];
  savedWorkspacePath?: string;
  error?: string;
  failedStepLabel?: string;
}

interface WorkflowBuilderViewProps {
  presets: SavedPreset[];
  appliedWorkflowPreset?: SavedPreset | null;
  promotedFiles?: { uploadToken: string; info: IdentifiedFileMetadata }[] | null;
  onClearPromoted?: () => void;
  onSavePreset: (preset: Omit<SavedPreset, 'id' | 'createdAt'>) => Promise<void>;
  onRefreshJobs: () => Promise<void>;
  onShowToast: (msg: string, kind?: 'info' | 'error') => void;
}

function formatStepSummary(config: Record<string, unknown>): string {
  const parts: string[] = [];
  if (config.modelPrecision) parts.push(String(config.modelPrecision));
  if (config.outputFormat) parts.push(String(config.outputFormat).toUpperCase());
  if (config.backgroundMode) parts.push(String(config.backgroundMode));
  if (config.width || config.height) parts.push(`${config.width || 1200}×${config.height || 1200}`);
  if (config.goal) parts.push(String(config.goal));
  if (config.targetFormat) parts.push(String(config.targetFormat).toUpperCase());
  if (config.format) parts.push(String(config.format).toUpperCase());
  if (config.quality !== undefined) parts.push(`${config.quality}%`);
  if (config.level !== undefined) parts.push(`Level ${config.level}`);
  if (config.stripMetadata) parts.push('Strip EXIF');
  return parts.join(' · ') || 'Default settings';
}

const DEFAULT_INITIAL_STEPS: WorkflowStep[] = [
  {
    id: 'init_1',
    tool: 'bg-remover',
    operationName: 'Remove Image Background',
    enabled: true,
    config: { modelPrecision: 'fast', outputFormat: 'png', backgroundMode: 'transparent', featherRadius: 1 },
  },
  {
    id: 'init_2',
    tool: 'resize',
    operationName: 'Resize Image',
    enabled: true,
    config: { width: 1200, height: 1200, fit: 'inside', maintainAspect: true },
  },
  {
    id: 'init_3',
    tool: 'compress',
    operationName: 'Compress File',
    enabled: true,
    config: { goal: 'balanced', quality: 82, stripMetadata: true },
  },
  {
    id: 'init_4',
    tool: 'convert',
    operationName: 'Convert Format',
    enabled: true,
    config: { targetFormat: 'webp', quality: 88, stripMetadata: true },
  },
];

export function WorkflowBuilderView({
  presets,
  appliedWorkflowPreset,
  promotedFiles,
  onClearPromoted,
  onSavePreset,
  onRefreshJobs,
  onShowToast,
}: WorkflowBuilderViewProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const folderInputRef = useRef<HTMLInputElement | null>(null);

  const [steps, setSteps] = useState<WorkflowStep[]>(DEFAULT_INITIAL_STEPS);
  const [expandedStepId, setExpandedStepId] = useState<string | null>(null);
  const [dragIndex, setDragIndex] = useState<number | null>(null);

  const [namingPattern, setNamingPattern] = useState('{name}_processed');
  const [destinationFolder, setDestinationFolder] = useState('');

  const [files, setFiles] = useState<WorkflowFileItem[]>([]);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [saveModalOpen, setSaveModalOpen] = useState(false);
  const [presetName, setPresetName] = useState('');
  const [presetDesc, setPresetDesc] = useState('');

  const [running, setRunning] = useState(false);
  const [paused, setPaused] = useState(false);
  const pauseRef = useRef(false);
  const cancelRef = useRef(false);

  // Load workflow preset when opened from My Presets (configures only, never executes automatically)
  useEffect(() => {
    if (appliedWorkflowPreset && appliedWorkflowPreset.steps && appliedWorkflowPreset.steps.length > 0) {
      setSteps(JSON.parse(JSON.stringify(appliedWorkflowPreset.steps)));
      if (appliedWorkflowPreset.outputRule?.namingPattern) {
        setNamingPattern(appliedWorkflowPreset.outputRule.namingPattern);
      }
      setDestinationFolder(appliedWorkflowPreset.outputRule?.destinationFolder || '');
    }
  }, [appliedWorkflowPreset]);

  // Accept promoted files from Explorer or other tools
  useEffect(() => {
    if (promotedFiles && promotedFiles.length > 0) {
      setFiles((prev) => [
        ...prev,
        ...promotedFiles.map((f) => ({
          localId: `wf_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
          uploadToken: f.uploadToken,
          info: f.info,
          selected: true,
          status: 'ready' as const,
          progress: 0,
        })),
      ]);
      onClearPromoted?.();
    }
  }, [promotedFiles, onClearPromoted]);

  const selectedFiles = useMemo(() => files.filter((f) => f.selected), [files]);

  const analysis = useMemo(
    () =>
      analyzeWorkflowCompatibility(
        steps,
        selectedFiles.map((f) => f.info.detectedExt)
      ),
    [selectedFiles, steps]
  );

  const enabledSteps = useMemo(() => steps.filter((s) => s.enabled), [steps]);

  const uploadBatchFiles = async (rawFiles: File[]) => {
    const added: WorkflowFileItem[] = [];
    for (const file of rawFiles) {
      const form = new FormData();
      form.append('file', file);
      const res = await fetch('/api/identify', { method: 'POST', body: form });
      const data = await res.json();
      if (res.ok) {
        added.push({
          localId: `wf_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
          uploadToken: data.uploadToken,
          info: data.info,
          selected: true,
          status: 'ready',
          progress: 0,
        });
      }
    }
    setFiles((prev) => [...prev, ...added]);
    onShowToast(`Queued ${added.length} file(s) in Workflow Builder.`);
  };

  const handleLoadSampleImages = async () => {
    const sampleEndpoints = ['/api/bg-remove/sample/product', '/api/bg-remove/sample/badge'];
    const loaded: File[] = [];
    for (const url of sampleEndpoints) {
      const res = await fetch(url);
      if (res.ok) {
        const blob = await res.blob();
        loaded.push(new File([blob], url.endsWith('product') ? 'watch_product.png' : 'emblem_badge.png', { type: 'image/png' }));
      }
    }
    if (loaded.length > 0) await uploadBatchFiles(loaded);
  };

  const updateStepConfig = (id: string, patch: Record<string, unknown>) => {
    setSteps((prev) =>
      prev.map((s) => (s.id === id ? { ...s, config: { ...s.config, ...patch } } : s))
    );
  };

  const handleDuplicateStep = (index: number) => {
    const src = steps[index];
    const clone: WorkflowStep = {
      ...JSON.parse(JSON.stringify(src)),
      id: `step_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    };
    const next = [...steps];
    next.splice(index + 1, 0, clone);
    setSteps(next);
  };

  const executeSelectedFiles = async (onlyIds?: Set<string>) => {
    setConfirmOpen(false);
    setRunning(true);
    setPaused(false);
    pauseRef.current = false;
    cancelRef.current = false;

    const queue = files.filter((f) => f.selected && (!onlyIds || onlyIds.has(f.localId)));
    for (const item of queue) {
      if (cancelRef.current) {
        setFiles((prev) =>
          prev.map((x) => (x.localId === item.localId && x.status !== 'completed' ? { ...x, status: 'cancelled' } : x))
        );
        continue;
      }

      while (pauseRef.current && !cancelRef.current) {
        await new Promise((r) => setTimeout(r, 200));
      }
      if (cancelRef.current) break;

      setFiles((prev) =>
        prev.map((x) =>
          x.localId === item.localId
            ? {
                ...x,
                status: 'processing',
                progress: 15,
                currentStepLabel: `Running ${enabledSteps.length} operation(s)...`,
                error: undefined,
                failedStepLabel: undefined,
              }
            : x
        )
      );

      try {
        const res = await fetch('/api/workflow/run', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            uploadToken: item.uploadToken,
            originalName: item.info.originalName,
            steps,
            namingPattern,
            destinationFolder: destinationFolder.trim() || undefined,
          }),
        });
        const data = await res.json();
        if (!res.ok) {
          setFiles((prev) =>
            prev.map((x) =>
              x.localId === item.localId
                ? {
                    ...x,
                    status: 'failed',
                    progress: 0,
                    currentStepLabel: undefined,
                    error: data.error || 'Workflow failed.',
                    failedStepLabel: data.failedStepLabel,
                  }
                : x
            )
          );
          continue;
        }
        setFiles((prev) =>
          prev.map((x) =>
            x.localId === item.localId
              ? {
                  ...x,
                  status: 'completed',
                  progress: 100,
                  currentStepLabel: `${data.stepReports.length} step(s) completed`,
                  job: data.job,
                  stepReports: data.stepReports,
                  savedWorkspacePath: data.savedWorkspacePath,
                }
              : x
          )
        );
      } catch (err) {
        setFiles((prev) =>
          prev.map((x) =>
            x.localId === item.localId
              ? {
                  ...x,
                  status: 'failed',
                  progress: 0,
                  error: err instanceof Error ? err.message : 'Network error during workflow.',
                }
              : x
          )
        );
      }
    }

    setRunning(false);
    setPaused(false);
    await onRefreshJobs();
    onShowToast(cancelRef.current ? 'Workflow execution cancelled.' : 'Custom workflow run finished.');
  };

  const completedJobs = files.filter((f) => f.status === 'completed' && f.job?.id);

  const handleDownloadZip = async () => {
    const jobIds = completedJobs.map((f) => f.job!.id);
    if (jobIds.length === 0) return;
    const res = await fetch('/api/jobs/batch-zip', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jobIds }),
    });
    if (!res.ok) {
      onShowToast('Failed to package workflow outputs.', 'error');
      return;
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `omnifiles_workflow_${Date.now()}.zip`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const overallProgress =
    selectedFiles.length === 0
      ? 0
      : Math.round(selectedFiles.reduce((acc, f) => acc + f.progress, 0) / selectedFiles.length);

  return (
    <div className="space-y-6">
      {/* Header & Top Controls */}
      <GlassSurface as="section" className="rounded-[22px] p-6 space-y-4 overflow-visible relative z-20">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="font-display text-lg font-semibold text-[var(--text-primary)]">
              Custom Processing Sequence Builder
            </h2>
            <p className="text-xs text-[var(--text-muted)] mt-0.5">
              Arrange processing tools in your exact sequence, verify compatibility, save reusable presets, and confirm before execution.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="w-56">
              <GlassDropdown
                size="sm"
                ariaLabel="Load workflow preset"
                placeholder="Load workflow preset..."
                value=""
                onChange={(id) => {
                  const found = presets.find((p) => p.id === id);
                  if (found?.steps) {
                    setSteps(JSON.parse(JSON.stringify(found.steps)));
                    if (found.outputRule?.namingPattern) setNamingPattern(found.outputRule.namingPattern);
                    setDestinationFolder(found.outputRule?.destinationFolder || '');
                    onShowToast(`Loaded sequence "${found.name}".`);
                  }
                }}
                options={[
                  { value: '', label: 'Load workflow preset...' },
                  ...presets
                    .filter((p) => p.steps && p.steps.length > 0)
                    .map((p) => ({ value: p.id, label: p.name })),
                ]}
              />
            </div>
            <button
              type="button"
              onClick={() => {
                setPresetName('');
                setPresetDesc('');
                setSaveModalOpen(true);
              }}
              className="glass-interactive inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-medium text-[var(--text-primary)] cursor-pointer whitespace-nowrap"
            >
              <BookmarkPlus className="w-3.5 h-3.5" />
              Save as Preset
            </button>
            <button
              type="button"
              onClick={() => {
                setSteps(DEFAULT_INITIAL_STEPS);
                setNamingPattern('{name}_processed');
                setDestinationFolder('');
              }}
              className="glass-interactive inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer whitespace-nowrap"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Reset
            </button>
          </div>
        </div>

        {/* Add Operation Palette */}
        <div className="pt-3 border-t border-black/10 dark:border-white/10 flex flex-wrap items-center gap-2">
          <span className="text-xs text-[var(--text-muted)] mr-1">Add Operation:</span>
          {WORKFLOW_OPERATION_CATALOG.map((op) => (
            <button
              key={op.tool}
              type="button"
              onClick={() => {
                const next = createWorkflowStep(op.tool);
                setSteps((prev) => [...prev, next]);
                setExpandedStepId(next.id);
              }}
              className="glass-interactive inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs text-[var(--text-primary)] cursor-pointer whitespace-nowrap"
            >
              <Plus className="w-3 h-3" />
              {op.operationName}
            </button>
          ))}
        </div>
      </GlassSurface>

      {/* Main Split: Sequence Builder (7 cols) + Files & Execution (5 cols) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Sequence Canvas */}
        <div className="lg:col-span-7 space-y-3">
          {steps.length === 0 ? (
            <GlassSurface as="div" className="rounded-[22px] p-10 text-center">
              <p className="text-sm text-[var(--text-primary)]">Sequence is empty</p>
              <p className="text-xs text-[var(--text-secondary)] mt-1">
                Click any operation button above to add Step 1 of your workflow.
              </p>
            </GlassSurface>
          ) : (
            steps.map((step, idx) => {
              const pred = analysis.predictions[idx];
              const stepIssues = analysis.issues.filter((i) => i.stepId === step.id);
              const hasErr = stepIssues.some((i) => i.severity === 'error');
              const hasWarn = stepIssues.some((i) => i.severity === 'warning');
              const catalogMeta = WORKFLOW_OPERATION_CATALOG.find((c) => c.tool === step.tool);
              const isOpen = expandedStepId === step.id;

              return (
                <div
                  key={step.id}
                  draggable
                  onDragStart={() => setDragIndex(idx)}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={() => {
                    if (dragIndex !== null && dragIndex !== idx) {
                      setSteps((prev) => reorderWorkflowSteps(prev, dragIndex, idx));
                    }
                    setDragIndex(null);
                  }}
                  className={`glass-secondary glass-rim rounded-[20px] p-4 transition-opacity ${
                    !step.enabled ? 'opacity-55' : ''
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-2.5 min-w-0">
                      <span
                        title="Drag to reorder"
                        className="mt-0.5 text-[var(--text-secondary)] cursor-grab shrink-0"
                      >
                        <GripVertical className="w-4 h-4" />
                      </span>
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2 text-xs">
                          <span className="font-mono font-semibold text-[var(--text-primary)] tabular-nums">
                            Step {idx + 1}
                          </span>
                          <span aria-hidden="true" className="text-[var(--text-secondary)]">·</span>
                          <span className="font-medium text-[var(--text-primary)]">{step.operationName}</span>
                          <span aria-hidden="true" className="text-[var(--text-secondary)]">·</span>
                          <span className="text-[var(--text-muted)]">{catalogMeta?.toolLabel || step.tool}</span>
                        </div>
                        {pred && (
                          <p className="text-[11px] font-mono text-[var(--text-secondary)] mt-1">
                            {pred.inputFormatLabel} → {pred.outputFormatLabel}
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        aria-label={`Move step ${idx + 1} up`}
                        disabled={idx === 0}
                        onClick={() => setSteps((prev) => moveWorkflowStep(prev, idx, 'up'))}
                        className="glass-interactive rounded-lg p-1.5 text-[var(--text-muted)] hover:text-[var(--text-primary)] disabled:opacity-30 cursor-pointer"
                      >
                        <ArrowUp className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        aria-label={`Move step ${idx + 1} down`}
                        disabled={idx === steps.length - 1}
                        onClick={() => setSteps((prev) => moveWorkflowStep(prev, idx, 'down'))}
                        className="glass-interactive rounded-lg p-1.5 text-[var(--text-muted)] hover:text-[var(--text-primary)] disabled:opacity-30 cursor-pointer"
                      >
                        <ArrowDown className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        aria-label={`Configure step ${idx + 1}`}
                        onClick={() => setExpandedStepId(isOpen ? null : step.id)}
                        className="glass-interactive rounded-lg p-1.5 text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer"
                      >
                        <Settings2 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        aria-label={`Duplicate step ${idx + 1}`}
                        onClick={() => handleDuplicateStep(idx)}
                        className="glass-interactive rounded-lg p-1.5 text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer"
                      >
                        <Copy className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        aria-label={`Remove step ${idx + 1}`}
                        onClick={() => setSteps((prev) => prev.filter((s) => s.id !== step.id))}
                        className="glass-interactive rounded-lg p-1.5 text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Compatibility Status Line + Enable Toggle */}
                  <div className="mt-3 pt-2.5 border-t border-black/8 dark:border-white/8 flex flex-wrap items-center justify-between gap-2 text-[11px]">
                    <div className="flex items-center gap-1.5">
                      {hasErr ? (
                        <>
                          <XCircle className="w-3.5 h-3.5 text-red-500 shrink-0" />
                          <span className="text-red-500 font-medium">Incompatible step</span>
                        </>
                      ) : hasWarn ? (
                        <>
                          <AlertTriangle className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                          <span className="text-amber-500 font-medium">Compatibility warning</span>
                        </>
                      ) : (
                        <>
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                          <span className="text-[var(--text-muted)]">
                            {step.enabled ? 'Compatible in sequence' : 'Disabled (will be skipped)'}
                          </span>
                        </>
                      )}
                    </div>

                    <label className="inline-flex items-center gap-1.5 text-[var(--text-soft)] cursor-pointer">
                      <input
                        type="checkbox"
                        checked={step.enabled}
                        onChange={(e) =>
                          setSteps((prev) =>
                            prev.map((s) => (s.id === step.id ? { ...s, enabled: e.target.checked } : s))
                          )
                        }
                        className="accent-zinc-900 dark:accent-white rounded cursor-pointer"
                      />
                      Enabled
                    </label>
                  </div>

                  {/* Step Compatibility Explanations & Optional 1-Click Fix */}
                  {stepIssues.length > 0 && (
                    <div className="mt-2.5 space-y-2">
                      {stepIssues.map((iss, j) => (
                        <div
                          key={j}
                          className="rounded-xl border border-black/10 dark:border-white/12 bg-black/4 dark:bg-black/40 p-3 text-xs space-y-1.5"
                        >
                          <p className={iss.severity === 'error' ? 'text-red-500 font-medium' : 'text-amber-500 font-medium'}>
                            {iss.message}
                          </p>
                          <p className="text-[var(--text-muted)]">Suggestion: {iss.suggestion}</p>
                          {iss.suggestedPatch && (
                            <button
                              type="button"
                              onClick={() => {
                                if (iss.suggestedPatch?.disableStep) {
                                  setSteps((prev) => prev.map((s) => (s.id === step.id ? { ...s, enabled: false } : s)));
                                } else if (iss.suggestedPatch?.config) {
                                  updateStepConfig(step.id, iss.suggestedPatch.config);
                                }
                              }}
                              className="glass-interactive rounded-lg px-2.5 py-1 text-[11px] font-medium text-[var(--text-primary)] cursor-pointer"
                            >
                              Apply Suggested Fix
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Expandable Operation Configuration */}
                  {isOpen && (
                    <div className="mt-3 pt-3 border-t border-black/10 dark:border-white/10 grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                      {step.tool === 'bg-remover' && (
                        <>
                          <div>
                            <label className="block text-[var(--text-muted)] mb-1">Backdrop Mode</label>
                            <GlassDropdown
                              size="sm"
                              ariaLabel="Backdrop Mode"
                              value={String(step.config.backgroundMode || 'transparent')}
                              onChange={(v) => updateStepConfig(step.id, { backgroundMode: v })}
                              options={[
                                { value: 'transparent', label: 'Transparent Alpha' },
                                { value: 'solid', label: 'Solid Color' },
                                { value: 'gradient', label: 'Studio Gradient' },
                                { value: 'blur', label: 'Blurred Original' },
                              ]}
                            />
                          </div>
                          <div>
                            <label className="block text-[var(--text-muted)] mb-1">Output Container</label>
                            <GlassDropdown
                              size="sm"
                              ariaLabel="Cutout Format"
                              value={String(step.config.outputFormat || 'png')}
                              onChange={(v) => updateStepConfig(step.id, { outputFormat: v })}
                              options={[
                                { value: 'png', label: 'PNG (Lossless Alpha)' },
                                { value: 'webp', label: 'WEBP (Alpha)' },
                              ]}
                            />
                          </div>
                          <div>
                            <label className="block text-[var(--text-muted)] mb-1">Model Precision</label>
                            <GlassDropdown
                              size="sm"
                              ariaLabel="Model Precision"
                              value={String(step.config.modelPrecision || 'fast')}
                              onChange={(v) => updateStepConfig(step.id, { modelPrecision: v })}
                              options={[
                                { value: 'fast', label: 'Fast (ISNet Small)' },
                                { value: 'high', label: 'High Detail (ISNet Medium)' },
                              ]}
                            />
                          </div>
                          <label className="flex items-center gap-2 pt-5 cursor-pointer text-[var(--text-soft)]">
                            <input
                              type="checkbox"
                              checked={Boolean(step.config.shadowEnabled)}
                              onChange={(e) => updateStepConfig(step.id, { shadowEnabled: e.target.checked })}
                              className="accent-zinc-900 dark:accent-white"
                            />
                            Add subtle drop shadow
                          </label>
                        </>
                      )}

                      {step.tool === 'resize' && (
                        <>
                          <div>
                            <label className="block text-[var(--text-muted)] mb-1">Width (px)</label>
                            <input
                              type="number"
                              min={16}
                              max={8000}
                              value={Number(step.config.width || 1200)}
                              onChange={(e) => updateStepConfig(step.id, { width: Number(e.target.value) })}
                              className="w-full rounded-xl border border-[var(--control-border)] bg-[var(--input-bg)] px-3 py-1.5 text-[var(--text-primary)] tabular-nums"
                            />
                          </div>
                          <div>
                            <label className="block text-[var(--text-muted)] mb-1">Height (px)</label>
                            <input
                              type="number"
                              min={16}
                              max={8000}
                              value={Number(step.config.height || 1200)}
                              onChange={(e) => updateStepConfig(step.id, { height: Number(e.target.value) })}
                              className="w-full rounded-xl border border-[var(--control-border)] bg-[var(--input-bg)] px-3 py-1.5 text-[var(--text-primary)] tabular-nums"
                            />
                          </div>
                          <div>
                            <label className="block text-[var(--text-muted)] mb-1">Fit Mode</label>
                            <GlassDropdown
                              size="sm"
                              ariaLabel="Resize Fit"
                              value={String(step.config.fit || 'inside')}
                              onChange={(v) => updateStepConfig(step.id, { fit: v })}
                              options={[
                                { value: 'inside', label: 'Contain (Preserve Aspect)' },
                                { value: 'cover', label: 'Cover (Crop to Fill)' },
                                { value: 'contain', label: 'Pad to Exact Canvas' },
                              ]}
                            />
                          </div>
                        </>
                      )}

                      {step.tool === 'compress' && (
                        <>
                          <div>
                            <label className="block text-[var(--text-muted)] mb-1">Compression Goal</label>
                            <GlassDropdown
                              size="sm"
                              ariaLabel="Compression Goal"
                              value={String(step.config.goal || 'balanced')}
                              onChange={(v) => updateStepConfig(step.id, { goal: v })}
                              options={[
                                { value: 'balanced', label: 'Balanced' },
                                { value: 'smallest', label: 'Smallest Size' },
                                { value: 'best-quality', label: 'Best Quality' },
                                { value: 'lossless', label: 'Lossless' },
                                { value: 'target-size', label: 'Target Size (KB)' },
                              ]}
                            />
                          </div>
                          <div>
                            <label className="block text-[var(--text-muted)] mb-1">
                              Quality ({Number(step.config.quality || 80)}%)
                            </label>
                            <input
                              type="range"
                              min={20}
                              max={100}
                              value={Number(step.config.quality || 80)}
                              onChange={(e) => updateStepConfig(step.id, { quality: Number(e.target.value) })}
                              className="w-full accent-zinc-900 dark:accent-white mt-2 cursor-pointer"
                            />
                          </div>
                          {step.config.goal === 'target-size' && (
                            <div>
                              <label className="block text-[var(--text-muted)] mb-1">Target Budget (KB)</label>
                              <input
                                type="number"
                                min={5}
                                value={Number(step.config.targetSizeKb || 120)}
                                onChange={(e) => updateStepConfig(step.id, { targetSizeKb: Number(e.target.value) })}
                                className="w-full rounded-xl border border-[var(--control-border)] bg-[var(--input-bg)] px-3 py-1.5 text-[var(--text-primary)] tabular-nums"
                              />
                            </div>
                          )}
                        </>
                      )}

                      {step.tool === 'convert' && (
                        <>
                          <div>
                            <label className="block text-[var(--text-muted)] mb-1">Target Output Format</label>
                            <GlassDropdown
                              size="sm"
                              ariaLabel="Target Output Format"
                              searchable
                              value={String(step.config.targetFormat || 'webp')}
                              onChange={(v) => updateStepConfig(step.id, { targetFormat: v })}
                              options={[
                                { value: 'webp', label: 'WEBP' },
                                { value: 'png', label: 'PNG' },
                                { value: 'jpg', label: 'JPG' },
                                { value: 'avif', label: 'AVIF' },
                                { value: 'tiff', label: 'TIFF' },
                                { value: 'pdf', label: 'PDF' },
                                { value: 'mp3', label: 'MP3' },
                                { value: 'mp4', label: 'MP4' },
                                { value: 'json', label: 'JSON' },
                              ]}
                            />
                          </div>
                          <div>
                            <label className="block text-[var(--text-muted)] mb-1">
                              Quality ({Number(step.config.quality || 88)}%)
                            </label>
                            <input
                              type="range"
                              min={20}
                              max={100}
                              value={Number(step.config.quality || 88)}
                              onChange={(e) => updateStepConfig(step.id, { quality: Number(e.target.value) })}
                              className="w-full accent-zinc-900 dark:accent-white mt-2 cursor-pointer"
                            />
                          </div>
                        </>
                      )}

                      {step.tool === 'archive' && (
                        <>
                          <div>
                            <label className="block text-[var(--text-muted)] mb-1">Archive Container</label>
                            <GlassDropdown
                              size="sm"
                              ariaLabel="Archive Container"
                              value={String(step.config.format || 'zip')}
                              onChange={(v) => updateStepConfig(step.id, { format: v })}
                              options={[
                                { value: 'zip', label: 'ZIP' },
                                { value: '7z', label: '7Z (LZMA2)' },
                                { value: 'tgz', label: 'TGZ (TAR + Gzip)' },
                              ]}
                            />
                          </div>
                          <div>
                            <label className="block text-[var(--text-muted)] mb-1">
                              Level ({Number(step.config.level || 7)})
                            </label>
                            <input
                              type="range"
                              min={0}
                              max={9}
                              value={Number(step.config.level || 7)}
                              onChange={(e) => updateStepConfig(step.id, { level: Number(e.target.value) })}
                              className="w-full accent-zinc-900 dark:accent-white mt-2 cursor-pointer"
                            />
                          </div>
                          <div className="sm:col-span-2">
                            <label className="block text-[var(--text-muted)] mb-1">AES-256 Password (Optional)</label>
                            <input
                              type="password"
                              value={String(step.config.password || '')}
                              onChange={(e) => updateStepConfig(step.id, { password: e.target.value })}
                              placeholder="Leave empty for unencrypted archive"
                              className="w-full rounded-xl border border-[var(--control-border)] bg-[var(--input-bg)] px-3 py-1.5 text-[var(--text-primary)]"
                            />
                          </div>
                        </>
                      )}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Right Column: Target Files, Output Naming, Summary & Controlled Execution */}
        <div className="lg:col-span-5 space-y-4">
          <GlassSurface as="section" className="rounded-[22px] p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="font-display text-sm font-semibold text-[var(--text-primary)]">
                Target Files ({selectedFiles.length} / {files.length})
              </h3>
              <div className="flex flex-wrap items-center gap-1.5">
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  className="hidden"
                  onChange={(e) => {
                    const list = Array.from(e.target.files || []);
                    if (list.length > 0) uploadBatchFiles(list);
                    e.target.value = '';
                  }}
                />
                <input
                  ref={folderInputRef}
                  type="file"
                  multiple
                  {...({ webkitdirectory: '' } as Record<string, string>)}
                  className="hidden"
                  onChange={(e) => {
                    const list = Array.from(e.target.files || []);
                    if (list.length > 0) uploadBatchFiles(list);
                    e.target.value = '';
                  }}
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="glass-interactive inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[11px] font-medium text-[var(--text-primary)] cursor-pointer"
                >
                  <Upload className="w-3 h-3" />
                  Files
                </button>
                <button
                  type="button"
                  onClick={() => folderInputRef.current?.click()}
                  className="glass-interactive inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[11px] font-medium text-[var(--text-primary)] cursor-pointer"
                >
                  <FolderUp className="w-3 h-3" />
                  Folder
                </button>
                <button
                  type="button"
                  onClick={handleLoadSampleImages}
                  className="glass-interactive rounded-lg px-2.5 py-1.5 text-[11px] text-[var(--text-soft)] hover:text-[var(--text-primary)] cursor-pointer"
                >
                  Load Samples
                </button>
              </div>
            </div>

            {files.length === 0 ? (
              <div className="py-8 text-center border border-dashed border-black/12 dark:border-white/14 rounded-xl">
                <p className="text-xs text-[var(--text-soft)]">No files selected for workflow</p>
                <p className="text-[11px] text-[var(--text-secondary)] mt-1">
                  Add multiple files or load samples to validate compatibility and run.
                </p>
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between text-[11px] text-[var(--text-secondary)]">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setFiles((prev) => prev.map((f) => ({ ...f, selected: true })))}
                      className="hover:text-[var(--text-primary)] cursor-pointer"
                    >
                      Select All
                    </button>
                    <span>·</span>
                    <button
                      type="button"
                      onClick={() => setFiles((prev) => prev.map((f) => ({ ...f, selected: false })))}
                      className="hover:text-[var(--text-primary)] cursor-pointer"
                    >
                      Deselect All
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={() => setFiles([])}
                    className="hover:text-[var(--text-primary)] cursor-pointer"
                  >
                    Clear Queue
                  </button>
                </div>

                <div className="max-h-64 overflow-y-auto divide-y divide-black/8 dark:divide-white/8">
                  {files.map((item) => (
                    <div key={item.localId} className="py-2.5 flex items-center justify-between gap-2 text-xs">
                      <label className="flex items-center gap-2 min-w-0 cursor-pointer flex-1">
                        <input
                          type="checkbox"
                          checked={item.selected}
                          disabled={running}
                          onChange={(e) =>
                            setFiles((prev) =>
                              prev.map((x) => (x.localId === item.localId ? { ...x, selected: e.target.checked } : x))
                            )
                          }
                          className="accent-zinc-900 dark:accent-white"
                        />
                        <div className="min-w-0">
                          <p className="text-[var(--text-primary)] truncate">{item.info.originalName}</p>
                          <p className="text-[11px] text-[var(--text-secondary)] font-mono tabular-nums">
                            {item.info.detectedExt.toUpperCase()} · {formatBytes(item.info.sizeBytes)} · {item.status}
                          </p>
                          {item.error && <p className="text-[11px] text-red-500 mt-0.5">{item.error}</p>}
                          {item.savedWorkspacePath && (
                            <p className="text-[11px] text-[var(--text-muted)]">Saved to Workspace: /{item.savedWorkspacePath}</p>
                          )}
                        </div>
                      </label>

                      <div className="flex items-center gap-1.5 shrink-0">
                        {item.status === 'processing' && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                        {item.status === 'completed' && item.job?.downloadUrl && (
                          <a
                            href={item.job.downloadUrl}
                            aria-label={`Download output for ${item.info.originalName}`}
                            className="glass-interactive rounded-lg p-1.5 text-[var(--text-primary)]"
                          >
                            <Download className="w-3.5 h-3.5" />
                          </a>
                        )}
                        {item.status === 'failed' && !running && (
                          <button
                            type="button"
                            onClick={() => executeSelectedFiles(new Set([item.localId]))}
                            className="glass-interactive rounded-lg px-2 py-1 text-[11px] text-[var(--text-primary)] cursor-pointer"
                          >
                            Retry
                          </button>
                        )}
                        <button
                          type="button"
                          aria-label={`Remove ${item.info.originalName}`}
                          disabled={running}
                          onClick={() => setFiles((prev) => prev.filter((x) => x.localId !== item.localId))}
                          className="text-[var(--text-secondary)] hover:text-[var(--text-primary)] p-1 cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}

            {/* Naming & Destination Controls */}
            <div className="pt-3 border-t border-black/10 dark:border-white/10 grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div>
                <label className="block text-[var(--text-muted)] mb-1">Output Naming Rule</label>
                <input
                  type="text"
                  value={namingPattern}
                  onChange={(e) => setNamingPattern(e.target.value)}
                  placeholder="{name}_processed"
                  className="w-full rounded-xl border border-[var(--control-border)] bg-[var(--input-bg)] px-3 py-1.5 font-mono text-[var(--text-primary)]"
                />
              </div>
              <div>
                <label className="block text-[var(--text-muted)] mb-1">Workspace Folder (Optional)</label>
                <input
                  type="text"
                  value={destinationFolder}
                  onChange={(e) => setDestinationFolder(e.target.value)}
                  placeholder="e.g. Exports/Web"
                  className="w-full rounded-xl border border-[var(--control-border)] bg-[var(--input-bg)] px-3 py-1.5 text-[var(--text-primary)]"
                />
              </div>
            </div>

            {/* Compatibility Summary */}
            <div className="rounded-xl border border-black/10 dark:border-white/10 bg-black/4 dark:bg-black/40 p-3.5 text-xs space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-[var(--text-muted)]">Predicted Final Output</span>
                <span className="font-mono font-semibold text-[var(--text-primary)]">
                  {analysis.predictedFinalFormat || '—'}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[var(--text-muted)]">Compatibility Status</span>
                <span className={analysis.hasErrors ? 'text-red-500 font-medium' : analysis.hasWarnings ? 'text-amber-500 font-medium' : 'text-emerald-500 font-medium'}>
                  {analysis.hasErrors
                    ? 'Blocked — fix errors'
                    : analysis.hasWarnings
                    ? 'Warnings present'
                    : 'All steps verified'}
                </span>
              </div>
            </div>

            {/* Progress & Controls */}
            {running && (
              <div className="space-y-2">
                <div className="h-1.5 rounded-full bg-black/10 dark:bg-white/10 overflow-hidden">
                  <motion.div
                    initial={false}
                    animate={{ width: `${overallProgress}%` }}
                    transition={{ duration: 0.3, ease: MOTION_EASE }}
                    className="h-full bg-zinc-900 dark:bg-white rounded-full"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      const next = !paused;
                      pauseRef.current = next;
                      setPaused(next);
                    }}
                    className="glass-interactive inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs text-[var(--text-primary)] cursor-pointer"
                  >
                    {paused ? <Play className="w-3.5 h-3.5" /> : <Pause className="w-3.5 h-3.5" />}
                    {paused ? 'Resume' : 'Pause'}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      cancelRef.current = true;
                    }}
                    className="glass-interactive inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs text-[var(--text-primary)] cursor-pointer"
                  >
                    <Square className="w-3.5 h-3.5" />
                    Cancel Batch
                  </button>
                </div>
              </div>
            )}

            <div className="flex flex-wrap items-center gap-2 pt-1">
              <button
                type="button"
                disabled={running || selectedFiles.length === 0 || enabledSteps.length === 0 || analysis.hasErrors}
                onClick={() => setConfirmOpen(true)}
                className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl bg-zinc-900 text-white dark:bg-white dark:text-black px-4 py-2.5 text-xs font-medium hover:opacity-90 disabled:opacity-40 cursor-pointer whitespace-nowrap"
              >
                <Play className="w-3.5 h-3.5" />
                Review &amp; Execute Workflow
              </button>
              {completedJobs.length > 0 && (
                <button
                  type="button"
                  onClick={handleDownloadZip}
                  className="glass-interactive inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2.5 text-xs font-medium text-[var(--text-primary)] cursor-pointer whitespace-nowrap"
                >
                  <Archive className="w-3.5 h-3.5" />
                  ZIP ({completedJobs.length})
                </button>
              )}
            </div>
          </GlassSurface>
        </div>
      </div>

      {/* Mandatory Pre-Execution Confirmation Summary Modal */}
      <GlassModal
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        title="Confirm Workflow Execution"
        subtitle="Review exact files, operations, destinations, and warnings before processing starts."
        maxWidthClass="max-w-xl"
      >
        <div className="space-y-4 text-xs">
          <div className="grid grid-cols-2 gap-3 rounded-xl border border-black/10 dark:border-white/10 bg-black/4 dark:bg-black/40 p-3.5 tabular-nums">
            <div>
              <span className="text-[var(--text-secondary)]">Selected Files</span>
              <p className="text-sm font-semibold text-[var(--text-primary)] mt-0.5">{selectedFiles.length} file(s)</p>
            </div>
            <div>
              <span className="text-[var(--text-secondary)]">Expected Output</span>
              <p className="text-sm font-semibold font-mono text-[var(--text-primary)] mt-0.5">
                {analysis.predictedFinalFormat}
              </p>
            </div>
            <div>
              <span className="text-[var(--text-secondary)]">Naming Rule</span>
              <p className="font-mono text-[var(--text-primary)] mt-0.5">{namingPattern}</p>
            </div>
            <div>
              <span className="text-[var(--text-secondary)]">Destination</span>
              <p className="text-[var(--text-primary)] mt-0.5">
                {destinationFolder.trim() ? `Workspace /${destinationFolder.trim()} + Download Queue` : 'Download Queue'}
              </p>
            </div>
          </div>

          <div>
            <p className="font-medium text-[var(--text-primary)] mb-1.5">
              Exact Processing Sequence ({enabledSteps.length} active operation(s))
            </p>
            <ol className="space-y-1.5 border border-black/10 dark:border-white/10 rounded-xl p-3">
              {enabledSteps.map((s, i) => (
                <li key={s.id} className="flex items-center justify-between gap-2">
                  <span className="text-[var(--text-soft)]">
                    <span className="font-mono font-semibold mr-2">{i + 1}.</span>
                    {s.operationName}
                  </span>
                  <span className="font-mono text-[11px] text-[var(--text-secondary)] truncate max-w-[240px]">
                    {formatStepSummary(s.config)}
                  </span>
                </li>
              ))}
            </ol>
          </div>

          <div>
            <p className="font-medium text-[var(--text-primary)] mb-1">Files to Process</p>
            <p className="text-[var(--text-muted)]">
              {selectedFiles.map((f) => f.info.originalName).join(', ')}
            </p>
          </div>

          {analysis.issues.length > 0 && (
            <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 space-y-1">
              <p className="font-medium text-amber-600 dark:text-amber-400">Warnings</p>
              {analysis.issues.map((w, i) => (
                <p key={i} className="text-[var(--text-soft)]">{w.message}</p>
              ))}
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setConfirmOpen(false)}
              className="glass-interactive rounded-xl px-4 py-2 text-[var(--text-muted)] cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => executeSelectedFiles()}
              className="rounded-xl bg-zinc-900 text-white dark:bg-white dark:text-black px-5 py-2 font-medium cursor-pointer"
            >
              Confirm &amp; Start Workflow
            </button>
          </div>
        </div>
      </GlassModal>

      {/* Save Sequence as Preset Modal */}
      <GlassModal
        open={saveModalOpen}
        onClose={() => setSaveModalOpen(false)}
        title="Save Sequence as Workflow Preset"
        subtitle="Reuse this exact operation order, settings, and naming rule in My Presets."
        maxWidthClass="max-w-md"
      >
        <div className="space-y-3 text-xs">
          <div>
            <label className="block text-[var(--text-muted)] mb-1">Preset Name</label>
            <input
              type="text"
              value={presetName}
              onChange={(e) => setPresetName(e.target.value)}
              placeholder="e.g. Storefront 1200px WebP"
              className="w-full rounded-xl border border-[var(--control-border)] bg-[var(--input-bg)] px-3 py-2 text-[var(--text-primary)]"
            />
          </div>
          <div>
            <label className="block text-[var(--text-muted)] mb-1">Description</label>
            <input
              type="text"
              value={presetDesc}
              onChange={(e) => setPresetDesc(e.target.value)}
              placeholder="Optional description"
              className="w-full rounded-xl border border-[var(--control-border)] bg-[var(--input-bg)] px-3 py-2 text-[var(--text-primary)]"
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setSaveModalOpen(false)}
              className="glass-interactive rounded-xl px-4 py-2 text-[var(--text-muted)] cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={async () => {
                if (!presetName.trim()) return;
                await onSavePreset({
                  name: presetName.trim(),
                  tool: 'workflow',
                  kind: 'workflow',
                  categoryTag: 'Workflow',
                  description:
                    presetDesc.trim() || `${steps.length}-step custom workflow (${analysis.predictedFinalFormat})`,
                  outputRule: {
                    namingPattern,
                    destinationMode: destinationFolder.trim() ? 'workspace-folder' : 'download-queue',
                    destinationFolder: destinationFolder.trim() || undefined,
                  },
                  steps,
                  config: {},
                });
                setSaveModalOpen(false);
              }}
              className="rounded-xl bg-zinc-900 text-white dark:bg-white dark:text-black px-4 py-2 font-medium cursor-pointer"
            >
              Save Workflow Preset
            </button>
          </div>
        </div>
      </GlassModal>
    </div>
  );
}
