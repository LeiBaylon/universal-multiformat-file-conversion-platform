import { execFile } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';
import { PDFDocument } from 'pdf-lib';
import { optimize as svgoOptimize } from 'svgo';
import type { ConversionOptions } from '../../src/shared/types';

const execFileAsync = promisify(execFile);

export async function inspectImage(filePath: string, ext: string): Promise<Record<string, string | number>> {
  if (ext === 'svg') {
    const svg = fs.readFileSync(filePath, 'utf8');
    const vb = svg.match(/viewBox=["']([^"']+)["']/i)?.[1];
    const w = svg.match(/\bwidth=["']([^"']+)["']/i)?.[1];
    const h = svg.match(/\bheight=["']([^"']+)["']/i)?.[1];
    return {
      format: 'SVG',
      viewBox: vb || 'auto',
      dimensions: w && h ? `${w} × ${h}` : 'scalable',
    };
  }
  try {
    const { stdout } = await execFileAsync('identify', ['-format', '%m|%w|%h|%[colorspace]|%z', `${filePath}[0]`], {
      timeout: 15000,
    });
    const [fmt, w, h, cs, depth] = stdout.trim().split('|');
    return {
      format: fmt || ext.toUpperCase(),
      width: Number(w) || 0,
      height: Number(h) || 0,
      colorspace: cs || 'sRGB',
      bitDepth: `${depth || 8}-bit`,
    };
  } catch {
    return { format: ext.toUpperCase() };
  }
}

