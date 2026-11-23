import { useRef, useState } from 'react';
import { motion } from 'motion/react';
import {
  Archive,
  CheckCircle2,
  Download,
  Loader2,
  Play,
  RotateCcw,
  Trash2,
  Upload,
  XCircle,
} from 'lucide-react';
import type { ConversionJob, ConversionOptions, IdentifiedFileMetadata } from '../shared/types';
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
  job?: ConversionJob;
  error?: string;
}

interface BatchConverterViewProps {
  items: BatchQueueItem[];
  bulkOptions: ConversionOptions;
  onUpdateBulkOptions: (next: ConversionOptions) => void;
  onAddFiles: (files: File[]) => Promise<void>;
  onAddSampleSet: () => Promise<void>;
  onSetItemTarget: (localId: string, target: string) => void;
  onRemoveItem: (localId: string) => void;
  onClearQueue: () => void;
  onStartBatch: () => Promise<void>;
  onCancelItem: (localId: string) => Promise<void>;
  onRetryItem: (localId: string) => Promise<void>;
  onDownloadAllZip: () => Promise<void>;
  running: boolean;
}

export function BatchConverterView({
  items,
  bulkOptions,
  onUpdateBulkOptions,
  onAddFiles,
  onAddSampleSet,
  onSetItemTarget,
  onRemoveItem,
  onClearQueue,
  onStartBatch,
  onCancelItem,
  onRetryItem,
  onDownloadAllZip,
  running,
}: BatchConverterViewProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [bulkFormat, setBulkFormat] = useState('');

  const completedCount = items.filter((i) => i.status === 'completed').length;
  const totalCount = items.length;
  const overallProgress =
    totalCount === 0 ? 0 : Math.round(items.reduce((acc, i) => acc + i.progress, 0) / totalCount);

  const commonTargets = Array.from(new Set(items.flatMap((i) => i.info.compatibleOutputs))).sort();

  const applyBulkFormat = (fmt: string) => {
    setBulkFormat(fmt);
    if (!fmt) return;
    for (const item of items) {
      if (item.info.compatibleOutputs.includes(fmt)) {
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
              Batch Conversion Queue
            </h2>
            <p className="text-xs text-[var(--text-muted)] mt-0.5 tabular-nums">
              {items.length} file(s) staged · {completedCount} completed · {overallProgress}% overall progress
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
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
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              className="glass-interactive inline-flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-medium text-[var(--text-primary)] cursor-pointer"
            >
              <Upload className="w-3.5 h-3.5" />
              Add Files
            </button>
            <button
              type="button"
              onClick={onAddSampleSet}
              className="glass-interactive inline-flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-medium text-[var(--text-soft)] hover:text-[var(--text-primary)] cursor-pointer"
            >
              Load Sample Batch (3 files)
            </button>
            <motion.button
              type="button"
              whileTap={{ scale: 0.98 }}
              disabled={items.length === 0 || running}
              onClick={onStartBatch}
              className="inline-flex items-center gap-2 rounded-xl bg-zinc-900 text-white dark:bg-white dark:text-black px-5 py-2 text-xs font-medium hover:opacity-90 disabled:opacity-40 cursor-pointer"
            >
              {running ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
              {running ? 'Processing Queue...' : 'Start Batch Conversion'}
            </motion.button>
          </div>
        </div>

        {/* Bulk Settings Row */}
        {items.length > 0 && (
          <div className="pt-4 border-t border-black/10 dark:border-white/10 flex flex-wrap items-center justify-between gap-4">
            <div className="flex flex-wrap items-center gap-4">
              <div className="flex items-center gap-2">
                <span className="text-xs text-[var(--text-muted)]">Apply Output to Compatible:</span>
                <div className="w-40">
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
                <span>Bulk Image Quality ({bulkOptions.quality ?? 88}%):</span>
                <input
                  type="range"
                  min={20}
                  max={100}
                  value={bulkOptions.quality ?? 88}
                  onChange={(e) => onUpdateBulkOptions({ ...bulkOptions, quality: Number(e.target.value) })}
                  className="w-28 accent-zinc-900 dark:accent-white cursor-pointer"
                />
              </div>
              <label className="flex items-center gap-1.5 text-xs text-[var(--text-soft)] cursor-pointer">
                <input
                  type="checkbox"
                  checked={Boolean(bulkOptions.stripMetadata)}
                  onChange={(e) => onUpdateBulkOptions({ ...bulkOptions, stripMetadata: e.target.checked })}
                  className="accent-zinc-900 dark:accent-white rounded cursor-pointer"
                />
                Strip Metadata
              </label>
            </div>

            <div className="flex items-center gap-2.5">
              {completedCount > 0 && (
                <motion.button
                  type="button"
                  whileTap={{ scale: 0.98 }}
                  onClick={onDownloadAllZip}
                  className="inline-flex items-center gap-2 rounded-xl bg-zinc-900 text-white dark:bg-white dark:text-black px-4 py-2 text-xs font-medium hover:opacity-90 cursor-pointer"
                >
                  <Archive className="w-3.5 h-3.5" />
                  Download All as ZIP ({completedCount})
                </motion.button>
              )}
              <button
                type="button"
                onClick={onClearQueue}
                className="glass-interactive inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Clear
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

      {/* Queue Rows */}
      <GlassSurface as="section" className="rounded-[22px] p-6 overflow-visible relative z-10">
        {items.length === 0 ? (
          <div className="py-12 text-center border border-dashed border-black/12 dark:border-white/14 rounded-xl space-y-3">
            <p className="text-sm text-[var(--text-soft)]">Batch queue is empty</p>
            <p className="text-xs text-[var(--text-secondary)] max-w-md mx-auto">
              Add multiple files of any format, assign per-file or bulk output formats, monitor progress, and download everything in a single ZIP archive.
            </p>
          </div>
        ) : (
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
              return (
                <div
                  key={item.localId}
                  className="py-3.5 grid grid-cols-1 md:grid-cols-12 gap-3 items-center text-xs"
                >
                  <div className="md:col-span-4 min-w-0">
                    <p className="text-[var(--text-primary)] font-medium truncate">{item.info.originalName}</p>
                    {item.job?.outputSizeBytes ? (
                      <p className="text-[var(--text-secondary)] mt-0.5 tabular-nums">
                        {formatBytes(item.job.outputSizeBytes)}
                        {delta ? ` (${delta.text})` : ''}
                      </p>
                    ) : null}
                    {item.error && <p className="text-red-500 dark:text-red-400 mt-0.5">{item.error}</p>}
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
                      <span className="capitalize text-[var(--text-soft)]">{item.status}</span>
                      <span className="text-[var(--text-secondary)]">{item.progress}%</span>
                    </div>
                  </div>

                  <div className="md:col-span-2 flex items-center md:justify-end gap-2.5 whitespace-nowrap">
                    {item.status === 'completed' && item.job?.downloadUrl && (
                      <a
                        href={item.job.downloadUrl}
                        className="inline-flex items-center gap-1 text-[var(--text-primary)] hover:underline font-medium"
                      >
                        <Download className="w-3.5 h-3.5" />
                        Download
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
              );
            })}
          </div>
        )}
      </GlassSurface>
    </div>
  );
}
