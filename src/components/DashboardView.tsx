import { useRef, useState } from 'react';
import { motion } from 'motion/react';
import {
  Archive,
  ArrowRight,
  Bookmark,
  Download,
  Eraser,
  FolderOpen,
  HardDrive,
  Layers,
  Minimize2,
  Upload,
  Workflow,
} from 'lucide-react';
import { CATEGORIES, FORMAT_REGISTRY, getSupportedStats } from '../shared/formats';
import type { ConversionJob, NavView, SavedPreset } from '../shared/types';
import { computeConversionActivity } from '../utils/converterHelpers';
import { formatBytes, formatDeltaPercent, formatRelativeTime } from '../utils/formatters';
import { MOTION_EASE } from '../utils/motion';
import { GlassSurface } from './glass/GlassSurface';

interface DashboardViewProps {
  jobs: ConversionJob[];
  presets: SavedPreset[];
  onFilesSelected: (files: File[]) => void;
  onLoadSample: (ext: string, suggestedTarget?: string) => void;
  onOpenHistory: () => void;
  onNavigateTool: (view: NavView) => void;
  onApplyPreset: (preset: SavedPreset) => void;
}

export function DashboardView({
  jobs,
  presets,
  onFilesSelected,
  onLoadSample,
  onOpenHistory,
  onNavigateTool,
  onApplyPreset,
}: DashboardViewProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [dragging, setDragging] = useState(false);

  const stats = getSupportedStats();
  const completedJobs = jobs.filter((j) => j.status === 'completed');
  const totalBytesProcessed = completedJobs.reduce((acc, j) => acc + j.inputSizeBytes, 0);
  const activity = computeConversionActivity(jobs);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const files = Array.from(e.dataTransfer.files || []);
    if (files.length > 0) onFilesSelected(files);
  };

  return (
    <div className="space-y-6">
      {/* Hero Universal Intake Dropzone */}
      <motion.section
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.28, ease: MOTION_EASE }}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        className={`glass-secondary glass-rim rounded-[24px] p-7 md:p-10 transition-all duration-200 ${
          dragging ? 'scale-[0.994] border-zinc-900/40 dark:border-white/50' : ''
        }`}
      >
        <div className="max-w-3xl">
          <p className="text-xs text-[var(--text-muted)] mb-2 tabular-nums">
            OmniFiles Workspace · {stats.full + stats.partial} Active Formats · {CATEGORIES.length} Processing Engines
          </p>
          <h1 className="font-display text-3xl md:text-4xl font-semibold tracking-tight text-[var(--text-primary)] [text-wrap:balance]">
            Full control over files, processing sequences, and batch operations.
          </h1>
          <p className="text-sm text-[var(--text-muted)] mt-3 max-w-2xl leading-relaxed">
            Upload single or multiple files to convert, remove backgrounds, compress with target budgets, build custom step-by-step workflows, or audit and organize workspace storage.
          </p>

          <div className="mt-6 flex flex-wrap items-center gap-3">
            <input
              ref={inputRef}
              type="file"
              multiple
              className="hidden"
              onChange={(e) => {
                const files = Array.from(e.target.files || []);
                if (files.length > 0) onFilesSelected(files);
                e.target.value = '';
              }}
            />
            <motion.button
              type="button"
              whileTap={{ scale: 0.98 }}
              onClick={() => inputRef.current?.click()}
              className="inline-flex items-center gap-2 rounded-xl bg-zinc-900 text-white dark:bg-white dark:text-black px-5 py-2.5 text-sm font-medium hover:opacity-90 transition-opacity whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Upload className="w-4 h-4" />
              Select Files to Process
            </motion.button>
            <button
              type="button"
              onClick={() => onNavigateTool('workflow-builder')}
              className="glass-interactive inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium text-[var(--text-primary)] whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Workflow className="w-4 h-4" />
              Open Workflow Builder
            </button>
            <button
              type="button"
              onClick={() => onLoadSample('png', 'webp')}
              className="glass-interactive inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium text-[var(--text-soft)] hover:text-[var(--text-primary)] whitespace-nowrap shrink-0 cursor-pointer"
            >
              Load Sample PNG
            </button>
          </div>
        </div>
      </motion.section>

      {/* Core Processing Studios */}
      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {(
          [
            {
              id: 'converter' as NavView,
              title: 'Universal Converter',
              subtitle: `${stats.full + stats.partial} formats across 15 categories with batch & intent guidance.`,
              icon: Layers,
            },
            {
              id: 'bg-remover' as NavView,
              title: 'Background Remover',
              subtitle: 'ISNet cutout engine, manual restore/erase brush, studio backdrops, and batch mode.',
              icon: Eraser,
            },
            {
              id: 'compressor' as NavView,
              title: 'File Compressor',
              subtitle: 'Target-KB budget solver, CRF media encoding, PDF shrink, and batch overrides.',
              icon: Minimize2,
            },
            {
              id: 'archive' as NavView,
              title: 'ZIP & Archive Manager',
              subtitle: 'AES-256 ZIP/7Z creation, split volumes, inspection, modification, and batch extract.',
              icon: Archive,
            },
          ]
        ).map((tool) => {
          const Icon = tool.icon;
          return (
            <button
              key={tool.id}
              type="button"
              onClick={() => onNavigateTool(tool.id)}
              className="glass-secondary glass-rim glass-interactive rounded-2xl p-5 text-left flex flex-col justify-between gap-3 cursor-pointer"
            >
              <div className="flex items-center justify-between">
                <div className="w-9 h-9 rounded-xl glass-interactive flex items-center justify-center">
                  <Icon className="w-4 h-4 text-[var(--text-primary)]" />
                </div>
                <ArrowRight className="w-4 h-4 text-[var(--text-secondary)]" />
              </div>
              <div>
                <h2 className="font-display text-sm font-semibold text-[var(--text-primary)]">{tool.title}</h2>
                <p className="text-xs text-[var(--text-muted)] mt-1 leading-relaxed">{tool.subtitle}</p>
              </div>
            </button>
          );
        })}
      </section>

      {/* Telemetry Strip */}
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <GlassSurface as="div" interactiveLight className="rounded-2xl p-5">
          <p className="text-xs text-[var(--text-muted)]">Registered Formats</p>
          <p className="font-display text-2xl font-semibold text-[var(--text-primary)] mt-1 tabular-nums">
            {FORMAT_REGISTRY.length}
          </p>
          <p className="text-xs text-[var(--text-secondary)] mt-1 tabular-nums">
            {stats.full} full · {stats.partial} partial
          </p>
        </GlassSurface>
        <GlassSurface as="div" interactiveLight className="rounded-2xl p-5">
          <p className="text-xs text-[var(--text-muted)]">Completed Jobs</p>
          <p className="font-display text-2xl font-semibold text-[var(--text-primary)] mt-1 tabular-nums">
            {completedJobs.length}
          </p>
          <p className="text-xs text-[var(--text-secondary)] mt-1 tabular-nums">{jobs.length} total session jobs</p>
        </GlassSurface>
        <GlassSurface as="div" interactiveLight className="rounded-2xl p-5">
          <p className="text-xs text-[var(--text-muted)]">Data Processed</p>
          <p className="font-display text-2xl font-semibold text-[var(--text-primary)] mt-1 tabular-nums">
            {formatBytes(totalBytesProcessed)}
          </p>
          <p className="text-xs text-[var(--text-secondary)] mt-1">Confined temporary disk</p>
        </GlassSurface>
        <GlassSurface as="div" interactiveLight className="rounded-2xl p-5">
          <p className="text-xs text-[var(--text-muted)]">Saved Presets</p>
          <p className="font-display text-2xl font-semibold text-[var(--text-primary)] mt-1 tabular-nums">
            {presets.length}
          </p>
          <p className="text-xs text-[var(--text-secondary)] mt-1">Reusable workflows &amp; configs</p>
        </GlassSurface>
      </section>

      {/* Reusable Presets & File Management Overview */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <GlassSurface as="section" className="lg:col-span-6 rounded-[22px] p-6 space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="font-display text-base font-semibold text-[var(--text-primary)]">My Processing Presets</h2>
              <p className="text-xs text-[var(--text-muted)] mt-0.5">
                Configure any tool or sequence without auto-running.
              </p>
            </div>
            <button
              type="button"
              onClick={() => onNavigateTool('presets')}
              className="text-xs text-[var(--text-primary)] hover:underline whitespace-nowrap shrink-0 cursor-pointer"
            >
              Manage Presets
            </button>
          </div>
          <div className="divide-y divide-black/8 dark:divide-white/8">
            {presets.slice(0, 5).map((preset) => (
              <div key={preset.id} className="py-3 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs font-medium text-[var(--text-primary)] truncate">{preset.name}</p>
                  <p className="text-[11px] text-[var(--text-secondary)] truncate">
                    {preset.kind === preset.tool ? preset.tool : `${preset.kind} · ${preset.tool}`}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => onApplyPreset(preset)}
                  className="glass-interactive rounded-lg px-3 py-1.5 text-xs font-medium text-[var(--text-primary)] whitespace-nowrap shrink-0 cursor-pointer"
                >
                  Load Config
                </button>
              </div>
            ))}
          </div>
        </GlassSurface>

        <GlassSurface as="section" className="lg:col-span-6 rounded-[22px] p-6 space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="font-display text-base font-semibold text-[var(--text-primary)]">
                Workspace &amp; Storage Intelligence
              </h2>
              <p className="text-xs text-[var(--text-muted)] mt-0.5">
                Audit duplicates, large assets, organization rules, and batch renames.
              </p>
            </div>
            <HardDrive className="w-4 h-4 text-[var(--text-secondary)]" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            {(
              [
                { id: 'explorer' as NavView, title: 'File Explorer', desc: 'Browse, upload folders, select & route files' },
                { id: 'organizer' as NavView, title: 'Smart Organizer', desc: 'Preview category, date, or size sorting' },
                { id: 'duplicates' as NavView, title: 'Duplicate Finder', desc: 'SHA-256 hash scan & safe deduplication' },
                { id: 'storage-analyzer' as NavView, title: 'Storage Analyzer', desc: 'Category breakdown & reclaimable waste' },
              ]
            ).map((card) => (
              <button
                key={card.id}
                type="button"
                onClick={() => onNavigateTool(card.id)}
                className="glass-interactive rounded-xl p-3.5 text-left cursor-pointer"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-[var(--text-primary)]">{card.title}</span>
                  <HardDrive className="w-3.5 h-3.5 text-[var(--text-secondary)]" />
                </div>
                <p className="text-[11px] text-[var(--text-secondary)] mt-1 leading-relaxed">{card.desc}</p>
              </button>
            ))}
          </div>

          {activity.length > 0 && (
            <div className="pt-3 border-t border-black/10 dark:border-white/10 space-y-2">
              <p className="text-xs font-medium text-[var(--text-primary)]">Session Throughput</p>
              {activity.slice(0, 3).map((item) => (
                <div key={item.category} className="space-y-1">
                  <div className="flex items-center justify-between text-[11px] tabular-nums">
                    <span className="capitalize text-[var(--text-soft)]">{item.category}</span>
                    <span className="text-[var(--text-muted)]">
                      {item.count} job(s) · {formatBytes(item.bytes)} · {item.sharePercent}%
                    </span>
                  </div>
                  <div className="h-1.5 rounded-full bg-black/8 dark:bg-white/10 overflow-hidden">
                    <div
                      style={{ width: `${item.sharePercent}%` }}
                      className="h-full bg-zinc-900 dark:bg-white rounded-full"
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </GlassSurface>
      </div>

      {/* Recently Processed Files */}
      <GlassSurface as="section" className="rounded-[22px] p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-display text-base font-semibold text-[var(--text-primary)]">
            Recently Processed Files
          </h2>
          <button
            type="button"
            onClick={onOpenHistory}
            className="text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors cursor-pointer whitespace-nowrap shrink-0"
          >
            View All History
          </button>
        </div>

        {jobs.length === 0 ? (
          <div className="py-10 text-center border border-dashed border-black/12 dark:border-white/14 rounded-xl">
            <Layers className="w-6 h-6 text-[var(--text-secondary)] mx-auto mb-2" />
            <p className="text-sm text-[var(--text-soft)]">No processing jobs recorded yet</p>
            <p className="text-xs text-[var(--text-secondary)] mt-1">
              Select files above or open any processing studio to start.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-black/10 dark:border-white/10 text-[var(--text-muted)]">
                  <th className="py-2.5 pr-4 font-medium">File</th>
                  <th className="py-2.5 pr-4 font-medium">Pathway</th>
                  <th className="py-2.5 pr-4 font-medium">Size</th>
                  <th className="py-2.5 pr-4 font-medium">Status</th>
                  <th className="py-2.5 pr-4 font-medium">When</th>
                  <th className="py-2.5 text-right font-medium">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-black/8 dark:divide-white/8">
                {jobs.slice(0, 6).map((job) => {
                  const delta = formatDeltaPercent(job.inputSizeBytes, job.outputSizeBytes);
                  return (
                    <tr key={job.id} className="hover:bg-black/4 dark:hover:bg-white/4 transition-colors">
                      <td className="py-3 pr-4 text-[var(--text-primary)] max-w-[220px] truncate">
                        {job.originalName}
                      </td>
                      <td className="py-3 pr-4 font-mono text-[var(--text-muted)]">
                        {job.sourceExt.toUpperCase()} → {job.targetExt.toUpperCase()}
                      </td>
                      <td className="py-3 pr-4 text-[var(--text-muted)] tabular-nums">
                        {formatBytes(job.inputSizeBytes)}
                        {job.outputSizeBytes ? ` → ${formatBytes(job.outputSizeBytes)}` : ''}
                        {delta ? ` (${delta.text})` : ''}
                      </td>
                      <td className="py-3 pr-4 text-[var(--text-soft)] capitalize">{job.status}</td>
                      <td className="py-3 pr-4 text-[var(--text-secondary)] tabular-nums">
                        {formatRelativeTime(job.createdAt)}
                      </td>
                      <td className="py-3 text-right">
                        {job.downloadUrl && job.status === 'completed' ? (
                          <a
                            href={job.downloadUrl}
                            className="inline-flex items-center gap-1.5 text-[var(--text-primary)] hover:underline whitespace-nowrap"
                          >
                            <Download className="w-3.5 h-3.5" />
                            Download
                          </a>
                        ) : (
                          <span className="text-[var(--text-secondary)] inline-flex items-center gap-1">
                            <FolderOpen className="w-3.5 h-3.5" />
                            Expired
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </GlassSurface>
    </div>
  );
}
