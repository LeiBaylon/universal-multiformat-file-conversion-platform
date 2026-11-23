import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

export const APP_DATA_ROOT = path.resolve(process.cwd(), '.converter-storage');
export const UPLOAD_DIR = path.resolve(APP_DATA_ROOT, 'uploads');
export const OUTPUT_DIR = path.resolve(APP_DATA_ROOT, 'outputs');
export const WORK_DIR = path.resolve(APP_DATA_ROOT, 'work');
export const STATE_FILE = path.resolve(APP_DATA_ROOT, 'state.json');

export function ensureStorageDirs(): void {
  for (const dir of [APP_DATA_ROOT, UPLOAD_DIR, OUTPUT_DIR, WORK_DIR]) {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }
}

/**
 * Strictly confines a target path inside baseDir using path.resolve + trailing path.sep boundary check.
 */
export function confinePath(baseDir: string, unsafeRelativeOrName: string): string {
  const resolvedBase = path.resolve(baseDir);
  const cleaned = unsafeRelativeOrName.replace(/\0/g, '').replace(/^[/\\]+/, '');
  const resolvedTarget = path.resolve(resolvedBase, cleaned);
  if (resolvedTarget !== resolvedBase && !resolvedTarget.startsWith(resolvedBase + path.sep)) {
    throw new Error('Path traversal rejected: target escapes confined directory.');
  }
  return resolvedTarget;
}

export function sanitizeFilename(name: string): string {
  const base = path.basename(name.replace(/\0/g, ''));
  const sanitized = base.replace(/[^a-zA-Z0-9._-]/g, '_').replace(/^\.+/, '');
  return sanitized || `file_${crypto.randomBytes(4).toString('hex')}`;
}

export function createSafeId(prefix = 'job'): string {
  return `${prefix}_${Date.now()}_${crypto.randomBytes(5).toString('hex')}`;
}

export interface MagicDetection {
  ext: string;
  mime: string;
  signature: string;
}

