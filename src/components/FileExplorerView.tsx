import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Eye,
  FileText,
  Folder,
  FolderPlus,
  FolderUp,
  Layers,
  RefreshCw,
  Search,
  Sparkles,
  Trash2,
  Upload,
} from 'lucide-react';
import type { NavView, WorkspaceFileEntry, WorkspaceTreeSummary } from '../shared/types';
import { formatBytes, formatRelativeTime } from '../utils/formatters';
import { GlassSurface } from './glass/GlassSurface';
import { GlassDropdown } from './glass/GlassDropdown';
import { GlassModal } from './glass/GlassModal';

interface FileExplorerViewProps {
  onPromoteToTarget: (relPaths: string[], targetView: NavView) => Promise<void>;
  onShowToast: (msg: string, kind?: 'info' | 'error') => void;
}

export function FileExplorerView({ onPromoteToTarget, onShowToast }: FileExplorerViewProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const folderInputRef = useRef<HTMLInputElement | null>(null);

  const [tree, setTree] = useState<WorkspaceTreeSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [folderFilter, setFolderFilter] = useState('all');
  const [selectedPaths, setSelectedPaths] = useState<string[]>([]);

  const [newFolderOpen, setNewFolderOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [previewEntry, setPreviewEntry] = useState<WorkspaceFileEntry | null>(null);
  const [previewText, setPreviewText] = useState<string | null>(null);
  const [sendTarget, setSendTarget] = useState<NavView>('converter');

  const fetchTree = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/workspace/tree');
      if (res.ok) {
        const data = (await res.json()) as WorkspaceTreeSummary;
        setTree(data);
      }
    } catch {
      onShowToast('Unable to load workspace tree.', 'error');
    } finally {
      setLoading(false);
    }
  }, [onShowToast]);

  useEffect(() => {
    fetchTree();
  }, [fetchTree]);

  const files = useMemo(() => (tree?.entries || []).filter((e) => !e.isDirectory), [tree]);
  const folders = useMemo(
    () => (tree?.entries || []).filter((e) => e.isDirectory).map((d) => d.relPath),
    [tree]
  );
  const categories = useMemo(
    () => Array.from(new Set(files.map((f) => f.category))).sort(),
    [files]
  );

  const filteredFiles = useMemo(() => {
    const q = search.trim().toLowerCase();
    return files.filter((f) => {
      if (categoryFilter !== 'all' && f.category !== categoryFilter) return false;
      if (folderFilter !== 'all') {
        const top = f.relPath.includes('/') ? f.relPath.split('/')[0] : '(Root)';
        if (top !== folderFilter) return false;
      }
      if (!q) return true;
      return (
        f.name.toLowerCase().includes(q) ||
        f.relPath.toLowerCase().includes(q) ||
        f.ext.toLowerCase().includes(q)
      );
    });
  }, [categoryFilter, files, folderFilter, search]);

  const handleUpload = async (rawFiles: File[]) => {
    if (rawFiles.length === 0) return;
    const form = new FormData();
    const rels: string[] = [];
    rawFiles.forEach((f) => {
      form.append('files', f);
      const webkitRel = (f as File & { webkitRelativePath?: string }).webkitRelativePath;
      rels.push(webkitRel && webkitRel.length > 0 ? webkitRel : f.name);
    });
    form.append('relativePaths', JSON.stringify(rels));
    if (folderFilter !== 'all' && folderFilter !== '(Root)') {
      form.append('folder', folderFilter);
    }

    const res = await fetch('/api/workspace/upload', { method: 'POST', body: form });
    const data = await res.json();
    if (!res.ok) {
      onShowToast(data.error || 'Upload to workspace failed.', 'error');
      return;
    }
    setTree(data.tree);
    onShowToast(`Added ${rawFiles.length} file(s) to Managed Workspace.`);
  };

  const handleSeedDemo = async () => {
    const res = await fetch('/api/workspace/seed-demo', { method: 'POST' });
    const data = await res.json();
    if (res.ok) {
      setTree(data);
      onShowToast('Populated Managed Workspace with sample media, documents, duplicates, and archives.');
    } else {
      onShowToast(data.error || 'Failed to load demo workspace.', 'error');
    }
  };

  const handleCreateFolder = async () => {
    if (!newFolderName.trim()) return;
    const res = await fetch('/api/workspace/folder', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: newFolderName.trim() }),
    });
    const data = await res.json();
    if (!res.ok) {
      onShowToast(data.error || 'Could not create folder.', 'error');
      return;
    }
    setTree(data.tree);
    setNewFolderName('');
    setNewFolderOpen(false);
    onShowToast(`Created folder "${data.folder}".`);
  };

  const handleDeleteSelected = async () => {
    setConfirmDeleteOpen(false);
    const res = await fetch('/api/workspace/delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ paths: selectedPaths }),
    });
    const data = await res.json();
    if (!res.ok) {
      onShowToast(data.error || 'Delete failed.', 'error');
      return;
    }
    setTree(data.tree);
    setSelectedPaths([]);
    onShowToast(`Removed ${data.deletedCount} file(s), freeing ${formatBytes(data.freedBytes)}.`);
  };

  const openPreview = async (entry: WorkspaceFileEntry) => {
    setPreviewEntry(entry);
    setPreviewText(null);
    if (['json', 'txt', 'md', 'csv', 'yaml', 'yml', 'xml', 'svg', 'html', 'css', 'js', 'ts'].includes(entry.ext)) {
      try {
        const res = await fetch(`/api/workspace/file/preview?path=${encodeURIComponent(entry.relPath)}`);
        if (res.ok) {
          const text = await res.text();
          setPreviewText(text.slice(0, 8000));
        }
      } catch {
        // ignore text fetch error
      }
    }
  };

  const selectedBytes = useMemo(
    () => files.filter((f) => selectedPaths.includes(f.relPath)).reduce((a, f) => a + f.sizeBytes, 0),
    [files, selectedPaths]
  );

  return (
    <div className="space-y-6">
      <GlassSurface as="section" className="rounded-[22px] p-6 space-y-4 overflow-visible relative z-20">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="font-display text-lg font-semibold text-[var(--text-primary)]">
              Workspace File Explorer
            </h2>
            <p className="text-xs text-[var(--text-muted)] mt-0.5 tabular-nums">
              {tree ? `${tree.totalFiles} files · ${tree.totalFolders} folders · ${formatBytes(tree.totalBytes)}` : 'Loading workspace...'}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <input
              ref={fileInputRef}
              type="file"
              multiple
              className="hidden"
              onChange={(e) => {
                handleUpload(Array.from(e.target.files || []));
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
                handleUpload(Array.from(e.target.files || []));
                e.target.value = '';
              }}
            />
            <button
              type="button"
              onClick={handleSeedDemo}
              className="glass-interactive inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-medium text-[var(--text-primary)] cursor-pointer whitespace-nowrap"
            >
              <Sparkles className="w-3.5 h-3.5" />
              Load Demo Workspace
            </button>
            <button
              type="button"
              onClick={() => setNewFolderOpen(true)}
              className="glass-interactive inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs text-[var(--text-primary)] cursor-pointer whitespace-nowrap"
            >
              <FolderPlus className="w-3.5 h-3.5" />
              New Folder
            </button>
            <button
              type="button"
              onClick={() => folderInputRef.current?.click()}
              className="glass-interactive inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs text-[var(--text-primary)] cursor-pointer whitespace-nowrap"
            >
              <FolderUp className="w-3.5 h-3.5" />
              Upload Folder
            </button>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="inline-flex items-center gap-1.5 rounded-xl bg-zinc-900 text-white dark:bg-white dark:text-black px-4 py-2 text-xs font-medium hover:opacity-90 cursor-pointer whitespace-nowrap"
            >
              <Upload className="w-3.5 h-3.5" />
              Upload Files
            </button>
          </div>
        </div>

        {/* Filters */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-center">
          <div className="md:col-span-5 relative">
            <Search className="w-3.5 h-3.5 text-[var(--text-secondary)] absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search workspace files or folders..."
              className="w-full rounded-xl border border-[var(--control-border)] bg-[var(--input-bg)] pl-9 pr-4 py-2 text-xs text-[var(--text-primary)]"
            />
          </div>
          <div className="md:col-span-3">
            <GlassDropdown
              size="sm"
              ariaLabel="Filter by workspace folder"
              value={folderFilter}
              onChange={setFolderFilter}
              options={[
                { value: 'all', label: 'All Folders' },
                { value: '(Root)', label: 'Root Directory' },
                ...Array.from(new Set(folders.map((f) => f.split('/')[0]))).map((top) => ({
                  value: top,
                  label: `/${top}`,
                })),
              ]}
            />
          </div>
          <div className="md:col-span-3">
            <GlassDropdown
              size="sm"
              ariaLabel="Filter by category"
              value={categoryFilter}
              onChange={setCategoryFilter}
              options={[
                { value: 'all', label: 'All Categories' },
                ...categories.map((c) => ({ value: c, label: c.charAt(0).toUpperCase() + c.slice(1) })),
              ]}
            />
          </div>
          <div className="md:col-span-1 flex justify-end">
            <button
              type="button"
              aria-label="Refresh workspace tree"
              onClick={fetchTree}
              className="glass-interactive rounded-xl p-2 text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {/* Multi-Selection Action Bar */}
        {selectedPaths.length > 0 && (
          <div className="pt-3 border-t border-black/10 dark:border-white/10 flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs font-medium text-[var(--text-primary)] tabular-nums">
              {selectedPaths.length} selected ({formatBytes(selectedBytes)})
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <div className="w-52">
                <GlassDropdown
                  size="sm"
                  ariaLabel="Destination Processing Tool"
                  value={sendTarget}
                  onChange={(v) => setSendTarget(v as NavView)}
                  options={[
                    { value: 'converter', label: 'Universal Converter' },
                    { value: 'batch', label: 'Batch Processing Queue' },
                    { value: 'workflow-builder', label: 'Workflow Builder' },
                    { value: 'bg-remover', label: 'Background Remover' },
                    { value: 'compressor', label: 'File Compressor' },
                    { value: 'archive', label: 'ZIP & Archive Manager' },
                    { value: 'renamer', label: 'Batch Renamer' },
                    { value: 'inspector', label: 'File Inspector' },
                  ]}
                />
              </div>
              <button
                type="button"
                onClick={() => onPromoteToTarget(selectedPaths, sendTarget)}
                className="inline-flex items-center gap-1.5 rounded-xl bg-zinc-900 text-white dark:bg-white dark:text-black px-3.5 py-2 text-xs font-medium cursor-pointer whitespace-nowrap"
              >
                <Layers className="w-3.5 h-3.5" />
                Send to Tool
              </button>
              <button
                type="button"
                onClick={() => setConfirmDeleteOpen(true)}
                className="glass-interactive inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs text-red-500 cursor-pointer whitespace-nowrap"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Delete Selected
              </button>
            </div>
          </div>
        )}
      </GlassSurface>

      {/* File Table */}
      <GlassSurface as="section" className="rounded-[22px] p-6">
        {loading && !tree ? (
          <div className="py-12 text-center text-xs text-[var(--text-secondary)]">Scanning managed workspace...</div>
        ) : filteredFiles.length === 0 ? (
          <div className="py-12 text-center border border-dashed border-black/12 dark:border-white/14 rounded-xl space-y-3">
            <Folder className="w-7 h-7 text-[var(--text-secondary)] mx-auto" />
            <p className="text-sm text-[var(--text-primary)]">Workspace directory is empty</p>
            <p className="text-xs text-[var(--text-secondary)] max-w-md mx-auto">
              Upload local files or folders, or populate the workspace with deterministic demo assets to test Smart Organizer, Duplicate Finder, Batch Renamer, and Storage Intelligence.
            </p>
            <button
              type="button"
              onClick={handleSeedDemo}
              className="rounded-xl bg-zinc-900 text-white dark:bg-white dark:text-black px-4 py-2 text-xs font-medium cursor-pointer"
            >
              Load Demo Workspace
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-black/10 dark:border-white/10 text-[var(--text-muted)]">
                  <th className="py-2.5 pr-3 w-8">
                    <input
                      type="checkbox"
                      aria-label="Select all visible workspace files"
                      checked={
                        filteredFiles.length > 0 &&
                        filteredFiles.every((f) => selectedPaths.includes(f.relPath))
                      }
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedPaths(filteredFiles.map((f) => f.relPath));
                        } else {
                          setSelectedPaths([]);
                        }
                      }}
                      className="accent-zinc-900 dark:accent-white cursor-pointer"
                    />
                  </th>
                  <th className="py-2.5 pr-4 font-medium">File Path</th>
                  <th className="py-2.5 pr-4 font-medium">Category</th>
                  <th className="py-2.5 pr-4 font-medium">Format</th>
                  <th className="py-2.5 pr-4 font-medium">Size</th>
                  <th className="py-2.5 pr-4 font-medium">Modified</th>
                  <th className="py-2.5 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-black/8 dark:divide-white/8">
                {filteredFiles.map((entry) => {
                  const checked = selectedPaths.includes(entry.relPath);
                  return (
                    <tr key={entry.relPath} className="hover:bg-black/4 dark:hover:bg-white/4 transition-colors">
                      <td className="py-2.5 pr-3">
                        <input
                          type="checkbox"
                          aria-label={`Select ${entry.relPath}`}
                          checked={checked}
                          onChange={(e) =>
                            setSelectedPaths((prev) =>
                              e.target.checked ? [...prev, entry.relPath] : prev.filter((p) => p !== entry.relPath)
                            )
                          }
                          className="accent-zinc-900 dark:accent-white cursor-pointer"
                        />
                      </td>
                      <td className="py-2.5 pr-4">
                        <span className="font-medium text-[var(--text-primary)]">{entry.name}</span>
                        {entry.relPath.includes('/') && (
                          <p className="text-[11px] font-mono text-[var(--text-secondary)]">{entry.relPath}</p>
                        )}
                      </td>
                      <td className="py-2.5 pr-4 capitalize text-[var(--text-soft)]">{entry.category}</td>
                      <td className="py-2.5 pr-4 font-mono text-[var(--text-muted)]">
                        {entry.ext ? entry.ext.toUpperCase() : 'FILE'}
                      </td>
                      <td className="py-2.5 pr-4 font-mono text-[var(--text-muted)] tabular-nums">
                        {formatBytes(entry.sizeBytes)}
                      </td>
                      <td className="py-2.5 pr-4 text-[var(--text-secondary)] tabular-nums">
                        {formatRelativeTime(entry.modifiedAt)}
                      </td>
                      <td className="py-2.5 text-right whitespace-nowrap space-x-2">
                        <button
                          type="button"
                          onClick={() => openPreview(entry)}
                          className="glass-interactive inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-[11px] text-[var(--text-primary)] cursor-pointer"
                        >
                          <Eye className="w-3 h-3" />
                          Preview
                        </button>
                        <button
                          type="button"
                          onClick={() => onPromoteToTarget([entry.relPath], 'converter')}
                          className="glass-interactive inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-[11px] text-[var(--text-primary)] cursor-pointer"
                        >
                          Process
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </GlassSurface>

      {/* New Folder Modal */}
      <GlassModal
        open={newFolderOpen}
        onClose={() => setNewFolderOpen(false)}
        title="Create Workspace Folder"
        subtitle="Create a confined folder inside the Managed Workspace."
        maxWidthClass="max-w-md"
      >
        <div className="space-y-4 text-xs">
          <div>
            <label className="block text-[var(--text-muted)] mb-1">Folder Path</label>
            <input
              type="text"
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              placeholder="e.g. Client_Exports/WebP"
              className="w-full rounded-xl border border-[var(--control-border)] bg-[var(--input-bg)] px-3 py-2 text-[var(--text-primary)]"
            />
          </div>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setNewFolderOpen(false)}
              className="glass-interactive rounded-xl px-4 py-2 text-[var(--text-muted)] cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleCreateFolder}
              className="rounded-xl bg-zinc-900 text-white dark:bg-white dark:text-black px-4 py-2 font-medium cursor-pointer"
            >
              Create Folder
            </button>
          </div>
        </div>
      </GlassModal>

      {/* Confirm Delete Modal */}
      <GlassModal
        open={confirmDeleteOpen}
        onClose={() => setConfirmDeleteOpen(false)}
        title="Confirm File Deletion"
        subtitle="Selected workspace files will be permanently removed."
        maxWidthClass="max-w-md"
      >
        <div className="space-y-4 text-xs">
          <p className="text-[var(--text-soft)] tabular-nums">
            You are about to remove {selectedPaths.length} file(s) totaling {formatBytes(selectedBytes)}.
          </p>
          <div className="max-h-40 overflow-y-auto rounded-xl border border-black/10 dark:border-white/10 p-2.5 font-mono text-[11px] space-y-1">
            {selectedPaths.map((p) => (
              <p key={p} className="truncate text-[var(--text-primary)]">
                /{p}
              </p>
            ))}
          </div>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setConfirmDeleteOpen(false)}
              className="glass-interactive rounded-xl px-4 py-2 text-[var(--text-muted)] cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleDeleteSelected}
              className="rounded-xl bg-red-600 text-white px-4 py-2 font-medium cursor-pointer"
            >
              Confirm Delete
            </button>
          </div>
        </div>
      </GlassModal>

      {/* Preview Modal */}
      <GlassModal
        open={Boolean(previewEntry)}
        onClose={() => setPreviewEntry(null)}
        title={previewEntry?.name || ''}
        subtitle={previewEntry ? `${previewEntry.relPath} · ${formatBytes(previewEntry.sizeBytes)}` : ''}
        maxWidthClass="max-w-2xl"
      >
        {previewEntry && (
          <div className="space-y-4 text-xs">
            {['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg'].includes(previewEntry.ext) ? (
              <div className="rounded-xl border border-black/10 dark:border-white/10 p-4 bg-black/5 dark:bg-black/40 flex justify-center">
                <img
                  src={`/api/workspace/file/preview?path=${encodeURIComponent(previewEntry.relPath)}`}
                  alt={previewEntry.name}
                  className="max-h-80 object-contain rounded"
                />
              </div>
            ) : previewText !== null ? (
              <pre className="rounded-xl border border-black/10 dark:border-white/10 bg-black/5 dark:bg-black/45 p-4 font-mono text-[11px] max-h-80 overflow-auto whitespace-pre-wrap">
                {previewText}
              </pre>
            ) : (
              <div className="py-8 text-center rounded-xl border border-black/10 dark:border-white/10">
                <FileText className="w-6 h-6 text-[var(--text-secondary)] mx-auto mb-2" />
                <p className="text-[var(--text-muted)]">
                  Binary {previewEntry.ext.toUpperCase()} asset ({formatBytes(previewEntry.sizeBytes)})
                </p>
              </div>
            )}
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  const p = previewEntry.relPath;
                  setPreviewEntry(null);
                  onPromoteToTarget([p], 'inspector');
                }}
                className="glass-interactive rounded-xl px-4 py-2 text-[var(--text-primary)] cursor-pointer"
              >
                Open in File Inspector
              </button>
              <button
                type="button"
                onClick={() => {
                  const p = previewEntry.relPath;
                  setPreviewEntry(null);
                  onPromoteToTarget([p], 'converter');
                }}
                className="rounded-xl bg-zinc-900 text-white dark:bg-white dark:text-black px-4 py-2 font-medium cursor-pointer"
              >
                Convert File
              </button>
            </div>
          </div>
        )}
      </GlassModal>
    </div>
  );
}
