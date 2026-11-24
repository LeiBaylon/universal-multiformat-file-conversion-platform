import fs from 'fs';
import path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { getFormatByExtension } from '../../src/shared/formats';
import type { ConversionOptions, IdentifiedFileMetadata } from '../../src/shared/types';
import { detectMagicBytes, ensureStorageDirs, WORK_DIR } from './security';
import { inspectImage, convertImageOrVector } from '../engines/imageEngine';
import { inspectMedia, convertMedia, mergeMediaFiles } from '../engines/mediaEngine';
import { inspectDocument, convertDocument, mergePdfFiles, renderTextToPdfBuffer, buildDocxBuffer } from '../engines/documentEngine';
import { inspectSpreadsheet, convertSpreadsheet } from '../engines/spreadsheetEngine';
import { inspectPresentation, convertPresentation, buildPptxFromText } from '../engines/presentationEngine';
import { inspectEbook, convertEbook, buildEpubBuffer } from '../engines/ebookEngine';
import { inspectArchive, convertArchive, createArchiveFromMultipleFiles } from '../engines/archiveEngine';
import { computeMeshStats, convertMesh, parseMesh } from '../engines/mesh3dEngine';
import { inspectFont, convertFont } from '../engines/fontEngine';
import { convertSubtitleContent, parseSubtitles } from '../engines/subtitleEngine';
import { convertDataContent } from '../engines/dataEngine';
import { transpileWebAsset } from '../engines/webdevEngine';
import { convertScientificContent } from '../engines/scientificEngine';
import * as XLSX from 'xlsx';

const execFileAsync = promisify(execFile);

