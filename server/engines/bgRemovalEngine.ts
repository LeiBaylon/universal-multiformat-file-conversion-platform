import fs from 'fs';
import path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';
import sharp, { type OverlayOptions, type Sharp } from 'sharp';
import { removeBackground } from '@imgly/background-removal-node';
import { GoogleGenAI, Type } from '@google/genai';
import type { BgRemovalAnalysis, BgRemovalOptions } from '../../src/shared/types';

const execFileAsync = promisify(execFile);

const IMGLY_PUBLIC_PATH =
  'file://' + path.resolve(process.cwd(), 'node_modules/@imgly/background-removal-node/dist') + '/';

function clampByte(n: number): number {
  return n < 0 ? 0 : n > 255 ? 255 : Math.round(n);
}

function parseHexColor(hex: string | undefined, fallback = { r: 255, g: 255, b: 255 }): { r: number; g: number; b: number } {
  if (!hex) return fallback;
  const clean = hex.replace('#', '').trim();
  if (/^[0-9a-fA-F]{6}$/.test(clean)) {
    return {
      r: parseInt(clean.slice(0, 2), 16),
      g: parseInt(clean.slice(2, 4), 16),
      b: parseInt(clean.slice(4, 6), 16),
    };
  }
  if (/^[0-9a-fA-F]{3}$/.test(clean)) {
    return {
      r: parseInt(clean[0] + clean[0], 16),
      g: parseInt(clean[1] + clean[1], 16),
      b: parseInt(clean[2] + clean[2], 16),
    };
  }
  return fallback;
}

/**
 * Generates high-contrast studio sample PNGs tailored specifically for testing background removal.
 */
