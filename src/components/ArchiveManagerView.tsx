import { useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'motion/react';
import {
  AlertTriangle,
  Archive,
  CheckCircle2,
  Diff,
  Download,
  Eye,
  FilePlus2,
  FolderArchive,
  FolderUp,
  KeyRound,
  Loader2,
  Pencil,
  Play,
  Search,
  ShieldCheck,
  Trash2,
  Upload,
} from 'lucide-react';
import { ARCHIVE_FORMAT_MATRIX } from '../shared/formats';
import type {
  ArchiveInspectReport,
  ConversionJob,
  IdentifiedFileMetadata,
  SavedPreset,
  ToolKind,
} from '../shared/types';
import { estimateArchiveFootprint } from '../utils/processingIntelligence';
import { formatBytes } from '../utils/formatters';
import { SPRING_SNAPPY } from '../utils/motion';
import { GlassSurface } from './glass/GlassSurface';
import { GlassDropdown } from './glass/GlassDropdown';
import { GlassModal } from './glass/GlassModal';
import { ToolHandoffBar } from './ToolHandoffBar';

interface ArchiveManagerViewProps {
  promotedInput?: { uploadToken: string; info: IdentifiedFileMetadata } | null;
  appliedPreset?: Record<string, unknown> | null;
  onClearPromotedInput?: () => void;
  onRefreshJobs: () => Promise<void>;
  onPromoteToTool: (jobId: string, targetTool: Exclude<ToolKind, 'workflow'>) => Promise<void>;
  onSavePreset: (preset: Omit<SavedPreset, 'id' | 'createdAt'>) => Promise<void>;
  onShowToast: (msg: string, kind?: 'info' | 'error') => void;
}

type SubTab = 'inspect' | 'create' | 'batch-extract' | 'modify-compare' | 'matrix';

interface BatchArchiveExtractItem {
  localId: string;
  uploadToken: string;
  originalName: string;
  ext: string;
  entryCount: number;
  sizeBytes: number;
  password: string;
  status: 'queued' | 'processing' | 'completed' | 'failed';
  job?: ConversionJob;
  extractedCount?: number;
  error?: string;
}

const ARCHIVE_EXTS = new Set(['zip', '7z', 'tar', 'tgz', 'gz', 'bz2', 'xz', 'lzma', 'zst', 'cab', 'deb']);

export function ArchiveManagerView({
  promotedInput,
  appliedPreset,
  onClearPromotedInput,
  onRefreshJobs,
  onPromoteToTool,
  onSavePreset,
  onShowToast,
}: ArchiveManagerViewProps) {
  const inspectInputRef = useRef<HTMLInputElement | null>(null);
  const createInputRef = useRef<HTMLInputElement | null>(null);
  const createFolderInputRef = useRef<HTMLInputElement | null>(null);
  const batchExtractInputRef = useRef<HTMLInputElement | null>(null);
  const modifyAddInputRef = useRef<HTMLInputElement | null>(null);
  const compareAInputRef = useRef<HTMLInputElement | null>(null);
  const compareBInputRef = useRef<HTMLInputElement | null>(null);

  const [tab, setTab] = useState<SubTab>('inspect');

  // Inspect & Extract state
  const [stagedArc, setStagedArc] = useState<{
    uploadToken: string;
    originalName: string;
    ext: string;
    report: ArchiveInspectReport;
  } | null>(null);
  const [inspectPassword, setInspectPassword] = useState('');
  const [entryFilter, setEntryFilter] = useState('');
  const [selectedEntries, setSelectedEntries] = useState<string[]>([]);
  const [integrityResult, setIntegrityResult] = useState<{ ok: boolean; testedEntries: number; message: string } | null>(
    null
  );
  const [entryPreview, setEntryPreview] = useState<{
    name: string;
    kind: 'image' | 'text' | 'binary';
    text?: string;
    dataUrl?: string;
    size: number;
  } | null>(null);
  const [extractJob, setExtractJob] = useState<ConversionJob | null>(null);
  const [inspectBusy, setInspectBusy] = useState(false);
  const [inspectError, setInspectError] = useState<string | null>(null);

  // Create & Encrypt state
  const [createFiles, setCreateFiles] = useState<File[]>([]);
  const [archiveName, setArchiveName] = useState('aether_bundle');
  const [createFormat, setCreateFormat] = useState('zip');
  const [createLevel, setCreateLevel] = useState(6);
  const [createAlgo, setCreateAlgo] = useState('lzma2');
  const [createPassword, setCreatePassword] = useState('');
  const [splitSizeMb, setSplitSizeMb] = useState('0');
  const [creating, setCreating] = useState(false);
  const [createResult, setCreateResult] = useState<{
    job: ConversionJob;
    note: string;
    volumes?: { name: string; sizeBytes: number; downloadUrl: string }[];
  } | null>(null);
  const [createError, setCreateError] = useState<string | null>(null);

  // Modify state
  const [renameFrom, setRenameFrom] = useState('');
  const [renameTo, setRenameTo] = useState('');
  const [modifying, setModifying] = useState(false);
  const [modifyResult, setModifyResult] = useState<{ job: ConversionJob; note: string } | null>(null);

  // Compare state
  const [compareA, setCompareA] = useState<File | null>(null);
  const [compareB, setCompareB] = useState<File | null>(null);
  const [comparing, setComparing] = useState(false);
  const [compareDiff, setCompareDiff] = useState<{
    nameA: string;
    nameB: string;
    diff: {
      summary: { onlyInA: number; onlyInB: number; sizeChanged: number; identical: number };
      onlyInA: { name: string; size: number }[];
      onlyInB: { name: string; size: number }[];
      sizeChanged: { name: string; sizeA: number; sizeB: number }[];
    };
  } | null>(null);

  // Batch Extract queue state
  const [batchExtractItems, setBatchExtractItems] = useState<BatchArchiveExtractItem[]>([]);
  const [batchExtracting, setBatchExtracting] = useState(false);
  const [batchExtractPassword, setBatchExtractPassword] = useState('');

  // Handle preset applied from Saved Presets
  useEffect(() => {
    if (appliedPreset) {
      setTab('create');
      if (appliedPreset.format) setCreateFormat(String(appliedPreset.format));
      if (appliedPreset.level !== undefined) setCreateLevel(Number(appliedPreset.level));
      if (appliedPreset.algorithm) setCreateAlgo(String(appliedPreset.algorithm));
    }
  }, [appliedPreset]);

  // Handle promoted file from another tool
  useEffect(() => {
    if (!promotedInput) return;
    const ext = promotedInput.info.detectedExt.toLowerCase();
    if (ARCHIVE_EXTS.has(ext)) {
      setTab('inspect');
      inspectExistingToken(promotedInput.uploadToken, promotedInput.info.originalName, ext);
    } else {
      // Promote non-archive file directly into Archive Create workbench by fetching upload preview
      setTab('create');
      fetch(`/api/uploads/${promotedInput.uploadToken}/preview`)
        .then((r) => r.blob())
        .then((blob) => {
          const f = new File([blob], promotedInput.info.originalName, { type: blob.type });
          setCreateFiles((prev) => [...prev, f]);
        })
        .catch(() => {});
    }
    onClearPromotedInput?.();
  }, [promotedInput, onClearPromotedInput]);

  const inspectExistingToken = async (uploadToken: string, originalName: string, ext: string, pwd?: string) => {
    setInspectBusy(true);
    setInspectError(null);
    setIntegrityResult(null);
    setExtractJob(null);
    try {
      const res = await fetch('/api/archive/inspect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ uploadToken, originalName, ext, password: pwd || undefined }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Archive inspection failed.');
      setStagedArc({ uploadToken: data.uploadToken, originalName: data.originalName, ext, report: data.report });
      setSelectedEntries([]);
    } catch (err) {
      setInspectError(err instanceof Error ? err.message : 'Inspection failed.');
    } finally {
      setInspectBusy(false);
    }
  };

  const handleUploadInspect = async (file: File) => {
    setInspectBusy(true);
    setInspectError(null);
    setIntegrityResult(null);
    setExtractJob(null);
    try {
      const form = new FormData();
      form.append('file', file);
      if (inspectPassword) form.append('password', inspectPassword);
      const res = await fetch('/api/archive/inspect', { method: 'POST', body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Archive inspection failed.');
      const ext = data.report.format || file.name.split('.').pop()?.toLowerCase() || 'zip';
      setStagedArc({ uploadToken: data.uploadToken, originalName: data.originalName, ext, report: data.report });
      setSelectedEntries([]);
    } catch (err) {
      setInspectError(err instanceof Error ? err.message : 'Failed to inspect archive.');
    } finally {
      setInspectBusy(false);
    }
  };

  const handleLoadSampleArchive = async (ext: 'zip' | '7z') => {
    try {
      const res = await fetch(`/api/sample/${ext}`);
      if (!res.ok) throw new Error('Sample generation failed.');
      const blob = await res.blob();
      await handleUploadInspect(new File([blob], `sample_bundle.${ext}`, { type: blob.type }));
    } catch (err) {
      setInspectError(err instanceof Error ? err.message : 'Could not load sample archive.');
    }
  };

  const handleTestIntegrity = async () => {
    if (!stagedArc) return;
    setInspectBusy(true);
    try {
      const res = await fetch('/api/archive/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          uploadToken: stagedArc.uploadToken,
          ext: stagedArc.ext,
          password: inspectPassword || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Integrity test failed.');
      setIntegrityResult(data);
    } catch (err) {
      setInspectError(err instanceof Error ? err.message : 'Integrity test error.');
    } finally {
      setInspectBusy(false);
    }
  };

  const handlePreviewEntry = async (entryName: string) => {
    if (!stagedArc) return;
    try {
      const res = await fetch('/api/archive/entry-preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          uploadToken: stagedArc.uploadToken,
          ext: stagedArc.ext,
          entryName,
          password: inspectPassword || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Preview unavailable.');
      setEntryPreview({ name: entryName, ...data });
    } catch (err) {
      onShowToast(err instanceof Error ? err.message : 'Entry preview failed.', 'error');
    }
  };

  const handleExtractArchive = async (onlySelected: boolean) => {
    if (!stagedArc) return;
    setInspectBusy(true);
    setInspectError(null);
    try {
      const res = await fetch('/api/archive/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          uploadToken: stagedArc.uploadToken,
          ext: stagedArc.ext,
          originalName: stagedArc.originalName,
          selectedEntries: onlySelected && selectedEntries.length > 0 ? selectedEntries : undefined,
          password: inspectPassword || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Extraction failed.');
      setExtractJob(data.job);
      await onRefreshJobs();
      onShowToast(`Safely extracted ${data.extractedFiles.length} file(s).`);
    } catch (err) {
      setInspectError(err instanceof Error ? err.message : 'Extraction failed.');
    } finally {
      setInspectBusy(false);
    }
  };

  const handleLoadSampleBundle = async () => {
    try {
      const exts = ['yaml', 'json', 'svg'];
      const fetched: File[] = [];
      for (const ext of exts) {
        const res = await fetch(`/api/sample/${ext}`);
        const blob = await res.blob();
        fetched.push(new File([blob], `sample_${ext}.${ext}`, { type: blob.type }));
      }
      setCreateFiles((prev) => [...prev, ...fetched]);
    } catch {
      onShowToast('Failed to load sample bundle files.', 'error');
    }
  };

  const handleCreateArchive = async () => {
    if (createFiles.length === 0) return;
    setCreating(true);
    setCreateError(null);
    try {
      const form = new FormData();
      createFiles.forEach((f) => form.append('files', f));
      form.append('format', createFormat);
      form.append('level', String(createLevel));
      form.append('archiveName', archiveName || 'aether_bundle');
      if (createFormat === '7z') form.append('algorithm', createAlgo);
      if (createPassword && (createFormat === 'zip' || createFormat === '7z')) {
        form.append('password', createPassword);
      }
      if (Number(splitSizeMb) > 0 && (createFormat === 'zip' || createFormat === '7z')) {
        form.append('splitSizeMb', splitSizeMb);
      }

      const res = await fetch('/api/archive/create', { method: 'POST', body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Archive creation failed.');
      setCreateResult(data);
      await onRefreshJobs();
      onShowToast(data.note || 'Archive built.');
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : 'Failed to build archive.');
    } finally {
      setCreating(false);
    }
  };

  const handleModifyAction = async (action: 'add' | 'delete' | 'rename', addFilesList?: File[]) => {
    if (!stagedArc) return;
    setModifying(true);
    try {
      const form = new FormData();
      form.append('uploadToken', stagedArc.uploadToken);
      form.append('ext', stagedArc.ext);
      form.append('action', action);
      if (inspectPassword) form.append('password', inspectPassword);
      if (action === 'delete') form.append('deleteEntries', JSON.stringify(selectedEntries));
      if (action === 'rename') {
        form.append('renameFrom', renameFrom);
        form.append('renameTo', renameTo);
      }
      if (action === 'add' && addFilesList) {
        addFilesList.forEach((f) => form.append('addFiles', f));
      }

      const res = await fetch('/api/archive/modify', { method: 'POST', body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Archive modification failed.');
      setStagedArc((prev) =>
        prev ? { ...prev, uploadToken: data.nextUploadToken, report: data.report } : prev
      );
      setModifyResult({ job: data.job, note: data.note });
      setSelectedEntries([]);
      await onRefreshJobs();
      onShowToast(data.note);
    } catch (err) {
      onShowToast(err instanceof Error ? err.message : 'Modify failed.', 'error');
    } finally {
      setModifying(false);
    }
  };

  const handleCompare = async () => {
    if (!compareA || !compareB) return;
    setComparing(true);
    try {
      const form = new FormData();
      form.append('archiveA', compareA);
      form.append('archiveB', compareB);
      const res = await fetch('/api/archive/compare', { method: 'POST', body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Comparison failed.');
      setCompareDiff(data);
    } catch (err) {
      onShowToast(err instanceof Error ? err.message : 'Compare failed.', 'error');
    } finally {
      setComparing(false);
    }
  };

  const filteredEntries = useMemo(() => {
    if (!stagedArc) return [];
    const q = entryFilter.trim().toLowerCase();
    if (!q) return stagedArc.report.entries;
    return stagedArc.report.entries.filter((e) => e.name.toLowerCase().includes(q));
  }, [entryFilter, stagedArc]);

  const footprintEstimate = useMemo(
    () =>
      estimateArchiveFootprint(
        createFiles.map((f) => ({ name: f.name, size: f.size })),
        createFormat,
        createLevel
      ),
    [createFiles, createFormat, createLevel]
  );

  const handleQueueBatchArchives = async (files: File[]) => {
    const queued: BatchArchiveExtractItem[] = [];
    for (const f of files) {
      const form = new FormData();
      form.append('file', f);
      if (batchExtractPassword) form.append('password', batchExtractPassword);
      const res = await fetch('/api/archive/inspect', { method: 'POST', body: form });
      const data = await res.json();
      if (res.ok && data.report) {
        const ext = data.report.format || f.name.split('.').pop()?.toLowerCase() || 'zip';
        queued.push({
          localId: `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
          uploadToken: data.uploadToken,
          originalName: data.originalName || f.name,
          ext,
          entryCount: data.report.entryCount || 0,
          sizeBytes: f.size,
          password: batchExtractPassword,
          status: 'queued',
        });
      }
    }
    setBatchExtractItems((prev) => [...prev, ...queued]);
    onShowToast(`Queued ${queued.length} archive(s) for batch extraction.`);
  };

  const handleRunBatchExtract = async () => {
    setBatchExtracting(true);
    for (const item of batchExtractItems) {
      if (item.status === 'completed') continue;
      setBatchExtractItems((prev) =>
        prev.map((x) => (x.localId === item.localId ? { ...x, status: 'processing', error: undefined } : x))
      );
      try {
        const res = await fetch('/api/archive/extract', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            uploadToken: item.uploadToken,
            ext: item.ext,
            originalName: item.originalName,
            password: item.password || batchExtractPassword || undefined,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Extraction failed');
        setBatchExtractItems((prev) =>
          prev.map((x) =>
            x.localId === item.localId
              ? { ...x, status: 'completed', job: data.job, extractedCount: data.extractedFiles?.length || 0 }
              : x
          )
        );
      } catch (err) {
        setBatchExtractItems((prev) =>
          prev.map((x) =>
            x.localId === item.localId
              ? { ...x, status: 'failed', error: err instanceof Error ? err.message : 'Failed' }
              : x
          )
        );
      }
    }
    setBatchExtracting(false);
    await onRefreshJobs();
    onShowToast('Batch archive extraction complete.');
  };

  const handleBatchExtractZip = async () => {
    const jobIds = batchExtractItems.filter((i) => i.status === 'completed' && i.job?.id).map((i) => i.job!.id);
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
    a.download = `omnifiles_extracted_archives_${Date.now()}.zip`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      {/* Header & Workspace Sub-Tabs */}
      <GlassSurface as="div" className="rounded-[22px] p-5 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="font-display text-lg font-semibold text-[var(--text-primary)]">ZIP &amp; Archive Manager</h2>
          <p className="text-xs text-[var(--text-muted)] mt-0.5">
            Create, inspect, batch extract, test integrity, modify, split volumes, and encrypt archives with traversal &amp; bomb protection
          </p>
        </div>

        <div className="inline-flex flex-wrap gap-1 p-1 rounded-xl border border-black/10 dark:border-white/12 bg-black/4 dark:bg-black/35">
          {(
            [
              { id: 'inspect', label: 'Inspect & Extract' },
              { id: 'create', label: 'Create & Encrypt' },
              { id: 'batch-extract', label: `Batch Extract (${batchExtractItems.length})` },
              { id: 'modify-compare', label: 'Modify & Compare' },
              { id: 'matrix', label: 'Format Matrix' },
            ] as { id: SubTab; label: string }[]
          ).map((t) => {
            const active = tab === t.id;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                className="relative px-3 py-1.5 rounded-lg text-xs font-medium cursor-pointer whitespace-nowrap"
              >
                {active && (
                  <motion.span
                    layoutId="arc-subtab-pill"
                    transition={SPRING_SNAPPY}
                    className="absolute inset-0 rounded-lg bg-zinc-900 dark:bg-white"
                  />
                )}
                <span
                  className={`relative z-10 ${
                    active ? 'text-white dark:text-black' : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                  }`}
                >
                  {t.label}
                </span>
              </button>
            );
          })}
        </div>
      </GlassSurface>

      {/* SUB-TAB 1: INSPECT & EXTRACT */}
      {tab === 'inspect' && (
        <div className="space-y-5">
          <input
            ref={inspectInputRef}
            type="file"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleUploadInspect(f);
              e.target.value = '';
            }}
          />

          {!stagedArc ? (
            <GlassSurface as="section" className="rounded-[24px] p-12 text-center space-y-4">
              <FolderArchive className="w-8 h-8 text-[var(--text-muted)] mx-auto" />
              <h3 className="font-display text-lg font-medium text-[var(--text-primary)]">
                Open an archive to browse contents, detect duplicates, or extract safely
              </h3>
              <p className="text-xs text-[var(--text-muted)] max-w-md mx-auto leading-relaxed">
                Supports ZIP, 7Z, TAR, TGZ, GZ, BZ2, XZ, LZMA, ZST, CAB, and DEB inspection with automatic Zip-Slip &amp; bomb guard checks.
              </p>
              <div className="flex flex-wrap justify-center gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => inspectInputRef.current?.click()}
                  className="rounded-xl bg-zinc-900 text-white dark:bg-white dark:text-black px-5 py-2.5 text-xs font-medium hover:opacity-90 cursor-pointer"
                >
                  Open Archive File
                </button>
                <button
                  type="button"
                  onClick={() => handleLoadSampleArchive('zip')}
                  className="glass-interactive rounded-xl px-4 py-2.5 text-xs text-[var(--text-primary)] cursor-pointer"
                >
                  Sample ZIP
                </button>
                <button
                  type="button"
                  onClick={() => handleLoadSampleArchive('7z')}
                  className="glass-interactive rounded-xl px-4 py-2.5 text-xs text-[var(--text-primary)] cursor-pointer"
                >
                  Sample 7Z
                </button>
              </div>
              {inspectError && <p className="text-xs text-red-500 pt-2">{inspectError}</p>}
            </GlassSurface>
          ) : (
            <>
              <GlassSurface as="section" className="rounded-[22px] p-5 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-xs text-[var(--text-secondary)]">Loaded Archive</p>
                    <h3 className="font-display text-base font-semibold text-[var(--text-primary)]">
                      {stagedArc.originalName}
                    </h3>
                    <p className="text-xs text-[var(--text-muted)] tabular-nums mt-0.5">
                      {stagedArc.report.format.toUpperCase()} · {stagedArc.report.entryCount} entries ·{' '}
                      {formatBytes(stagedArc.report.fileSizeBytes)} compressed →{' '}
                      {formatBytes(stagedArc.report.totalUncompressedBytes)} expanded (
                      {stagedArc.report.compressionRatioPct}% saved)
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <div className="relative">
                      <KeyRound className="w-3.5 h-3.5 text-[var(--text-secondary)] absolute left-2.5 top-1/2 -translate-y-1/2" />
                      <input
                        type="password"
                        value={inspectPassword}
                        onChange={(e) => setInspectPassword(e.target.value)}
                        placeholder="Password (if encrypted)"
                        className="rounded-xl border border-[var(--control-border)] bg-[var(--input-bg)] pl-8 pr-3 py-1.5 text-xs text-[var(--text-primary)] w-44"
                      />
                    </div>
                    <button
                      type="button"
                      disabled={inspectBusy}
                      onClick={handleTestIntegrity}
                      className="glass-interactive inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs text-[var(--text-primary)] cursor-pointer"
                    >
                      <ShieldCheck className="w-3.5 h-3.5" />
                      Test Integrity
                    </button>
                    <button
                      type="button"
                      onClick={() => inspectInputRef.current?.click()}
                      className="glass-interactive rounded-xl px-3 py-1.5 text-xs text-[var(--text-primary)] cursor-pointer"
                    >
                      Open Another
                    </button>
                  </div>
                </div>

                {stagedArc.report.bombRiskWarning && (
                  <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 flex items-start gap-2.5 text-xs text-amber-700 dark:text-amber-300">
                    <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                    <span>{stagedArc.report.bombRiskWarning}</span>
                  </div>
                )}

                {stagedArc.report.duplicateGroups.length > 0 && (
                  <div className="rounded-xl border border-black/10 dark:border-white/12 p-3 text-xs">
                    <p className="font-medium text-[var(--text-primary)]">
                      Duplicate Entries Detected ({stagedArc.report.duplicateGroups.length} group(s)):
                    </p>
                    <p className="text-[var(--text-muted)] mt-0.5">
                      {stagedArc.report.duplicateGroups
                        .slice(0, 3)
                        .map((g) => `${g.names.join(' = ')} (${formatBytes(g.size)})`)
                        .join(' · ')}
                    </p>
                  </div>
                )}

                {integrityResult && (
                  <div className="rounded-xl border border-emerald-500/35 bg-emerald-500/10 p-3 flex items-center gap-2 text-xs text-[var(--text-primary)]">
                    <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                    <span>{integrityResult.message}</span>
                  </div>
                )}

                {/* Search & Selective Extraction Actions */}
                <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-black/10 dark:border-white/10">
                  <div className="relative flex-1 min-w-[200px] max-w-sm">
                    <Search className="w-3.5 h-3.5 text-[var(--text-secondary)] absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={entryFilter}
                      onChange={(e) => setEntryFilter(e.target.value)}
                      placeholder="Filter entries by path or filename..."
                      className="w-full rounded-xl border border-[var(--control-border)] bg-[var(--input-bg)] pl-8 pr-3 py-1.5 text-xs text-[var(--text-primary)]"
                    />
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {selectedEntries.length > 0 && (
                      <button
                        type="button"
                        disabled={inspectBusy}
                        onClick={() => handleExtractArchive(true)}
                        className="glass-interactive rounded-xl px-3.5 py-2 text-xs font-medium text-[var(--text-primary)] cursor-pointer"
                      >
                        Extract Selected ({selectedEntries.length})
                      </button>
                    )}
                    <button
                      type="button"
                      disabled={inspectBusy}
                      onClick={() => handleExtractArchive(false)}
                      className="inline-flex items-center gap-1.5 rounded-xl bg-zinc-900 text-white dark:bg-white dark:text-black px-4 py-2 text-xs font-medium hover:opacity-90 cursor-pointer"
                    >
                      {inspectBusy && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                      Extract All Safely (ZIP)
                    </button>
                  </div>
                </div>

                {/* Entries Table */}
                <div className="overflow-x-auto max-h-[360px] overflow-y-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-black/10 dark:border-white/10 text-[var(--text-muted)]">
                        <th className="py-2 pr-3 w-8">Sel</th>
                        <th className="py-2 pr-4 font-medium">Entry Path</th>
                        <th className="py-2 pr-4 font-medium">Uncompressed</th>
                        <th className="py-2 pr-4 font-medium">Encrypted</th>
                        <th className="py-2 text-right font-medium">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-black/8 dark:divide-white/8">
                      {filteredEntries.map((entry) => {
                        const checked = selectedEntries.includes(entry.name);
                        return (
                          <tr key={entry.name} className="hover:bg-black/4 dark:hover:bg-white/4">
                            <td className="py-2.5 pr-3">
                              {!entry.isDirectory && (
                                <input
                                  type="checkbox"
                                  aria-label={`Select ${entry.name}`}
                                  checked={checked}
                                  onChange={(e) =>
                                    setSelectedEntries((prev) =>
                                      e.target.checked ? [...prev, entry.name] : prev.filter((x) => x !== entry.name)
                                    )
                                  }
                                  className="accent-zinc-900 dark:accent-white cursor-pointer"
                                />
                              )}
                            </td>
                            <td className="py-2.5 pr-4 font-mono text-[var(--text-primary)] truncate max-w-[320px]">
                              {entry.isDirectory ? `${entry.name}/` : entry.name}
                            </td>
                            <td className="py-2.5 pr-4 text-[var(--text-muted)] tabular-nums">
                              {entry.isDirectory ? 'DIR' : formatBytes(entry.size)}
                            </td>
                            <td className="py-2.5 pr-4 text-[var(--text-secondary)]">
                              {entry.encrypted ? 'AES/Pwd' : 'No'}
                            </td>
                            <td className="py-2.5 text-right whitespace-nowrap space-x-3">
                              {!entry.isDirectory && (
                                <>
                                  <button
                                    type="button"
                                    onClick={() => handlePreviewEntry(entry.name)}
                                    className="inline-flex items-center gap-1 text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer"
                                  >
                                    <Eye className="w-3.5 h-3.5" />
                                    Preview
                                  </button>
                                  <a
                                    href={`/api/archive/entry-download?uploadToken=${encodeURIComponent(stagedArc.uploadToken)}&ext=${encodeURIComponent(stagedArc.ext)}&entryName=${encodeURIComponent(entry.name)}${inspectPassword ? `&password=${encodeURIComponent(inspectPassword)}` : ''}`}
                                    className="inline-flex items-center gap-1 text-[var(--text-primary)] hover:underline"
                                  >
                                    <Download className="w-3.5 h-3.5" />
                                    Save
                                  </a>
                                </>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {inspectError && <p className="text-xs text-red-500">{inspectError}</p>}

                {extractJob?.downloadUrl && (
                  <div className="pt-3 border-t border-black/10 dark:border-white/10 flex flex-wrap items-center justify-between gap-3">
                    <span className="text-xs text-[var(--text-primary)] font-medium">
                      Extracted bundle ready ({formatBytes(extractJob.outputSizeBytes)})
                    </span>
                    <a
                      href={extractJob.downloadUrl}
                      className="inline-flex items-center gap-1.5 rounded-xl bg-zinc-900 text-white dark:bg-white dark:text-black px-4 py-2 text-xs font-medium hover:opacity-90"
                    >
                      <Download className="w-3.5 h-3.5" />
                      Download Extracted ZIP
                    </a>
                  </div>
                )}
              </GlassSurface>
            </>
          )}
        </div>
      )}

      {/* SUB-TAB 2: CREATE & ENCRYPT */}
      {tab === 'create' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-5 space-y-5">
            <GlassSurface as="section" className="rounded-[22px] p-6 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="font-display text-base font-semibold text-[var(--text-primary)]">
                  Source Files ({createFiles.length})
                </h3>
                <div className="flex flex-wrap items-center gap-1.5">
                  <button
                    type="button"
                    onClick={handleLoadSampleBundle}
                    className="glass-interactive rounded-lg px-2.5 py-1 text-xs text-[var(--text-primary)] cursor-pointer"
                  >
                    Load 3 Samples
                  </button>
                  <button
                    type="button"
                    onClick={() => createFolderInputRef.current?.click()}
                    className="glass-interactive inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs text-[var(--text-primary)] cursor-pointer"
                  >
                    <FolderUp className="w-3 h-3" />
                    Add Folder
                  </button>
                  <button
                    type="button"
                    onClick={() => createInputRef.current?.click()}
                    className="rounded-lg bg-zinc-900 text-white dark:bg-white dark:text-black px-3 py-1 text-xs font-medium cursor-pointer"
                  >
                    Add Files
                  </button>
                </div>
                <input
                  ref={createInputRef}
                  type="file"
                  multiple
                  className="hidden"
                  onChange={(e) => {
                    const files = Array.from(e.target.files || []);
                    if (files.length > 0) setCreateFiles((prev) => [...prev, ...files]);
                    e.target.value = '';
                  }}
                />
                <input
                  ref={createFolderInputRef}
                  type="file"
                  multiple
                  {...({ webkitdirectory: '' } as Record<string, string>)}
                  className="hidden"
                  onChange={(e) => {
                    const files = Array.from(e.target.files || []);
                    if (files.length > 0) setCreateFiles((prev) => [...prev, ...files]);
                    e.target.value = '';
                  }}
                />
              </div>

              {createFiles.length === 0 ? (
                <div className="py-10 text-center border border-dashed border-black/12 dark:border-white/14 rounded-xl space-y-2">
                  <FilePlus2 className="w-6 h-6 text-[var(--text-secondary)] mx-auto" />
                  <p className="text-xs text-[var(--text-muted)]">Add files or click &ldquo;Load 3 Samples&rdquo; to bundle.</p>
                </div>
              ) : (
                <div className="divide-y divide-black/8 dark:divide-white/8 max-h-[300px] overflow-y-auto">
                  {createFiles.map((f, idx) => (
                    <div key={`${f.name}-${idx}`} className="py-2 flex items-center justify-between text-xs">
                      <span className="text-[var(--text-primary)] truncate pr-3">{f.name}</span>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-[var(--text-secondary)] tabular-nums">{formatBytes(f.size)}</span>
                        <button
                          type="button"
                          onClick={() => setCreateFiles((prev) => prev.filter((_, i) => i !== idx))}
                          className="text-[var(--text-secondary)] hover:text-[var(--text-primary)] cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {createFiles.length > 0 && (
                <div className="pt-3 border-t border-black/10 dark:border-white/10 text-xs flex items-center justify-between tabular-nums">
                  <span className="text-[var(--text-muted)]">
                    Total Input: {formatBytes(footprintEstimate.totalInputBytes)}
                  </span>
                  <span className="font-mono text-[var(--text-primary)]">
                    Est. Output: ~{formatBytes(footprintEstimate.estimatedOutputBytes)} ({footprintEstimate.estimatedReductionPct}% saved)
                  </span>
                </div>
              )}
            </GlassSurface>
          </div>

          <div className="lg:col-span-7 space-y-5">
            <section className="glass-secondary glass-rim rounded-[22px] p-6 space-y-5 overflow-visible">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                <div>
                  <label className="block text-[var(--text-muted)] mb-1">Archive Filename</label>
                  <input
                    type="text"
                    value={archiveName}
                    onChange={(e) => setArchiveName(e.target.value)}
                    className="w-full rounded-xl border border-[var(--control-border)] bg-[var(--input-bg)] px-3 py-2 text-xs text-[var(--text-primary)]"
                  />
                </div>
                <div>
                  <label className="block text-[var(--text-muted)] mb-1">Container Format</label>
                  <GlassDropdown
                    size="sm"
                    ariaLabel="Archive Container Format"
                    value={createFormat}
                    onChange={setCreateFormat}
                    options={[
                      { value: 'zip', label: 'ZIP', sublabel: 'Universal + AES-256' },
                      { value: '7z', label: '7Z', sublabel: 'LZMA2 Ultra Ratio' },
                      { value: 'tgz', label: 'TGZ', sublabel: 'Gzipped TAR' },
                      { value: 'tar', label: 'TAR', sublabel: 'Uncompressed tape' },
                      { value: 'bz2', label: 'BZ2', sublabel: 'BZip2 TAR' },
                      { value: 'xz', label: 'XZ', sublabel: 'LZMA TAR' },
                    ]}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                <div>
                  <span className="text-[var(--text-muted)]">Compression Level ({createLevel}/9)</span>
                  <input
                    type="range"
                    min={0}
                    max={9}
                    value={createLevel}
                    onChange={(e) => setCreateLevel(Number(e.target.value))}
                    className="w-full accent-zinc-900 dark:accent-white mt-2 cursor-pointer"
                  />
                </div>

                {createFormat === '7z' && (
                  <div>
                    <label className="block text-[var(--text-muted)] mb-1">7-Zip Algorithm</label>
                    <GlassDropdown
                      size="sm"
                      ariaLabel="7-Zip Algorithm"
                      value={createAlgo}
                      onChange={setCreateAlgo}
                      options={[
                        { value: 'lzma2', label: 'LZMA2 (Multi-thread Default)' },
                        { value: 'lzma', label: 'LZMA' },
                        { value: 'bzip2', label: 'BZip2' },
                        { value: 'ppmd', label: 'PPMd (Best for text)' },
                      ]}
                    />
                  </div>
                )}

                {(createFormat === 'zip' || createFormat === '7z') && (
                  <>
                    <div>
                      <label className="block text-[var(--text-muted)] mb-1">
                        AES-256 Encryption Password (Optional)
                      </label>
                      <input
                        type="password"
                        value={createPassword}
                        onChange={(e) => setCreatePassword(e.target.value)}
                        placeholder="Leave blank for unencrypted"
                        className="w-full rounded-xl border border-[var(--control-border)] bg-[var(--input-bg)] px-3 py-2 text-xs text-[var(--text-primary)]"
                      />
                    </div>
                    <div>
                      <label className="block text-[var(--text-muted)] mb-1">Split Volume Limit (MB)</label>
                      <GlassDropdown
                        size="sm"
                        ariaLabel="Split Volume Limit"
                        value={splitSizeMb}
                        onChange={setSplitSizeMb}
                        options={[
                          { value: '0', label: 'Single File (No Split)' },
                          { value: '1', label: '1 MB per volume (.001, .002...)' },
                          { value: '5', label: '5 MB per volume' },
                          { value: '10', label: '10 MB per volume' },
                          { value: '25', label: '25 MB per volume' },
                        ]}
                      />
                    </div>
                  </>
                )}
              </div>

              <button
                type="button"
                disabled={createFiles.length === 0 || creating}
                onClick={handleCreateArchive}
                className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-zinc-900 text-white dark:bg-white dark:text-black px-5 py-3 text-sm font-medium hover:opacity-90 disabled:opacity-40 cursor-pointer"
              >
                {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Archive className="w-4 h-4" />}
                {creating ? 'Packing Archive...' : `Build ${createFormat.toUpperCase()} Archive`}
              </button>

              {createError && <p className="text-xs text-red-500">{createError}</p>}
            </section>

            {createResult && (
              <GlassSurface as="section" className="rounded-[22px] p-5 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h4 className="font-display text-sm font-semibold text-[var(--text-primary)]">
                      {createResult.job.originalName} Built
                    </h4>
                    <p className="text-xs text-[var(--text-muted)] mt-0.5 tabular-nums">
                      {formatBytes(createResult.job.outputSizeBytes)} · {createResult.note}
                    </p>
                  </div>
                  {createResult.job.downloadUrl && (
                    <a
                      href={createResult.job.downloadUrl}
                      className="inline-flex items-center gap-1.5 rounded-xl bg-zinc-900 text-white dark:bg-white dark:text-black px-4 py-2 text-xs font-medium hover:opacity-90"
                    >
                      <Download className="w-3.5 h-3.5" />
                      Download {createResult.volumes ? 'All Volumes ZIP' : createResult.job.targetExt.toUpperCase()}
                    </a>
                  )}
                </div>

                {createResult.volumes && createResult.volumes.length > 0 && (
                  <div className="pt-2 border-t border-black/10 dark:border-white/10 space-y-1.5 text-xs">
                    <p className="text-[var(--text-muted)]">Split Volume Parts:</p>
                    <div className="flex flex-wrap gap-2">
                      {createResult.volumes.map((v) => (
                        <a
                          key={v.name}
                          href={v.downloadUrl}
                          className="glass-interactive rounded-lg px-2.5 py-1 font-mono text-[var(--text-primary)] inline-flex items-center gap-1.5"
                        >
                          <Download className="w-3 h-3" />
                          {v.name} ({formatBytes(v.sizeBytes)})
                        </a>
                      ))}
                    </div>
                  </div>
                )}

                <ToolHandoffBar
                  job={createResult.job}
                  currentTool="archive"
                  onPromoteToTool={onPromoteToTool}
                  presetConfig={{ format: createFormat, level: createLevel, algorithm: createAlgo }}
                  presetDescription={`${createFormat.toUpperCase()} Level ${createLevel} archive preset`}
                  onSavePreset={onSavePreset}
                />
              </GlassSurface>
            )}
          </div>
        </div>
      )}

      {/* SUB-TAB 2B: BATCH ARCHIVE EXTRACTION */}
      {tab === 'batch-extract' && (
        <GlassSurface as="section" className="rounded-[22px] p-6 space-y-5">
          <input
            ref={batchExtractInputRef}
            type="file"
            multiple
            className="hidden"
            onChange={(e) => {
              const files = Array.from(e.target.files || []);
              if (files.length > 0) handleQueueBatchArchives(files);
              e.target.value = '';
            }}
          />
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h3 className="font-display text-base font-semibold text-[var(--text-primary)]">
                Batch Archive Extraction ({batchExtractItems.length} archives)
              </h3>
              <p className="text-xs text-[var(--text-muted)] mt-0.5">
                Upload multiple ZIP, 7Z, TAR, TGZ, BZ2, or XZ archives and safely extract each with Zip-Slip protection.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <input
                type="password"
                value={batchExtractPassword}
                onChange={(e) => setBatchExtractPassword(e.target.value)}
                placeholder="Shared password (optional)"
                className="rounded-xl border border-[var(--control-border)] bg-[var(--input-bg)] px-3 py-2 text-xs text-[var(--text-primary)] w-44"
              />
              <button
                type="button"
                onClick={() => batchExtractInputRef.current?.click()}
                className="glass-interactive inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs text-[var(--text-primary)] cursor-pointer"
              >
                <Upload className="w-3.5 h-3.5" />
                Add Archives
              </button>
              {batchExtractItems.some((i) => i.status === 'completed') && (
                <button
                  type="button"
                  onClick={handleBatchExtractZip}
                  className="glass-interactive inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs text-[var(--text-primary)] cursor-pointer"
                >
                  <FolderArchive className="w-3.5 h-3.5" />
                  Download All ZIP
                </button>
              )}
              <button
                type="button"
                disabled={batchExtracting || batchExtractItems.length === 0}
                onClick={handleRunBatchExtract}
                className="inline-flex items-center gap-1.5 rounded-xl bg-zinc-900 text-white dark:bg-white dark:text-black px-4 py-2 text-xs font-medium disabled:opacity-40 cursor-pointer"
              >
                {batchExtracting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
                {batchExtracting ? 'Extracting...' : `Extract All (${batchExtractItems.length})`}
              </button>
            </div>
          </div>

          {batchExtractItems.length === 0 ? (
            <div className="py-10 text-center border border-dashed border-black/12 dark:border-white/14 rounded-xl space-y-2">
              <FolderArchive className="w-7 h-7 text-[var(--text-secondary)] mx-auto" />
              <p className="text-xs text-[var(--text-muted)]">Add multiple archive files to inspect and batch extract.</p>
            </div>
          ) : (
            <div className="divide-y divide-black/8 dark:divide-white/8">
              {batchExtractItems.map((item) => (
                <div key={item.localId} className="py-3 flex flex-wrap items-center justify-between gap-3 text-xs">
                  <div className="min-w-0">
                    <p className="font-medium text-[var(--text-primary)] truncate">{item.originalName}</p>
                    <p className="text-[var(--text-secondary)] tabular-nums">
                      {item.ext.toUpperCase()} · {item.entryCount} entries · {formatBytes(item.sizeBytes)} · {item.status}
                      {item.extractedCount ? ` (${item.extractedCount} files extracted)` : ''}
                    </p>
                    {item.error && <p className="text-red-500 mt-0.5">{item.error}</p>}
                  </div>
                  <div className="flex items-center gap-3">
                    {item.job?.downloadUrl && (
                      <a href={item.job.downloadUrl} className="inline-flex items-center gap-1 text-[var(--text-primary)] underline">
                        <Download className="w-3.5 h-3.5" />
                        Download Extracted ZIP
                      </a>
                    )}
                    <button
                      type="button"
                      onClick={() => setBatchExtractItems((prev) => prev.filter((x) => x.localId !== item.localId))}
                      className="text-[var(--text-secondary)] hover:text-[var(--text-primary)] cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </GlassSurface>
      )}

      {/* SUB-TAB 3: MODIFY & COMPARE */}
      {tab === 'modify-compare' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Modify Loaded Archive */}
          <GlassSurface as="section" className="rounded-[22px] p-6 space-y-4">
            <div className="flex items-center justify-between gap-2">
              <h3 className="font-display text-base font-semibold text-[var(--text-primary)]">
                Modify Loaded ZIP / 7Z Archive
              </h3>
              <Pencil className="w-4 h-4 text-[var(--text-muted)]" />
            </div>

            {!stagedArc || (stagedArc.ext !== 'zip' && stagedArc.ext !== '7z') ? (
              <div className="py-8 text-center border border-dashed border-black/12 dark:border-white/14 rounded-xl space-y-3">
                <p className="text-xs text-[var(--text-muted)]">
                  Load a ZIP or 7Z archive in &ldquo;Inspect &amp; Extract&rdquo; first to add, rename, or delete entries.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setTab('inspect');
                    handleLoadSampleArchive('zip');
                  }}
                  className="glass-interactive rounded-xl px-4 py-2 text-xs text-[var(--text-primary)] cursor-pointer"
                >
                  Load Sample ZIP
                </button>
              </div>
            ) : (
              <div className="space-y-4 text-xs">
                <p className="text-[var(--text-muted)]">
                  Editing <span className="font-mono text-[var(--text-primary)]">{stagedArc.originalName}</span> ({stagedArc.report.entryCount} entries)
                </p>

                <div className="flex flex-wrap gap-2">
                  <input
                    ref={modifyAddInputRef}
                    type="file"
                    multiple
                    className="hidden"
                    onChange={(e) => {
                      const files = Array.from(e.target.files || []);
                      if (files.length > 0) handleModifyAction('add', files);
                      e.target.value = '';
                    }}
                  />
                  <button
                    type="button"
                    disabled={modifying}
                    onClick={() => modifyAddInputRef.current?.click()}
                    className="glass-interactive rounded-xl px-3.5 py-2 text-[var(--text-primary)] cursor-pointer"
                  >
                    + Add Files to Archive
                  </button>
                  <button
                    type="button"
                    disabled={modifying || selectedEntries.length === 0}
                    onClick={() => handleModifyAction('delete')}
                    className="glass-interactive rounded-xl px-3.5 py-2 text-[var(--text-primary)] disabled:opacity-40 cursor-pointer"
                  >
                    Delete Selected ({selectedEntries.length})
                  </button>
                </div>

                <div className="pt-3 border-t border-black/10 dark:border-white/10 space-y-2">
                  <span className="font-medium text-[var(--text-primary)] block">Rename Entry</span>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <input
                      type="text"
                      value={renameFrom}
                      onChange={(e) => setRenameFrom(e.target.value)}
                      placeholder="Current path (e.g. readme.txt)"
                      className="rounded-xl border border-[var(--control-border)] bg-[var(--input-bg)] px-3 py-1.5 text-xs text-[var(--text-primary)]"
                    />
                    <input
                      type="text"
                      value={renameTo}
                      onChange={(e) => setRenameTo(e.target.value)}
                      placeholder="New path (e.g. docs/README.md)"
                      className="rounded-xl border border-[var(--control-border)] bg-[var(--input-bg)] px-3 py-1.5 text-xs text-[var(--text-primary)]"
                    />
                  </div>
                  <button
                    type="button"
                    disabled={modifying || !renameFrom.trim() || !renameTo.trim()}
                    onClick={() => handleModifyAction('rename')}
                    className="rounded-xl bg-zinc-900 text-white dark:bg-white dark:text-black px-4 py-2 text-xs font-medium disabled:opacity-40 cursor-pointer"
                  >
                    Rename Entry
                  </button>
                </div>

                {modifyResult?.job.downloadUrl && (
                  <div className="pt-3 border-t border-black/10 dark:border-white/10 flex items-center justify-between">
                    <span className="text-[var(--text-soft)]">{modifyResult.note}</span>
                    <a
                      href={modifyResult.job.downloadUrl}
                      className="inline-flex items-center gap-1 font-medium text-[var(--text-primary)] underline"
                    >
                      <Download className="w-3.5 h-3.5" />
                      Download Modified
                    </a>
                  </div>
                )}
              </div>
            )}
          </GlassSurface>

          {/* Compare Two Archives */}
          <GlassSurface as="section" className="rounded-[22px] p-6 space-y-4">
            <div className="flex items-center justify-between gap-2">
              <h3 className="font-display text-base font-semibold text-[var(--text-primary)]">
                Compare Two Archives (Diff)
              </h3>
              <Diff className="w-4 h-4 text-[var(--text-muted)]" />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div>
                <input
                  ref={compareAInputRef}
                  type="file"
                  className="hidden"
                  onChange={(e) => setCompareA(e.target.files?.[0] || null)}
                />
                <button
                  type="button"
                  onClick={() => compareAInputRef.current?.click()}
                  className="w-full glass-interactive rounded-xl p-3 text-left cursor-pointer truncate"
                >
                  <span className="text-[var(--text-secondary)] block">Archive A</span>
                  <span className="font-mono text-[var(--text-primary)]">
                    {compareA ? compareA.name : 'Select first archive...'}
                  </span>
                </button>
              </div>
              <div>
                <input
                  ref={compareBInputRef}
                  type="file"
                  className="hidden"
                  onChange={(e) => setCompareB(e.target.files?.[0] || null)}
                />
                <button
                  type="button"
                  onClick={() => compareBInputRef.current?.click()}
                  className="w-full glass-interactive rounded-xl p-3 text-left cursor-pointer truncate"
                >
                  <span className="text-[var(--text-secondary)] block">Archive B</span>
                  <span className="font-mono text-[var(--text-primary)]">
                    {compareB ? compareB.name : 'Select second archive...'}
                  </span>
                </button>
              </div>
            </div>

            <button
              type="button"
              disabled={!compareA || !compareB || comparing}
              onClick={handleCompare}
              className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-zinc-900 text-white dark:bg-white dark:text-black px-4 py-2.5 text-xs font-medium disabled:opacity-40 cursor-pointer"
            >
              {comparing && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              Compare Contents
            </button>

            {compareDiff && (
              <div className="space-y-3 pt-2 border-t border-black/10 dark:border-white/10 text-xs">
                <div className="grid grid-cols-4 gap-2 text-center">
                  <div className="rounded-lg border border-black/10 dark:border-white/10 p-2">
                    <span className="text-[var(--text-secondary)]">Only in A</span>
                    <p className="font-mono font-semibold text-[var(--text-primary)]">{compareDiff.diff.summary.onlyInA}</p>
                  </div>
                  <div className="rounded-lg border border-black/10 dark:border-white/10 p-2">
                    <span className="text-[var(--text-secondary)]">Only in B</span>
                    <p className="font-mono font-semibold text-[var(--text-primary)]">{compareDiff.diff.summary.onlyInB}</p>
                  </div>
                  <div className="rounded-lg border border-black/10 dark:border-white/10 p-2">
                    <span className="text-[var(--text-secondary)]">Changed</span>
                    <p className="font-mono font-semibold text-[var(--text-primary)]">{compareDiff.diff.summary.sizeChanged}</p>
                  </div>
                  <div className="rounded-lg border border-black/10 dark:border-white/10 p-2">
                    <span className="text-[var(--text-secondary)]">Identical</span>
                    <p className="font-mono font-semibold text-[var(--text-primary)]">{compareDiff.diff.summary.identical}</p>
                  </div>
                </div>
                {compareDiff.diff.onlyInA.length > 0 && (
                  <p className="text-[var(--text-muted)]">
                    Only in A: {compareDiff.diff.onlyInA.slice(0, 6).map((x) => x.name).join(', ')}
                  </p>
                )}
                {compareDiff.diff.onlyInB.length > 0 && (
                  <p className="text-[var(--text-muted)]">
                    Only in B: {compareDiff.diff.onlyInB.slice(0, 6).map((x) => x.name).join(', ')}
                  </p>
                )}
                {compareDiff.diff.sizeChanged.length > 0 && (
                  <p className="text-[var(--text-muted)]">
                    Size/CRC Changed: {compareDiff.diff.sizeChanged.slice(0, 6).map((x) => x.name).join(', ')}
                  </p>
                )}
              </div>
            )}
          </GlassSurface>
        </div>
      )}

      {/* SUB-TAB 4: HONEST ARCHIVE FORMAT MATRIX */}
      {tab === 'matrix' && (
        <GlassSurface as="section" className="rounded-[22px] p-6 space-y-4">
          <div>
            <h3 className="font-display text-base font-semibold text-[var(--text-primary)]">
              Archive Format Capability Matrix
            </h3>
            <p className="text-xs text-[var(--text-muted)] mt-0.5">
              Truthful capability disclosure per container format in this runtime environment.
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-black/10 dark:border-white/10 text-[var(--text-muted)]">
                  <th className="py-2.5 pr-4 font-medium">Format</th>
                  <th className="py-2.5 pr-4 font-medium">Support</th>
                  <th className="py-2.5 pr-3 font-medium">Create</th>
                  <th className="py-2.5 pr-3 font-medium">Extract</th>
                  <th className="py-2.5 pr-3 font-medium">Modify</th>
                  <th className="py-2.5 pr-3 font-medium">Encrypt</th>
                  <th className="py-2.5 pr-3 font-medium">Split</th>
                  <th className="py-2.5 font-medium">Engine / Adapter Disclosure</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-black/8 dark:divide-white/8">
                {ARCHIVE_FORMAT_MATRIX.map((row) => (
                  <tr key={row.ext} className="hover:bg-black/4 dark:hover:bg-white/4">
                    <td className="py-2.5 pr-4 font-mono font-semibold text-[var(--text-primary)]">
                      {row.ext.toUpperCase()}
                    </td>
                    <td className="py-2.5 pr-4 capitalize text-[var(--text-soft)]">
                      {row.supportLevel === 'unavailable' ? 'External Adapter' : row.supportLevel}
                    </td>
                    <td className="py-2.5 pr-3">{row.create ? 'Yes' : '—'}</td>
                    <td className="py-2.5 pr-3">{row.extract ? 'Yes' : '—'}</td>
                    <td className="py-2.5 pr-3">{row.modify ? 'Yes' : '—'}</td>
                    <td className="py-2.5 pr-3">{row.encrypt ? 'AES-256' : '—'}</td>
                    <td className="py-2.5 pr-3">{row.split ? 'Yes' : '—'}</td>
                    <td className="py-2.5 text-[var(--text-muted)]">
                      {row.engine}
                      {row.notes ? ` · ${row.notes}` : ''}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </GlassSurface>
      )}

      {/* Entry Inline Preview Modal */}
      <GlassModal
        open={Boolean(entryPreview)}
        onClose={() => setEntryPreview(null)}
        title={entryPreview?.name || ''}
        subtitle={entryPreview ? `${formatBytes(entryPreview.size)} · Extracted entry preview` : ''}
      >
        {entryPreview?.kind === 'image' && entryPreview.dataUrl && (
          <img src={entryPreview.dataUrl} alt={entryPreview.name} className="max-h-[360px] mx-auto rounded" />
        )}
        {entryPreview?.kind === 'text' && (
          <pre className="rounded-xl border border-black/10 dark:border-white/12 bg-black/4 dark:bg-black/50 p-4 text-xs font-mono text-[var(--text-soft)] max-h-[360px] overflow-auto whitespace-pre-wrap">
            {entryPreview.text}
          </pre>
        )}
        {entryPreview?.kind === 'binary' && (
          <p className="text-xs text-[var(--text-muted)] py-6 text-center">
            Binary payload ({formatBytes(entryPreview.size)}). Use &ldquo;Save&rdquo; to extract this entry.
          </p>
        )}
      </GlassModal>
    </div>
  );
}