export async function identifyFile(
  filePath: string,
  originalName: string,
  declaredMime?: string
): Promise<IdentifiedFileMetadata> {
  const stat = fs.statSync(filePath);
  const head = Buffer.alloc(Math.min(4096, stat.size));
  const fd = fs.openSync(filePath, 'r');
  try {
    fs.readSync(fd, head, 0, head.length, 0);
  } finally {
    fs.closeSync(fd);
  }

  const magic = detectMagicBytes(head, originalName);
  const extFromName = path.extname(originalName).toLowerCase().replace(/^\./, '');
  // Prefer specific text/code extension when magic falls back to generic or ext is known text format
  const detectedExt =
    magic.ext === 'bin' && extFromName
      ? extFromName
      : extFromName && ['scss', 'sass', 'less', 'ts', 'tsx', 'jsx', 'mdx', 'yaml', 'yml', 'toml', 'ini', 'properties', 'ndjson', 'sql', 'csv', 'tsv', 'srt', 'vtt', 'ass', 'ssa', 'sub', 'sbv', 'ttml', 'dfxp', 'xyz', 'mol', 'sdf', 'cif', 'fasta', 'fastq', 'obj', 'stl', 'ply', 'off', 'gltf', 'x3d', 'wrl', 'svg', 'eps', 'ps', 'fb2', 'md', 'html', 'htm', 'rtf'].includes(extFromName)
      ? extFromName
      : magic.ext;

  const fmt = getFormatByExtension(detectedExt);
  let details: Record<string, string | number | boolean | string[]> = {};
  let previewKind: IdentifiedFileMetadata['previewKind'] = 'none';
  let previewData: unknown = undefined;

  if (fmt) {
    switch (fmt.category) {
      case 'image':
      case 'vector':
        details = await inspectImage(filePath, detectedExt);
        if (['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp', 'ico', 'svg', 'avif'].includes(detectedExt)) {
          previewKind = 'image';
        }
        break;
      case 'audio':
        details = await inspectMedia(filePath);
        if (['mp3', 'wav', 'ogg', 'opus', 'flac', 'aac', 'm4a'].includes(detectedExt)) {
          previewKind = 'audio';
        }
        break;
      case 'video':
        details = await inspectMedia(filePath);
        if (['mp4', 'webm', 'ogg', 'ogv', 'mov'].includes(detectedExt)) {
          previewKind = 'video';
        }
        break;
      case 'document':
        details = await inspectDocument(filePath, detectedExt);
        if (detectedExt === 'pdf') previewKind = 'pdf';
        else if (['txt', 'md', 'html', 'htm', 'rtf'].includes(detectedExt)) {
          previewKind = 'text';
          previewData = fs.readFileSync(filePath, 'utf8').slice(0, 8000);
        }
        break;
      case 'spreadsheet': {
        details = inspectSpreadsheet(filePath, detectedExt);
        try {
          const wb = XLSX.readFile(filePath);
          const first = wb.SheetNames[0];
          if (first) {
            previewKind = 'spreadsheet';
            previewData = XLSX.utils.sheet_to_json(wb.Sheets[first], { header: 1 }).slice(0, 15);
          }
        } catch {
          // ignore
        }
        break;
      }
      case 'presentation':
        details = inspectPresentation(filePath, detectedExt);
        break;
      case 'ebook':
        details = inspectEbook(filePath, detectedExt);
        break;
      case 'archive':
        if (fmt.supportLevel !== 'unavailable') {
          const entries = await inspectArchive(filePath, detectedExt);
          details = { entries: entries.length };
          previewKind = 'archive';
          previewData = entries.slice(0, 40);
        }
        break;
      case 'model3d':
        if (fmt.supportLevel !== 'unavailable') {
          try {
            const mesh = parseMesh(fs.readFileSync(filePath), detectedExt);
            const stats = computeMeshStats(mesh);
            details = { vertices: stats.vertexCount, faces: stats.faceCount };
            previewKind = 'mesh3d';
            previewData = {
              vertices: mesh.vertices.slice(0, 3000),
              faces: mesh.faces.slice(0, 3000).filter(([a, b, c]) => a < 3000 && b < 3000 && c < 3000),
            };
          } catch {
            details = { format: detectedExt.toUpperCase() };
          }
        }
        break;
      case 'font':
        if (fmt.supportLevel !== 'unavailable') {
          details = inspectFont(filePath, detectedExt);
          previewKind = 'font';
        }
        break;
      case 'subtitle':
        if (fmt.supportLevel !== 'unavailable') {
          const raw = fs.readFileSync(filePath, 'utf8');
          const cues = parseSubtitles(raw, detectedExt);
          details = { cues: cues.length };
          previewKind = 'text';
          previewData = raw.slice(0, 8000);
        }
        break;
      case 'data':
      case 'webdev':
      case 'scientific':
        if (fmt.supportLevel !== 'unavailable') {
          const raw = fs.readFileSync(filePath, 'utf8');
          details = { lines: raw.split(/\r?\n/).length, bytes: stat.size };
          previewKind = 'text';
          previewData = raw.slice(0, 8000);
        }
        break;
    }
  }

  return {
    originalName,
    sizeBytes: stat.size,
    detectedExt,
    detectedMime: fmt?.mimeTypes[0] || declaredMime || magic.mime,
    magicSignature: magic.signature,
    category: fmt?.category || 'unknown',
    supportLevel: fmt?.supportLevel || 'unavailable',
    engine: fmt?.engine || 'none',
    compatibleOutputs: fmt?.compatibleOutputs || [],
    recommendedOutputs: fmt?.recommendedOutputs || [],
    details,
    previewKind,
    previewData,
    notes: fmt?.notes,
  };
}

