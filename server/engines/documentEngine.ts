import { execFile } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import { PDFDocument, degrees } from 'pdf-lib';
import PDFKitDocument from 'pdfkit';
import mammoth from 'mammoth';
import { Document as DocxDocument, Packer, Paragraph, TextRun, HeadingLevel } from 'docx';
import { marked } from 'marked';
import TurndownService from 'turndown';
import AdmZip from 'adm-zip';
import type { ConversionOptions } from '../../src/shared/types';
import { convertImageOrVector } from './imageEngine';
import { buildEpubBuffer } from './ebookEngine';

const execFileAsync = promisify(execFile);

function parsePageRange(rangeStr: string | undefined, totalPages: number): number[] {
  if (!rangeStr || !rangeStr.trim()) {
    return Array.from({ length: totalPages }, (_, i) => i);
  }
  const indices = new Set<number>();
  for (const part of rangeStr.split(',')) {
    const trimmed = part.trim();
    if (trimmed.includes('-')) {
      const [s, e] = trimmed.split('-').map((n) => parseInt(n.trim(), 10));
      if (!Number.isNaN(s) && !Number.isNaN(e)) {
        for (let p = Math.max(1, s); p <= Math.min(totalPages, e); p++) {
          indices.add(p - 1);
        }
      }
    } else {
      const p = parseInt(trimmed, 10);
      if (!Number.isNaN(p) && p >= 1 && p <= totalPages) {
        indices.add(p - 1);
      }
    }
  }
  return Array.from(indices).sort((a, b) => a - b);
}

export async function inspectDocument(filePath: string, ext: string): Promise<Record<string, string | number>> {
  const format = ext.toLowerCase();
  if (format === 'pdf') {
    try {
      const bytes = fs.readFileSync(filePath);
      const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
      return {
        pages: doc.getPageCount(),
        encrypted: doc.isEncrypted ? 'Yes' : 'No',
        title: doc.getTitle() || 'Untitled PDF',
      };
    } catch {
      return { format: 'PDF' };
    }
  }
  if (['txt', 'md', 'html', 'htm'].includes(format)) {
    const text = fs.readFileSync(filePath, 'utf8');
    const words = text.trim() ? text.trim().split(/\s+/).length : 0;
    return { characters: text.length, words, lines: text.split(/\r?\n/).length };
  }
  if (format === 'docx' || format === 'docm') {
    try {
      const res = await mammoth.extractRawText({ path: filePath });
      const words = res.value.trim() ? res.value.trim().split(/\s+/).length : 0;
      return { words, characters: res.value.length };
    } catch {
      return { format: format.toUpperCase() };
    }
  }
  return { format: format.toUpperCase() };
}

export async function extractPdfText(pdfPath: string): Promise<string> {
  const tmpTxt = `${pdfPath}.extracted.txt`;
  try {
    await execFileAsync(
      'gs',
      ['-dSAFER', '-dBATCH', '-dNOPAUSE', '-sDEVICE=txtwrite', `-sOutputFile=${tmpTxt}`, pdfPath],
      { timeout: 45000 }
    );
    if (fs.existsSync(tmpTxt)) {
      return fs.readFileSync(tmpTxt, 'utf8');
    }
  } finally {
    if (fs.existsSync(tmpTxt)) fs.unlinkSync(tmpTxt);
  }
  return '';
}

function stripRtf(rtf: string): string {
  return rtf
    .replace(/\\par[d]?/g, '\n')
    .replace(/\\tab/g, '\t')
    .replace(/\{\\\*[^}]+\}/g, '')
    .replace(/\\[a-z]+-?\d* ?/g, '')
    .replace(/[{}]/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function extractOdtText(odtPath: string): string {
  const zip = new AdmZip(odtPath);
  const entry = zip.getEntry('content.xml');
  if (!entry) throw new Error('Invalid ODT document: missing content.xml');
  const xml = entry.getData().toString('utf8');
  return xml
    .replace(/<text:p[^>]*>/g, '\n')
    .replace(/<text:h[^>]*>/g, '\n## ')
    .replace(/<[^>]+>/g, '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .trim();
}

export async function renderTextToPdfBuffer(title: string, text: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFKitDocument({ margin: 56, size: 'A4', info: { Title: title } });
    const chunks: Buffer[] = [];
    doc.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const lines = text.replace(/\r\n/g, '\n').split('\n');
    for (const line of lines) {
      if (line.startsWith('# ')) {
        doc.moveDown(0.4).font('Helvetica-Bold').fontSize(20).text(line.slice(2).trim());
        doc.moveDown(0.3);
      } else if (line.startsWith('## ')) {
        doc.moveDown(0.3).font('Helvetica-Bold').fontSize(15).text(line.slice(3).trim());
        doc.moveDown(0.2);
      } else if (line.startsWith('### ')) {
        doc.moveDown(0.2).font('Helvetica-Bold').fontSize(12.5).text(line.slice(4).trim());
        doc.moveDown(0.15);
      } else if (!line.trim()) {
        doc.moveDown(0.5);
      } else {
        doc.font('Helvetica').fontSize(11).text(line, { lineGap: 3 });
      }
    }
    doc.end();
  });
}

