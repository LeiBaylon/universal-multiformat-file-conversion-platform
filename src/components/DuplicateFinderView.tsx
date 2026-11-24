import { useCallback, useEffect, useMemo, useState } from 'react';
import { CopyCheck, RefreshCw, Trash2 } from 'lucide-react';
import type { DuplicateGroup } from '../shared/types';
import { formatBytes, formatRelativeTime } from '../utils/formatters';
import { GlassSurface } from './glass/GlassSurface';
import { GlassModal } from './glass/GlassModal';

interface DuplicateFinderViewProps {
  onShowToast: (msg: string, kind?: 'info' | 'error') => void;
}

export function DuplicateFinderView({ onShowToast }: DuplicateFinderViewProps) {
  const [groups, setGroups] = useState<DuplicateGroup[]>([]);
  const [wastedBytes, setWastedBytes] = useState(0);
  const [selectedPaths, setSelectedPaths] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const scanDuplicates = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/workspace/duplicates');
      if (res.ok) {
        const data = await res.json();
        setGroups(data.groups || []);
        setWastedBytes(data.totalWastedBytes || 0);
        setSelectedPaths([]);
      }
    } catch {
      onShowToast('Failed to scan workspace duplicates.', 'error');
    } finally {
      setLoading(false);
    }
  }, [onShowToast]);

  useEffect(() => {
    scanDuplicates();
  }, [scanDuplicates]);

  const selectDuplicateCopies = () => {
    const copies = groups.flatMap((g) => g.files.slice(1).map((f) => f.relPath));
    setSelectedPaths(copies);
  };

  const selectedSavings = useMemo(() => {
    const map = new Map<string, number>();
    groups.forEach((g) => g.files.forEach((f) => map.set(f.relPath, f.sizeBytes)));
    return selectedPaths.reduce((acc, p) => acc + (map.get(p) || 0), 0);
  }, [groups, selectedPaths]);

  const handleConfirmDelete = async () => {
    setConfirmOpen(false);
    const res = await fetch('/api/workspace/delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ paths: selectedPaths }),
    });
    const data = await res.json();
    if (!res.ok) {
      onShowToast(data.error || 'Duplicate cleanup failed.', 'error');
      return;
    }
    onShowToast(`Removed ${data.deletedCount} duplicate file(s), reclaiming ${formatBytes(data.freedBytes)}.`);
    await scanDuplicates();
  };

  return (
    <div className="space-y-6">
      <GlassSurface as="section" className="rounded-[22px] p-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="font-display text-lg font-semibold text-[var(--text-primary)]">Duplicate Finder</h2>
          <p className="text-xs text-[var(--text-muted)] mt-0.5 tabular-nums">
            Exact SHA-256 content matching · {groups.length} duplicate group(s) · {formatBytes(wastedBytes)} reclaimable
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={scanDuplicates}
            className="glass-interactive inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs text-[var(--text-primary)] cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            Rescan SHA-256
          </button>
          {groups.length > 0 && (
            <button
              type="button"
              onClick={selectDuplicateCopies}
              className="glass-interactive rounded-xl px-3.5 py-2 text-xs font-medium text-[var(--text-primary)] cursor-pointer"
            >
              Auto-Select Copies (Keep First)
            </button>
          )}
          <button
            type="button"
            disabled={selectedPaths.length === 0}
            onClick={() => setConfirmOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-xl bg-zinc-900 text-white dark:bg-white dark:text-black px-4 py-2 text-xs font-medium disabled:opacity-40 cursor-pointer whitespace-nowrap"
          >
            <Trash2 className="w-3.5 h-3.5" />
            Remove Selected ({selectedPaths.length})
          </button>
        </div>
      </GlassSurface>

      {groups.length === 0 ? (
        <GlassSurface as="section" className="rounded-[22px] p-12 text-center space-y-2">
          <CopyCheck className="w-7 h-7 text-[var(--text-secondary)] mx-auto" />
          <p className="text-sm text-[var(--text-primary)]">
            {loading ? 'Hashing workspace files...' : 'Zero duplicate files found'}
          </p>
          <p className="text-xs text-[var(--text-secondary)]">
            Files with identical SHA-256 checksums will appear grouped here for safe review before deletion.
          </p>
        </GlassSurface>
      ) : (
        <div className="space-y-4">
          {groups.map((group) => (
            <GlassSurface key={group.hash} as="article" className="rounded-[20px] p-5 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                <span className="font-mono text-[var(--text-primary)] tabular-nums">
                  SHA-256 {group.hash.slice(0, 14)}… · {group.files.length} identical files ·{' '}
                  {formatBytes(group.sizeBytes)} each
                </span>
                <span className="text-[var(--text-muted)] tabular-nums">
                  Reclaimable: {formatBytes(group.wastedBytes)}
                </span>
              </div>

              <div className="divide-y divide-black/8 dark:divide-white/8">
                {group.files.map((file, idx) => {
                  const checked = selectedPaths.includes(file.relPath);
                  return (
                    <label
                      key={file.relPath}
                      className="py-2.5 flex items-center justify-between gap-3 text-xs cursor-pointer"
                    >
                      <span className="flex items-center gap-2.5 min-w-0">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(e) =>
                            setSelectedPaths((prev) =>
                              e.target.checked ? [...prev, file.relPath] : prev.filter((p) => p !== file.relPath)
                            )
                          }
                          className="accent-zinc-900 dark:accent-white cursor-pointer"
                        />
                        <span className="font-mono text-[var(--text-primary)] truncate">/{file.relPath}</span>
                      </span>
                      <span className="text-[var(--text-secondary)] tabular-nums shrink-0">
                        {idx === 0 ? 'Primary' : 'Duplicate Copy'} · {formatRelativeTime(file.modifiedAt)}
                      </span>
                    </label>
                  );
                })}
              </div>
            </GlassSurface>
          ))}
        </div>
      )}

      <GlassModal
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        title="Confirm Duplicate Cleanup"
        subtitle="Selected duplicate files will be permanently removed from the workspace."
        maxWidthClass="max-w-md"
      >
        <div className="space-y-4 text-xs">
          <p className="text-[var(--text-soft)] tabular-nums">
            Removing {selectedPaths.length} file(s) will reclaim {formatBytes(selectedSavings)} of disk space.
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
              onClick={handleConfirmDelete}
              className="rounded-xl bg-red-600 text-white px-4 py-2 font-medium cursor-pointer"
            >
              Confirm Removal
            </button>
          </div>
        </div>
      </GlassModal>
    </div>
  );
}
