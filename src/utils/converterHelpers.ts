import type { ConversionJob, FormatCategory, IdentifiedFileMetadata, UserSettings } from '../shared/types';

export function resolveDefaultTargetFormat(
  info: IdentifiedFileMetadata,
  settings: UserSettings,
  preferredTarget?: string
): string {
  if (preferredTarget && info.compatibleOutputs.includes(preferredTarget)) {
    return preferredTarget;
  }
  const categoryDefault =
    info.category !== 'unknown' ? settings.defaultOutputFormats?.[info.category] : undefined;
  if (categoryDefault && info.compatibleOutputs.includes(categoryDefault)) {
    return categoryDefault;
  }
  return info.recommendedOutputs[0]?.format || info.compatibleOutputs[0] || '';
}

export interface CategoryActivityStat {
  category: FormatCategory;
  count: number;
  bytes: number;
  sharePercent: number;
}

export function computeConversionActivity(jobs: ConversionJob[]): CategoryActivityStat[] {
  const completed = jobs.filter((j) => j.status === 'completed');
  if (completed.length === 0) return [];

  const buckets = new Map<FormatCategory, { count: number; bytes: number }>();
  for (const job of completed) {
    const prev = buckets.get(job.category) || { count: 0, bytes: 0 };
    buckets.set(job.category, {
      count: prev.count + 1,
      bytes: prev.bytes + job.inputSizeBytes,
    });
  }

  return Array.from(buckets.entries())
    .map(([category, data]) => ({
      category,
      count: data.count,
      bytes: data.bytes,
      sharePercent: Math.round((data.count / completed.length) * 100),
    }))
    .sort((a, b) => b.count - a.count || b.bytes - a.bytes);
}

export function getViewDirection(prevIndex: number, nextIndex: number): number {
  if (nextIndex === prevIndex) return 1;
  return nextIndex > prevIndex ? 1 : -1;
}
