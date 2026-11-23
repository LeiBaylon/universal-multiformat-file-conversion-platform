import { useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  Download,
  FilePlus2,
  GitMerge,
  Loader2,
  SlidersHorizontal,
  Sparkles,
  Star,
  Upload,
} from 'lucide-react';
import type { ConversionJob, ConversionOptions, IdentifiedFileMetadata } from '../shared/types';
import { getFormatByExtension } from '../shared/formats';
import { formatBytes, formatDeltaPercent } from '../utils/formatters';
import { ACCORDION_VARIANTS, MOTION_EASE, PANEL_SLIDE_VARIANTS, SPRING_SNAPPY } from '../utils/motion';
import { PreviewPanel } from './PreviewPanel';
import { ConversionOptionsPanel } from './ConversionOptionsPanel';
import { GlassSurface } from './glass/GlassSurface';
import { GlassDropdown } from './glass/GlassDropdown';

export interface StagedConversionItem {
  uploadToken: string;
  info: IdentifiedFileMetadata;
  targetFormat: string;
  options: ConversionOptions;
  job?: ConversionJob;
  outputPreviewData?: unknown;
  note?: string;
  error?: string;
  converting?: boolean;
}

interface UniversalConverterViewProps {
  staged: StagedConversionItem | null;
  favoritePairs: string[];
  onUploadFile: (file: File, preferredTarget?: string) => Promise<void>;
  onLoadSample: (ext: string, suggestedTarget?: string) => Promise<void>;
  onUpdateStaged: (patch: Partial<StagedConversionItem>) => void;
  onConvert: () => Promise<void>;
  onToggleFavorite: (pair: string) => void;
  onMergeFiles: (
    files: File[],
    mode: 'pdf-merge' | 'audio-merge' | 'video-merge' | 'archive-pack',
    targetExt: string
  ) => Promise<ConversionJob | null>;
}