export async function buildDocxBuffer(text: string): Promise<Buffer> {
  const paragraphs = text
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((line) => {
      if (line.startsWith('# ')) {
        return new Paragraph({ text: line.slice(2).trim(), heading: HeadingLevel.HEADING_1 });
      }
      if (line.startsWith('## ')) {
        return new Paragraph({ text: line.slice(3).trim(), heading: HeadingLevel.HEADING_2 });
      }
      return new Paragraph({ children: [new TextRun(line)] });
    });
  const doc = new DocxDocument({ sections: [{ children: paragraphs }] });
  return Packer.toBuffer(doc);
}

export async function convertDocument(
  inputPath: string,
  outputPath: string,
  sourceExt: string,
  targetExt: string,
  options: ConversionOptions = {},
  originalName = 'document'
): Promise<{ note: string }> {
  const src = sourceExt.toLowerCase();
  const dst = targetExt.toLowerCase();

  // PDF operations
  if (src === 'pdf') {
    if (dst === 'pdf') {
      // Page extraction, rotation, or Ghostscript compression
      if (options.compressLevel) {
        const setting =
          options.compressLevel === 'high'
            ? '/screen'
            : options.compressLevel === 'medium'
            ? '/ebook'
            : '/printer';
        await execFileAsync(
          'gs',
          [
            '-sDEVICE=pdfwrite',
            '-dCompatibilityLevel=1.4',
            `-dPDFSETTINGS=${setting}`,
            '-dNOPAUSE',
            '-dQUIET',
            '-dBATCH',
            `-sOutputFile=${outputPath}`,
            inputPath,
          ],
          { timeout: 60000 }
        );
        return { note: `Compressed PDF using Ghostscript preset (${options.compressLevel}).` };
      }

      const bytes = fs.readFileSync(inputPath);
      const srcDoc = await PDFDocument.load(bytes, { ignoreEncryption: true });
      const outDoc = await PDFDocument.create();
      const indices = parsePageRange(options.pageRange, srcDoc.getPageCount());
      const copied = await outDoc.copyPages(srcDoc, indices);
      for (const page of copied) {
        if (options.rotate) {
          page.setRotation(degrees((page.getRotation().angle + options.rotate) % 360));
        }
        outDoc.addPage(page);
      }
      fs.writeFileSync(outputPath, await outDoc.save());
      return { note: `Processed ${copied.length} PDF page(s) via PDF-Lib.` };
    }

    if (['png', 'jpg', 'jpeg', 'webp', 'tiff', 'eps', 'svg'].includes(dst)) {
      const dpi = options.dpi || 150;
      if (dst === 'eps') {
        await execFileAsync(
          'gs',
          ['-dSAFER', '-dBATCH', '-dNOPAUSE', '-sDEVICE=eps2write', `-sOutputFile=${outputPath}`, inputPath],
          { timeout: 60000 }
        );
        return { note: 'Converted PDF to EPS vector format via Ghostscript.' };
      }
      const tmpPng = `${outputPath}.page1.png`;
      await execFileAsync(
        'gs',
        [
          '-dSAFER',
          '-dBATCH',
          '-dNOPAUSE',
          '-dFirstPage=1',
          '-dLastPage=1',
          `-r${dpi}`,
          '-sDEVICE=png16m',
          `-sOutputFile=${tmpPng}`,
          inputPath,
        ],
        { timeout: 60000 }
      );
      try {
        if (dst === 'png') {
          fs.renameSync(tmpPng, outputPath);
        } else if (dst === 'svg') {
          const b64 = fs.readFileSync(tmpPng).toString('base64');
          fs.writeFileSync(
            outputPath,
            `<svg xmlns="http://www.w3.org/2000/svg" width="794" height="1123" viewBox="0 0 794 1123"><image href="data:image/png;base64,${b64}" width="794" height="1123"/></svg>`,
            'utf8'
          );
        } else {
          await convertImageOrVector(tmpPng, outputPath, 'png', dst, options);
        }
      } finally {
        if (fs.existsSync(tmpPng)) fs.unlinkSync(tmpPng);
      }
      return { note: `Rendered PDF page 1 at ${dpi} DPI via Ghostscript.` };
    }

    const extracted = await extractPdfText(inputPath);
    if (dst === 'txt') {
      fs.writeFileSync(outputPath, extracted, 'utf8');
      return { note: 'Extracted UTF-8 text from PDF via Ghostscript txtwrite.' };
    }
    if (dst === 'md') {
      fs.writeFileSync(outputPath, extracted, 'utf8');
      return { note: 'Extracted PDF text into Markdown.' };
    }
    if (dst === 'html') {
      const html = await marked.parse(extracted);
      fs.writeFileSync(outputPath, `<!doctype html><html><meta charset="utf-8"><body>${html}</body></html>`, 'utf8');
      return { note: 'Converted PDF text content to HTML.' };
    }
    if (dst === 'docx') {
      const buf = await buildDocxBuffer(extracted || ' ');
      fs.writeFileSync(outputPath, buf);
      return { note: 'Converted extracted PDF text into editable DOCX.' };
    }
  }

  // Extract normalized text & HTML from non-PDF documents
  let plainText = '';
  let htmlContent = '';

  if (src === 'docx' || src === 'docm') {
    const htmlRes = await mammoth.convertToHtml({ path: inputPath });
    const txtRes = await mammoth.extractRawText({ path: inputPath });
    htmlContent = htmlRes.value;
    plainText = txtRes.value;
  } else if (src === 'md') {
    plainText = fs.readFileSync(inputPath, 'utf8');
    htmlContent = await marked.parse(plainText);
  } else if (src === 'html' || src === 'htm') {
    htmlContent = fs.readFileSync(inputPath, 'utf8');
    const td = new TurndownService();
    plainText = td.turndown(htmlContent);
  } else if (src === 'txt') {
    plainText = fs.readFileSync(inputPath, 'utf8');
    htmlContent = `<pre>${plainText.replace(/</g, '&lt;')}</pre>`;
  } else if (src === 'rtf') {
    plainText = stripRtf(fs.readFileSync(inputPath, 'utf8'));
    htmlContent = await marked.parse(plainText);
  } else if (src === 'odt') {
    plainText = extractOdtText(inputPath);
    htmlContent = await marked.parse(plainText);
  } else {
    throw new Error(`Unsupported document input format: ${src}`);
  }

  if (dst === 'txt') {
    fs.writeFileSync(outputPath, plainText, 'utf8');
    return { note: `Extracted plain text from ${src.toUpperCase()}.` };
  }
  if (dst === 'md') {
    if (src === 'html' || src === 'htm') {
      const td = new TurndownService();
      fs.writeFileSync(outputPath, td.turndown(htmlContent) + '\n', 'utf8');
    } else if (src === 'docx' || src === 'docm') {
      const td = new TurndownService();
      fs.writeFileSync(outputPath, td.turndown(htmlContent) + '\n', 'utf8');
    } else {
      fs.writeFileSync(outputPath, plainText, 'utf8');
    }
    return { note: `Converted ${src.toUpperCase()} to Markdown.` };
  }
  if (dst === 'html' || dst === 'htm') {
    const full = `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><title>${originalName}</title>
<style>body{font-family:system-ui,sans-serif;max-width:760px;margin:48px auto;padding:0 24px;line-height:1.6;color:#111}</style>
</head>
<body>${htmlContent}</body>
</html>`;
    fs.writeFileSync(outputPath, full, 'utf8');
    return { note: `Converted ${src.toUpperCase()} to semantic HTML.` };
  }
  if (dst === 'docx') {
    const buf = await buildDocxBuffer(plainText);
    fs.writeFileSync(outputPath, buf);
    return { note: `Generated OOXML Word document (.docx) from ${src.toUpperCase()}.` };
  }
  if (dst === 'pdf') {
    const buf = await renderTextToPdfBuffer(originalName, plainText);
    fs.writeFileSync(outputPath, buf);
    return { note: `Rendered ${src.toUpperCase()} to PDF via PDFKit.` };
  }
  if (dst === 'epub') {
    const epubBuf = await buildEpubBuffer({
      title: originalName.replace(/\.[^.]+$/, ''),
      author: 'Aether Convert',
      chapters: [{ title: 'Document Content', html: htmlContent || `<p>${plainText}</p>` }],
    });
    fs.writeFileSync(outputPath, epubBuf);
    return { note: `Packaged ${src.toUpperCase()} into EPUB 3 ebook.` };
  }

  throw new Error(`Unsupported document conversion: ${src} -> ${dst}`);
}

export async function mergePdfFiles(inputPaths: string[], outputPath: string): Promise<{ note: string }> {
  const merged = await PDFDocument.create();
  for (const p of inputPaths) {
    const bytes = fs.readFileSync(p);
    const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
    const pages = await merged.copyPages(doc, doc.getPageIndices());
    pages.forEach((pg) => merged.addPage(pg));
  }
  fs.writeFileSync(outputPath, await merged.save());
  return { note: `Merged ${inputPaths.length} PDF documents (${merged.getPageCount()} total pages).` };
}
