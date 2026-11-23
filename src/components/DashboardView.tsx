import { useRef, useState } from 'react';
import { motion } from 'motion/react';
import { ArrowRight, Download, FolderOpen, Layers, Sparkles, Star, Upload } from 'lucide-react';
import { CATEGORIES, FORMAT_REGISTRY, QUICK_SHORTCUTS, getSupportedStats } from '../shared/formats';
import type { ConversionJob, FormatCategory } from '../shared/types';
import { computeConversionActivity } from '../utils/converterHelpers';
import { formatBytes, formatDeltaPercent, formatRelativeTime } from '../utils/formatters';
import { MOTION_EASE } from '../utils/motion';
import { GlassSurface } from './glass/GlassSurface';

interface DashboardViewProps {
  jobs: ConversionJob[];
  favoritePairs: string[];
  onFilesSelected: (files: File[]) => void;
  onLoadSample: (ext: string, suggestedTarget?: string) => void;
  onSelectCategory: (cat: FormatCategory) => void;
  onOpenHistory: () => void;
}

const SAMPLE_PRESETS = [
  { ext: 'png', label: 'PNG Image', target: 'webp' },
  { ext: 'pdf', label: 'PDF Document', target: 'docx' },
  { ext: 'docx', label: 'Word DOCX', target: 'pdf' },
  { ext: 'xlsx', label: 'Excel Sheet', target: 'csv' },
  { ext: 'wav', label: 'WAV Audio', target: 'mp3' },
  { ext: 'mp4', label: 'MP4 Video', target: 'gif' },
  { ext: 'obj', label: '3D OBJ Mesh', target: 'glb' },
  { ext: 'srt', label: 'SRT Subtitles', target: 'vtt' },
  { ext: 'yaml', label: 'YAML Data', target: 'json' },
  { ext: 'scss', label: 'SCSS Styles', target: 'css' },
];

