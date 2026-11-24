import type {
  CompressionGoal,
  CompressionOptions,
  FormatCategory,
  IdentifiedFileMetadata,
  SmartRecommendation,
} from '../shared/types';

export type ConversionIntent = 'balanced' | 'web' | 'print' | 'smallest' | 'editing' | 'transparency';

const TRANSPARENCY_TARGETS = new Set(['png', 'webp', 'avif', 'tiff', 'gif', 'ico', 'svg']);
const SMALLEST_TARGETS = new Set(['avif', 'webp', 'opus', 'webm', 'xz', '7z', 'woff2', 'glb', 'json']);
const WEB_TARGETS = new Set(['webp', 'avif', 'svg', 'mp4', 'webm', 'opus', 'mp3', 'woff2', 'vtt', 'json', 'css', 'js', 'html']);
const PRINT_TARGETS = new Set(['pdf', 'tiff', 'eps', 'ps', 'otf']);
const EDITING_TARGETS = new Set(['png', 'tiff', 'wav', 'flac', 'docx', 'xlsx', 'obj', 'ttf', 'md', 'yaml', 'srt']);

export function recommendConversionIntelligence(
  meta: Pick<IdentifiedFileMetadata, 'detectedExt' | 'category' | 'compatibleOutputs' | 'recommendedOutputs'>,
  intent: ConversionIntent
): SmartRecommendation[] {
  const compatible = meta.compatibleOutputs || [];
  if (compatible.length === 0) return [];
  if (intent === 'balanced' && meta.recommendedOutputs.length > 0) {
    return meta.recommendedOutputs;
  }

  const scored = compatible.map((ext, idx) => {
    let score = Math.max(0, 20 - idx * 0.25);
    let badge = 'Compatible';
    let reason = `Converts ${meta.detectedExt.toUpperCase()} to ${ext.toUpperCase()}.`;

    if (intent === 'transparency' && TRANSPARENCY_TARGETS.has(ext)) {
      score += 100;
      badge = 'Alpha Safe';
      reason = `Preserves alpha transparency channel cleanly in ${ext.toUpperCase()}.`;
    } else if (intent === 'smallest' && SMALLEST_TARGETS.has(ext)) {
      score += 100;
      badge = 'Compact Footprint';
      reason = `High-efficiency codec/container focused on minimal byte size.`;
    } else if (intent === 'web' && WEB_TARGETS.has(ext)) {
      score += 100;
      badge = 'Web Native';
      reason = `Broad browser compatibility and fast network streaming.`;
    } else if (intent === 'print' && PRINT_TARGETS.has(ext)) {
      score += 100;
      badge = 'Print Master';
      reason = `Maintains fixed pagination, print vectors, or archival color fidelity.`;
    } else if (intent === 'editing' && EDITING_TARGETS.has(ext)) {
      score += 100;
      badge = 'Editable / Lossless';
      reason = `Avoids destructive generational loss for downstream editing.`;
    }

    return { ext, score, badge, reason };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, 4).map(({ ext, badge, reason }) => ({ format: ext, badge, reason }));
}

export function buildCompressionPresetOptions(
  category: FormatCategory | 'unknown',
  goal: CompressionGoal,
  targetSizeKb?: number
): CompressionOptions {
  const base: CompressionOptions = {
    goal,
    targetSizeKb: goal === 'target-size' ? targetSizeKb : undefined,
    stripMetadata: goal === 'smallest' || goal === 'target-size',
    preserveDimensions: goal !== 'smallest',
  };

  if (category === 'image' || category === 'vector') {
    if (goal === 'lossless') return { ...base, quality: 100, stripMetadata: true };
    if (goal === 'best-quality') return { ...base, quality: 90, stripMetadata: false };
    if (goal === 'smallest') return { ...base, quality: 58, maxWidth: 1920, preserveDimensions: false, stripMetadata: true };
    return { ...base, quality: 78, stripMetadata: true };
  }

  if (category === 'video') {
    if (goal === 'best-quality') return { ...base, videoCodec: 'libx264', videoCrf: 20, videoResolution: 'original' };
    if (goal === 'smallest') return { ...base, videoCodec: 'libx264', videoCrf: 31, videoResolution: '1280x720', preserveDimensions: false };
    return { ...base, videoCodec: 'libx264', videoCrf: 26, videoResolution: 'original' };
  }

  if (category === 'audio') {
    if (goal === 'lossless') return { ...base, audioBitrate: '320k', audioSampleRate: 44100 };
    if (goal === 'best-quality') return { ...base, audioBitrate: '256k', audioSampleRate: 44100 };
    if (goal === 'smallest') return { ...base, audioBitrate: '96k', audioSampleRate: 44100 };
    return { ...base, audioBitrate: '128k', audioSampleRate: 44100 };
  }

  if (category === 'document') {
    if (goal === 'best-quality') return { ...base, pdfPreset: 'printer' };
    if (goal === 'smallest') return { ...base, pdfPreset: 'screen' };
    return { ...base, pdfPreset: 'ebook' };
  }

  if (category === 'archive') {
    return { ...base, archiveLevel: goal === 'best-quality' ? 6 : 9 };
  }

  return base;
}

const HIGH_COMPRESSIBILITY_EXTS = new Set([
  'txt', 'md', 'html', 'htm', 'css', 'scss', 'less', 'js', 'ts', 'tsx', 'jsx',
  'json', 'yaml', 'yml', 'xml', 'csv', 'tsv', 'sql', 'svg', 'srt', 'vtt', 'ass',
  'obj', 'stl', 'ply', 'off', 'xyz', 'mol', 'sdf', 'cif', 'fasta', 'fastq', 'wav', 'bmp', 'tiff',
]);

const LOW_COMPRESSIBILITY_EXTS = new Set([
  'png', 'jpg', 'jpeg', 'webp', 'avif', 'heic', 'mp3', 'aac', 'm4a', 'ogg', 'opus',
  'mp4', 'mkv', 'webm', 'mov', 'zip', '7z', 'gz', 'tgz', 'bz2', 'xz', 'zst', 'woff2',
]);

export function estimateArchiveFootprint(
  files: { name: string; size: number }[],
  targetExt: string,
  compressionLevel: number
): { totalInputBytes: number; estimatedOutputBytes: number; estimatedReductionPct: number } {
  const totalInputBytes = files.reduce((acc, f) => acc + Math.max(0, f.size), 0);
  if (totalInputBytes === 0) {
    return { totalInputBytes: 0, estimatedOutputBytes: 0, estimatedReductionPct: 0 };
  }
  if (targetExt === 'tar' || compressionLevel === 0) {
    const overhead = files.length * 1024;
    return {
      totalInputBytes,
      estimatedOutputBytes: totalInputBytes + overhead,
      estimatedReductionPct: 0,
    };
  }

  const levelFactor = Math.min(1, Math.max(0.2, compressionLevel / 9));
  const algoBoost = targetExt === '7z' || targetExt === 'xz' ? 1.15 : targetExt === 'bz2' ? 1.06 : 1.0;

  let estimated = 0;
  for (const f of files) {
    const ext = f.name.split('.').pop()?.toLowerCase() || '';
    let keepRatio = 0.72;
    if (HIGH_COMPRESSIBILITY_EXTS.has(ext)) keepRatio = 0.34;
    else if (LOW_COMPRESSIBILITY_EXTS.has(ext)) keepRatio = 0.97;
    const adjustedKeep = 1 - Math.min(0.85, (1 - keepRatio) * (0.65 + 0.35 * levelFactor) * algoBoost);
    estimated += Math.round(f.size * adjustedKeep);
  }
  const estimatedOutputBytes = Math.max(128, estimated + files.length * 160);
  const estimatedReductionPct = Math.max(0, Math.round(((totalInputBytes - estimatedOutputBytes) / totalInputBytes) * 100));
  return { totalInputBytes, estimatedOutputBytes, estimatedReductionPct };
}