export async function executeConversion(params: {
  inputPath: string;
  outputPath: string;
  sourceExt: string;
  targetExt: string;
  originalName: string;
  options: ConversionOptions;
}): Promise<{
  note: string;
  engineUsed: string;
  operationKind: 'conversion' | 'transpilation' | 'archive' | 'extraction';
  previewKind?: IdentifiedFileMetadata['previewKind'];
  previewData?: unknown;
  details?: Record<string, string | number | boolean | string[]>;
}> {
  const { inputPath, outputPath, sourceExt, targetExt, originalName, options } = params;
  const srcFmt = getFormatByExtension(sourceExt);
  const dstFmt = getFormatByExtension(targetExt);

  if (!srcFmt) {
    throw new Error(`Unrecognized source format ".${sourceExt}".`);
  }
  if (srcFmt.supportLevel === 'unavailable' || !srcFmt.inputSupported) {
    throw new Error(
      `${srcFmt.ext.toUpperCase()} conversion requires an external adapter (${srcFmt.notes || 'unavailable in current environment'}).`
    );
  }
  if (!srcFmt.compatibleOutputs.includes(targetExt.toLowerCase())) {
    throw new Error(
      `Incompatible conversion path: ${sourceExt.toUpperCase()} cannot be directly converted to ${targetExt.toUpperCase()}.`
    );
  }

  const src = sourceExt.toLowerCase();
  const dst = targetExt.toLowerCase();

  // Route by source category & engine
  if (srcFmt.category === 'image' || srcFmt.category === 'vector') {
    const res = await convertImageOrVector(inputPath, outputPath, src, dst, options);
    const details = await inspectImage(outputPath, dst);
    const previewKind = ['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp', 'ico', 'svg', 'avif'].includes(dst)
      ? 'image'
      : dst === 'pdf'
      ? 'pdf'
      : 'none';
    return {
      note: res.note,
      engineUsed: ['eps', 'ps', 'ai'].includes(src) || ['eps', 'ps'].includes(dst) ? 'Ghostscript' : 'ImageMagick',
      operationKind: 'conversion',
      previewKind,
      details,
    };
  }

  if (srcFmt.category === 'audio' || srcFmt.category === 'video') {
    const res = await convertMedia(inputPath, outputPath, src, dst, options);
    const details = await inspectMedia(outputPath);
    const isAudio = ['mp3', 'wav', 'ogg', 'opus', 'flac', 'aac', 'm4a'].includes(dst);
    const isVideo = ['mp4', 'webm', 'ogv', 'mov'].includes(dst);
    const isImg = ['png', 'jpg', 'webp', 'gif'].includes(dst);
    return {
      note: res.note,
      engineUsed: 'FFmpeg 4.4',
      operationKind: srcFmt.category === 'video' && isAudio ? 'extraction' : 'conversion',
      previewKind: isAudio ? 'audio' : isVideo ? 'video' : isImg ? 'image' : 'none',
      details,
    };
  }

  if (srcFmt.category === 'document') {
    const res = await convertDocument(inputPath, outputPath, src, dst, options, originalName);
    const previewKind =
      dst === 'pdf'
        ? 'pdf'
        : ['png', 'jpg', 'jpeg', 'webp', 'svg'].includes(dst)
        ? 'image'
        : ['txt', 'md', 'html', 'htm'].includes(dst)
        ? 'text'
        : 'none';
    return {
      note: res.note,
      engineUsed: dst === 'pdf' && src !== 'pdf' ? 'PDFKit' : src === 'pdf' ? 'Ghostscript / PDF-Lib' : 'Document Node Engine',
      operationKind: 'conversion',
      previewKind,
      previewData: previewKind === 'text' ? fs.readFileSync(outputPath, 'utf8').slice(0, 8000) : undefined,
    };
  }

  if (srcFmt.category === 'spreadsheet') {
    const res = await convertSpreadsheet(inputPath, outputPath, src, dst, options);
    const previewKind = ['csv', 'tsv', 'json', 'yaml', 'yml', 'xml', 'sql', 'html'].includes(dst)
      ? 'text'
      : dst === 'pdf'
      ? 'pdf'
      : 'spreadsheet';
    return {
      note: res.note,
      engineUsed: 'SheetJS (XLSX)',
      operationKind: 'conversion',
      previewKind,
      previewData: previewKind === 'text' ? fs.readFileSync(outputPath, 'utf8').slice(0, 8000) : undefined,
    };
  }

  if (srcFmt.category === 'presentation') {
    const res = await convertPresentation(inputPath, outputPath, src, dst);
    const previewKind = dst === 'pdf' ? 'pdf' : ['html', 'md', 'txt', 'json'].includes(dst) ? 'text' : 'none';
    return {
      note: res.note,
      engineUsed: 'Presentation Engine',
      operationKind: 'conversion',
      previewKind,
      previewData: previewKind === 'text' ? fs.readFileSync(outputPath, 'utf8').slice(0, 8000) : undefined,
    };
  }

  if (srcFmt.category === 'ebook') {
    const res = await convertEbook(inputPath, outputPath, src, dst, options);
    const previewKind = dst === 'pdf' ? 'pdf' : ['html', 'md', 'txt', 'fb2', 'json'].includes(dst) ? 'text' : 'none';
    return {
      note: res.note,
      engineUsed: 'EPUB 3 Engine',
      operationKind: 'conversion',
      previewKind,
      previewData: previewKind === 'text' ? fs.readFileSync(outputPath, 'utf8').slice(0, 8000) : undefined,
    };
  }

  if (srcFmt.category === 'archive') {
    const res = await convertArchive(inputPath, outputPath, src, dst, WORK_DIR, options.archiveCompressionLevel);
    const entries = await inspectArchive(outputPath, dst);
    return {
      note: res.note,
      engineUsed: 'Archive Engine',
      operationKind: 'archive',
      previewKind: 'archive',
      previewData: entries.slice(0, 40),
      details: { entries: entries.length },
    };
  }

  if (srcFmt.category === 'model3d') {
    const res = convertMesh(fs.readFileSync(inputPath), src, dst, options.scale || 1);
    fs.writeFileSync(outputPath, res.output);
    return {
      note: `Converted 3D mesh (${res.stats.vertexCount} vertices, ${res.stats.faceCount} faces) to ${dst.toUpperCase()}.`,
      engineUsed: 'Mesh3D Geometry Engine',
      operationKind: 'conversion',
      previewKind: 'mesh3d',
      previewData: res.meshPreview,
      details: { vertices: res.stats.vertexCount, faces: res.stats.faceCount },
    };
  }

  if (srcFmt.category === 'font') {
    const res = await convertFont(inputPath, outputPath, src, dst);
    return {
      note: res.note,
      engineUsed: 'FontEditor Core',
      operationKind: 'conversion',
      previewKind: 'font',
    };
  }

  if (srcFmt.category === 'subtitle') {
    const raw = fs.readFileSync(inputPath, 'utf8');
    const res = convertSubtitleContent(raw, src, dst, options.timeOffsetMs || 0);
    fs.writeFileSync(outputPath, res.output, options.encoding || 'utf8');
    return {
      note: `Converted ${res.cueCount} subtitle cue(s) (${src.toUpperCase()} -> ${dst.toUpperCase()}).`,
      engineUsed: 'Subtitle Cue Engine',
      operationKind: 'conversion',
      previewKind: 'text',
      previewData: res.output.slice(0, 8000),
      details: { cues: res.cueCount },
    };
  }

  if (srcFmt.category === 'data') {
    const raw = fs.readFileSync(inputPath, 'utf8');
    const res = convertDataContent(raw, src, dst, {
      pretty: options.prettyPrint !== false,
      minify: options.minify,
    });
    fs.writeFileSync(outputPath, res.output);
    const isText = dst !== 'xlsx';
    return {
      note: `Converted ${res.recordCount} structured record(s) from ${src.toUpperCase()} to ${dst.toUpperCase()}.`,
      engineUsed: 'Structured Data Engine',
      operationKind: 'conversion',
      previewKind: isText ? 'text' : 'spreadsheet',
      previewData: isText ? String(res.output).slice(0, 8000) : undefined,
      details: { records: res.recordCount },
    };
  }

  if (srcFmt.category === 'webdev') {
    const raw = fs.readFileSync(inputPath, 'utf8');
    const res = await transpileWebAsset(raw, src, dst, { minify: options.minify });
    fs.writeFileSync(outputPath, res.output, 'utf8');
    return {
      note: res.note,
      engineUsed: dstFmt?.engine === 'webdev-node' ? 'Web Transpiler (Sass/Less/TS)' : 'Web Asset Compiler',
      operationKind: res.operationKind,
      previewKind: 'text',
      previewData: res.output.slice(0, 8000),
    };
  }

  if (srcFmt.category === 'scientific') {
    const raw = fs.readFileSync(inputPath, 'utf8');
    const res = convertScientificContent(raw, src, dst);
    fs.writeFileSync(outputPath, res.output, 'utf8');
    return {
      note: `Converted scientific dataset from ${src.toUpperCase()} to ${dst.toUpperCase()}.`,
      engineUsed: 'Scientific & Bio Engine',
      operationKind: 'conversion',
      previewKind: 'text',
      previewData: res.output.slice(0, 8000),
      details: res.summary,
    };
  }

  throw new Error(`No active engine handler for ${sourceExt} -> ${targetExt}`);
}