export async function convertImageOrVector(
  inputPath: string,
  outputPath: string,
  sourceExt: string,
  targetExt: string,
  options: ConversionOptions = {}
): Promise<{ note: string }> {
  const src = sourceExt.toLowerCase();
  const dst = targetExt.toLowerCase();

  // SVG optimization (SVG -> SVG)
  if (src === 'svg' && dst === 'svg') {
    const raw = fs.readFileSync(inputPath, 'utf8');
    const res = svgoOptimize(raw, { multipass: true });
    fs.writeFileSync(outputPath, res.data, 'utf8');
    return { note: 'Optimized SVG paths and metadata via SVGO.' };
  }

  // Vector PS / EPS / AI via Ghostscript (because Ubuntu ImageMagick policy disables PS/EPS/PDF)
  if (['eps', 'ps', 'ai'].includes(src)) {
    const dpi = options.dpi || 150;
    if (dst === 'pdf') {
      await execFileAsync(
        'gs',
        ['-dSAFER', '-dBATCH', '-dNOPAUSE', '-sDEVICE=pdfwrite', `-sOutputFile=${outputPath}`, inputPath],
        { timeout: 60000 }
      );
      return { note: `Converted ${src.toUpperCase()} vector stream to PDF via Ghostscript.` };
    }
    const tempPng = `${outputPath}.tmp.png`;
    await execFileAsync(
      'gs',
      ['-dSAFER', '-dBATCH', '-dNOPAUSE', '-dEPSCrop', `-r${dpi}`, '-sDEVICE=pngalpha', `-sOutputFile=${tempPng}`, inputPath],
      { timeout: 60000 }
    );
    try {
      if (dst === 'png') {
        fs.renameSync(tempPng, outputPath);
      } else if (dst === 'svg') {
        // Wrap rasterized or simple fallback note
        const b64 = fs.readFileSync(tempPng).toString('base64');
        const info = await inspectImage(tempPng, 'png');
        const w = Number(info.width) || 800;
        const h = Number(info.height) || 600;
        fs.writeFileSync(
          outputPath,
          `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><image href="data:image/png;base64,${b64}" width="${w}" height="${h}"/></svg>`,
          'utf8'
        );
      } else {
        await convertImageOrVector(tempPng, outputPath, 'png', dst, options);
      }
    } finally {
      if (fs.existsSync(tempPng)) fs.unlinkSync(tempPng);
    }
    return { note: `Rasterized ${src.toUpperCase()} at ${dpi} DPI via Ghostscript.` };
  }

  // Image -> PDF via pdf-lib (wrapping PNG/JPEG cleanly without hitting ImageMagick PDF policy!)
  if (dst === 'pdf') {
    let imgPath = inputPath;
    let cleanupTmp = false;
    let useJpg = src === 'jpg' || src === 'jpeg';
    if (!useJpg && src !== 'png') {
      imgPath = `${outputPath}.tmp.png`;
      cleanupTmp = true;
      await execFileAsync('convert', [`${inputPath}[0]`, imgPath], { timeout: 60000 });
    }
    try {
      const pdfDoc = await PDFDocument.create();
      const bytes = fs.readFileSync(imgPath);
      const embedded = useJpg ? await pdfDoc.embedJpg(bytes) : await pdfDoc.embedPng(bytes);
      const page = pdfDoc.addPage([embedded.width, embedded.height]);
      page.drawImage(embedded, { x: 0, y: 0, width: embedded.width, height: embedded.height });
      const pdfBytes = await pdfDoc.save();
      fs.writeFileSync(outputPath, pdfBytes);
      return { note: 'Embedded image into PDF page via PDF-Lib.' };
    } finally {
      if (cleanupTmp && fs.existsSync(imgPath)) fs.unlinkSync(imgPath);
    }
  }

  // Image -> EPS / PS via PDF intermediate + Ghostscript ps2write/eps2write
  if (dst === 'eps' || dst === 'ps') {
    const tmpPdf = `${outputPath}.tmp.pdf`;
    await convertImageOrVector(inputPath, tmpPdf, src, 'pdf', options);
    try {
      await execFileAsync(
        'gs',
        [
          '-dSAFER',
          '-dBATCH',
          '-dNOPAUSE',
          `-sDEVICE=${dst === 'eps' ? 'eps2write' : 'ps2write'}`,
          `-sOutputFile=${outputPath}`,
          tmpPdf,
        ],
        { timeout: 60000 }
      );
      return { note: `Generated ${dst.toUpperCase()} via Ghostscript ${dst === 'eps' ? 'eps2write' : 'ps2write'}.` };
    } finally {
      if (fs.existsSync(tmpPdf)) fs.unlinkSync(tmpPdf);
    }
  }

  // Raster/SVG -> Raster via ImageMagick convert
  const args: string[] = [];
  if (src === 'svg' && options.dpi) {
    args.push('-density', String(options.dpi));
  }
  if (src === 'svg') {
    args.push('-background', 'none');
  }

  // Keep animations for GIF/APNG/WEBP targets when source is GIF/APNG
  const isAnimSource = src === 'gif' || src === 'apng';
  const isAnimTarget = dst === 'gif' || dst === 'apng' || dst === 'webp';
  args.push(isAnimSource && isAnimTarget ? inputPath : `${inputPath}[0]`);

  if (options.rotate && [90, 180, 270].includes(options.rotate)) {
    args.push('-rotate', String(options.rotate));
  }
  if (options.flipHorizontal) {
    args.push('-flop');
  }
  if (options.flipVertical) {
    args.push('-flip');
  }
  if (options.grayscale) {
    args.push('-colorspace', 'Gray');
  }
  if (options.removeBackground) {
    args.push('-fuzz', '12%', '-transparent', 'white');
  }
  if (options.width || options.height) {
    const w = options.width ? String(options.width) : '';
    const h = options.height ? String(options.height) : '';
    const suffix = options.maintainAspect === false ? '!' : '';
    args.push('-resize', `${w}x${h}${suffix}`);
  }
  if (options.dpi) {
    args.push('-units', 'PixelsPerInch', '-density', String(options.dpi));
  }
  if (options.stripMetadata) {
    args.push('-strip');
  }
  if (options.quality && options.quality >= 1 && options.quality <= 100) {
    args.push('-quality', String(options.quality));
  }

  // Target-specific ImageMagick prefixes/handling
  const outPrefix = dst === 'apng' ? 'APNG:' : dst === 'cur' ? 'CUR:' : dst === 'ico' ? 'ICO:' : '';
  if (dst === 'ico' || dst === 'cur') {
    // Ensure ICO/CUR stays within 256x256 spec
    if (!options.width && !options.height) {
      args.push('-resize', '256x256>');
    }
  }
  if (['jpg', 'jpeg', 'bmp'].includes(dst)) {
    args.push('-background', 'white', '-alpha', 'remove', '-alpha', 'off');
  }

  args.push(`${outPrefix}${outputPath}`);
  await execFileAsync('convert', args, { timeout: 60000 });
  return { note: `Processed via ImageMagick ${path.extname(outputPath).toUpperCase().slice(1)} encoder.` };
}
