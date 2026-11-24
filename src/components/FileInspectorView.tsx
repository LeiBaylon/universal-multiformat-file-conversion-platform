import { useEffect, useRef, useState } from 'react';
import { Download, FileSearch, Loader2, Upload } from 'lucide-react';
import type { IdentifiedFileMetadata } from '../shared/types';
import { formatBytes } from '../utils/formatters';
import { GlassSurface } from './glass/GlassSurface';

interface InspectedItem {
  name: string;
  source: 'upload' | 'workspace';
  relPath?: string;
  sha256: string;
  info: IdentifiedFileMetadata;
}

interface FileInspectorViewProps {
  workspacePathsToInspect?: string[] | null;
  onClearInitial?: () => void;
  onShowToast: (msg: string, kind?: 'info' | 'error') => void;
}

export function FileInspectorView({
  workspacePathsToInspect,
  onClearInitial,
  onShowToast,
}: FileInspectorViewProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [items, setItems] = useState<InspectedItem[]>([]);
  const [loading, setLoading] = useState(false);

  const inspectWorkspacePaths = async (paths: string[]) => {
    if (paths.length === 0) return;
    setLoading(true);
    try {
      const res = await fetch('/api/workspace/inspect-batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspacePaths: paths }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Inspection failed.');
      setItems(data.items || []);
    } catch (err) {
      onShowToast(err instanceof Error ? err.message : 'Batch inspection failed.', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (workspacePathsToInspect && workspacePathsToInspect.length > 0) {
      inspectWorkspacePaths(workspacePathsToInspect);
      onClearInitial?.();
    }
  }, [workspacePathsToInspect, onClearInitial]);

  const handleUploadFiles = async (files: File[]) => {
    if (files.length === 0) return;
    setLoading(true);
    try {
      const form = new FormData();
      files.forEach((f) => form.append('files', f));
      const res = await fetch('/api/workspace/inspect-batch', { method: 'POST', body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Inspection failed.');
      setItems((prev) => [...prev, ...(data.items || [])]);
    } catch (err) {
      onShowToast(err instanceof Error ? err.message : 'Upload inspection failed.', 'error');
    } finally {
      setLoading(false);
    }
  };

  const inspectAllWorkspace = async () => {
    const treeRes = await fetch('/api/workspace/tree');
    if (!treeRes.ok) return;
    const tree = await treeRes.json();
    const filePaths = (tree.entries || []).filter((e: { isDirectory: boolean }) => !e.isDirectory).map((e: { relPath: string }) => e.relPath);
    if (filePaths.length === 0) {
      onShowToast('No files in workspace to inspect.', 'error');
      return;
    }
    await inspectWorkspacePaths(filePaths.slice(0, 60));
  };

  const exportReport = (format: 'json' | 'csv') => {
    if (items.length === 0) return;
    let content = '';
    let mime = 'application/json';
    if (format === 'json') {
      content = JSON.stringify(items, null, 2);
    } else {
      mime = 'text/csv';
      const header = ['Name', 'Extension', 'Category', 'MIME', 'Bytes', 'MagicSignature', 'SHA256'];
      const rows = items.map((i) => [
        `"${i.name.replace(/"/g, '""')}"`,
        i.info.detectedExt,
        i.info.category,
        i.info.detectedMime,
        String(i.info.sizeBytes),
        `"${(i.info.magicSignature || 'text').replace(/"/g, '""')}"`,
        i.sha256,
      ]);
      content = [header.join(','), ...rows.map((r) => r.join(','))].join('\n');
    }
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `omnifiles_inspection_report.${format}`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <GlassSurface as="section" className="rounded-[22px] p-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="font-display text-lg font-semibold text-[var(--text-primary)]">
            File &amp; Batch Metadata Inspector
          </h2>
          <p className="text-xs text-[var(--text-muted)] mt-0.5 tabular-nums">
            Magic-byte format verification, MIME detection, SHA-256 digests, and JSON/CSV export ({items.length} inspected)
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <input
            ref={inputRef}
            type="file"
            multiple
            className="hidden"
            onChange={(e) => {
              handleUploadFiles(Array.from(e.target.files || []));
              e.target.value = '';
            }}
          />
          <button
            type="button"
            onClick={inspectAllWorkspace}
            className="glass-interactive rounded-xl px-3.5 py-2 text-xs font-medium text-[var(--text-primary)] cursor-pointer"
          >
            Inspect Workspace Files
          </button>
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="inline-flex items-center gap-1.5 rounded-xl bg-zinc-900 text-white dark:bg-white dark:text-black px-4 py-2 text-xs font-medium cursor-pointer"
          >
            {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
            Inspect Local Files
          </button>
          {items.length > 0 && (
            <>
              <button
                type="button"
                onClick={() => exportReport('csv')}
                className="glass-interactive inline-flex items-center gap-1 rounded-xl px-3 py-2 text-xs text-[var(--text-primary)] cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                CSV
              </button>
              <button
                type="button"
                onClick={() => exportReport('json')}
                className="glass-interactive inline-flex items-center gap-1 rounded-xl px-3 py-2 text-xs text-[var(--text-primary)] cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                JSON
              </button>
            </>
          )}
        </div>
      </GlassSurface>

      <GlassSurface as="section" className="rounded-[22px] p-6">
        {items.length === 0 ? (
          <div className="py-12 text-center space-y-2">
            <FileSearch className="w-7 h-7 text-[var(--text-secondary)] mx-auto" />
            <p className="text-sm text-[var(--text-primary)]">No files inspected yet</p>
            <p className="text-xs text-[var(--text-secondary)]">
              Upload one or multiple files or inspect your entire Managed Workspace at once.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-black/10 dark:border-white/10 text-[var(--text-muted)]">
                  <th className="py-2.5 pr-4 font-medium">File</th>
                  <th className="py-2.5 pr-4 font-medium">Format / Category</th>
                  <th className="py-2.5 pr-4 font-medium">MIME</th>
                  <th className="py-2.5 pr-4 font-medium">Size</th>
                  <th className="py-2.5 pr-4 font-medium">Signature &amp; Details</th>
                  <th className="py-2.5 font-medium">SHA-256 Digest</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-black/8 dark:divide-white/8">
                {items.map((item, idx) => (
                  <tr key={`${item.name}-${idx}`} className="align-top">
                    <td className="py-3 pr-4 font-medium text-[var(--text-primary)]">{item.name}</td>
                    <td className="py-3 pr-4 font-mono text-[var(--text-soft)]">
                      {item.info.detectedExt.toUpperCase()} · {item.info.category}
                    </td>
                    <td className="py-3 pr-4 font-mono text-[11px] text-[var(--text-muted)]">{item.info.detectedMime}</td>
                    <td className="py-3 pr-4 font-mono text-[var(--text-muted)] tabular-nums">
                      {formatBytes(item.info.sizeBytes)}
                    </td>
                    <td className="py-3 pr-4 text-[11px] text-[var(--text-secondary)] max-w-xs">
                      {item.info.magicSignature || 'Plaintext / Structural'}
                      {item.info.details.width ? ` · ${item.info.details.width}×${item.info.details.height}` : ''}
                    </td>
                    <td className="py-3 font-mono text-[11px] text-[var(--text-secondary)]">
                      {item.sha256.slice(0, 18)}…
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </GlassSurface>
    </div>
  );
}
