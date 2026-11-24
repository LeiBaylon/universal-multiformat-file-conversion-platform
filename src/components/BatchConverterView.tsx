import { useRef, useState } from 'react';
import { motion } from 'motion/react';
import {
  Archive,
  CheckCircle2,
  Download,
  FolderUp,
  Loader2,
  Pause,
  Play,
  RotateCcw,
  SlidersHorizontal,
  Square,
  Trash2,
  Upload,
  XCircle,
} from 'lucide-react';
import type {
  ConversionJob,
  ConversionOptions,
  IdentifiedFileMetadata,
  SavedPreset,
} from '../shared/types';
import { formatBytes, formatDeltaPercent } from '../utils/formatters';
import { MOTION_EASE } from '../utils/motion';
import { GlassSurface } from './glass/GlassSurface';
import { GlassDropdown } from './glass/GlassDropdown';

export interface BatchQueueItem {
  localId: string;
  uploadToken: string;
  info: IdentifiedFileMetadata;
  targetFormat: string;
  status: 'queued' | 'processing' | 'completed' | 'failed' | 'cancelled';
  progress: number;
  excluded?: boolean;
  overrideOptions?: Partial<ConversionOptions>;
  job?: ConversionJob;
  error?: string;
}

interface BatchConverterViewProps {
  items: BatchQueueItem[];
  bulkOptions: ConversionOptions;
  presets?: SavedPreset[];
  onUpdateBulkOptions: (next: ConversionOptions) => void;
  onAddFiles: (files: File[]) => Promise<void>;
  onAddSampleSet: () => Promise<void>;
  onSetItemTarget: (localId: string, target: string) => void;
  onToggleExclude: (localId: string, excluded: boolean) => void;
  onSelectAll: (selected: boolean) => void;
  onUpdateItemOverride: (localId: string, patch: Partial<ConversionOptions> | null) => void;
  onApplyPreset?: (preset: SavedPreset) => void;
  onRemoveItem: (localId: string) => void;
  onClearQueue: () => void;
  onClearCompleted: () => void;
  onStartBatch: () => Promise<void>;
  onTogglePause: () => void;
  onCancelPending: () => void;
  onCancelItem: (localId: string) => Promise<void>;
  onRetryItem: (localId: string) => Promise<void>;
  onDownloadAllZip: () => Promise<void>;
  running: boolean;
  paused: boolean;
}

