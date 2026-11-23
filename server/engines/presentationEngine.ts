import fs from 'fs';
import AdmZip from 'adm-zip';
import PptxGenJS from 'pptxgenjs';
import PDFKitDocument from 'pdfkit';

export interface SlideContent {
  index: number;
  title: string;
  lines: string[];
}

export function extractPresentationSlides(filePath: string, ext: string): SlideContent[] {
  const format = ext.toLowerCase();
  const zip = new AdmZip(filePath);
  const slides: SlideContent[] = [];

  if (format === 'odp') {
    const entry = zip.getEntry('content.xml');
    if (!entry) throw new Error('Invalid ODP presentation: missing content.xml');
    const xml = entry.getData().toString('utf8');
    const pages = xml.split(/<draw:page\b/i).slice(1);
    pages.forEach((pg, idx) => {
      const texts = Array.from(pg.matchAll(/<text:p[^>]*>([\s\S]*?)<\/text:p>/gi))
        .map((m) => m[1].replace(/<[^>]+>/g, '').trim())
        .filter(Boolean);
      slides.push({
        index: idx + 1,
        title: texts[0] || `Slide ${idx + 1}`,
        lines: texts.slice(1),
      });
    });
    return slides;
  }

  // OOXML PPTX / PPTM / PPSX
  const entries = zip
    .getEntries()
    .filter((e) => /^ppt\/slides\/slide(\d+)\.xml$/i.test(e.entryName))
    .sort((a, b) => {
      const na = parseInt(a.entryName.match(/slide(\d+)/i)?.[1] || '0', 10);
      const nb = parseInt(b.entryName.match(/slide(\d+)/i)?.[1] || '0', 10);
      return na - nb;
    });

  entries.forEach((entry, idx) => {
    const xml = entry.getData().toString('utf8');
    const paragraphs = Array.from(xml.matchAll(/<a:p\b[^>]*>([\s\S]*?)<\/a:p>/gi))
      .map((m) =>
        Array.from(m[1].matchAll(/<a:t[^>]*>([\s\S]*?)<\/a:t>/gi))
          .map((t) => t[1])
          .join('')
          .replace(/&amp;/g, '&')
          .replace(/&lt;/g, '<')
          .replace(/&gt;/g, '>')
          .trim()
      )
      .filter(Boolean);
    slides.push({
      index: idx + 1,
      title: paragraphs[0] || `Slide ${idx + 1}`,
      lines: paragraphs.slice(1),
    });
  });

  return slides;
}

export function inspectPresentation(filePath: string, ext: string): Record<string, string | number> {
  try {
    const slides = extractPresentationSlides(filePath, ext);
    return { format: ext.toUpperCase(), slides: slides.length, firstSlide: slides[0]?.title || 'Slide 1' };
  } catch {
    return { format: ext.toUpperCase() };
  }
}