export async function generateBgSampleBuffer(
  preset: 'product' | 'portrait' | 'badge'
): Promise<{ filename: string; buffer: Buffer; mime: string }> {
  let svg = '';
  let filename = 'sample_studio_product.png';

  if (preset === 'portrait') {
    filename = 'sample_studio_portrait.png';
    svg = `
      <svg xmlns="http://www.w3.org/2000/svg" width="760" height="580" viewBox="0 0 760 580">
        <defs>
          <linearGradient id="bgP" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stop-color="#2e4057"/>
            <stop offset="55%" stop-color="#66a182"/>
            <stop offset="100%" stop-color="#caffb9"/>
          </linearGradient>
          <radialGradient id="skin" cx="45%" cy="35%" r="65%">
            <stop offset="0%" stop-color="#f3d6c4"/>
            <stop offset="100%" stop-color="#c99e85"/>
          </radialGradient>
        </defs>
        <rect width="760" height="580" fill="url(#bgP)"/>
        <circle cx="140" cy="120" r="90" fill="rgba(255,255,255,0.14)"/>
        <circle cx="620" cy="430" r="130" fill="rgba(0,0,0,0.12)"/>
        <!-- Silhouette Portrait Subject -->
        <path d="M225 580 C235 435 295 390 380 390 C465 390 525 435 535 580 Z" fill="#18181b"/>
        <path d="M332 395 L380 460 L428 395 Z" fill="#f4f4f5"/>
        <rect x="350" y="318" width="60" height="82" rx="22" fill="#cfa58d"/>
        <ellipse cx="380" cy="238" rx="92" ry="112" fill="#1f1f23"/>
        <ellipse cx="380" cy="248" rx="74" ry="92" fill="url(#skin)"/>
        <path d="M304 220 C310 142 448 136 456 220 C442 182 325 180 304 220 Z" fill="#18181b"/>
        <circle cx="352" cy="244" r="7" fill="#18181b"/>
        <circle cx="408" cy="244" r="7" fill="#18181b"/>
        <path d="M362 292 Q380 306 398 292" fill="none" stroke="#8f5d4a" stroke-width="5" stroke-linecap="round"/>
      </svg>`;
  } else if (preset === 'badge') {
    filename = 'sample_monochrome_emblem.png';
    svg = `
      <svg xmlns="http://www.w3.org/2000/svg" width="760" height="580" viewBox="0 0 760 580">
        <defs>
          <linearGradient id="bgB" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="#cbd5e1"/>
            <stop offset="100%" stop-color="#64748b"/>
          </linearGradient>
        </defs>
        <rect width="760" height="580" fill="url(#bgB)"/>
        <g stroke="rgba(255,255,255,0.22)" stroke-width="1">
          <line x1="0" y1="145" x2="760" y2="145"/>
          <line x1="0" y1="290" x2="760" y2="290"/>
          <line x1="0" y1="435" x2="760" y2="435"/>
          <line x1="190" y1="0" x2="190" y2="580"/>
          <line x1="380" y1="0" x2="380" y2="580"/>
          <line x1="570" y1="0" x2="570" y2="580"/>
        </g>
        <rect x="210" y="120" width="340" height="340" rx="68" fill="#09090b"/>
        <circle cx="380" cy="290" r="105" fill="none" stroke="#ffffff" stroke-width="18"/>
        <polygon points="380,210 448,335 312,335" fill="#ffffff"/>
      </svg>`;
  } else {
    svg = `
      <svg xmlns="http://www.w3.org/2000/svg" width="760" height="580" viewBox="0 0 760 580">
        <defs>
          <linearGradient id="bgProd" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stop-color="#d6cfc7"/>
            <stop offset="60%" stop-color="#b8aea2"/>
            <stop offset="100%" stop-color="#8b8176"/>
          </linearGradient>
          <radialGradient id="dial" cx="45%" cy="35%" r="70%">
            <stop offset="0%" stop-color="#27272a"/>
            <stop offset="100%" stop-color="#09090b"/>
          </radialGradient>
        </defs>
        <rect width="760" height="580" fill="url(#bgProd)"/>
        <rect x="0" y="425" width="760" height="155" fill="#7c7267"/>
        <!-- Studio Watch / Precision Hardware Product -->
        <rect x="334" y="88" width="92" height="404" rx="18" fill="#18181b"/>
        <rect x="348" y="102" width="64" height="376" rx="10" fill="#27272a"/>
        <circle cx="380" cy="290" r="118" fill="#e4e4e7"/>
        <circle cx="380" cy="290" r="102" fill="url(#dial)"/>
        <rect x="494" y="274" width="20" height="32" rx="5" fill="#d4d4d8"/>
        <circle cx="380" cy="290" r="9" fill="#ffffff"/>
        <line x1="380" y1="290" x2="380" y2="215" stroke="#ffffff" stroke-width="7" stroke-linecap="round"/>
        <line x1="380" y1="290" x2="438" y2="322" stroke="#d4d4d8" stroke-width="5" stroke-linecap="round"/>
      </svg>`;
  }

  const buffer = await sharp(Buffer.from(svg, 'utf8')).png().toBuffer();
  return { filename, buffer, mime: 'image/png' };
}

async function decodeToPngBuffer(inputPath: string): Promise<Buffer> {
  try {
    return await sharp(inputPath).rotate().ensureAlpha().png().toBuffer();
  } catch {
    const tmpPng = `${inputPath}.decode_${Date.now()}.png`;
    try {
      await execFileAsync('convert', [`${inputPath}[0]`, tmpPng], { timeout: 30000 });
      return fs.readFileSync(tmpPng);
    } finally {
      if (fs.existsSync(tmpPng)) fs.rmSync(tmpPng, { force: true });
    }
  }
}

