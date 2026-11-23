import fs from 'fs';
import AdmZip from 'adm-zip';
import TurndownService from 'turndown';
import PDFKitDocument from 'pdfkit';
import { Document as DocxDocument, Packer, Paragraph, HeadingLevel } from 'docx';

export interface EbookChapter {
  title: string;
  html: string;
}

export interface ParsedEbook {
  title: string;
  author: string;
  chapters: EbookChapter[];
  hasCover: boolean;
}

function stripTags(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<\/(p|div|h1|h2|h3|h4|li|br)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function parseEpubFile(filePath: string): ParsedEbook {
  const zip = new AdmZip(filePath);
  const entries = zip.getEntries();
  const opfEntry = entries.find((e) => e.entryName.endsWith('.opf'));
  let title = 'Untitled Ebook';
  let author = 'Unknown Author';

  if (opfEntry) {
    const opf = opfEntry.getData().toString('utf8');
    title = opf.match(/<dc:title[^>]*>([\s\S]*?)<\/dc:title>/i)?.[1]?.trim() || title;
    author = opf.match(/<dc:creator[^>]*>([\s\S]*?)<\/dc:creator>/i)?.[1]?.trim() || author;
  }

  const htmlEntries = entries
    .filter((e) => /\.(xhtml|html|htm)$/i.test(e.entryName) && !e.entryName.includes('nav.'))
    .sort((a, b) => a.entryName.localeCompare(b.entryName));

  const chapters: EbookChapter[] = htmlEntries.map((entry, idx) => {
    const raw = entry.getData().toString('utf8');
    const body = raw.match(/<body[^>]*>([\s\S]*?)<\/body>/i)?.[1] || raw;
    const hTitle = body.match(/<h[1-3][^>]*>([\s\S]*?)<\/h[1-3]>/i)?.[1];
    return {
      title: hTitle ? stripTags(hTitle) : `Chapter ${idx + 1}`,
      html: body,
    };
  });

  const hasCover = entries.some((e) => /cover/i.test(e.entryName) && /\.(jpg|jpeg|png|webp)$/i.test(e.entryName));
  return { title, author, chapters, hasCover };
}

export function parseFb2File(filePath: string): ParsedEbook {
  const xml = fs.readFileSync(filePath, 'utf8');
  const title = xml.match(/<book-title[^>]*>([\s\S]*?)<\/book-title>/i)?.[1]?.trim() || 'FictionBook';
  const first = xml.match(/<first-name[^>]*>([\s\S]*?)<\/first-name>/i)?.[1]?.trim() || '';
  const last = xml.match(/<last-name[^>]*>([\s\S]*?)<\/last-name>/i)?.[1]?.trim() || '';
  const author = [first, last].filter(Boolean).join(' ') || 'Unknown Author';

  const sections = Array.from(xml.matchAll(/<section\b[^>]*>([\s\S]*?)<\/section>/gi));
  const chapters: EbookChapter[] = (sections.length > 0 ? sections : [[xml, xml]]).map((m, idx) => {
    const inner = m[1];
    const chapTitle = inner.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1];
    const paragraphs = Array.from(inner.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi)).map(
      (p) => `<p>${p[1]}</p>`
    );
    return {
      title: chapTitle ? stripTags(chapTitle) : `Chapter ${idx + 1}`,
      html: paragraphs.join('\n') || `<p>${stripTags(inner)}</p>`,
    };
  });

  return { title, author, chapters, hasCover: false };
}