export function DashboardView({
  jobs,
  favoritePairs,
  onFilesSelected,
  onLoadSample,
  onSelectCategory,
  onOpenHistory,
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
      {/* Hero Universal Dropzone */}
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
            Universal Conversion Workspace · {stats.full + stats.partial} Active Formats · {CATEGORIES.length} Engines
          </p>
          <h1 className="font-display text-3xl md:text-4xl font-semibold tracking-tight text-[var(--text-primary)] [text-wrap:balance]">
            Drop any file to identify, configure, and convert.
          </h1>
          <p className="text-sm text-[var(--text-muted)] mt-3 max-w-2xl leading-relaxed">
            Automatic magic-byte identification routes your file through dedicated raster, FFmpeg media, Ghostscript, SheetJS, EPUB, 3D mesh, font, and compiler pipelines.
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
              Select Files to Convert
            </motion.button>
            <motion.button
              type="button"
              whileTap={{ scale: 0.98 }}
              onClick={() => onLoadSample('png', 'webp')}
              className="glass-interactive inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium text-[var(--text-primary)] whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Sparkles className="w-4 h-4" />
              Try Sample PNG to WebP
            </motion.button>
          </div>

          <div className="mt-6 pt-5 border-t border-black/10 dark:border-white/10">
            <p className="text-xs text-[var(--text-muted)] mb-2.5">Instant Sample Files</p>
            <div className="flex flex-wrap gap-2">
              {SAMPLE_PRESETS.map((s) => (
                <button
                  key={s.ext}
                  type="button"
                  onClick={() => onLoadSample(s.ext, s.target)}
                  className="glass-interactive rounded-lg px-3 py-1.5 text-xs text-[var(--text-soft)] hover:text-[var(--text-primary)] whitespace-nowrap shrink-0 cursor-pointer"
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </motion.section>

      {/* Conversion Stats Strip */}
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
          <p className="text-xs text-[var(--text-muted)]">Completed Conversions</p>
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
          <p className="text-xs text-[var(--text-muted)]">Pinned Favorites</p>
          <p className="font-display text-2xl font-semibold text-[var(--text-primary)] mt-1 tabular-nums">
            {favoritePairs.length}
          </p>
          <p className="text-xs text-[var(--text-secondary)] mt-1">Quick conversion pathways</p>
        </GlassSurface>
      </section>

      {/* Quick Shortcuts, Favorite Formats & Popular Categories */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <GlassSurface as="section" className="lg:col-span-5 rounded-[22px] p-6 space-y-5">
          <div>
            <div className="flex items-center justify-between mb-3 gap-3">
              <h2 className="font-display text-base font-semibold text-[var(--text-primary)]">
                Quick Conversion Shortcuts
              </h2>
              <span className="text-xs text-[var(--text-secondary)] whitespace-nowrap shrink-0">1-Click Sample</span>
            </div>
            <div className="divide-y divide-black/8 dark:divide-white/8">
              {QUICK_SHORTCUTS.slice(0, 6).map((sc) => (
                <button
                  key={sc.label}
                  type="button"
                  onClick={() => onLoadSample(sc.from, sc.to)}
                  className="w-full py-2.5 px-2 -mx-2 rounded-lg flex items-center justify-between text-left hover:bg-black/5 dark:hover:bg-white/6 transition-colors cursor-pointer group"
                >
                  <span className="text-xs sm:text-sm text-[var(--text-soft)] group-hover:text-[var(--text-primary)]">
                    {sc.label}
                  </span>
                  <span className="inline-flex items-center gap-1.5 text-xs text-[var(--text-muted)] font-mono tabular-nums">
                    {sc.from.toUpperCase()}
                    <ArrowRight className="w-3.5 h-3.5 transition-transform group-hover:translate-x-0.5" />
                    {sc.to.toUpperCase()}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {favoritePairs.length > 0 && (
            <div className="pt-4 border-t border-black/10 dark:border-white/10">
              <div className="flex items-center justify-between mb-2.5">
                <span className="text-xs font-medium text-[var(--text-primary)] inline-flex items-center gap-1.5">
                  <Star className="w-3.5 h-3.5" />
                  Favorite Pairs
                </span>
                <span className="text-xs text-[var(--text-secondary)] tabular-nums">{favoritePairs.length}</span>
              </div>
              <div className="flex flex-wrap gap-2">
                {favoritePairs.slice(0, 6).map((pair) => {
                  const [from, to] = pair.split('->');
                  return (
                    <button
                      key={pair}
                      type="button"
                      onClick={() => onLoadSample(from, to)}
                      className="glass-interactive rounded-lg px-2.5 py-1.5 text-xs font-mono text-[var(--text-primary)] inline-flex items-center gap-1 cursor-pointer"
                    >
                      <span>{from?.toUpperCase()}</span>
                      <ArrowRight className="w-3 h-3 text-[var(--text-secondary)]" />
                      <span>{to?.toUpperCase()}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </GlassSurface>

        <GlassSurface as="section" className="lg:col-span-7 rounded-[22px] p-6 space-y-5">
          <div>
            <div className="flex items-center justify-between mb-3.5">
              <h2 className="font-display text-base font-semibold text-[var(--text-primary)]">
                Popular Conversion Categories
              </h2>
              <span className="text-xs text-[var(--text-secondary)] tabular-nums">{CATEGORIES.length} Engines</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {CATEGORIES.slice(0, 8).map((cat) => {
                const count = FORMAT_REGISTRY.filter(
                  (f) => f.category === cat.id && f.supportLevel !== 'unavailable'
                ).length;
                return (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => onSelectCategory(cat.id)}
                    className="glass-interactive rounded-xl p-3.5 text-left cursor-pointer"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-[var(--text-primary)]">{cat.label}</span>
                      <span className="text-xs text-[var(--text-muted)] tabular-nums">{count} active</span>
                    </div>
                    <p className="text-xs text-[var(--text-secondary)] mt-1 line-clamp-1">{cat.description}</p>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Conversion Activity Breakdown */}
          <div className="pt-4 border-t border-black/10 dark:border-white/10">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs font-medium text-[var(--text-primary)]">Session Conversion Activity</h3>
              <span className="text-xs text-[var(--text-secondary)] tabular-nums">
                {completedJobs.length} completed
              </span>
            </div>
            {activity.length === 0 ? (
              <p className="text-xs text-[var(--text-secondary)]">
                Category throughput bars will populate as conversions complete in this session.
              </p>
            ) : (
              <div className="space-y-2.5">
                {activity.slice(0, 4).map((item) => (
                  <div key={item.category} className="space-y-1">
                    <div className="flex items-center justify-between text-xs tabular-nums">
                      <span className="capitalize text-[var(--text-soft)]">{item.category}</span>
                      <span className="text-[var(--text-muted)]">
                        {item.count} job(s) · {formatBytes(item.bytes)} · {item.sharePercent}%
                      </span>
                    </div>
                    <div className="h-1.5 rounded-full bg-black/8 dark:bg-white/10 overflow-hidden">
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${item.sharePercent}%` }}
                        transition={{ duration: 0.45, ease: MOTION_EASE }}
                        className="h-full bg-zinc-900 dark:bg-white rounded-full"
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </GlassSurface>
      </div>

      {/* Recently Converted Files */}
      <GlassSurface as="section" className="rounded-[22px] p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-display text-base font-semibold text-[var(--text-primary)]">
            Recently Converted Files
          </h2>
          <button
            type="button"
            onClick={onOpenHistory}
            className="text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors cursor-pointer"
          >
            View All History
          </button>
        </div>

        {jobs.length === 0 ? (
          <div className="py-10 text-center border border-dashed border-black/12 dark:border-white/14 rounded-xl">
            <Layers className="w-6 h-6 text-[var(--text-secondary)] mx-auto mb-2" />
            <p className="text-sm text-[var(--text-soft)]">No conversions recorded yet</p>
            <p className="text-xs text-[var(--text-secondary)] mt-1">
              Upload a file or click any sample preset above to begin.
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
