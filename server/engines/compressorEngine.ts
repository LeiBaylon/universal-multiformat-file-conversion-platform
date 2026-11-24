import fs from 'fs';
import path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';
import sharp from 'sharp';
import AdmZip from 'adm-zip';
import { optimize as svgoOptimize } from 'svgo';
import CleanCSS from 'clean-css';
import { minify as terserMinify } from 'terser';
import { path7za } from '7zip-bin';
import { ensureExecutablePermission, WORK_DIR } from '../services/security';
import { inspectMedia } from './mediaEngine';
import type { CompressionOptions, CompressionStats, FormatCategory } from '../../src/shared/types';

const execFileAsync = promisify(execFile);

const RASTER_COMPRESS_EXTS = new Set(['png', 'jpg', 'jpeg', 'webp', 'avif', 'tiff', 'tif', 'gif']);
const VIDEO_COMPRESS_EXTS = new Set(['mp4', 'webm', 'mkv', 'mov', 'avi', 'm4v', 'flv']);
const AUDIO_COMPRESS_EXTS = new Set(['mp3', 'wav', 'flac', 'aac', 'm4a', 'ogg', 'opus']);
const OOXML_COMPRESS_EXTS = new Set(['docx', 'xlsx', 'pptx', 'epub', 'odt', 'ods', 'odp']);
const WEB_DATA_COMPRESS_EXTS = new Set(['svg', 'css', 'js', 'json', 'ndjson', 'html', 'htm', 'xml']);
const ARCHIVE_COMPRESS_EXTS = new Set(['zip', '7z', 'gz', 'tgz', 'bz2', 'xz']);

function buildStats(
  originalBytes: number,
  outputBytes: number,
  durationMs: number,
  strategyUsed: string,
  targetSizeKb?: number
): CompressionStats {
  const savedBytes = originalBytes - outputBytes;
  const percentDelta =
    originalBytes > 0 ? Number((((outputBytes - originalBytes) / originalBytes) * 100).toFixed(1)) : 0;
  return {
    originalBytes,
    outputBytes,
    savedBytes,
    percentDelta,
    durationMs,
    strategyUsed,
    targetAchieved: targetSizeKb ? outputBytes <= targetSizeKb * 1024 : undefined,
  };
}

async function encodeSharpToExt(
  inputPath: string,
  ext: string,
  quality: number,
  maxWidth: number | undefined,
  stripMetadata: boolean
): Promise<Buffer> {
  let pipe = sharp(inputPath, { animated: ext === 'gif' || ext === 'webp' }).rotate();
  const meta = await sharp(inputPath).metadata();
  if (maxWidth && meta.width && meta.width > maxWidth) {
    pipe = pipe.resize({ width: maxWidth, withoutEnlargement: true });
  }
  if (!stripMetadata) {
    pipe = pipe.keepMetadata();
  }

  if (ext === 'jpg' || ext === 'jpeg') {
    return pipe.jpeg({ quality, mozjpeg: true }).toBuffer();
  }
  if (ext === 'webp') {
    return pipe.webp({ quality, effort: 5 }).toBuffer();
  }
  if (ext === 'avif') {
    return pipe.avif({ quality: Math.max(25, quality - 10), effort: 4 }).toBuffer();
  }
  if (ext === 'tiff' || ext === 'tif') {
    return pipe.tiff({ compression: 'lzw', quality }).toBuffer();
  }
  if (ext === 'gif') {
    return pipe.gif({ colours: Math.max(32, Math.min(256, Math.round((quality / 100) * 256))) }).toBuffer();
  }
  // PNG
  const palette = quality < 95;
  return pipe
    .png({
      compressionLevel: 9,
      palette,
      quality: palette ? quality : 100,
      effort: 8,
    })
    .toBuffer();
}