export async function buildEpubBuffer(book: {
  title: string;
  author: string;
  chapters: EbookChapter[];
}): Promise<Buffer> {
  const zip = new AdmZip();
  zip.addFile('mimetype', Buffer.from('application/epub+zip', 'utf8'));
  zip.addFile(
    'META-INF/container.xml',
    Buffer.from(
      `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`,
      'utf8'
    )
  );

  const manifestItems: string[] = [];
  const spineItems: string[] = [];

  book.chapters.forEach((chap, idx) => {
    const id = `chap${idx + 1}`;
    const filename = `${id}.xhtml`;
    manifestItems.push(`<item id="${id}" href="${filename}" media-type="application/xhtml+xml"/>`);
    spineItems.push(`<itemref idref="${id}"/>`);

    const xhtml = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml">
<head><title>${chap.title.replace(/</g, '&lt;')}</title></head>
<body>
  <h1>${chap.title.replace(/</g, '&lt;')}</h1>
  ${chap.html}
</body>
</html>`;
    zip.addFile(`OEBPS/${filename}`, Buffer.from(xhtml, 'utf8'));
  });

  const opf = `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" unique-identifier="bookid" version="3.0">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="bookid">urn:uuid:${Date.now()}</dc:identifier>
    <dc:title>${book.title.replace(/</g, '&lt;')}</dc:title>
    <dc:creator>${book.author.replace(/</g, '&lt;')}</dc:creator>
    <dc:language>en</dc:language>
  </metadata>
  <manifest>
    ${manifestItems.join('\n    ')}
  </manifest>
  <spine>
    ${spineItems.join('\n    ')}
  </spine>
</package>`;
  zip.addFile('OEBPS/content.opf', Buffer.from(opf, 'utf8'));
  return zip.toBuffer();
}

export function inspectEbook(filePath: string, ext: string): Record<string, string | number | boolean> {
  try {
    const parsed = ext.toLowerCase() === 'fb2' ? parseFb2File(filePath) : parseEpubFile(filePath);
    return {
      title: parsed.title,
      author: parsed.author,
      chapters: parsed.chapters.length,
      hasCover: parsed.hasCover,
    };
  } catch {
    return { format: ext.toUpperCase() };
  }
}

export async function convertEbook(
  inputPath: string,
  outputPath: string,
  sourceExt: string,
  targetExt: string,
  options: { ebookTitle?: string; ebookAuthor?: string } = {}
): Promise<{ note: string }> {
  const src = sourceExt.toLowerCase();
  const dst = targetExt.toLowerCase();

  const parsed = src === 'fb2' ? parseFb2File(inputPath) : parseEpubFile(inputPath);
  const title = options.ebookTitle || parsed.title;
  const author = options.ebookAuthor || parsed.author;

  if (dst === 'epub') {
    const buf = await buildEpubBuffer({ title, author, chapters: parsed.chapters });
    fs.writeFileSync(outputPath, buf);
    return { note: `Packaged "${title}" (${parsed.chapters.length} chapters) into EPUB 3.` };
  }

  if (dst === 'json') {
    fs.writeFileSync(outputPath, JSON.stringify({ title, author, chapters: parsed.chapters }, null, 2), 'utf8');
    return { note: `Extracted ${parsed.chapters.length} ebook chapters to JSON.` };
  }

  if (dst === 'html') {
    const body = parsed.chapters.map((c) => `<article><h2>${c.title}</h2>${c.html}</article>`).join('\n<hr/>\n');
    fs.writeFileSync(
      outputPath,
      `<!doctype html><html><meta charset="utf-8"><title>${title}</title><body style="max-width:740px;margin:48px auto;font-family:Georgia,serif;line-height:1.7;padding:0 24px"><h1>${title}</h1><p><em>${author}</em></p>${body}</body></html>`,
      'utf8'
    );
    return { note: `Exported "${title}" to readable HTML.` };
  }

  const plainText = parsed.chapters.map((c) => `# ${c.title}\n\n${stripTags(c.html)}`).join('\n\n');

  if (dst === 'txt') {
    fs.writeFileSync(outputPath, `${title}\nby ${author}\n\n${plainText}\n`, 'utf8');
    return { note: `Extracted "${title}" to plain text.` };
  }

  if (dst === 'md') {
    const td = new TurndownService();
    const md = parsed.chapters.map((c) => `# ${c.title}\n\n${td.turndown(c.html)}`).join('\n\n');
    fs.writeFileSync(outputPath, `# ${title}\n*by ${author}*\n\n${md}\n`, 'utf8');
    return { note: `Converted "${title}" to Markdown.` };
  }

  if (dst === 'fb2') {
    const sections = parsed.chapters
      .map(
        (c) =>
          `<section><title><p>${c.title.replace(/</g, '&lt;')}</p></title>${stripTags(c.html)
            .split('\n\n')
            .map((p) => `<p>${p.replace(/</g, '&lt;')}</p>`)
            .join('')}</section>`
      )
      .join('\n');
    const fb2 = `<?xml version="1.0" encoding="utf-8"?>
<FictionBook xmlns="http://www.gribuser.ru/xml/fictionbook/2.0">
  <description><title-info><book-title>${title.replace(/</g, '&lt;')}</book-title><author><first-name>${author.replace(/</g, '&lt;')}</first-name></author></title-info></description>
  <body>${sections}</body>
</FictionBook>`;
    fs.writeFileSync(outputPath, fb2, 'utf8');
    return { note: `Converted "${title}" to FictionBook 2.0 XML.` };
  }

  if (dst === 'docx') {
    const paragraphs: Paragraph[] = [
      new Paragraph({ text: title, heading: HeadingLevel.TITLE }),
      new Paragraph({ text: `By ${author}` }),
    ];
    for (const c of parsed.chapters) {
      paragraphs.push(new Paragraph({ text: c.title, heading: HeadingLevel.HEADING_1 }));
      for (const line of stripTags(c.html).split('\n\n')) {
        paragraphs.push(new Paragraph({ text: line }));
      }
    }
    const doc = new DocxDocument({ sections: [{ children: paragraphs }] });
    fs.writeFileSync(outputPath, await Packer.toBuffer(doc));
    return { note: `Exported "${title}" to DOCX.` };
  }

  if (dst === 'pdf') {
    const buf = await new Promise<Buffer>((resolve, reject) => {
      const doc = new PDFKitDocument({ margin: 60, size: 'A4', info: { Title: title, Author: author } });
      const chunks: Buffer[] = [];
      doc.on('data', (c) => chunks.push(Buffer.from(c)));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);
      doc.font('Helvetica-Bold').fontSize(24).text(title, { align: 'center' });
      doc.moveDown(0.3).font('Helvetica-Oblique').fontSize(13).text(author, { align: 'center' });
      for (const c of parsed.chapters) {
        doc.addPage();
        doc.font('Helvetica-Bold').fontSize(17).text(c.title);
        doc.moveDown(0.5);
        doc.font('Helvetica').fontSize(11).text(stripTags(c.html), { lineGap: 4 });
      }
      doc.end();
    });
    fs.writeFileSync(outputPath, buf);
    return { note: `Rendered "${title}" (${parsed.chapters.length} chapters) to PDF.` };
  }

  throw new Error(`Unsupported ebook target format: ${dst}`);
}