export async function buildPptxFromText(text: string, title = 'Converted Presentation'): Promise<Buffer> {
  const pptx = new PptxGenJS();
  pptx.title = title;
  const sections = text
    .replace(/\r\n/g, '\n')
    .split(/\n---\n|\n(?=# )/g)
    .map((s) => s.trim())
    .filter(Boolean);

  const chunks = sections.length > 0 ? sections : [text];
  for (const chunk of chunks.slice(0, 50)) {
    const lines = chunk.split('\n').map((l) => l.trim()).filter(Boolean);
    const slide = pptx.addSlide();
    slide.background = { color: '0A0A0A' };
    const heading = (lines[0] || title).replace(/^#+\s*/, '');
    slide.addText(heading, {
      x: 0.7,
      y: 0.7,
      w: 8.6,
      h: 0.9,
      fontSize: 26,
      bold: true,
      color: 'FFFFFF',
    });
    const body = lines.slice(1).join('\n');
    if (body) {
      slide.addText(body, {
        x: 0.7,
        y: 1.8,
        w: 8.6,
        h: 3.4,
        fontSize: 15,
        color: 'D4D4D8',
        valign: 'top',
      });
    }
  }
  const out = (await pptx.write({ outputType: 'nodebuffer' })) as Buffer;
  return out;
}

export async function convertPresentation(
  inputPath: string,
  outputPath: string,
  sourceExt: string,
  targetExt: string
): Promise<{ note: string }> {
  const src = sourceExt.toLowerCase();
  const dst = targetExt.toLowerCase();

  if (dst === 'pptx' && ['md', 'txt'].includes(src)) {
    const text = fs.readFileSync(inputPath, 'utf8');
    const buf = await buildPptxFromText(text);
    fs.writeFileSync(outputPath, buf);
    return { note: 'Generated PPTX slide deck via PptxGenJS.' };
  }

  const slides = extractPresentationSlides(inputPath, src);
  if (slides.length === 0) {
    throw new Error(`No slides extracted from ${src.toUpperCase()} presentation.`);
  }

  if (dst === 'json') {
    fs.writeFileSync(outputPath, JSON.stringify(slides, null, 2) + '\n', 'utf8');
    return { note: `Extracted ${slides.length} slide(s) to structured JSON.` };
  }

  if (dst === 'txt') {
    const txt = slides
      .map((s) => `Slide ${s.index}: ${s.title}\n${s.lines.join('\n')}`)
      .join('\n\n---\n\n');
    fs.writeFileSync(outputPath, txt + '\n', 'utf8');
    return { note: `Extracted ${slides.length} slide(s) to plain text.` };
  }

  if (dst === 'md') {
    const md = slides
      .map((s) => `# ${s.title}\n\n${s.lines.map((l) => `- ${l}`).join('\n')}`)
      .join('\n\n---\n\n');
    fs.writeFileSync(outputPath, md + '\n', 'utf8');
    return { note: `Extracted ${slides.length} slide(s) to Markdown.` };
  }

  if (dst === 'html') {
    const htmlSlides = slides
      .map(
        (s) => `<section style="background:#0c0c0c;color:#f5f5f5;padding:40px;margin:24px auto;max-width:860px;border:1px solid #262626;border-radius:16px">
<p style="color:#888;font-size:12px;margin:0 0 8px">Slide ${s.index}</p>
<h2 style="margin:0 0 16px">${s.title.replace(/</g, '&lt;')}</h2>
<ul>${s.lines.map((l) => `<li>${l.replace(/</g, '&lt;')}</li>`).join('')}</ul>
</section>`
      )
      .join('\n');
    fs.writeFileSync(
      outputPath,
      `<!doctype html><html><meta charset="utf-8"><body style="background:#000;font-family:system-ui,sans-serif;padding:24px">${htmlSlides}</body></html>`,
      'utf8'
    );
    return { note: `Rendered ${slides.length} slide(s) to HTML deck.` };
  }

  if (dst === 'pdf') {
    const buf = await new Promise<Buffer>((resolve, reject) => {
      const doc = new PDFKitDocument({ margin: 54, size: 'A4', layout: 'landscape' });
      const chunks: Buffer[] = [];
      doc.on('data', (c) => chunks.push(Buffer.from(c)));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);
      slides.forEach((s, i) => {
        if (i > 0) doc.addPage();
        doc.font('Helvetica').fontSize(10).fillColor('#666666').text(`Slide ${s.index} of ${slides.length}`);
        doc.moveDown(0.5);
        doc.font('Helvetica-Bold').fontSize(22).fillColor('#111111').text(s.title);
        doc.moveDown(0.8);
        doc.font('Helvetica').fontSize(13).fillColor('#222222');
        for (const l of s.lines) {
          doc.text(`• ${l}`, { lineGap: 4 });
        }
      });
      doc.end();
    });
    fs.writeFileSync(outputPath, buf);
    return { note: `Exported ${slides.length} slide(s) to landscape PDF handout.` };
  }

  throw new Error(`Unsupported presentation target format: ${dst}`);
}