export function UniversalConverterView({
  staged,
  favoritePairs,
  onUploadFile,
  onLoadSample,
  onUpdateStaged,
  onConvert,
  onToggleFavorite,
  onMergeFiles,
}: UniversalConverterViewProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const mergeInputRef = useRef<HTMLInputElement | null>(null);
  const [mergeMode, setMergeMode] = useState<'pdf-merge' | 'audio-merge' | 'video-merge' | 'archive-pack'>('pdf-merge');
  const [mergeFiles, setMergeFiles] = useState<File[]>([]);
  const [mergeTarget, setMergeTarget] = useState('pdf');
  const [merging, setMerging] = useState(false);
  const [mergeResult, setMergeResult] = useState<ConversionJob | null>(null);
  const [mergeError, setMergeError] = useState<string | null>(null);
  const [showMergeTool, setShowMergeTool] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(true);

  const srcFormatDef = staged ? getFormatByExtension(staged.info.detectedExt) : undefined;
  const pairKey = staged ? `${staged.info.detectedExt}->${staged.targetFormat}` : '';
  const isFav = pairKey ? favoritePairs.includes(pairKey) : false;

  const handleRunMerge = async () => {
    if (mergeFiles.length < 2) return;
    setMerging(true);
    setMergeError(null);
    try {
      const job = await onMergeFiles(mergeFiles, mergeMode, mergeTarget);
      if (job) setMergeResult(job);
    } catch (err) {
      setMergeError(err instanceof Error ? err.message : 'Merge failed.');
    } finally {
      setMerging(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Action Bar */}
      <GlassSurface as="div" className="rounded-[22px] p-5 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="font-display text-lg font-semibold text-[var(--text-primary)]">
            Universal File Converter
          </h2>
          <p className="text-xs text-[var(--text-muted)] mt-0.5">
            Automatic MIME &amp; magic-byte detection · Compatible target filtering · Live previews
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) onUploadFile(file);
              e.target.value = '';
            }}
          />
          <motion.button
            type="button"
            whileTap={{ scale: 0.98 }}
            onClick={() => setShowMergeTool((v) => !v)}
            aria-expanded={showMergeTool}
            className="glass-interactive inline-flex items-center gap-2 rounded-xl px-3.5 py-2 text-xs font-medium text-[var(--text-primary)] whitespace-nowrap shrink-0 cursor-pointer"
          >
            <GitMerge className="w-3.5 h-3.5" />
            {showMergeTool ? 'Hide Merge & Pack Tool' : 'Merge PDFs / Media / Pack ZIP'}
          </motion.button>
          <motion.button
            type="button"
            whileTap={{ scale: 0.98 }}
            onClick={() => fileInputRef.current?.click()}
            className="inline-flex items-center gap-2 rounded-xl bg-zinc-900 text-white dark:bg-white dark:text-black px-4 py-2 text-xs font-medium hover:opacity-90 transition-opacity whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Upload className="w-3.5 h-3.5" />
            Upload File
          </motion.button>
        </div>
      </GlassSurface>

      {/* Multi-file Merge & Archive Bundler (Slide Accordion) */}
      <AnimatePresence initial={false}>
        {showMergeTool && (
          <motion.section
            variants={PANEL_SLIDE_VARIANTS}
            initial="initial"
            animate="animate"
            exit="exit"
            className="glass-secondary glass-rim rounded-[22px] p-6 space-y-4 overflow-visible"
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="font-display text-base font-semibold text-[var(--text-primary)]">
                  Multi-File Merge &amp; Archive Creation
                </h3>
                <p className="text-xs text-[var(--text-muted)] mt-0.5">
                  Combine multiple PDFs, concatenate audio/video tracks, or pack files into ZIP/TAR/TGZ/BZ2/XZ.
                </p>
              </div>
              <div className="inline-flex flex-wrap gap-1 p-1 rounded-xl border border-black/10 dark:border-white/12 bg-black/4 dark:bg-black/35">
                {(
                  [
                    { id: 'pdf-merge', label: 'Merge PDFs', defExt: 'pdf' },
                    { id: 'audio-merge', label: 'Merge Audio', defExt: 'mp3' },
                    { id: 'video-merge', label: 'Merge Video', defExt: 'mp4' },
                    { id: 'archive-pack', label: 'Create Archive', defExt: 'zip' },
                  ] as const
                ).map((m) => {
                  const active = mergeMode === m.id;
                  return (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => {
                        setMergeMode(m.id);
                        setMergeTarget(m.defExt);
                      }}
                      className="relative px-3 py-1.5 rounded-lg text-xs font-medium cursor-pointer whitespace-nowrap"
                    >
                      {active && (
                        <motion.span
                          layoutId="merge-mode-pill"
                          transition={SPRING_SNAPPY}
                          className="absolute inset-0 rounded-lg bg-zinc-900 dark:bg-white"
                        />
                      )}
                      <span
                        className={`relative z-10 ${
                          active ? 'text-white dark:text-black' : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                        }`}
                      >
                        {m.label}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <input
                ref={mergeInputRef}
                type="file"
                multiple
                className="hidden"
                onChange={(e) => setMergeFiles(Array.from(e.target.files || []))}
              />
              <button
                type="button"
                onClick={() => mergeInputRef.current?.click()}
                className="glass-interactive rounded-xl px-4 py-2 text-xs font-medium text-[var(--text-primary)] cursor-pointer"
              >
                Choose 2+ Files ({mergeFiles.length} selected)
              </button>

              {mergeMode === 'archive-pack' && (
                <div className="w-44">
                  <GlassDropdown
                    size="sm"
                    ariaLabel="Archive Output Format"
                    value={mergeTarget}
                    onChange={setMergeTarget}
                    options={[
                      { value: 'zip', label: 'ZIP', sublabel: 'Archive' },
                      { value: 'tar', label: 'TAR' },
                      { value: 'tgz', label: 'TGZ', sublabel: 'Gzipped Tar' },
                      { value: 'bz2', label: 'BZ2' },
                      { value: 'xz', label: 'XZ' },
                    ]}
                  />
                </div>
              )}

              <motion.button
                type="button"
                whileTap={{ scale: 0.98 }}
                disabled={mergeFiles.length < 2 || merging}
                onClick={handleRunMerge}
                className="inline-flex items-center gap-2 rounded-xl bg-zinc-900 text-white dark:bg-white dark:text-black px-4 py-2 text-xs font-medium disabled:opacity-40 cursor-pointer"
              >
                {merging && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                {merging ? 'Processing...' : 'Merge & Build Output'}
              </motion.button>

              {mergeResult?.downloadUrl && (
                <a
                  href={mergeResult.downloadUrl}
                  className="inline-flex items-center gap-1.5 text-xs font-medium text-[var(--text-primary)] underline"
                >
                  <Download className="w-3.5 h-3.5" />
                  Download {mergeResult.targetExt.toUpperCase()} ({formatBytes(mergeResult.outputSizeBytes)})
                </a>
              )}
            </div>
            {mergeError && <p className="text-xs text-red-500 dark:text-red-400">{mergeError}</p>}
          </motion.section>
        )}
      </AnimatePresence>

      {/* Empty state vs Staged File Workflow */}
      {!staged ? (
        <motion.div
          key="converter-empty"
          variants={PANEL_SLIDE_VARIANTS}
          initial="initial"
          animate="animate"
          className="glass-secondary glass-rim rounded-[24px] p-12 text-center space-y-4"
        >
            <FilePlus2 className="w-8 h-8 text-[var(--text-muted)] mx-auto" />
            <h3 className="font-display text-lg font-medium text-[var(--text-primary)]">
              No file loaded in inspector
            </h3>
            <p className="text-xs text-[var(--text-muted)] max-w-md mx-auto leading-relaxed">
              Upload any image, document, spreadsheet, presentation, audio, video, ebook, archive, 3D model, font, subtitle, data, web asset, or scientific file.
            </p>
            <div className="flex flex-wrap justify-center gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="rounded-xl bg-zinc-900 text-white dark:bg-white dark:text-black px-5 py-2.5 text-xs font-medium hover:opacity-90 cursor-pointer"
              >
                Select Local File
              </button>
              <button
                type="button"
                onClick={() => onLoadSample('yaml', 'json')}
                className="glass-interactive rounded-xl px-4 py-2.5 text-xs text-[var(--text-primary)] cursor-pointer"
              >
                Load Sample YAML
              </button>
              <button
                type="button"
                onClick={() => onLoadSample('obj', 'glb')}
                className="glass-interactive rounded-xl px-4 py-2.5 text-xs text-[var(--text-primary)] cursor-pointer"
              >
                Load Sample 3D OBJ
              </button>
            </div>
          </motion.div>
        ) : (
          <motion.div
            key={staged.uploadToken}
            variants={PANEL_SLIDE_VARIANTS}
            initial="initial"
            animate="animate"
            exit="exit"
            className="grid grid-cols-1 lg:grid-cols-12 gap-6"
          >
            {/* Left Column: Identified File & Before Preview */}
            <div className="lg:col-span-5 space-y-5">
              <GlassSurface as="section" className="rounded-[22px] p-5 space-y-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-xs text-[var(--text-muted)]">Detected Source File</p>
                    <h3 className="font-display text-base font-semibold text-[var(--text-primary)] truncate mt-0.5">
                      {staged.info.originalName}
                    </h3>
                    <p className="text-xs text-[var(--text-muted)] mt-1 tabular-nums">
                      {staged.info.detectedExt.toUpperCase()} · {formatBytes(staged.info.sizeBytes)} ·{' '}
                      <span className="capitalize">{staged.info.category}</span>
                    </p>
                  </div>
                  <span className="text-xs font-mono text-[var(--text-soft)] shrink-0">
                    {staged.info.supportLevel === 'full'
                      ? 'Full Engine'
                      : staged.info.supportLevel === 'partial'
                      ? 'Partial'
                      : 'Adapter Needed'}
                  </span>
                </div>

                <div className="border-t border-black/10 dark:border-white/10 pt-3 grid grid-cols-2 gap-3 text-xs">
                  <div>
                    <span className="text-[var(--text-secondary)]">MIME Type</span>
                    <p className="text-[var(--text-primary)] font-mono truncate mt-0.5">{staged.info.detectedMime}</p>
                  </div>
                  <div>
                    <span className="text-[var(--text-secondary)]">Magic Signature</span>
                    <p className="text-[var(--text-primary)] font-mono truncate mt-0.5">
                      {staged.info.magicSignature || 'Text'}
                    </p>
                  </div>
                  {Object.entries(staged.info.details)
                    .slice(0, 4)
                    .map(([k, v]) => (
                      <div key={k}>
                        <span className="text-[var(--text-secondary)] capitalize">{k}</span>
                        <p className="text-[var(--text-primary)] truncate mt-0.5 tabular-nums">
                          {Array.isArray(v) ? v.join(', ') : String(v)}
                        </p>
                      </div>
                    ))}
                </div>

                {staged.info.notes && (
                  <p className="text-xs text-[var(--text-muted)] border-t border-black/10 dark:border-white/10 pt-3">
                    {staged.info.notes}
                  </p>
                )}
              </GlassSurface>

              <GlassSurface as="section" className="rounded-[22px] p-5 space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-medium text-[var(--text-primary)]">Before Conversion Preview</h4>
                  <span className="text-xs font-mono text-[var(--text-secondary)]">
                    {staged.info.detectedExt.toUpperCase()}
                  </span>
                </div>
                <PreviewPanel
                  kind={staged.info.previewKind}
                  url={`/api/uploads/${staged.uploadToken}/preview`}
                  data={staged.info.previewData}
                  label={staged.info.originalName}
                  ext={staged.info.detectedExt}
                />
              </GlassSurface>
            </div>

            {/* Right Column: Target Selection, Smart Recommendations, Settings & Output */}
            <div className="lg:col-span-7 space-y-5">
              <section className="glass-secondary glass-rim rounded-[22px] p-6 space-y-5 overflow-visible">
                {staged.info.supportLevel === 'unavailable' || staged.info.compatibleOutputs.length === 0 ? (
                  <div className="rounded-xl border border-amber-500/35 bg-amber-500/10 p-4 flex items-start gap-3">
                    <AlertCircle className="w-5 h-5 text-amber-500 dark:text-amber-300 shrink-0 mt-0.5" />
                    <div>
                      <p className="text-sm font-medium text-[var(--text-primary)]">
                        {staged.info.detectedExt.toUpperCase()} requires an external engine adapter
                      </p>
                      <p className="text-xs text-[var(--text-muted)] mt-1">
                        {staged.info.notes ||
                          'This format is cataloged in the compatibility matrix but its native binary engine is not installed in this container.'}
                      </p>
                    </div>
                  </div>
                ) : (
                  <>
                    {/* Smart Recommendations */}
                    {staged.info.recommendedOutputs.length > 0 && (
                      <div className="space-y-2.5">
                        <div className="flex items-center gap-2 text-xs text-[var(--text-muted)]">
                          <Sparkles className="w-3.5 h-3.5 text-[var(--text-primary)]" />
                          <span>Smart Output Recommendations</span>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                          {staged.info.recommendedOutputs.map((rec) => {
                            const active = staged.targetFormat === rec.format;
                            return (
                              <motion.button
                                key={rec.format}
                                type="button"
                                whileTap={{ scale: 0.985 }}
                                onClick={() => onUpdateStaged({ targetFormat: rec.format })}
                                className={`rounded-xl border p-3.5 text-left transition-all cursor-pointer ${
                                  active
                                    ? 'border-zinc-900 bg-black/8 dark:border-white dark:bg-white/14'
                                    : 'glass-interactive'
                                }`}
                              >
                                <div className="flex items-center justify-between">
                                  <span className="font-mono text-sm font-semibold text-[var(--text-primary)]">
                                    {rec.format.toUpperCase()}
                                  </span>
                                  <span className="text-xs text-[var(--text-muted)]">{rec.badge}</span>
                                </div>
                                <p className="text-xs text-[var(--text-muted)] mt-1 line-clamp-2">{rec.reason}</p>
                              </motion.button>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* Compatible Output Selector & Primary Convert CTA */}
                    <div className="flex flex-wrap items-end justify-between gap-3 pt-3 border-t border-black/10 dark:border-white/10">
                      <div className="flex-1 min-w-[200px]">
                        <label
                          htmlFor="target-format-select"
                          className="block text-xs text-[var(--text-muted)] mb-1.5"
                        >
                          {srcFormatDef?.operationKind === 'transpilation'
                            ? 'Target Compilation Output'
                            : 'Compatible Output Format'}
                        </label>
                        <GlassDropdown
                          id="target-format-select"
                          ariaLabel="Compatible Output Format"
                          searchable={staged.info.compatibleOutputs.length > 6}
                          value={staged.targetFormat}
                          onChange={(v) => onUpdateStaged({ targetFormat: v })}
                          options={staged.info.compatibleOutputs.map((ext) => ({
                            value: ext,
                            label: ext.toUpperCase(),
                            sublabel: getFormatByExtension(ext)?.name,
                          }))}
                        />
                      </div>

                      <motion.button
                        type="button"
                        whileTap={{ scale: 0.97 }}
                        onClick={() => onToggleFavorite(pairKey)}
                        aria-label={`Favorite ${pairKey}`}
                        className="glass-interactive inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2.5 text-xs text-[var(--text-primary)] cursor-pointer"
                      >
                        <Star
                          className={`w-3.5 h-3.5 ${
                            isFav
                              ? 'fill-zinc-900 text-zinc-900 dark:fill-white dark:text-white'
                              : 'text-[var(--text-muted)]'
                          }`}
                        />
                        {isFav ? 'Favorited' : 'Pin Pair'}
                      </motion.button>

                      <motion.button
                        type="button"
                        whileTap={{ scale: 0.98 }}
                        disabled={staged.converting || !staged.targetFormat}
                        onClick={onConvert}
                        className="inline-flex items-center gap-2 rounded-xl bg-zinc-900 text-white dark:bg-white dark:text-black px-6 py-2.5 text-sm font-medium hover:opacity-90 disabled:opacity-40 transition-opacity whitespace-nowrap shrink-0 cursor-pointer"
                      >
                        {staged.converting && <Loader2 className="w-4 h-4 animate-spin" />}
                        {staged.converting
                          ? 'Converting...'
                          : srcFormatDef?.operationKind === 'transpilation'
                          ? `Compile to ${staged.targetFormat.toUpperCase()}`
                          : `Convert to ${staged.targetFormat.toUpperCase()}`}
                      </motion.button>
                    </div>

                    {/* Active Conversion Progress Bar */}
                    <AnimatePresence>
                      {staged.converting && (
                        <motion.div
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: 'auto' }}
                          exit={{ opacity: 0, height: 0 }}
                          className="space-y-1.5"
                        >
                          <div className="flex items-center justify-between text-xs text-[var(--text-muted)]">
                            <span>Running conversion pipeline...</span>
                            <span className="font-mono">{staged.targetFormat.toUpperCase()}</span>
                          </div>
                          <div className="h-1.5 w-full rounded-full bg-black/10 dark:bg-white/10 overflow-hidden">
                            <motion.div
                              initial={{ x: '-60%' }}
                              animate={{ x: '100%' }}
                              transition={{ repeat: Infinity, duration: 1.1, ease: 'linear' }}
                              className="h-full w-1/2 rounded-full bg-zinc-900 dark:bg-white"
                            />
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>

                    {/* Progressive Disclosure Conversion Settings */}
                    <div className="pt-3 border-t border-black/10 dark:border-white/10">
                      <button
                        type="button"
                        aria-expanded={advancedOpen}
                        onClick={() => setAdvancedOpen((v) => !v)}
                        className="w-full flex items-center justify-between text-xs font-medium text-[var(--text-primary)] py-1 cursor-pointer"
                      >
                        <span className="inline-flex items-center gap-2">
                          <SlidersHorizontal className="w-3.5 h-3.5 text-[var(--text-muted)]" />
                          Conversion Settings
                        </span>
                        <ChevronDown
                          className={`w-4 h-4 text-[var(--text-muted)] transition-transform duration-200 ${
                            advancedOpen ? 'rotate-180' : ''
                          }`}
                        />
                      </button>

                      <AnimatePresence initial={false}>
                        {advancedOpen && (
                          <motion.div
                            variants={ACCORDION_VARIANTS}
                            initial="initial"
                            animate="animate"
                            exit="exit"
                            className="pt-3"
                          >
                            <ConversionOptionsPanel
                              category={staged.info.category}
                              sourceExt={staged.info.detectedExt}
                              targetExt={staged.targetFormat}
                              options={staged.options}
                              onChange={(next) => onUpdateStaged({ options: next })}
                              availableSheets={
                                Array.isArray(staged.info.details.sheets)
                                  ? (staged.info.details.sheets as string[])
                                  : undefined
                              }
                            />
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  </>
                )}

                {/* Error State */}
                {staged.error && (
                  <div className="rounded-xl border border-red-500/35 bg-red-500/10 p-4 flex items-start gap-3">
                    <AlertCircle className="w-4 h-4 text-red-500 dark:text-red-400 shrink-0 mt-0.5" />
                    <p className="text-xs text-red-700 dark:text-red-200">{staged.error}</p>
                  </div>
                )}
              </section>

              {/* Converted Result & After Preview */}
              <AnimatePresence>
                {staged.job && staged.job.status === 'completed' && (
                  <motion.section
                    key={staged.job.id}
                    initial={{ opacity: 0, y: 14 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 8 }}
                    transition={{ duration: 0.28, ease: MOTION_EASE }}
                    className="glass-secondary glass-rim rounded-[22px] p-6 space-y-4"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-4">
                      <div className="flex items-start gap-3">
                        <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                        <div>
                          <h4 className="font-display text-base font-semibold text-[var(--text-primary)]">
                            Conversion Complete · {staged.job.targetExt.toUpperCase()}
                          </h4>
                          <p className="text-xs text-[var(--text-muted)] mt-0.5 tabular-nums">
                            {formatBytes(staged.job.inputSizeBytes)} → {formatBytes(staged.job.outputSizeBytes)}
                            {(() => {
                              const d = formatDeltaPercent(
                                staged.job.inputSizeBytes,
                                staged.job.outputSizeBytes
                              );
                              return d ? ` (${d.text})` : '';
                            })()}
                            {staged.job.engineUsed ? ` · ${staged.job.engineUsed}` : ''}
                          </p>
                          {staged.note && <p className="text-xs text-[var(--text-soft)] mt-1">{staged.note}</p>}
                        </div>
                      </div>

                      {staged.job.downloadUrl && (
                        <a
                          href={staged.job.downloadUrl}
                          className="inline-flex items-center gap-2 rounded-xl bg-zinc-900 text-white dark:bg-white dark:text-black px-5 py-2.5 text-xs font-medium hover:opacity-90 transition-opacity whitespace-nowrap shrink-0"
                        >
                          <Download className="w-3.5 h-3.5" />
                          Download {staged.job.targetExt.toUpperCase()}
                        </a>
                      )}
                    </div>

                    <div className="pt-3 border-t border-black/10 dark:border-white/10 space-y-2">
                      <p className="text-xs text-[var(--text-muted)]">After Conversion Preview</p>
                      <PreviewPanel
                        kind={staged.job.previewKind}
                        url={staged.job.previewUrl}
                        data={staged.outputPreviewData}
                        label={staged.job.outputName || staged.job.originalName}
                        ext={staged.job.targetExt}
                      />
                    </div>
                  </motion.section>
                )}
              </AnimatePresence>
            </div>
          </motion.div>
      )}
    </div>
  );
}