export async function executeMultiMerge(
  fileEntries: { path: string; originalName: string }[],
  outputPath: string,
  mode: 'pdf-merge' | 'audio-merge' | 'video-merge' | 'archive-pack',
  targetExt: string,
  options: ConversionOptions = {}
): Promise<{ note: string; engineUsed: string }> {
  if (mode === 'pdf-merge') {
    const res = await mergePdfFiles(
      fileEntries.map((f) => f.path),
      outputPath
    );
    return { note: res.note, engineUsed: 'PDF-Lib' };
  }
  if (mode === 'audio-merge' || mode === 'video-merge') {
    const res = await mergeMediaFiles(
      fileEntries.map((f) => f.path),
      outputPath,
      targetExt,
      WORK_DIR
    );
    return { note: res.note, engineUsed: 'FFmpeg 4.4' };
  }
  const res = await createArchiveFromMultipleFiles(
    fileEntries,
    outputPath,
    targetExt,
    WORK_DIR,
    options.archiveCompressionLevel || 6
  );
  return { note: res.note, engineUsed: 'Archive Engine' };
}

/**
 * Generates real, valid sample files for instant testing across every conversion category.
 */
export async function generateSampleFileBuffer(ext: string): Promise<{ filename: string; buffer: Buffer; mime: string }> {
  ensureStorageDirs();
  const fmt = ext.toLowerCase();
  switch (fmt) {
    case 'png': {
      const tmp = path.join(WORK_DIR, `sample_${Date.now()}.png`);
      await execFileAsync(
        'convert',
        ['-size', '640x400', 'radial-gradient:#ffffff-#18181b', '-fill', '#000000', '-draw', 'circle 320,200 320,120', tmp],
        { timeout: 15000 }
      );
      const buffer = fs.readFileSync(tmp);
      fs.unlinkSync(tmp);
      return { filename: 'sample_monolith.png', buffer, mime: 'image/png' };
    }
    case 'svg':
      return {
        filename: 'sample_vector.svg',
        mime: 'image/svg+xml',
        buffer: Buffer.from(
          `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 240" width="240" height="240"><rect width="240" height="240" rx="48" fill="#141414"/><circle cx="120" cy="120" r="64" fill="none" stroke="#ffffff" stroke-width="10"/><circle cx="120" cy="120" r="18" fill="#ffffff"/></svg>`,
          'utf8'
        ),
      };
    case 'pdf': {
      const buffer = await renderTextToPdfBuffer(
        'Aether Sample Specification',
        '# Aether Universal Conversion Spec\n\n## Overview\nThis is a genuine multi-paragraph PDF sample generated on the server for testing PDF-to-DOCX, PDF-to-PNG, PDF-to-TXT, and compression pipelines.\n\n## Capabilities\n- Exact UTF-8 text extraction\n- Ghostscript high-DPI rasterization\n- PDF-Lib page rotation and splitting'
      );
      return { filename: 'sample_spec.pdf', buffer, mime: 'application/pdf' };
    }
    case 'docx': {
      const buffer = await buildDocxBuffer(
        '# Quarterly Engineering Review\n\n## Summary\nAll conversion pipelines are verified against deterministic output schemas.\n\nThis DOCX archive can be converted to PDF, Markdown, HTML, EPUB, or Plain Text.'
      );
      return {
        filename: 'sample_report.docx',
        buffer,
        mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      };
    }
    case 'xlsx': {
      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.json_to_sheet([
        { Format: 'PNG', Category: 'Image', Engine: 'ImageMagick', LatencyMs: 42 },
        { Format: 'MP4', Category: 'Video', Engine: 'FFmpeg', LatencyMs: 310 },
        { Format: 'WOFF2', Category: 'Font', Engine: 'FontEditor', LatencyMs: 28 },
        { Format: 'GLB', Category: '3D', Engine: 'Mesh3D', LatencyMs: 14 },
      ]);
      XLSX.utils.book_append_sheet(wb, ws, 'Formats');
      const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
      return {
        filename: 'sample_metrics.xlsx',
        buffer,
        mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      };
    }
    case 'pptx': {
      const buffer = await buildPptxFromText(
        '# Aether Architecture\nZero-pill Liquid Glass design\nDeterministic conversion pipelines\n---\n# Engine Matrix\nImageMagick, Ghostscript, FFmpeg 4.4\nSheetJS, PDF-Lib, Mesh3D',
        'Aether Overview'
      );
      return {
        filename: 'sample_deck.pptx',
        buffer,
        mime: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      };
    }
    case 'wav': {
      const tmp = path.join(WORK_DIR, `sample_${Date.now()}.wav`);
      await execFileAsync(
        'ffmpeg',
        ['-y', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=2', '-ar', '44100', '-ac', '2', tmp],
        { timeout: 15000 }
      );
      const buffer = fs.readFileSync(tmp);
      fs.unlinkSync(tmp);
      return { filename: 'sample_tone_440hz.wav', buffer, mime: 'audio/wav' };
    }
    case 'mp4': {
      const tmp = path.join(WORK_DIR, `sample_${Date.now()}.mp4`);
      await execFileAsync(
        'ffmpeg',
        [
          '-y',
          '-f', 'lavfi', '-i', 'testsrc=duration=2:size=480x270:rate=24',
          '-f', 'lavfi', '-i', 'sine=frequency=523:duration=2',
          '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', tmp,
        ],
        { timeout: 30000 }
      );
      const buffer = fs.readFileSync(tmp);
      fs.unlinkSync(tmp);
      return { filename: 'sample_clip.mp4', buffer, mime: 'video/mp4' };
    }
    case 'epub': {
      const buffer = await buildEpubBuffer({
        title: 'The Liquid Glass Monograph',
        author: 'Aether Press',
        chapters: [
          { title: 'Chapter 1: Clarity', html: '<p>Precision interfaces emerge when ornament yields to structure.</p>' },
          { title: 'Chapter 2: Depth', html: '<p>Translucency creates spatial hierarchy across monochromatic surfaces.</p>' },
        ],
      });
      return { filename: 'sample_book.epub', buffer, mime: 'application/epub+zip' };
    }
    case 'zip':
    case '7z': {
      const tmpDir = path.join(WORK_DIR, `sz_${Date.now()}`);
      const tmpArc = path.join(WORK_DIR, `sz_${Date.now()}.${fmt}`);
      fs.mkdirSync(tmpDir, { recursive: true });
      fs.writeFileSync(path.join(tmpDir, 'readme.txt'), `Sample archive content inside ${fmt.toUpperCase()}.`, 'utf8');
      fs.writeFileSync(path.join(tmpDir, 'config.json'), '{"version":2,"mode":"monochrome"}', 'utf8');
      await createArchiveFromMultipleFiles(
        [
          { path: path.join(tmpDir, 'readme.txt'), originalName: 'readme.txt' },
          { path: path.join(tmpDir, 'config.json'), originalName: 'config.json' },
        ],
        tmpArc,
        fmt,
        WORK_DIR
      );
      const buffer = fs.readFileSync(tmpArc);
      fs.rmSync(tmpDir, { recursive: true, force: true });
      fs.unlinkSync(tmpArc);
      return {
        filename: `sample_bundle.${fmt}`,
        buffer,
        mime: fmt === '7z' ? 'application/x-7z-compressed' : 'application/zip',
      };
    }
    case 'obj': {
      // Clean octahedron mesh
      const obj = [
        '# Sample Octahedron',
        'v 0 1 0',
        'v 1 0 0',
        'v 0 0 1',
        'v -1 0 0',
        'v 0 0 -1',
        'v 0 -1 0',
        'f 1 2 3',
        'f 1 3 4',
        'f 1 4 5',
        'f 1 5 2',
        'f 6 3 2',
        'f 6 4 3',
        'f 6 5 4',
        'f 6 2 5',
      ].join('\n');
      return { filename: 'sample_octahedron.obj', buffer: Buffer.from(obj, 'utf8'), mime: 'model/obj' };
    }
    case 'srt':
      return {
        filename: 'sample_captions.srt',
        mime: 'application/x-subrip',
        buffer: Buffer.from(
          `1\n00:00:00,500 --> 00:00:03,200\nWelcome to Aether Universal Converter.\n\n2\n00:00:03,500 --> 00:00:06,800\nSubtitles support millisecond sync offsets.\n`,
          'utf8'
        ),
      };
    case 'yaml':
      return {
        filename: 'sample_pipeline.yaml',
        mime: 'application/x-yaml',
        buffer: Buffer.from(
          `service: aether-convert\nversion: 2\nengines:\n  - name: ffmpeg\n    category: media\n  - name: imagemagick\n    category: raster\n`,
          'utf8'
        ),
      };
    case 'scss':
      return {
        filename: 'sample_glass.scss',
        mime: 'text/x-scss',
        buffer: Buffer.from(
          `$glass-bg: rgba(255, 255, 255, 0.06);\n.panel {\n  background: $glass-bg;\n  .title { color: #ffffff; font-weight: 600; }\n}\n`,
          'utf8'
        ),
      };
    case 'xyz':
      return {
        filename: 'sample_benzene.xyz',
        mime: 'chemical/x-xyz',
        buffer: Buffer.from(
          `6\nBenzene Carbon Ring\nC  1.3900  0.0000  0.0000\nC  0.6950  1.2038  0.0000\nC -0.6950  1.2038  0.0000\nC -1.3900  0.0000  0.0000\nC -0.6950 -1.2038  0.0000\nC  0.6950 -1.2038  0.0000\n`,
          'utf8'
        ),
      };
    default: {
      if (fmt === 'json') {
        return {
          filename: 'sample_records.json',
          mime: 'application/json',
          buffer: Buffer.from('[{"id":1,"format":"JSON"},{"id":2,"format":"YAML"}]', 'utf8'),
        };
      }
      if (fmt === 'vtt') {
        return {
          filename: 'sample.vtt',
          mime: 'text/vtt',
          buffer: Buffer.from('WEBVTT\n\n1\n00:00:00.000 --> 00:00:02.500\nSample cue\n', 'utf8'),
        };
      }
      if (fmt === 'off') {
        return {
          filename: 'sample.off',
          mime: 'model/off',
          buffer: Buffer.from('OFF\n3 1 0\n0 0 0\n1 0 0\n0 1 0\n3 0 1 2\n', 'utf8'),
        };
      }
      return {
        filename: `sample.${fmt}`,
        mime: 'text/plain',
        buffer: Buffer.from(`Sample ${fmt.toUpperCase()} document content.\n`, 'utf8'),
      };
    }
  }
}
