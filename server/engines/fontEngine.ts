import fs from 'fs';
import { Font, woff2 } from 'fonteditor-core';
import * as opentype from 'opentype.js';

let woff2Ready = false;
async function ensureWoff2(): Promise<void> {
  if (!woff2Ready) {
    await woff2.init();
    woff2Ready = true;
  }
}

export function inspectFont(filePath: string, ext: string): Record<string, string | number> {
  try {
    const buf = fs.readFileSync(filePath);
    const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
    if (['ttf', 'otf', 'woff'].includes(ext.toLowerCase())) {
      const font = opentype.parse(ab);
      const names = font.names as { fontFamily?: { en?: string }; fontSubfamily?: { en?: string } };
      return {
        family: names.fontFamily?.en || 'Unknown',
        style: names.fontSubfamily?.en || 'Regular',
        glyphs: font.numGlyphs,
        unitsPerEm: font.unitsPerEm,
      };
    }
    return { format: ext.toUpperCase() };
  } catch {
    return { format: ext.toUpperCase() };
  }
}

export async function convertFont(
  inputPath: string,
  outputPath: string,
  sourceExt: string,
  targetExt: string
): Promise<{ note: string }> {
  const src = sourceExt.toLowerCase() as 'ttf' | 'otf' | 'woff' | 'woff2' | 'eot' | 'svg' | 'ttc';
  const dst = targetExt.toLowerCase() as 'ttf' | 'otf' | 'woff' | 'woff2' | 'eot' | 'svg';

  if (src === 'woff2' || dst === 'woff2') {
    await ensureWoff2();
  }

  const rawBuf = fs.readFileSync(inputPath);
  const font = Font.create(rawBuf, {
    type: src === 'ttc' ? 'ttf' : src,
    hinting: true,
    compound2simple: dst === 'svg',
  });

  const outData = font.write({
    type: dst,
    hinting: true,
    deflate: undefined,
  });

  if (typeof outData === 'string') {
    fs.writeFileSync(outputPath, outData, 'utf8');
  } else if (outData instanceof ArrayBuffer) {
    fs.writeFileSync(outputPath, Buffer.from(outData));
  } else {
    fs.writeFileSync(outputPath, Buffer.from(outData as Uint8Array));
  }

  return { note: `Transcoded font face (${src.toUpperCase()} -> ${dst.toUpperCase()}) via FontEditor Core.` };
}