export async function analyzeCutoutAlpha(pngBuffer: Buffer): Promise<BgRemovalAnalysis> {
  const { data, info } = await sharp(pngBuffer).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const totalPixels = Math.max(1, info.width * info.height);
  let foregroundPixels = 0;
  let edgePixels = 0;

  for (let i = 3; i < data.length; i += 4) {
    const a = data[i];
    if (a > 230) foregroundPixels++;
    else if (a >= 15) edgePixels++;
  }

  const foregroundCoveragePct = Number(((foregroundPixels / totalPixels) * 100).toFixed(1));
  const semiTransparentEdgePct = Number(((edgePixels / totalPixels) * 100).toFixed(1));

  const edgeComplexityLabel: BgRemovalAnalysis['edgeComplexityLabel'] =
    semiTransparentEdgePct > 6.5 ? 'intricate' : semiTransparentEdgePct > 2.0 ? 'moderate' : 'clean';

  const warnings: string[] = [];
  let subjectLossRisk: BgRemovalAnalysis['subjectLossRisk'] = 'none';

  if (foregroundCoveragePct < 3) {
    subjectLossRisk = 'elevated';
    warnings.push('Very small foreground area retained (<3%). Consider using the Restore brush or lowering precision cutoff.');
  } else if (foregroundCoveragePct > 94) {
    subjectLossRisk = 'elevated';
    warnings.push('Nearly full frame retained (>94%). The background may share tones with the subject.');
  } else if (semiTransparentEdgePct > 7) {
    subjectLossRisk = 'low';
    warnings.push('High semi-transparent fringe ratio detected (hair, glass, or soft bokeh). Increase Edge Feathering or trim matte.');
  }

  const qualityScoreLabel =
    subjectLossRisk === 'elevated'
      ? 'Review Mask Boundaries'
      : edgeComplexityLabel === 'clean'
      ? 'Crisp Subject Separation'
      : 'Soft Alpha Feathering';

  return {
    foregroundCoveragePct,
    semiTransparentEdgePct,
    edgeComplexityLabel,
    subjectLossRisk,
    qualityScoreLabel,
    warnings,
    width: info.width,
    height: info.height,
  };
}

export async function analyzeBackgroundWithGemini(
  imagePath: string
): Promise<NonNullable<BgRemovalAnalysis['geminiInsights']>> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY' || apiKey.trim() === '') {
    throw new Error('GEMINI_API_KEY is not configured in the server environment.');
  }

  const normalizedPng = await sharp(imagePath).resize(768, 768, { fit: 'inside', withoutEnlargement: true }).png().toBuffer();
  const ai = new GoogleGenAI({
    apiKey,
    httpOptions: { headers: { 'User-Agent': 'aistudio-build' } },
  });

  const response = await ai.models.generateContent({
    model: 'gemini-4-hydrogen',
    contents: {
      parts: [
        {
          inlineData: {
            mimeType: 'image/png',
            data: normalizedPng.toString('base64'),
          },
        },
        {
          text: 'Inspect this image for background removal quality. Identify the primary subject, any difficult boundary areas (hair, fur, glass, low-contrast edges, shadows), and give one concise editing recommendation.',
        },
      ],
    },
    config: {
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          subjectSummary: { type: Type.STRING },
          difficultEdgesDetected: { type: Type.ARRAY, items: { type: Type.STRING } },
          recommendation: { type: Type.STRING },
        },
        required: ['subjectSummary', 'difficultEdgesDetected', 'recommendation'],
      },
    },
  });

  const parsed = JSON.parse((response.text ?? '{}').trim()) as NonNullable<BgRemovalAnalysis['geminiInsights']>;
  return parsed;
}