export async function compressFile(
  inputPath: string,
  outputPath: string,
  ext: string,
  category: FormatCategory | 'unknown',
  options: CompressionOptions
): Promise<{ stats: CompressionStats; engineUsed: string; previewKind: 'image' | 'audio' | 'video' | 'pdf' | 'text' | 'archive' | 'none' }> {
  const startedAt = Date.now();
  const lowerExt = ext.toLowerCase();
  const originalBytes = fs.statSync(inputPath).size;
  const stripMeta = options.stripMetadata !== false;

  // 1. Raster Images via Sharp (+ iterative target-size solver)
  if (RASTER_COMPRESS_EXTS.has(lowerExt) || category === 'image') {
    if (!RASTER_COMPRESS_EXTS.has(lowerExt)) {
      // Fallback: convert via ImageMagick / sharp to PNG/JPG
      const buf = await sharp(inputPath).png({ compressionLevel: 9, palette: options.goal !== 'lossless' }).toBuffer();
      fs.writeFileSync(outputPath, buf);
      return {
        stats: buildStats(originalBytes, buf.length, Date.now() - startedAt, 'Sharp raster recompression', options.targetSizeKb),
        engineUsed: 'Sharp',
        previewKind: 'image',
      };
    }

    if (options.goal === 'target-size' && options.targetSizeKb && options.targetSizeKb > 0) {
      const targetBytes = options.targetSizeKb * 1024;
      let bestBuf: Buffer | null = null;
      let usedQ = options.quality || 80;
      const meta = await sharp(inputPath).metadata();
      let widthCap = options.maxWidth || meta.width || 2400;

      // Binary search quality first, then progressively scale down width if still over budget
      for (const scaleFactor of [1, 0.78, 0.58, 0.42]) {
        const cap = Math.round(widthCap * scaleFactor);
        let lo = 18;
        let hi = 92;
        for (let step = 0; step < 5; step++) {
          const mid = Math.round((lo + hi) / 2);
          const candidate = await encodeSharpToExt(inputPath, lowerExt, mid, cap, stripMeta);
          if (!bestBuf || Math.abs(candidate.length - targetBytes) < Math.abs(bestBuf.length - targetBytes) || (candidate.length <= targetBytes && bestBuf.length > targetBytes)) {
            bestBuf = candidate;
            usedQ = mid;
          }
          if (candidate.length <= targetBytes) {
            lo = mid + 1;
          } else {
            hi = mid - 1;
          }
        }
        if (bestBuf && bestBuf.length <= targetBytes) break;
      }

      const finalBuf = bestBuf || (await encodeSharpToExt(inputPath, lowerExt, 65, options.maxWidth, stripMeta));
      fs.writeFileSync(outputPath, finalBuf);
      return {
        stats: buildStats(
          originalBytes,
          finalBuf.length,
          Date.now() - startedAt,
          `Target-size adaptive solver (Q${usedQ}, goal ${options.targetSizeKb} KB)`,
          options.targetSizeKb
        ),
        engineUsed: 'Sharp Target Solver',
        previewKind: 'image',
      };
    }

    const q = options.goal === 'lossless' ? 100 : options.quality || (options.goal === 'smallest' ? 58 : options.goal === 'best-quality' ? 90 : 78);
    const outBuf = await encodeSharpToExt(inputPath, lowerExt, q, options.maxWidth, stripMeta);
    fs.writeFileSync(outputPath, outBuf);
    return {
      stats: buildStats(
        originalBytes,
        outBuf.length,
        Date.now() - startedAt,
        options.goal === 'lossless'
          ? `Lossless ${lowerExt.toUpperCase()} re-encoding (level 9)`
          : `${lowerExt.toUpperCase()} quality ${q}%${stripMeta ? ' + metadata stripped' : ''}`,
        options.targetSizeKb
      ),
      engineUsed: 'Sharp (libvips)',
      previewKind: 'image',
    };
  }

  // 2. PDF via Ghostscript
  if (lowerExt === 'pdf') {
    const preset =
      options.pdfPreset ||
      (options.goal === 'smallest' || options.goal === 'target-size'
        ? 'screen'
        : options.goal === 'best-quality'
        ? 'printer'
        : 'ebook');
    await execFileAsync(
      'gs',
      [
        '-sDEVICE=pdfwrite',
        '-dCompatibilityLevel=1.4',
        `-dPDFSETTINGS=/${preset}`,
        '-dNOPAUSE',
        '-dQUIET',
        '-dBATCH',
        '-dDetectDuplicateImages=true',
        '-dCompressFonts=true',
        '-dSubsetFonts=true',
        `-sOutputFile=${outputPath}`,
        inputPath,
      ],
      { timeout: 120000 }
    );
    const outBytes = fs.statSync(outputPath).size;
    return {
      stats: buildStats(
        originalBytes,
        outBytes,
        Date.now() - startedAt,
        `Ghostscript /${preset} stream & font subset compression`,
        options.targetSizeKb
      ),
      engineUsed: 'Ghostscript',
      previewKind: 'pdf',
    };
  }

  // 3. Video via FFmpeg
  if (VIDEO_COMPRESS_EXTS.has(lowerExt) || category === 'video') {
    const args: string[] = ['-y', '-i', inputPath];
    const codec = options.videoCodec || (lowerExt === 'webm' ? 'libvpx-vp9' : 'libx264');
    const vFilters: string[] = [];
    if (options.videoResolution && options.videoResolution !== 'original' && options.videoResolution.includes('x')) {
      const [w, h] = options.videoResolution.split('x');
      vFilters.push(`scale=${w}:${h}:force_original_aspect_ratio=decrease,pad=ceil(iw/2)*2:ceil(ih/2)*2`);
    } else {
      vFilters.push('scale=ceil(iw/2)*2:ceil(ih/2)*2');
    }
    args.push('-vf', vFilters.join(','));

    let strategyDesc = '';
    if (options.goal === 'target-size' && options.targetSizeKb && options.targetSizeKb > 0) {
      const mediaInfo = await inspectMedia(inputPath);
      const dur = Math.max(1, Number(mediaInfo.durationSec) || 5);
      const totalKbps = Math.max(96, Math.floor((options.targetSizeKb * 8) / dur));
      const audioKbps = Math.min(128, Math.max(48, Math.floor(totalKbps * 0.18)));
      const videoKbps = Math.max(64, totalKbps - audioKbps);
      args.push(
        '-c:v',
        codec,
        '-b:v',
        `${videoKbps}k`,
        '-maxrate',
        `${Math.round(videoKbps * 1.25)}k`,
        '-bufsize',
        `${videoKbps * 2}k`,
        '-pix_fmt',
        'yuv420p',
        '-c:a',
        lowerExt === 'webm' ? 'libopus' : 'aac',
        '-b:a',
        `${audioKbps}k`
      );
      strategyDesc = `FFmpeg target-bitrate (${videoKbps} kbps video + ${audioKbps} kbps audio)`;
    } else {
      const crf =
        options.videoCrf ||
        (options.goal === 'smallest' ? 31 : options.goal === 'best-quality' ? 20 : 26);
      args.push(
        '-c:v',
        codec,
        '-crf',
        String(crf),
        '-preset',
        'veryfast',
        '-pix_fmt',
        'yuv420p',
        '-c:a',
        lowerExt === 'webm' ? 'libopus' : 'aac',
        '-b:a',
        options.audioBitrate || '128k'
      );
      strategyDesc = `FFmpeg ${codec} CRF ${crf}`;
    }

    if (lowerExt === 'mp4' || lowerExt === 'mov' || lowerExt === 'm4v') {
      args.push('-movflags', '+faststart');
    }
    if (stripMeta) args.push('-map_metadata', '-1');
    args.push(outputPath);

    await execFileAsync('ffmpeg', args, { timeout: 180000 });
    const outBytes = fs.statSync(outputPath).size;
    return {
      stats: buildStats(originalBytes, outBytes, Date.now() - startedAt, strategyDesc, options.targetSizeKb),
      engineUsed: 'FFmpeg 4.4',
      previewKind: ['mp4', 'webm', 'mov'].includes(lowerExt) ? 'video' : 'none',
    };
  }

  // 4. Audio via FFmpeg
  if (AUDIO_COMPRESS_EXTS.has(lowerExt) || category === 'audio') {
    const args: string[] = ['-y', '-i', inputPath, '-vn'];
    let strategyDesc = '';
    if (options.goal === 'target-size' && options.targetSizeKb && options.targetSizeKb > 0 && !['wav', 'flac'].includes(lowerExt)) {
      const info = await inspectMedia(inputPath);
      const dur = Math.max(1, Number(info.durationSec) || 5);
      const kbps = Math.max(32, Math.min(320, Math.floor((options.targetSizeKb * 8) / dur)));
      args.push('-b:a', `${kbps}k`);
      strategyDesc = `Target-bitrate ${kbps} kbps`;
    } else if (lowerExt === 'flac') {
      args.push('-c:a', 'flac', '-compression_level', '12');
      strategyDesc = 'Lossless FLAC level 12 compression';
    } else if (lowerExt === 'wav') {
      // Lossless WAV doesn't compress substantially without downsampling; keep honest 16-bit PCM or downsample if requested
      args.push('-c:a', 'pcm_s16le');
      if (options.audioSampleRate) args.push('-ar', String(options.audioSampleRate));
      strategyDesc = 'PCM s16le normalized stream';
    } else {
      const bitrate =
        options.audioBitrate ||
        (options.goal === 'smallest' ? '96k' : options.goal === 'best-quality' ? '256k' : '128k');
      args.push('-b:a', bitrate);
      strategyDesc = `${lowerExt.toUpperCase()} re-encoded at ${bitrate}`;
    }
    if (options.audioSampleRate && lowerExt !== 'wav') args.push('-ar', String(options.audioSampleRate));
    if (stripMeta) args.push('-map_metadata', '-1');
    args.push(outputPath);

    await execFileAsync('ffmpeg', args, { timeout: 120000 });
    const outBytes = fs.statSync(outputPath).size;
    return {
      stats: buildStats(originalBytes, outBytes, Date.now() - startedAt, strategyDesc, options.targetSizeKb),
      engineUsed: 'FFmpeg 4.4',
      previewKind: 'audio',
    };
  }

  // 5. OOXML Documents / Spreadsheets / Presentations / EPUB (recompress ZIP + optimize embedded rasters)
  if (OOXML_COMPRESS_EXTS.has(lowerExt)) {
    const zip = new AdmZip(inputPath);
    const outZip = new AdmZip();
    let optimizedImages = 0;

    for (const entry of zip.getEntries()) {
      if (entry.isDirectory) continue;
      let data = entry.getData();
      const entryLower = entry.entryName.toLowerCase();
      if ((entryLower.endsWith('.png') || entryLower.endsWith('.jpg') || entryLower.endsWith('.jpeg')) && options.goal !== 'lossless') {
        try {
          const q = options.quality || (options.goal === 'smallest' ? 65 : 80);
          const compacted = entryLower.endsWith('.png')
            ? await sharp(data).png({ compressionLevel: 9, palette: true, quality: q }).toBuffer()
            : await sharp(data).jpeg({ quality: q, mozjpeg: true }).toBuffer();
          if (compacted.length < data.length) {
            data = compacted;
            optimizedImages++;
          }
        } catch {
          // keep original entry bytes
        }
      }
      outZip.addFile(entry.entryName, data);
    }

    const buf = outZip.toBuffer();
    fs.writeFileSync(outputPath, buf);
    return {
      stats: buildStats(
        originalBytes,
        buf.length,
        Date.now() - startedAt,
        `Container deflate optimization${optimizedImages > 0 ? ` + ${optimizedImages} embedded media image(s) compressed` : ''}`,
        options.targetSizeKb
      ),
      engineUsed: 'OOXML / Sharp Media Optimizer',
      previewKind: 'none',
    };
  }

  // 6. Web & Data formats (SVG, CSS, JS, JSON, HTML, XML)
  if (WEB_DATA_COMPRESS_EXTS.has(lowerExt) || category === 'webdev' || category === 'data') {
    const raw = fs.readFileSync(inputPath, 'utf8');
    let outText = raw;
    let engineUsed = 'Text Minifier';
    let strategy = 'Whitespace & syntax compaction';

    if (lowerExt === 'svg') {
      outText = svgoOptimize(raw, { multipass: true }).data;
      engineUsed = 'SVGO';
      strategy = 'SVGO multipass path & attribute optimization';
    } else if (lowerExt === 'css') {
      outText = new CleanCSS({ level: 2 }).minify(raw).styles || raw;
      engineUsed = 'CleanCSS';
      strategy = 'CleanCSS Level 2 rule compaction';
    } else if (lowerExt === 'js') {
      const minified = await terserMinify(raw, { compress: true, mangle: true });
      outText = minified.code || raw;
      engineUsed = 'Terser';
      strategy = 'Terser AST dead-code & mangle pass';
    } else if (lowerExt === 'json') {
      outText = JSON.stringify(JSON.parse(raw));
      engineUsed = 'JSON Compact';
      strategy = 'Single-line JSON serialization';
    } else {
      outText = raw.replace(/>\s+</g, '><').replace(/[ \t]+/g, ' ').trim();
    }

    fs.writeFileSync(outputPath, outText, 'utf8');
    const outBytes = fs.statSync(outputPath).size;
    return {
      stats: buildStats(originalBytes, outBytes, Date.now() - startedAt, strategy, options.targetSizeKb),
      engineUsed,
      previewKind: lowerExt === 'svg' ? 'image' : 'text',
    };
  }

  // 7. Archives -> Re-pack at maximum compression level
  if (ARCHIVE_COMPRESS_EXTS.has(lowerExt)) {
    const tmpDir = path.join(WORK_DIR, `cmp_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`);
    fs.mkdirSync(tmpDir, { recursive: true });
    try {
      ensureExecutablePermission(path7za);
      await execFileAsync(path7za, ['x', '-y', `-o${tmpDir}`, inputPath], { timeout: 60000 });
      const level = options.archiveLevel ?? 9;
      if (lowerExt === '7z') {
        await execFileAsync(path7za, ['a', '-y', '-t7z', `-mx=${level}`, outputPath, '.'], { cwd: tmpDir, timeout: 90000 });
      } else if (lowerExt === 'zip') {
        await execFileAsync(path7za, ['a', '-y', '-tzip', `-mx=${level}`, outputPath, '.'], { cwd: tmpDir, timeout: 90000 });
      } else {
        await execFileAsync(path7za, ['a', '-y', `-mx=${level}`, outputPath, '.'], { cwd: tmpDir, timeout: 90000 });
      }
      const outBytes = fs.statSync(outputPath).size;
      return {
        stats: buildStats(
          originalBytes,
          outBytes,
          Date.now() - startedAt,
          `7-Zip Level ${level} re-compression`,
          options.targetSizeKb
        ),
        engineUsed: '7-Zip (p7zip)',
        previewKind: 'archive',
      };
    } finally {
      if (fs.existsSync(tmpDir)) fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  }

  // Fallback for general text/uncompressed formats -> compress safely into .gz if requested or throw informative message
  throw new Error(
    `Direct in-place compression is not supported for .${lowerExt.toUpperCase()}. Use ZIP & Archive Manager to pack this file into a compressed 7Z or XZ archive.`
  );
}
