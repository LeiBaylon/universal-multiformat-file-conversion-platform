export function formatBytes(bytes: number | undefined): string {
  if (bytes === undefined || Number.isNaN(bytes)) return '—';
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const idx = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  const val = bytes / Math.pow(1024, idx);
  return `${val >= 100 ? val.toFixed(0) : val >= 10 ? val.toFixed(1) : val.toFixed(2)} ${units[idx]}`;
}

export function formatDeltaPercent(inputBytes: number, outputBytes?: number): { text: string; saved: boolean } | null {
  if (!inputBytes || !outputBytes) return null;
  const diff = ((outputBytes - inputBytes) / inputBytes) * 100;
  const rounded = Math.round(diff);
  if (rounded === 0) return { text: '0%', saved: true };
  return {
    text: `${rounded > 0 ? '+' : ''}${rounded}%`,
    saved: rounded <= 0,
  };
}

export function formatRelativeTime(isoDate: string): string {
  const diffSec = Math.max(0, Math.floor((Date.now() - new Date(isoDate).getTime()) / 1000));
  if (diffSec < 60) return `${diffSec}s ago`;
  const min = Math.floor(diffSec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  return new Date(isoDate).toLocaleDateString();
}