export function detectMagicBytes(buffer: Buffer, originalName: string): MagicDetection {
  const extFromName = path.extname(originalName).toLowerCase().replace(/^\./, '');

  if (buffer.length >= 8) {
    // PNG
    if (
      buffer[0] === 0x89 &&
      buffer[1] === 0x50 &&
      buffer[2] === 0x4e &&
      buffer[3] === 0x47 &&
      buffer[4] === 0x0d &&
      buffer[5] === 0x0a &&
      buffer[6] === 0x1a &&
      buffer[7] === 0x0a
    ) {
      return { ext: 'png', mime: 'image/png', signature: '89 50 4E 47 0D 0A 1A 0A' };
    }
  }

  if (buffer.length >= 4) {
    // PDF
    if (buffer.subarray(0, 5).toString('ascii') === '%PDF-') {
      return { ext: 'pdf', mime: 'application/pdf', signature: '%PDF-' };
    }
    // JPEG
    if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
      return { ext: extFromName === 'jpeg' ? 'jpeg' : 'jpg', mime: 'image/jpeg', signature: 'FF D8 FF' };
    }
    // GIF
    const header6 = buffer.subarray(0, 6).toString('ascii');
    if (header6 === 'GIF87a' || header6 === 'GIF89a') {
      return { ext: 'gif', mime: 'image/gif', signature: header6 };
    }
    // PSD
    if (buffer.subarray(0, 4).toString('ascii') === '8BPS') {
      return { ext: 'psd', mime: 'image/vnd.adobe.photoshop', signature: '8BPS' };
    }
    // WEBP / WAV / AVI (RIFF)
    if (buffer.subarray(0, 4).toString('ascii') === 'RIFF' && buffer.length >= 12) {
      const form = buffer.subarray(8, 12).toString('ascii');
      if (form === 'WEBP') return { ext: 'webp', mime: 'image/webp', signature: 'RIFF/WEBP' };
      if (form === 'WAVE') return { ext: 'wav', mime: 'audio/wav', signature: 'RIFF/WAVE' };
      if (form === 'AVI ') return { ext: 'avi', mime: 'video/x-msvideo', signature: 'RIFF/AVI' };
    }
    // FLAC
    if (buffer.subarray(0, 4).toString('ascii') === 'fLaC') {
      return { ext: 'flac', mime: 'audio/flac', signature: 'fLaC' };
    }
    // OGG / OPUS / OGV / SPX
    if (buffer.subarray(0, 4).toString('ascii') === 'OggS') {
      const targetExt = ['opus', 'ogv', 'spx'].includes(extFromName) ? extFromName : 'ogg';
      return { ext: targetExt, mime: targetExt === 'ogv' ? 'video/ogg' : 'audio/ogg', signature: 'OggS' };
    }
    // AIFF
    if (buffer.subarray(0, 4).toString('ascii') === 'FORM' && buffer.length >= 12) {
      const sub = buffer.subarray(8, 12).toString('ascii');
      if (sub === 'AIFF' || sub === 'AIFC') {
        return { ext: extFromName === 'aif' ? 'aif' : 'aiff', mime: 'audio/aiff', signature: `FORM/${sub}` };
      }
    }
    // MP3 ID3 or sync
    if (buffer.subarray(0, 3).toString('ascii') === 'ID3' || (buffer[0] === 0xff && (buffer[1] & 0xe0) === 0xe0)) {
      if (extFromName === 'aac') return { ext: 'aac', mime: 'audio/aac', signature: 'ADTS' };
      if (extFromName === 'mp2') return { ext: 'mp2', mime: 'audio/mpeg', signature: 'MPEG-L2' };
      return { ext: 'mp3', mime: 'audio/mpeg', signature: buffer.subarray(0, 3).toString('ascii') === 'ID3' ? 'ID3' : 'FF FB' };
    }
    // GLB
    if (buffer.subarray(0, 4).toString('ascii') === 'glTF') {
      return { ext: 'glb', mime: 'model/gltf-binary', signature: 'glTF' };
    }
    // WOFF / WOFF2 / OTF / TTF
    const tag = buffer.subarray(0, 4).toString('ascii');
    if (tag === 'wOFF') return { ext: 'woff', mime: 'font/woff', signature: 'wOFF' };
    if (tag === 'wOF2') return { ext: 'woff2', mime: 'font/woff2', signature: 'wOF2' };
    if (tag === 'OTTO') return { ext: 'otf', mime: 'font/otf', signature: 'OTTO' };
    if (tag === 'ttcf') return { ext: 'ttc', mime: 'font/collection', signature: 'ttcf' };
    if (buffer[0] === 0x00 && buffer[1] === 0x01 && buffer[2] === 0x00 && buffer[3] === 0x00) {
      return { ext: 'ttf', mime: 'font/ttf', signature: '00 01 00 00' };
    }
    // BMP
    if (buffer[0] === 0x42 && buffer[1] === 0x4d) {
      return { ext: 'bmp', mime: 'image/bmp', signature: 'BM' };
    }
    // TIFF
    if (
      (buffer[0] === 0x49 && buffer[1] === 0x49 && buffer[2] === 0x2a && buffer[3] === 0x00) ||
      (buffer[0] === 0x4d && buffer[1] === 0x4d && buffer[2] === 0x00 && buffer[3] === 0x2a)
    ) {
      if (extFromName === 'dng') return { ext: 'dng', mime: 'image/x-adobe-dng', signature: 'TIFF/DNG' };
      return { ext: extFromName === 'tif' ? 'tif' : 'tiff', mime: 'image/tiff', signature: 'TIFF' };
    }
    // ICO / CUR
    if (buffer[0] === 0x00 && buffer[1] === 0x00 && buffer[2] === 0x01 && buffer[3] === 0x00) {
      return { ext: 'ico', mime: 'image/x-icon', signature: '00 00 01 00' };
    }
    if (buffer[0] === 0x00 && buffer[1] === 0x00 && buffer[2] === 0x02 && buffer[3] === 0x00) {
      return { ext: 'cur', mime: 'image/x-win-bitmap', signature: '00 00 02 00' };
    }
    // GZIP / TGZ
    if (buffer[0] === 0x1f && buffer[1] === 0x8b) {
      return { ext: extFromName === 'tgz' ? 'tgz' : 'gz', mime: 'application/gzip', signature: '1F 8B' };
    }
    // BZ2
    if (buffer.subarray(0, 3).toString('ascii') === 'BZh') {
      return { ext: 'bz2', mime: 'application/x-bzip2', signature: 'BZh' };
    }
    // XZ
    if (buffer[0] === 0xfd && buffer[1] === 0x37 && buffer[2] === 0x7a && buffer[3] === 0x58) {
      return { ext: 'xz', mime: 'application/x-xz', signature: 'FD 37 7A 58' };
    }
    // Matroska / WebM
    if (buffer[0] === 0x1a && buffer[1] === 0x45 && buffer[2] === 0xdf && buffer[3] === 0xa3) {
      const sample = buffer.subarray(0, 64).toString('latin1');
      if (sample.includes('webm') || extFromName === 'webm') {
        return { ext: 'webm', mime: 'video/webm', signature: 'EBML/webm' };
      }
      return { ext: 'mkv', mime: 'video/x-matroska', signature: 'EBML/matroska' };
    }
    // FLV
    if (buffer.subarray(0, 3).toString('ascii') === 'FLV') {
      return { ext: 'flv', mime: 'video/x-flv', signature: 'FLV' };
    }
    // ZIP-based containers (ZIP, DOCX, XLSX, PPTX, EPUB, ODT, ODS)
    if (buffer[0] === 0x50 && buffer[1] === 0x4b && (buffer[2] === 0x03 || buffer[2] === 0x05)) {
      if (['docx', 'docm', 'xlsx', 'xlsm', 'pptx', 'pptm', 'ppsx', 'epub', 'odt', 'ods', 'odp'].includes(extFromName)) {
        return { ext: extFromName, mime: 'application/zip', signature: `PK/${extFromName.toUpperCase()}` };
      }
      return { ext: 'zip', mime: 'application/zip', signature: '50 4B 03 04' };
    }
    // ISO Base Media (MP4, MOV, M4A, M4V, 3GP, HEIC, AVIF)
    if (buffer.length >= 12 && buffer.subarray(4, 8).toString('ascii') === 'ftyp') {
      const brand = buffer.subarray(8, 12).toString('ascii');
      if (brand === 'avif' || brand === 'avis') return { ext: 'avif', mime: 'image/avif', signature: `ftyp/${brand}` };
      if (['heic', 'heix', 'mif1', 'msf1'].includes(brand)) {
        return { ext: extFromName === 'heif' ? 'heif' : 'heic', mime: 'image/heic', signature: `ftyp/${brand}` };
      }
      if (brand === 'M4A ') return { ext: 'm4a', mime: 'audio/mp4', signature: 'ftyp/M4A' };
      if (brand === 'qt  ') return { ext: 'mov', mime: 'video/quicktime', signature: 'ftyp/qt' };
      if (brand.startsWith('3gp')) return { ext: '3gp', mime: 'video/3gpp', signature: `ftyp/${brand}` };
      if (['mov', 'm4v', 'm4a', 'alac', '3gp', '3g2'].includes(extFromName)) {
        return { ext: extFromName, mime: 'video/mp4', signature: `ftyp/${brand}` };
      }
      return { ext: 'mp4', mime: 'video/mp4', signature: `ftyp/${brand}` };
    }
    // PostScript / EPS
    if (buffer.subarray(0, 4).toString('ascii') === '%!PS') {
      return { ext: extFromName === 'ps' ? 'ps' : 'eps', mime: 'application/postscript', signature: '%!PS' };
    }
  }

  // Text heuristics for extensionless or plain text files
  const headText = buffer.subarray(0, Math.min(buffer.length, 512)).toString('utf8').trimStart();
  if (!extFromName) {
    if (headText.startsWith('<svg') || (headText.startsWith('<?xml') && headText.includes('<svg'))) {
      return { ext: 'svg', mime: 'image/svg+xml', signature: 'XML/SVG' };
    }
    if (headText.startsWith('WEBVTT')) return { ext: 'vtt', mime: 'text/vtt', signature: 'WEBVTT' };
    if (headText.startsWith('{') || headText.startsWith('[')) return { ext: 'json', mime: 'application/json', signature: 'JSON' };
    if (headText.startsWith('<?xml')) return { ext: 'xml', mime: 'application/xml', signature: 'XML' };
  }

  return {
    ext: extFromName || 'bin',
    mime: 'application/octet-stream',
    signature: extFromName ? `EXT:${extFromName.toUpperCase()}` : 'BINARY',
  };
}
