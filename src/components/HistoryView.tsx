import { useMemo, useState } from 'react';
import { motion } from 'motion/react';
import { Download, Eye, Search, Trash2 } from 'lucide-react';
import type { ConversionJob } from '../shared/types';
import { formatBytes, formatDeltaPercent, formatRelativeTime } from '../utils/formatters';
import { SPRING_SNAPPY } from '../utils/motion';
import { PreviewPanel } from './PreviewPanel';
import { GlassSurface } from './glass/GlassSurface';
import { GlassModal } from './glass/GlassModal';

interface HistoryViewProps {
  jobs: ConversionJob[];
  onDeleteJob: (id: string) => Promise<void>;
  onClearHistory: () => Promise<void>;
}

export function HistoryView({ jobs, onDeleteJob, onClearHistory }: HistoryViewProps) {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'completed' | 'failed'>('all');
  const [previewJob, setPreviewJob] = useState<ConversionJob | null>(null);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return jobs.filter((j) => {
      if (statusFilter !== 'all' && j.status !== statusFilter) return false;
      if (!q) return true;
      return (
        j.originalName.toLowerCase().includes(q) ||
        j.sourceExt.toLowerCase().includes(q) ||
        j.targetExt.toLowerCase().includes(q) ||
        j.category.toLowerCase().includes(q)
      );
    });
  }, [jobs, search, statusFilter]);

  return (
    <div className="space-y-6">
      <GlassSurface as="section" className="rounded-[22px] p-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="font-display text-lg font-semibold text-[var(--text-primary)]">Conversion History</h2>
            <p className="text-xs text-[var(--text-muted)] mt-0.5 tabular-nums">
              {jobs.length} recorded job(s) · Temporary outputs remain downloadable until retention expiry
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2.5">
            <div className="inline-flex items-center gap-1 p-1 rounded-xl border border-black/10 dark:border-white/12 bg-black/4 dark:bg-black/35">
              {(['all', 'completed', 'failed'] as const).map((st) => {
                const active = statusFilter === st;
                return (
                  <button
                    key={st}
                    type="button"
                    onClick={() => setStatusFilter(st)}
                    className="relative px-3 py-1.5 rounded-lg text-xs font-medium capitalize cursor-pointer whitespace-nowrap"
                  >
                    {active && (
                      <motion.span
                        layoutId="history-status-pill"
                        transition={SPRING_SNAPPY}
                        className="absolute inset-0 rounded-lg bg-zinc-900 dark:bg-white"
                      />
                    )}
                    <span
                      className={`relative z-10 ${
                        active
                          ? 'text-white dark:text-black'
                          : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                      }`}
                    >
                      {st}
                    </span>
                  </button>
                );
              })}
            </div>
            {jobs.length > 0 && (
              <button
                type="button"
                onClick={onClearHistory}
                className="glass-interactive inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Clear History
              </button>
            )}
          </div>
        </div>

        <div className="relative">
          <Search className="w-4 h-4 text-[var(--text-secondary)] absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search history by filename, format, or category..."
            className="w-full rounded-xl border border-[var(--control-border)] bg-[var(--input-bg)] pl-10 pr-4 py-2.5 text-xs text-[var(--text-primary)] placeholder-[var(--text-secondary)] focus:outline-none focus:border-zinc-500 dark:focus:border-white/45 transition-colors"
          />
        </div>
      </GlassSurface>

      <GlassSurface as="section" className="rounded-[22px] p-6">
        {filtered.length === 0 ? (
          <div className="py-12 text-center text-xs text-[var(--text-secondary)]">
            No conversion history records match your filter.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-black/10 dark:border-white/10 text-[var(--text-muted)]">
                  <th className="py-2.5 pr-4 font-medium">Original File</th>
                  <th className="py-2.5 pr-4 font-medium">Conversion</th>
                  <th className="py-2.5 pr-4 font-medium">Engine</th>
                  <th className="py-2.5 pr-4 font-medium">Size Delta</th>
                  <th className="py-2.5 pr-4 font-medium">Status</th>
                  <th className="py-2.5 pr-4 font-medium">Date</th>
                  <th className="py-2.5 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-black/8 dark:divide-white/8">
                {filtered.map((job) => {
                  const delta = formatDeltaPercent(job.inputSizeBytes, job.outputSizeBytes);
                  return (
                    <tr key={job.id} className="hover:bg-black/4 dark:hover:bg-white/4 transition-colors">
                      <td className="py-3 pr-4">
                        <p className="text-[var(--text-primary)] font-medium max-w-[220px] truncate">
                          {job.originalName}
                        </p>
                        {job.error && (
                          <p className="text-red-500 dark:text-red-400 mt-0.5 max-w-xs truncate">{job.error}</p>
                        )}
                      </td>
                      <td className="py-3 pr-4 font-mono text-[var(--text-soft)]">
                        {job.sourceExt.toUpperCase()} → {job.targetExt.toUpperCase()}
                      </td>
                      <td className="py-3 pr-4 text-[var(--text-muted)]">{job.engineUsed || job.category}</td>
                      <td className="py-3 pr-4 text-[var(--text-muted)] tabular-nums">
                        {formatBytes(job.inputSizeBytes)}
                        {job.outputSizeBytes ? ` → ${formatBytes(job.outputSizeBytes)}` : ''}
                        {delta ? ` (${delta.text})` : ''}
                      </td>
                      <td className="py-3 pr-4 capitalize text-[var(--text-soft)]">{job.status}</td>
                      <td className="py-3 pr-4 text-[var(--text-secondary)] tabular-nums">
                        {formatRelativeTime(job.createdAt)}
                      </td>
                      <td className="py-3 text-right whitespace-nowrap">
                        <div className="inline-flex items-center gap-3">
                          {job.status === 'completed' && job.previewUrl && job.previewKind !== 'none' && (
                            <button
                              type="button"
                              onClick={() => setPreviewJob(job)}
                              className="inline-flex items-center gap-1 text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer"
                            >
                              <Eye className="w-3.5 h-3.5" />
                              Preview
                            </button>
                          )}
                          {job.status === 'completed' && job.downloadUrl && (
                            <a
                              href={job.downloadUrl}
                              className="inline-flex items-center gap-1 text-[var(--text-primary)] hover:underline"
                            >
                              <Download className="w-3.5 h-3.5" />
                              Download
                            </a>
                          )}
                          <button
                            type="button"
                            onClick={() => onDeleteJob(job.id)}
                            aria-label={`Delete history item ${job.originalName}`}
                            className="text-[var(--text-secondary)] hover:text-[var(--text-primary)] cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </GlassSurface>

      {/* Preview Modal */}
      <GlassModal
        open={Boolean(previewJob)}
        onClose={() => setPreviewJob(null)}
        title={previewJob ? `${previewJob.originalName} (${previewJob.targetExt.toUpperCase()})` : ''}
        subtitle={
          previewJob
            ? `${formatBytes(previewJob.outputSizeBytes)} · ${previewJob.engineUsed || previewJob.category}`
            : ''
        }
      >
        {previewJob && (
          <PreviewPanel
            kind={previewJob.previewKind}
            url={previewJob.previewUrl}
            label={previewJob.originalName}
            ext={previewJob.targetExt}
          />
        )}
      </GlassModal>
    </div>
  );
}