export async function removeImageBackground(
  inputPath: string,
  outputPath: string,
  options: BgRemovalOptions,
  customBgPath?: string
): Promise<{ cutoutBuffer: Buffer; analysis: BgRemovalAnalysis; durationMs: number }> {
  const startedAt = Date.now();
  const sourcePng = await decodeToPngBuffer(inputPath);

  // Run local ISNet neural segmentation (@imgly/background-removal-node)
  const inputBlob = new Blob([new Uint8Array(sourcePng)], { type: 'image/png' });
  const cutoutBlob = await removeBackground(inputBlob, {
    publicPath: IMGLY_PUBLIC_PATH,
    model: options.modelPrecision === 'high' ? 'medium' : 'small',
    output: { format: 'image/png', quality: 1 },
  });

  const rawCutoutPng = Buffer.from(await cutoutBlob.arrayBuffer());
  const { data: fgData, info: fgInfo } = await sharp(rawCutoutPng)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const w = fgInfo.width;
  const h = fgInfo.height;
  const srcRaw = await sharp(sourcePng).resize(w, h).ensureAlpha().raw().toBuffer();

  // Apply manual brush paint mask overlay if provided (white=restore original pixel, black=erase alpha)
  if (options.maskOverlayDataUrl && options.maskOverlayDataUrl.startsWith('data:image/')) {
    const base64Part = options.maskOverlayDataUrl.split(',')[1];
    if (base64Part) {
      const maskBuf = Buffer.from(base64Part, 'base64');
      const maskRaw = await sharp(maskBuf).resize(w, h).ensureAlpha().raw().toBuffer();
      for (let i = 0; i < fgData.length; i += 4) {
        const mAlpha = maskRaw[i + 3];
        if (mAlpha > 20) {
          const lum = (maskRaw[i] + maskRaw[i + 1] + maskRaw[i + 2]) / 3;
          if (lum >= 165) {
            // Restore original RGB & full alpha
            fgData[i] = srcRaw[i];
            fgData[i + 1] = srcRaw[i + 1];
            fgData[i + 2] = srcRaw[i + 2];
            fgData[i + 3] = 255;
          } else if (lum <= 90) {
            // Erase alpha
            fgData[i + 3] = 0;
          }
        }
      }
    }
  }

  // Extract alpha channel for edge refinement & feathering
  let alphaChannel: Buffer = Buffer.alloc(w * h);
  for (let p = 0; p < w * h; p++) {
    let a = fgData[p * 4 + 3];
    if (options.edgeRefinement !== 0 && a > 0 && a < 255) {
      a = clampByte(a + options.edgeRefinement * 32);
    } else if (options.edgeRefinement < 0 && a === 255) {
      // Soft slight choke stays clean at edges during blur pass below
      a = 255;
    }
    alphaChannel[p] = a;
  }

  if (options.edgeRefinement < 0) {
    // Contract semi-transparent boundary slightly
    alphaChannel = await sharp(alphaChannel, { raw: { width: w, height: h, channels: 1 } })
      .blur(Math.abs(options.edgeRefinement) * 0.6)
      .linear(1.35, -45 * Math.abs(options.edgeRefinement))
      .toBuffer();
  } else if (options.edgeRefinement > 0) {
    alphaChannel = await sharp(alphaChannel, { raw: { width: w, height: h, channels: 1 } })
      .blur(options.edgeRefinement * 0.6)
      .linear(1.25, 22 * options.edgeRefinement)
      .toBuffer();
  }

  if (options.featherRadius > 0) {
    alphaChannel = await sharp(alphaChannel, { raw: { width: w, height: h, channels: 1 } })
      .blur(Math.max(0.35, options.featherRadius * 0.6))
      .toBuffer();
  }

  for (let p = 0; p < w * h; p++) {
    fgData[p * 4 + 3] = alphaChannel[p];
  }

  const refinedCutoutBuf = await sharp(fgData, { raw: { width: w, height: h, channels: 4 } }).png().toBuffer();
  const analysis = await analyzeCutoutAlpha(refinedCutoutBuf);

  // Color adjustments on subject
  let subjectPipeline = sharp(refinedCutoutBuf);
  if (options.brightness !== 1 || options.saturation !== 1) {
    subjectPipeline = subjectPipeline.modulate({
      brightness: options.brightness,
      saturation: options.saturation,
    });
  }
  if (options.contrast !== 1) {
    subjectPipeline = subjectPipeline.linear(options.contrast, 128 * (1 - options.contrast));
  }
  const adjustedSubjectBuf = await subjectPipeline.png().toBuffer();

  // Compute output canvas dimensions based on cropAspect
  let canvasW = w;
  let canvasH = h;
  if (options.cropAspect === '1:1') {
    const s = Math.max(w, h);
    canvasW = s;
    canvasH = s;
  } else if (options.cropAspect === '4:3') {
    canvasW = Math.max(w, Math.round((h * 4) / 3));
    canvasH = Math.round((canvasW * 3) / 4);
  } else if (options.cropAspect === '16:9') {
    canvasW = Math.max(w, Math.round((h * 16) / 9));
    canvasH = Math.round((canvasW * 9) / 16);
  } else if (options.cropAspect === '3:4') {
    canvasH = Math.max(h, Math.round((w * 4) / 3));
    canvasW = Math.round((canvasH * 3) / 4);
  }

  // Scale & position subject
  const scale = Math.max(0.4, Math.min(1.5, options.subjectScale || 1));
  const scaledW = Math.max(16, Math.round(w * scale));
  const scaledH = Math.max(16, Math.round(h * scale));
  const scaledSubject = await sharp(adjustedSubjectBuf)
    .resize(scaledW, scaledH, { fit: 'fill' })
    .ensureAlpha()
    .png()
    .toBuffer();

  const left = Math.round((canvasW - scaledW) / 2 + (options.offsetX || 0));
  const top = Math.round((canvasH - scaledH) / 2 + (options.offsetY || 0));

  // Build Background Layer
  let baseCanvas: Sharp;
  if (options.backgroundMode === 'solid') {
    const rgb = parseHexColor(options.backgroundColor, { r: 255, g: 255, b: 255 });
    baseCanvas = sharp({
      create: { width: canvasW, height: canvasH, channels: 4, background: { ...rgb, alpha: 1 } },
    });
  } else if (options.backgroundMode === 'gradient') {
    const fromHex = options.gradientFrom || '#141414';
    const toHex = options.gradientTo || '#e4e4e7';
    const angle = Number(options.gradientAngle || 135);
    const rad = (angle * Math.PI) / 180;
    const x2 = 50 + Math.cos(rad) * 50;
    const y2 = 50 + Math.sin(rad) * 50;
    const gradSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="${canvasW}" height="${canvasH}"><defs><linearGradient id="g" x1="0%" y1="0%" x2="${x2.toFixed(1)}%" y2="${y2.toFixed(1)}%"><stop offset="0%" stop-color="${fromHex}"/><stop offset="100%" stop-color="${toHex}"/></linearGradient></defs><rect width="${canvasW}" height="${canvasH}" fill="url(#g)"/></svg>`;
    baseCanvas = sharp(Buffer.from(gradSvg, 'utf8')).resize(canvasW, canvasH);
  } else if (options.backgroundMode === 'blur') {
    const blurredBg = await sharp(sourcePng)
      .resize(canvasW, canvasH, { fit: 'cover' })
      .blur(Math.max(4, Math.min(40, options.backgroundBlurRadius || 18)))
      .png()
      .toBuffer();
    baseCanvas = sharp(blurredBg);
  } else if (options.backgroundMode === 'custom' && customBgPath && fs.existsSync(customBgPath)) {
    const customBgBuf = await sharp(customBgPath).resize(canvasW, canvasH, { fit: 'cover' }).png().toBuffer();
    baseCanvas = sharp(customBgBuf);
  } else {
    baseCanvas = sharp({
      create: { width: canvasW, height: canvasH, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
    });
  }

  // Optional Drop Shadow Layer
  const layers: OverlayOptions[] = [];
  if (options.shadowEnabled) {
    const { data: sData, info: sInfo } = await sharp(scaledSubject)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    const shadowRaw = Buffer.alloc(sData.length);
    const shadowAlphaFactor = Math.max(0.1, Math.min(0.85, options.shadowOpacity || 0.35));
    for (let i = 0; i < sData.length; i += 4) {
      shadowRaw[i] = 0;
      shadowRaw[i + 1] = 0;
      shadowRaw[i + 2] = 0;
      shadowRaw[i + 3] = clampByte(sData[i + 3] * shadowAlphaFactor);
    }
    const blurSigma = Math.max(2, Math.min(30, options.shadowBlur || 14));
    const shadowImg = await sharp(shadowRaw, {
      raw: { width: sInfo.width, height: sInfo.height, channels: 4 },
    })
      .blur(blurSigma * 0.65)
      .png()
      .toBuffer();
    layers.push({ input: shadowImg, left, top: top + Math.round(blurSigma * 0.45) });
  }

  layers.push({ input: scaledSubject, left, top });

  const composed = baseCanvas.composite(layers);
  const q = Math.max(30, Math.min(100, options.quality || 92));
  if (options.outputFormat === 'webp') {
    await composed.webp({ quality: q, alphaQuality: 100 }).toFile(outputPath);
  } else {
    await composed.png({ compressionLevel: 7 }).toFile(outputPath);
  }

  return {
    cutoutBuffer: refinedCutoutBuf,
    analysis,
    durationMs: Date.now() - startedAt,
  };
}
