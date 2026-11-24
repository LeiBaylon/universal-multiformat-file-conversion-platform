import { useCallback, useEffect, useMemo, useState } from 'react';
import { Archive, HardDrive, Minimize2, Trash2 } from 'lucide-react';
import type { NavView, WorkspaceFileEntry } from '../shared/types';
import { formatBytes, formatRelativeTime } from '../utils/formatters';
import { GlassSurface } from './glass/GlassSurface';
import { GlassDropdown } from './glass/GlassDropdown';
import { GlassModal } from './glass/GlassModal';

interface LargeFilesViewProps {
  onPromoteToTarget: (relPaths: string[], targetView: NavView) => Promise<void>;
  onShowToast: (msg: string, kind?: 'info' | 'error') => void;
}

export function LargeFilesView({ onPromoteToTarget, onShowToast }: LargeFilesViewProps) {
  const [files, setFiles] = useState<WorkspaceFileEntry[]>([]);
  const [thresholdKb, setThresholdKb] = useState('100');
  const [selectedPaths, setSelectedPaths] = useState<string[]>([]);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const loadFiles = useCallback(async () => {
    const res = await fetch('/api/workspace/tree');
    if (res.ok) {
      const data = await res.json();
      setFiles((data.entries || []).filter((e: WorkspaceFileEntry) => !e.isDirectory));
    }
  }, []);

  useEffect(() => {
    loadFiles();
  }, [loadFiles]);

  const largeList = useMemo(() => {
    const minBytes = Number(thresholdKb) * 1024;
    return files
      .filter((f) => f.sizeBytes >= minBytes)
      .sort((a, b) => b.sizeBytes - a.sizeBytes);
  }, [files, thresholdKb]);

  const handleConfirmDelete = async () => {
    setConfirmOpen(false);
    const res = await fetch('/api/workspace/delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ paths: selectedPaths }),
    });
    const data = await res.json();
    if (res.ok) {
      onShowToast(`Deleted ${data.deletedCount} large file(s) (${formatBytes(data.freedBytes)}).`);
      setSelectedPaths([]);
      await loadFiles();
    }
  };

  return (
    <div className="space-y-6">
      <GlassSurface as="section" className="rounded-[22px] p-6 flex flex-wrap items-center justify-between gap-4 overflow-visible relative z-20">
        <div>
          <h2 className="font-display text-lg font-semibold text-[var(--text-primary)]">Large Files Finder</h2>
          <p className="text-xs text-[var(--text-muted)] mt-0.5 tabular-nums">
            {largeList.length} file(s) above {thresholdKb} KB · Route directly to File Compressor or Archive Manager.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <div className="w-40">
            <GlassDropdown
              size="sm"
              ariaLabel="Minimum File Size Threshold"
              value={thresholdKb}
              onChange={setThresholdKb}
              options={[
                { value: '50', label: '50 KB +' },
                { value: '100', label: '100 KB +' },
                { value: '500', label: '500 KB +' },
                { value: '1024', label: '1 MB +' },
                { value: '5120', label: '5 MB +' },
              ]}
            />
          </div>
          {selectedPaths.length > 0 && (
            <>
              <button
                type="button"
                onClick={() => onPromoteToTarget(selectedPaths, 'compressor')}
                className="glass-interactive inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-medium text-[var(--text-primary)] cursor-pointer"
              >
                <Minimize2 className="w-3.5 h-3.5" />
                Compress ({selectedPaths.length})
              </button>
              <button
                type="button"
                onClick={() => onPromoteToTarget(selectedPaths, 'archive')}
                className="glass-interactive inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-medium text-[var(--text-primary)] cursor-pointer"
              >
                <Archive className="w-3.5 h-3.5" />
                Archive ({selectedPaths.length})
              </button>
              <button
                type="button"
                onClick={() => setConfirmOpen(true)}
                className="inline-flex items-center gap-1.5 rounded-xl bg-red-600 text-white px-3.5 py-2 text-xs font-medium cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Delete ({selectedPaths.length})
              </button>
            </>
          )}
        </div>
      </GlassSurface>

      <GlassSurface as="section" className="rounded-[22px] p-6">
        {largeList.length === 0 ? (
          <div className="py-12 text-center space-y-2">
            <HardDrive className="w-7 h-7 text-[var(--text-secondary)] mx-auto" />
            <p className="text-sm text-[var(--text-primary)]">No files exceed {thresholdKb} KB</p>
            <p className="text-xs text-[var(--text-secondary)]">Lower the threshold above or add workspace files.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-black/10 dark:border-white/10 text-[var(--text-muted)]">
                  <th className="py-2.5 pr-3 w-8">Sel</th>
                  <th className="py-2.5 pr-4 font-medium">Path</th>
                  <th className="py-2.5 pr-4 font-medium">Category</th>
                  <th className="py-2.5 pr-4 font-medium">Size</th>
                  <th className="py-2.5 pr-4 font-medium">Modified</th>
                  <th className="py-2.5 text-right font-medium">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-black/8 dark:divide-white/8">
                {largeList.map((f) => (
                  <tr key={f.relPath}>
                    <td className="py-2.5 pr-3">
                      <input
                        type="checkbox"
                        checked={selectedPaths.includes(f.relPath)}
                        onChange={(e) =>
                          setSelectedPaths((prev) =>
                            e.target.checked ? [...prev, f.relPath] : prev.filter((p) => p !== f.relPath)
                          )
                        }
                        className="accent-zinc-900 dark:accent-white cursor-pointer"
                      />
                    </td>
                    <td className="py-2.5 pr-4 font-mono text-[var(--text-primary)]">/{f.relPath}</td>
                    <td className="py-2.5 pr-4 capitalize text-[var(--text-soft)]">{f.category}</td>
                    <td className="py-2.5 pr-4 font-mono font-semibold text-[var(--text-primary)] tabular-nums">
                      {formatBytes(f.sizeBytes)}
                    </td>
                    <td className="py-2.5 pr-4 text-[var(--text-secondary)] tabular-nums">
                      {formatRelativeTime(f.modifiedAt)}
                    </td>
                    <td className="py-2.5 text-right whitespace-nowrap space-x-2">
                      <button
                        type="button"
                        onClick={() => onPromoteToTarget([f.relPath], 'compressor')}
                        className="glass-interactive rounded-lg px-2.5 py-1 text-[11px] text-[var(--text-primary)] cursor-pointer"
                      >
                        Compress
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </GlassSurface>

      <GlassModal
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        title="Confirm Deletion of Large Files"
        subtitle="Selected large files will be permanently removed from workspace storage."
        maxWidthClass="max-w-md"
      >
        <div className="space-y-4 text-xs">
          <p className="text-[var(--text-soft)]">Delete {selectedPaths.length} selected large file(s)?</p>
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
              Confirm Delete
            </button>
          </div>
        </div>
      </GlassModal>
    </div>
  );
}
