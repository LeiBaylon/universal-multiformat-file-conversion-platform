import { useCallback, useEffect, useMemo, useState } from 'react';
import { RefreshCw, Sparkles, Trash2 } from 'lucide-react';
import type { DuplicateGroup, NavView, StorageAnalysisReport } from '../shared/types';
import { formatBytes } from '../utils/formatters';
import { GlassSurface } from './glass/GlassSurface';
import { GlassModal } from './glass/GlassModal';

interface StorageIntelligenceViewProps {
  mode: 'analyzer' | 'cleanup';
  onNavigate: (view: NavView) => void;
  onRefreshParent: () => Promise<void>;
  onShowToast: (msg: string, kind?: 'info' | 'error') => void;
}

export function StorageIntelligenceView({
  mode,
  onNavigate,
  onRefreshParent,
  onShowToast,
}: StorageIntelligenceViewProps) {
  const [report, setReport] = useState<StorageAnalysisReport | null>(null);
  const [duplicateGroups, setDuplicateGroups] = useState<DuplicateGroup[]>([]);
  const [selectedPaths, setSelectedPaths] = useState<string[]>([]);
  const [purgeTemp, setPurgeTemp] = useState(true);
  const [loading, setLoading] = useState(true);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const loadAnalysis = useCallback(async () => {
    setLoading(true);
    try {
      const [repRes, dupRes] = await Promise.all([
        fetch('/api/storage/analyze?thresholdKb=500'),
        fetch('/api/workspace/duplicates'),
      ]);
      if (repRes.ok) {
        setReport(await repRes.json());
      }
      if (dupRes.ok) {
        const dupData = await dupRes.json();
        setDuplicateGroups(dupData.groups || []);
      }
    } catch {
      onShowToast('Failed to analyze workspace storage.', 'error');
    } finally {
      setLoading(false);
    }
  }, [onShowToast]);

  useEffect(() => {
    loadAnalysis();
  }, [loadAnalysis]);

  const cleanupCandidates = useMemo(
    () =>
      duplicateGroups.flatMap((g) =>
        g.files.slice(1).map((f) => ({
          relPath: f.relPath,
          sizeBytes: f.sizeBytes,
          reason: `Identical SHA-256 copy of ${g.files[0]?.name}`,
        }))
      ),
    [duplicateGroups]
  );

  const estimatedReclaimBytes = useMemo(() => {
    const fileBytes = cleanupCandidates
      .filter((c) => selectedPaths.includes(c.relPath))
      .reduce((acc, c) => acc + c.sizeBytes, 0);
    const tempBytes = purgeTemp && report ? report.tempUploadBytes + report.tempOutputBytes : 0;
    return fileBytes + tempBytes;
  }, [cleanupCandidates, purgeTemp, report, selectedPaths]);

  const handleConfirmCleanup = async () => {
    setConfirmOpen(false);
    const res = await fetch('/api/storage/cleanup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ workspacePaths: selectedPaths, purgeTemp }),
    });
    const data = await res.json();
    if (!res.ok) {
      onShowToast(data.error || 'Cleanup failed.', 'error');
      return;
    }
    setReport(data.report);
    setSelectedPaths([]);
    await onRefreshParent();
    await loadAnalysis();
    onShowToast(`Cleanup freed ${formatBytes(data.freedBytes)} across ${data.removedCount} item(s).`);
  };

  return (
    <div className="space-y-6">
      <GlassSurface as="section" className="rounded-[22px] p-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="font-display text-lg font-semibold text-[var(--text-primary)]">
            {mode === 'analyzer' ? 'Storage Analyzer' : 'Cleanup Center'}
          </h2>
          <p className="text-xs text-[var(--text-muted)] mt-0.5">
            {mode === 'analyzer'
              ? 'Category footprint, folder distribution, duplicate waste, and temporary processing disk telemetry.'
              : 'Review reclaimable duplicates and temporary cache files before confirming permanent cleanup.'}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={loadAnalysis}
            className="glass-interactive inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs text-[var(--text-primary)] cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh Scan
          </button>
          {mode === 'analyzer' ? (
            <button
              type="button"
              onClick={() => onNavigate('cleanup')}
              className="rounded-xl bg-zinc-900 text-white dark:bg-white dark:text-black px-4 py-2 text-xs font-medium cursor-pointer"
            >
              Open Cleanup Center
            </button>
          ) : (
            <button
              type="button"
              disabled={selectedPaths.length === 0 && (!purgeTemp || !report || report.tempFileCount === 0)}
              onClick={() => setConfirmOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-xl bg-zinc-900 text-white dark:bg-white dark:text-black px-4 py-2 text-xs font-medium disabled:opacity-40 cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Review Cleanup ({formatBytes(estimatedReclaimBytes)})
            </button>
          )}
        </div>
      </GlassSurface>

      {/* Summary Telemetry */}
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <GlassSurface as="div" className="rounded-2xl p-5">
          <p className="text-xs text-[var(--text-muted)]">Workspace Used</p>
          <p className="font-display text-2xl font-semibold text-[var(--text-primary)] mt-1 tabular-nums">
            {report ? formatBytes(report.workspaceBytes) : '—'}
          </p>
          <p className="text-xs text-[var(--text-secondary)] mt-1 tabular-nums">
            {report ? `${report.workspaceFiles} tracked files` : ''}
          </p>
        </GlassSurface>
        <GlassSurface as="div" className="rounded-2xl p-5">
          <p className="text-xs text-[var(--text-muted)]">Duplicate Waste</p>
          <p className="font-display text-2xl font-semibold text-[var(--text-primary)] mt-1 tabular-nums">
            {report ? formatBytes(report.duplicateWastedBytes) : '—'}
          </p>
          <p className="text-xs text-[var(--text-secondary)] mt-1 tabular-nums">
            {report ? `${report.duplicateGroupCount} duplicate group(s)` : ''}
          </p>
        </GlassSurface>
        <GlassSurface as="div" className="rounded-2xl p-5">
          <p className="text-xs text-[var(--text-muted)]">Large Files (500KB+)</p>
          <p className="font-display text-2xl font-semibold text-[var(--text-primary)] mt-1 tabular-nums">
            {report ? formatBytes(report.largeFilesBytes) : '—'}
          </p>
          <p className="text-xs text-[var(--text-secondary)] mt-1 tabular-nums">
            {report ? `${report.largeFileCount} large item(s)` : ''}
          </p>
        </GlassSurface>
        <GlassSurface as="div" className="rounded-2xl p-5">
          <p className="text-xs text-[var(--text-muted)]">Temp Processing Cache</p>
          <p className="font-display text-2xl font-semibold text-[var(--text-primary)] mt-1 tabular-nums">
            {report ? formatBytes(report.tempUploadBytes + report.tempOutputBytes) : '—'}
          </p>
          <p className="text-xs text-[var(--text-secondary)] mt-1 tabular-nums">
            {report ? `${report.tempFileCount} staged/output file(s)` : ''}
          </p>
        </GlassSurface>
      </section>

      {mode === 'analyzer' ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <GlassSurface as="section" className="rounded-[22px] p-6 space-y-4">
            <h3 className="font-display text-sm font-semibold text-[var(--text-primary)]">Storage by Category</h3>
            {!report || report.byCategory.length === 0 ? (
              <p className="text-xs text-[var(--text-secondary)]">No workspace files analyzed yet.</p>
            ) : (
              <div className="space-y-3">
                {report.byCategory.map((cat) => (
                  <div key={cat.category} className="space-y-1">
                    <div className="flex items-center justify-between text-xs tabular-nums">
                      <span className="capitalize text-[var(--text-primary)]">{cat.category}</span>
                      <span className="text-[var(--text-muted)]">
                        {cat.files} file(s) · {formatBytes(cat.bytes)} · {cat.sharePct}%
                      </span>
                    </div>
                    <div className="h-1.5 rounded-full bg-black/8 dark:bg-white/10 overflow-hidden">
                      <div style={{ width: `${cat.sharePct}%` }} className="h-full bg-zinc-900 dark:bg-white rounded-full" />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </GlassSurface>

          <GlassSurface as="section" className="rounded-[22px] p-6 space-y-4">
            <h3 className="font-display text-sm font-semibold text-[var(--text-primary)]">Top Workspace Folders</h3>
            {!report || report.topFolders.length === 0 ? (
              <p className="text-xs text-[var(--text-secondary)]">No folders recorded yet.</p>
            ) : (
              <div className="divide-y divide-black/8 dark:divide-white/8 text-xs">
                {report.topFolders.map((folder) => (
                  <div key={folder.folder} className="py-2.5 flex items-center justify-between tabular-nums">
                    <span className="font-mono text-[var(--text-primary)]">/{folder.folder}</span>
                    <span className="text-[var(--text-muted)]">
                      {folder.files} file(s) · {formatBytes(folder.bytes)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </GlassSurface>
        </div>
      ) : (
        <GlassSurface as="section" className="rounded-[22px] p-6 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="font-display text-sm font-semibold text-[var(--text-primary)]">
              Selectable Cleanup Candidates
            </h3>
            {cleanupCandidates.length > 0 && (
              <button
                type="button"
                onClick={() => setSelectedPaths(cleanupCandidates.map((c) => c.relPath))}
                className="text-xs text-[var(--text-primary)] hover:underline cursor-pointer"
              >
                Select All Duplicate Copies ({cleanupCandidates.length})
              </button>
            )}
          </div>

          <label className="flex items-center justify-between rounded-xl border border-black/10 dark:border-white/12 p-3.5 text-xs cursor-pointer">
            <span className="flex items-center gap-2.5">
              <input
                type="checkbox"
                checked={purgeTemp}
                onChange={(e) => setPurgeTemp(e.target.checked)}
                className="accent-zinc-900 dark:accent-white"
              />
              <span>
                <span className="font-medium text-[var(--text-primary)]">Temporary Upload &amp; Output Cache</span>
                <span className="block text-[var(--text-secondary)] mt-0.5 tabular-nums">
                  {report ? `${report.tempFileCount} temporary file(s)` : 'Staged temporary artifacts'}
                </span>
              </span>
            </span>
            <span className="font-mono text-[var(--text-primary)] tabular-nums">
              {report ? formatBytes(report.tempUploadBytes + report.tempOutputBytes) : '—'}
            </span>
          </label>

          {cleanupCandidates.length === 0 ? (
            <div className="py-8 text-center text-xs text-[var(--text-secondary)]">
              <Sparkles className="w-5 h-5 mx-auto mb-1.5" />
              No duplicate workspace files detected.
            </div>
          ) : (
            <div className="divide-y divide-black/8 dark:divide-white/8">
              {cleanupCandidates.map((cand) => (
                <label key={cand.relPath} className="py-3 flex items-center justify-between gap-3 text-xs cursor-pointer">
                  <span className="flex items-center gap-2.5 min-w-0">
                    <input
                      type="checkbox"
                      checked={selectedPaths.includes(cand.relPath)}
                      onChange={(e) =>
                        setSelectedPaths((prev) =>
                          e.target.checked ? [...prev, cand.relPath] : prev.filter((p) => p !== cand.relPath)
                        )
                      }
                      className="accent-zinc-900 dark:accent-white"
                    />
                    <span className="min-w-0">
                      <span className="font-mono text-[var(--text-primary)] block truncate">/{cand.relPath}</span>
                      <span className="text-[11px] text-[var(--text-secondary)]">{cand.reason}</span>
                    </span>
                  </span>
                  <span className="font-mono text-[var(--text-muted)] tabular-nums shrink-0">
                    {formatBytes(cand.sizeBytes)}
                  </span>
                </label>
              ))}
            </div>
          )}
        </GlassSurface>
      )}

      <GlassModal
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        title="Confirm Storage Cleanup"
        subtitle="Selected files and cache artifacts will be permanently deleted."
        maxWidthClass="max-w-md"
      >
        <div className="space-y-4 text-xs">
          <p className="text-[var(--text-soft)] tabular-nums">
            Total estimated space savings: {formatBytes(estimatedReclaimBytes)} ({selectedPaths.length} workspace file(s)
            {purgeTemp ? ' + temporary processing cache' : ''}).
          </p>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setConfirmOpen(false)}
              className="glass-interactive rounded-xl px-4 py-2 text-[var(--text-muted)] cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleConfirmCleanup}
              className="rounded-xl bg-red-600 text-white px-4 py-2 font-medium cursor-pointer"
            >
              Confirm Cleanup
            </button>
          </div>
        </div>
      </GlassModal>
    </div>
  );
}
