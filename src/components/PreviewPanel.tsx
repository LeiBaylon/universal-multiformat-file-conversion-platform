import type { IdentifiedFileMetadata } from '../shared/types';
import { formatBytes } from '../utils/formatters';
import { MeshPreviewCanvas } from './MeshPreviewCanvas';

interface PreviewPanelProps {
  kind?: IdentifiedFileMetadata['previewKind'];
  url?: string;
  data?: unknown;
  label: string;
  ext: string;
}

export function PreviewPanel({ kind, url, data, label, ext }: PreviewPanelProps) {
  if (!kind || kind === 'none') {
    return (
      <div className="rounded-xl border border-black/10 dark:border-white/12 bg-black/4 dark:bg-black/45 p-6 text-center">
        <p className="text-sm font-medium text-[var(--text-primary)]">{label}</p>
        <p className="text-xs text-[var(--text-muted)] mt-1">
          Binary {ext.toUpperCase()} output ready for download. Inline visual preview is not applicable to this container.
        </p>
      </div>
    );
  }

  if (kind === 'image' && url) {
    return (
      <div className="rounded-xl border border-black/10 dark:border-white/12 bg-[#f3f3f6] dark:bg-[#080808] overflow-hidden">
        <div className="flex items-center justify-center p-4 min-h-[200px] max-h-[300px] bg-[radial-gradient(#d4d4d8_1px,transparent_1px)] dark:bg-[radial-gradient(#1f1f1f_1px,transparent_1px)] [background-size:14px_14px]">
          <img
            src={url}
            alt={label}
            referrerPolicy="no-referrer"
            className="max-h-[260px] max-w-full object-contain rounded"
          />
        </div>
      </div>
    );
  }

  if (kind === 'audio' && url) {
    return (
      <div className="rounded-xl border border-black/10 dark:border-white/12 bg-black/4 dark:bg-[#080808] p-5">
        <p className="text-xs text-[var(--text-muted)] mb-3">{label} · Audio Playback</p>
        <audio controls src={url} className="w-full" />
      </div>
    );
  }

  if (kind === 'video' && url) {
    return (
      <div className="rounded-xl border border-black/10 dark:border-white/12 bg-black overflow-hidden">
        <video controls src={url} className="w-full max-h-[280px] bg-black" />
      </div>
    );
  }

  if (kind === 'pdf' && url) {
    return (
      <div className="rounded-xl border border-black/10 dark:border-white/12 bg-white overflow-hidden">
        <iframe title={label} src={url} className="w-full h-[280px] bg-white" />
      </div>
    );
  }

  if (kind === 'mesh3d' && data && typeof data === 'object') {
    const mesh = data as { vertices: { x: number; y: number; z: number }[]; faces: [number, number, number][] };
    return <MeshPreviewCanvas mesh={mesh} />;
  }

  if (kind === 'archive' && Array.isArray(data)) {
    const entries = data as { name: string; size: number; isDirectory: boolean }[];
    return (
      <div className="rounded-xl border border-black/10 dark:border-white/12 bg-black/4 dark:bg-[#080808] max-h-[240px] overflow-y-auto divide-y divide-black/8 dark:divide-white/8">
        {entries.map((e, i) => (
          <div key={i} className="px-3.5 py-2 flex items-center justify-between text-xs">
            <span className="font-mono text-[var(--text-primary)] truncate pr-4">
              {e.isDirectory ? `${e.name}/` : e.name}
            </span>
            <span className="text-[var(--text-muted)] tabular-nums shrink-0">
              {e.isDirectory ? 'DIR' : formatBytes(e.size)}
            </span>
          </div>
        ))}
      </div>
    );
  }

  if (kind === 'spreadsheet' && Array.isArray(data)) {
    const rows = data as unknown[][];
    return (
      <div className="rounded-xl border border-black/10 dark:border-white/12 bg-black/4 dark:bg-[#080808] max-h-[240px] overflow-auto">
        <table className="w-full text-left text-xs border-collapse">
          <tbody>
            {rows.map((row, rIdx) => (
              <tr
                key={rIdx}
                className={
                  rIdx === 0
                    ? 'bg-black/6 dark:bg-white/8 font-medium text-[var(--text-primary)]'
                    : 'border-t border-black/8 dark:border-white/8 text-[var(--text-soft)]'
                }
              >
                {(row || []).slice(0, 8).map((cell, cIdx) => (
                  <td key={cIdx} className="px-3 py-1.5 whitespace-nowrap max-w-[180px] truncate">
                    {String(cell ?? '')}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  if (kind === 'text' && typeof data === 'string') {
    return (
      <div className="rounded-xl border border-black/10 dark:border-white/12 bg-black/4 dark:bg-[#080808] p-4 max-h-[260px] overflow-auto">
        <pre className="text-xs font-mono text-[var(--text-soft)] whitespace-pre-wrap break-words leading-relaxed">
          {data}
        </pre>
      </div>
    );
  }

  if (kind === 'font') {
    return (
      <div className="rounded-xl border border-black/10 dark:border-white/12 bg-black/4 dark:bg-[#080808] p-6 space-y-2">
        <p className="text-2xl font-display text-[var(--text-primary)] tracking-tight">Aa Bb Cc 1234567890</p>
        <p className="text-sm text-[var(--text-muted)]">The quick brown fox jumps over the lazy dog.</p>
      </div>
    );
  }

  return null;
}
