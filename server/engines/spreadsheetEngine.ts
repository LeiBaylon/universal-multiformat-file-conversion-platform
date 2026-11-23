import fs from 'fs';
import * as XLSX from 'xlsx';
import * as yaml from 'js-yaml';
import PDFKitDocument from 'pdfkit';
import type { ConversionOptions } from '../../src/shared/types';
import { serializeStructuredData } from './dataEngine';

export function inspectSpreadsheet(filePath: string, ext: string): Record<string, string | number | string[]> {
  try {
    const wb = XLSX.readFile(filePath);
    const firstSheet = wb.SheetNames[0];
    const rows = firstSheet ? XLSX.utils.sheet_to_json(wb.Sheets[firstSheet]) : [];
    return {
      format: ext.toUpperCase(),
      sheets: wb.SheetNames,
      sheetCount: wb.SheetNames.length,
      primaryRows: rows.length,
    };
  } catch {
    return { format: ext.toUpperCase() };
  }
}

export async function convertSpreadsheet(
  inputPath: string,
  outputPath: string,
  sourceExt: string,
  targetExt: string,
  options: ConversionOptions = {}
): Promise<{ note: string }> {
  const src = sourceExt.toLowerCase();
  const dst = targetExt.toLowerCase();

  const wb = XLSX.readFile(inputPath, {
    FS: src === 'tsv' ? '\t' : undefined,
  });

  const targetSheetName = options.sheetName && wb.SheetNames.includes(options.sheetName)
    ? options.sheetName
    : wb.SheetNames[0];

  if (!targetSheetName) {
    throw new Error('Spreadsheet contains no readable worksheets.');
  }

  const sheet = wb.Sheets[targetSheetName];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet);

  if (dst === 'json') {
    fs.writeFileSync(outputPath, JSON.stringify(rows, null, 2) + '\n', 'utf8');
    return { note: `Exported sheet "${targetSheetName}" (${rows.length} rows) to JSON.` };
  }
  if (dst === 'yaml' || dst === 'yml') {
    fs.writeFileSync(outputPath, yaml.dump(rows), 'utf8');
    return { note: `Exported sheet "${targetSheetName}" to YAML.` };
  }
  if (dst === 'xml' || dst === 'sql') {
    const out = serializeStructuredData(rows, dst, { tableName: targetSheetName });
    fs.writeFileSync(outputPath, out);
    return { note: `Exported sheet "${targetSheetName}" to ${dst.toUpperCase()}.` };
  }
  if (dst === 'pdf') {
    const buf = await new Promise<Buffer>((resolve, reject) => {
      const doc = new PDFKitDocument({ margin: 40, size: 'A4', layout: 'landscape' });
      const chunks: Buffer[] = [];
      doc.on('data', (c) => chunks.push(Buffer.from(c)));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      doc.font('Helvetica-Bold').fontSize(14).text(`Worksheet: ${targetSheetName}`);
      doc.moveDown(0.5);
      const aoa = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1 });
      doc.font('Courier').fontSize(9);
      for (const row of aoa.slice(0, 200)) {
        const line = (row as unknown[]).map((cell) => String(cell ?? '')).join(' | ');
        doc.text(line);
      }
      doc.end();
    });
    fs.writeFileSync(outputPath, buf);
    return { note: `Rendered worksheet "${targetSheetName}" to landscape PDF.` };
  }

  if (dst === 'csv' || dst === 'tsv') {
    const delimiter = options.delimiter || (dst === 'tsv' ? '\t' : ',');
    const csv = XLSX.utils.sheet_to_csv(sheet, { FS: delimiter });
    fs.writeFileSync(outputPath, csv, options.encoding || 'utf8');
    return { note: `Converted "${targetSheetName}" to ${dst.toUpperCase()}.` };
  }

  const bookTypeMap: Record<string, XLSX.BookType> = {
    xlsx: 'xlsx',
    xls: 'biff8',
    xlsm: 'xlsm',
    ods: 'ods',
    fods: 'fods',
    dif: 'dif',
    sylk: 'sylk',
    html: 'html',
  };

  const bookType = bookTypeMap[dst];
  if (!bookType) {
    throw new Error(`Unsupported spreadsheet output format: ${dst}`);
  }

  const outBuf = XLSX.write(wb, { type: 'buffer', bookType }) as Buffer;
  fs.writeFileSync(outputPath, outBuf);
  return { note: `Converted workbook (${wb.SheetNames.length} sheet(s)) to ${dst.toUpperCase()} via SheetJS.` };
}