export function BatchConverterView({
  items,
  bulkOptions,
  presets = [],
  onUpdateBulkOptions,
  onAddFiles,
  onAddSampleSet,
  onSetItemTarget,
  onToggleExclude,
  onSelectAll,
  onUpdateItemOverride,
  onApplyPreset,
  onRemoveItem,
  onClearQueue,
  onClearCompleted,
  onStartBatch,
  onTogglePause,
  onCancelPending,
  onCancelItem,
  onRetryItem,
  onDownloadAllZip,
  running,
  paused,
}: BatchConverterViewProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const folderInputRef = useRef<HTMLInputElement | null>(null);
  const [bulkFormat, setBulkFormat] = useState('');
  const [expandedOverrideId, setExpandedOverrideId] = useState<string | null>(null);

  const activeItems = items.filter((i) => !i.excluded);
  const completedCount = items.filter((i) => i.status === 'completed').length;
  const overallProgress =
    activeItems.length === 0
      ? 0
      : Math.round(activeItems.reduce((acc, i) => acc + i.progress, 0) / activeItems.length);

  const commonTargets = Array.from(new Set(items.flatMap((i) => i.info.compatibleOutputs))).sort();
  const batchPresets = presets.filter((p) => p.tool === 'converter' || p.kind === 'batch');

  const applyBulkFormat = (fmt: string) => {
    setBulkFormat(fmt);
    if (!fmt) return;
    for (const item of items) {
      if (!item.excluded && item.info.compatibleOutputs.includes(fmt)) {
        onSetItemTarget(item.localId, fmt);
      }
    }
  };

  return (
    <div className="space-y-6">
      {/* Header & Controls */}
      <section className="glass-secondary glass-rim rounded-[22px] p-6 space-y-5 overflow-visible relative z-20">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="font-display text-lg font-semibold text-[var(--text-primary)]">
              Batch Processing Queue
            </h2>
            <p className="text-xs text-[var(--text-muted)] mt-0.5 tabular-nums">
              {activeItems.length} of {items.length} file(s) active · {completedCount} completed · {overallProgress}% overall progress
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <input
              ref={inputRef}
              type="file"
              multiple
              className="hidden"
              onChange={(e) => {
                const files = Array.from(e.target.files || []);
                if (files.length > 0) onAddFiles(files);
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
                const files = Array.from(e.target.files || []);
                if (files.length > 0) onAddFiles(files);
                e.target.value = '';
              }}
            />
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              className="glass-interactive inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-medium text-[var(--text-primary)] cursor-pointer whitespace-nowrap"
            >
              <Upload className="w-3.5 h-3.5" />
              Add Files
            </button>
            <button
              type="button"
              onClick={() => folderInputRef.current?.click()}
              className="glass-interactive inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-medium text-[var(--text-primary)] cursor-pointer whitespace-nowrap"
            >
              <FolderUp className="w-3.5 h-3.5" />
              Add Folder
            </button>
            <button
              type="button"
              onClick={onAddSampleSet}
              className="glass-interactive inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-medium text-[var(--text-soft)] hover:text-[var(--text-primary)] cursor-pointer whitespace-nowrap"
            >
              Load Sample Batch
            </button>
            {running ? (
              <>
                <button
                  type="button"
                  onClick={onTogglePause}
                  className="glass-interactive inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-medium text-[var(--text-primary)] cursor-pointer whitespace-nowrap"
                >
                  {paused ? <Play className="w-3.5 h-3.5" /> : <Pause className="w-3.5 h-3.5" />}
                  {paused ? 'Resume' : 'Pause'}
                </button>
                <button
                  type="button"
                  onClick={onCancelPending}
                  className="glass-interactive inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-medium text-[var(--text-primary)] cursor-pointer whitespace-nowrap"
                >
                  <Square className="w-3.5 h-3.5" />
                  Stop Queue
                </button>
              </>
            ) : (
              <motion.button
                type="button"
                whileTap={{ scale: 0.98 }}
                disabled={activeItems.length === 0}
                onClick={onStartBatch}
                className="inline-flex items-center gap-2 rounded-xl bg-zinc-900 text-white dark:bg-white dark:text-black px-5 py-2 text-xs font-medium hover:opacity-90 disabled:opacity-40 cursor-pointer whitespace-nowrap"
              >
                <Play className="w-3.5 h-3.5" />
                Start Batch ({activeItems.length})
              </motion.button>
            )}
          </div>
        </div>

        {/* Bulk Settings & Preset Application Row */}
        {items.length > 0 && (
          <div className="pt-4 border-t border-black/10 dark:border-white/10 flex flex-wrap items-center justify-between gap-4">
            <div className="flex flex-wrap items-center gap-4">
              {batchPresets.length > 0 && onApplyPreset && (
                <div className="w-48">
                  <GlassDropdown
                    size="sm"
                    ariaLabel="Apply Preset to Batch"
                    placeholder="Load preset config..."
                    value=""
                    onChange={(id) => {
                      const found = batchPresets.find((p) => p.id === id);
                      if (found) onApplyPreset(found);
                    }}
                    options={[
                      { value: '', label: 'Load preset config...' },
                      ...batchPresets.map((p) => ({ value: p.id, label: p.name })),
                    ]}
                  />
                </div>
              )}

              <div className="flex items-center gap-2">
                <span className="text-xs text-[var(--text-muted)]">Target:</span>
                <div className="w-44">
                  <GlassDropdown
                    size="sm"
                    ariaLabel="Apply Bulk Output Format"
                    placeholder="Choose format..."
                    searchable={commonTargets.length > 8}
                    value={bulkFormat}
                    onChange={applyBulkFormat}
                    options={[
                      { value: '', label: 'Choose format...' },
                      ...commonTargets.map((ext) => ({ value: ext, label: ext.toUpperCase() })),
                    ]}
                  />
                </div>
              </div>

              <div className="flex items-center gap-2 text-xs text-[var(--text-muted)]">
                <span>Quality ({bulkOptions.quality ?? 88}%):</span>
                <input
                  type="range"
                  min={20}
                  max={100}
                  value={bulkOptions.quality ?? 88}
                  onChange={(e) => onUpdateBulkOptions({ ...bulkOptions, quality: Number(e.target.value) })}
                  className="w-24 accent-zinc-900 dark:accent-white cursor-pointer"
                />
              </div>

              <label className="flex items-center gap-1.5 text-xs text-[var(--text-soft)] cursor-pointer whitespace-nowrap">
                <input
                  type="checkbox"
                  checked={Boolean(bulkOptions.stripMetadata)}
                  onChange={(e) => onUpdateBulkOptions({ ...bulkOptions, stripMetadata: e.target.checked })}
                  className="accent-zinc-900 dark:accent-white rounded cursor-pointer"
                />
                Strip Metadata
              </label>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {completedCount > 0 && (
                <>
                  <motion.button
                    type="button"
                    whileTap={{ scale: 0.98 }}
                    onClick={onDownloadAllZip}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-zinc-900 text-white dark:bg-white dark:text-black px-3.5 py-2 text-xs font-medium hover:opacity-90 cursor-pointer whitespace-nowrap"
                  >
                    <Archive className="w-3.5 h-3.5" />
                    Download ZIP ({completedCount})
                  </motion.button>
                  <button
                    type="button"
                    onClick={onClearCompleted}
                    className="glass-interactive rounded-xl px-3 py-2 text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer whitespace-nowrap"
                  >
                    Clear Completed
                  </button>
                </>
              )}
              <button
                type="button"
                onClick={onClearQueue}
                className="glass-interactive inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer whitespace-nowrap"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Clear All
              </button>
            </div>
          </div>
        )}

        {/* Overall Progress Bar */}
        {items.length > 0 && (
          <div className="h-1.5 w-full rounded-full bg-black/10 dark:bg-white/10 overflow-hidden">
            <motion.div
              initial={false}
              animate={{ width: `${overallProgress}%` }}
              transition={{ duration: 0.35, ease: MOTION_EASE }}
              className="h-full bg-zinc-900 dark:bg-white rounded-full"
            />
          </div>
        )}
      </section>

      {/* Queue Rows with Individual File Overrides */}
      <GlassSurface as="section" className="rounded-[22px] p-6 overflow-visible relative z-10">
        {items.length === 0 ? (
          <div className="py-12 text-center border border-dashed border-black/12 dark:border-white/14 rounded-xl space-y-3">
            <p className="text-sm text-[var(--text-soft)]">Batch queue is empty</p>
            <p className="text-xs text-[var(--text-secondary)] max-w-md mx-auto">
              Add files or entire folders, set global or individual per-file output formats &amp; settings, and download completed outputs individually or in a single ZIP archive.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-[var(--text-secondary)]">
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => onSelectAll(true)}
                  className="hover:text-[var(--text-primary)] cursor-pointer whitespace-nowrap shrink-0"
                >
                  Select All
                </button>
                <span aria-hidden="true">·</span>
                <button
                  type="button"
                  onClick={() => onSelectAll(false)}
                  className="hover:text-[var(--text-primary)] cursor-pointer whitespace-nowrap shrink-0"
                >
                  Deselect All
                </button>
              </div>
              <span className="tabular-nums whitespace-nowrap">
                {items.filter((i) => i.overrideOptions && Object.keys(i.overrideOptions).length > 0).length} file(s) with individual overrides
              </span>
            </div>

            <div className="divide-y divide-black/8 dark:divide-white/8">
              <div className="hidden md:grid grid-cols-12 gap-3 pb-2.5 text-xs font-medium text-[var(--text-muted)]">
                <div className="col-span-4">File</div>
                <div className="col-span-2">Source</div>
                <div className="col-span-2">Output Format</div>
                <div className="col-span-2">Progress</div>
                <div className="col-span-2 text-right">Actions</div>
              </div>

              {items.map((item) => {
                const delta = formatDeltaPercent(item.info.sizeBytes, item.job?.outputSizeBytes);
                const hasOverride = Boolean(item.overrideOptions && Object.keys(item.overrideOptions).length > 0);
                const isOpen = expandedOverrideId === item.localId;
                const effQuality = item.overrideOptions?.quality ?? bulkOptions.quality ?? 88;
                const effStrip = item.overrideOptions?.stripMetadata ?? Boolean(bulkOptions.stripMetadata);

                return (
                  <div key={item.localId} className={`py-3.5 space-y-3 ${item.excluded ? 'opacity-50' : ''}`}>
                    <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-center text-xs">
                      <div className="md:col-span-4 min-w-0 flex items-start gap-2.5">
                        <input
                          type="checkbox"
                          aria-label={`Include ${item.info.originalName}`}
                          checked={!item.excluded}
                          disabled={item.status === 'processing'}
                          onChange={(e) => onToggleExclude(item.localId, !e.target.checked)}
                          className="mt-0.5 accent-zinc-900 dark:accent-white rounded cursor-pointer shrink-0"
                        />
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="text-[var(--text-primary)] font-medium truncate">{item.info.originalName}</p>
                            {hasOverride && (
                              <span className="font-mono text-[10px] text-[var(--text-primary)] underline shrink-0">
                                Customized
                              </span>
                            )}
                          </div>
                          {item.job?.outputSizeBytes ? (
                            <p className="text-[var(--text-secondary)] mt-0.5 tabular-nums">
                              {formatBytes(item.job.outputSizeBytes)}
                              {delta ? ` (${delta.text})` : ''}
                            </p>
                          ) : null}
                          {item.error && <p className="text-red-500 dark:text-red-400 mt-0.5">{item.error}</p>}
                        </div>
                      </div>

                      <div className="md:col-span-2 font-mono text-[var(--text-muted)] tabular-nums">
                        {item.info.detectedExt.toUpperCase()} · {formatBytes(item.info.sizeBytes)}
                      </div>

                      <div className="md:col-span-2">
                        {item.info.compatibleOutputs.length > 0 ? (
                          <GlassDropdown
                            size="sm"
                            ariaLabel={`Target format for ${item.info.originalName}`}
                            disabled={item.status === 'processing'}
                            searchable={item.info.compatibleOutputs.length > 6}
                            value={item.targetFormat}
                            onChange={(v) => onSetItemTarget(item.localId, v)}
                            options={item.info.compatibleOutputs.map((ext) => ({
                              value: ext,
                              label: ext.toUpperCase(),
                            }))}
                          />
                        ) : (
                          <span className="text-[var(--text-secondary)]">Unavailable</span>
                        )}
                      </div>

                      <div className="md:col-span-2 tabular-nums">
                        <div className="flex items-center gap-2">
                          {item.status === 'completed' && (
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                          )}
                          {item.status === 'processing' && (
                            <Loader2 className="w-3.5 h-3.5 animate-spin text-[var(--text-primary)] shrink-0" />
                          )}
                          {item.status === 'failed' && <XCircle className="w-3.5 h-3.5 text-red-500 shrink-0" />}
                          <span className="capitalize text-[var(--text-soft)]">
                            {item.excluded ? 'Excluded' : item.status}
                          </span>
                          <span className="text-[var(--text-secondary)]">{item.progress}%</span>
                        </div>
                      </div>

                      <div className="md:col-span-2 flex items-center md:justify-end gap-2 whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => setExpandedOverrideId(isOpen ? null : item.localId)}
                          className="glass-interactive inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer"
                        >
                          <SlidersHorizontal className="w-3 h-3" />
                          Override
                        </button>

                        {item.status === 'completed' && item.job?.downloadUrl && (
                          <a
                            href={item.job.downloadUrl}
                            className="inline-flex items-center gap-1 text-[var(--text-primary)] hover:underline font-medium"
                          >
                            <Download className="w-3.5 h-3.5" />
                            Save
                          </a>
                        )}
                        {item.status === 'processing' && (
                          <button
                            type="button"
                            onClick={() => onCancelItem(item.localId)}
                            className="text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer"
                          >
                            Cancel
                          </button>
                        )}
                        {(item.status === 'failed' || item.status === 'cancelled') && (
                          <button
                            type="button"
                            onClick={() => onRetryItem(item.localId)}
                            className="inline-flex items-center gap-1 text-[var(--text-primary)] hover:underline cursor-pointer"
                          >
                            <RotateCcw className="w-3.5 h-3.5" />
                            Retry
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => onRemoveItem(item.localId)}
                          aria-label={`Remove ${item.info.originalName}`}
                          className="text-[var(--text-secondary)] hover:text-[var(--text-primary)] cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    {/* Individual File Override Panel */}
                    {isOpen && (
                      <div className="ml-6 rounded-xl border border-black/10 dark:border-white/12 bg-black/4 dark:bg-black/40 p-3.5 flex flex-wrap items-center justify-between gap-4 text-xs">
                        <div className="flex flex-wrap items-center gap-4">
                          <div className="flex items-center gap-2">
                            <span className="text-[var(--text-muted)]">File Quality ({effQuality}%):</span>
                            <input
                              type="range"
                              min={20}
                              max={100}
                              value={effQuality}
                              onChange={(e) =>
                                onUpdateItemOverride(item.localId, { quality: Number(e.target.value) })
                              }
                              className="w-28 accent-zinc-900 dark:accent-white cursor-pointer"
                            />
                          </div>
                          <label className="flex items-center gap-1.5 text-[var(--text-soft)] cursor-pointer">
                            <input
                              type="checkbox"
                              checked={effStrip}
                              onChange={(e) =>
                                onUpdateItemOverride(item.localId, { stripMetadata: e.target.checked })
                              }
                              className="accent-zinc-900 dark:accent-white rounded cursor-pointer"
                            />
                            Strip Metadata
                          </label>
                        </div>

                        {hasOverride && (
                          <button
                            type="button"
                            onClick={() => onUpdateItemOverride(item.localId, null)}
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
    </div>
  );
}
