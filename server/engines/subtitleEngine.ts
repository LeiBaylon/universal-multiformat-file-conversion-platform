export interface SubtitleCue {
  index: number;
  startMs: number;
  endMs: number;
  text: string;
}

export type SubtitleFormat = 'srt' | 'vtt' | 'ass' | 'ssa' | 'sub' | 'sbv' | 'ttml' | 'dfxp';

function pad2(n: number): string {
  return String(Math.max(0, Math.floor(n))).padStart(2, '0');
}

function pad3(n: number): string {
  return String(Math.max(0, Math.floor(n))).padStart(3, '0');
}

export function formatMsToSrt(ms: number): string {
  const clamped = Math.max(0, Math.round(ms));
  const h = Math.floor(clamped / 3600000);
  const m = Math.floor((clamped % 3600000) / 60000);
  const s = Math.floor((clamped % 60000) / 1000);
  const rem = clamped % 1000;
  return `${pad2(h)}:${pad2(m)}:${pad2(s)},${pad3(rem)}`;
}

export function formatMsToVtt(ms: number): string {
  return formatMsToSrt(ms).replace(',', '.');
}

export function formatMsToAss(ms: number): string {
  const clamped = Math.max(0, Math.round(ms));
  const h = Math.floor(clamped / 3600000);
  const m = Math.floor((clamped % 3600000) / 60000);
  const s = Math.floor((clamped % 60000) / 1000);
  const cs = Math.floor((clamped % 1000) / 10);
  return `${h}:${pad2(m)}:${pad2(s)}.${pad2(cs)}`;
}

export function parseTimestampToMs(raw: string): number {
  const cleaned = raw.trim().replace(',', '.');
  const parts = cleaned.split(':');
  if (parts.length === 3) {
    const h = Number(parts[0]) || 0;
    const m = Number(parts[1]) || 0;
    const s = Number(parts[2]) || 0;
    return Math.round((h * 3600 + m * 60 + s) * 1000);
  }
  if (parts.length === 2) {
    const m = Number(parts[0]) || 0;
    const s = Number(parts[1]) || 0;
    return Math.round((m * 60 + s) * 1000);
  }
  if (cleaned.endsWith('s')) {
    return Math.round((Number(cleaned.slice(0, -1)) || 0) * 1000);
  }
  return Math.round((Number(cleaned) || 0) * 1000);
}

function stripTags(text: string): string {
  return text
    .replace(/\{\\[^}]+\}/g, '')
    .replace(/\\N/g, '\n')
    .replace(/\\n/g, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .trim();
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function unescapeXml(str: string): string {
  return str
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

export function parseSubtitles(content: string, ext: string): SubtitleCue[] {
  const norm = content.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const format = ext.toLowerCase() as SubtitleFormat;
  const cues: SubtitleCue[] = [];

  if (format === 'srt' || format === 'vtt') {
    const body = format === 'vtt' ? norm.replace(/^WEBVTT[^\n]*\n+/i, '') : norm;
    const blocks = body.split(/\n{2,}/);
    let idx = 1;
    for (const block of blocks) {
      const lines = block.split('\n').map((l) => l.trimEnd());
      const timingLineIdx = lines.findIndex((l) => l.includes('-->'));
      if (timingLineIdx === -1) continue;
      const timingLine = lines[timingLineIdx];
      const [startStr, endPart] = timingLine.split('-->');
      const endStr = (endPart || '').trim().split(/\s+/)[0] || '';
      const text = stripTags(lines.slice(timingLineIdx + 1).join('\n'));
      if (!text) continue;
      cues.push({
        index: idx++,
        startMs: parseTimestampToMs(startStr),
        endMs: parseTimestampToMs(endStr),
        text,
      });
    }
    return cues;
  }

  if (format === 'sbv') {
    const blocks = norm.split(/\n{2,}/);
    let idx = 1;
    for (const block of blocks) {
      const lines = block.split('\n');
      if (lines.length < 2 || !lines[0].includes(',')) continue;
      const [startStr, endStr] = lines[0].split(',');
      const text = stripTags(lines.slice(1).join('\n'));
      if (!text) continue;
      cues.push({
        index: idx++,
        startMs: parseTimestampToMs(startStr),
        endMs: parseTimestampToMs(endStr),
        text,
      });
    }
    return cues;
  }

  if (format === 'sub') {
    // MicroDVD {startFrame}{endFrame}text at 25fps default
    const fps = 25;
    let idx = 1;
    for (const line of norm.split('\n')) {
      const m = line.match(/^\{(\d+)\}\{(\d+)\}(.+)$/);
      if (!m) continue;
      const startMs = Math.round((Number(m[1]) / fps) * 1000);
      const endMs = Math.round((Number(m[2]) / fps) * 1000);
      const text = m[3].replace(/\|/g, '\n').trim();
      cues.push({ index: idx++, startMs, endMs, text });
    }
    return cues;
  }

  if (format === 'ass' || format === 'ssa') {
    let idx = 1;
    for (const line of norm.split('\n')) {
      if (!line.startsWith('Dialogue:')) continue;
      const payload = line.slice('Dialogue:'.length).trim();
      const parts = payload.split(',');
      if (parts.length < 10) continue;
      const startMs = parseTimestampToMs(parts[1]);
      const endMs = parseTimestampToMs(parts[2]);
      const text = stripTags(parts.slice(9).join(','));
      cues.push({ index: idx++, startMs, endMs, text });
    }
    return cues;
  }

  if (format === 'ttml' || format === 'dfxp') {
    const regex = /<p\b[^>]*begin=["']([^"']+)["'][^>]*end=["']([^"']+)["'][^>]*>([\s\S]*?)<\/p>/gi;
    let match: RegExpExecArray | null;
    let idx = 1;
    while ((match = regex.exec(norm)) !== null) {
      const startMs = parseTimestampToMs(match[1]);
      const endMs = parseTimestampToMs(match[2]);
      const text = stripTags(unescapeXml(match[3]));
      if (text) cues.push({ index: idx++, startMs, endMs, text });
    }
    return cues;
  }

  return cues;
}

export function shiftSubtitles(cues: SubtitleCue[], offsetMs: number): SubtitleCue[] {
  if (!offsetMs) return cues;
  return cues.map((c) => ({
    ...c,
    startMs: Math.max(0, c.startMs + offsetMs),
    endMs: Math.max(100, c.endMs + offsetMs),
  }));
}

export function serializeSubtitles(cues: SubtitleCue[], targetExt: string): string {
  const format = targetExt.toLowerCase() as SubtitleFormat;
  switch (format) {
    case 'srt':
      return cues
        .map((c, i) => `${i + 1}\n${formatMsToSrt(c.startMs)} --> ${formatMsToSrt(c.endMs)}\n${c.text}`)
        .join('\n\n') + '\n';

    case 'vtt':
      return (
        'WEBVTT\n\n' +
        cues
          .map((c, i) => `${i + 1}\n${formatMsToVtt(c.startMs)} --> ${formatMsToVtt(c.endMs)}\n${c.text}`)
          .join('\n\n') +
        '\n'
      );

    case 'sbv':
      return (
        cues
          .map((c) => `${formatMsToVtt(c.startMs)},${formatMsToVtt(c.endMs)}\n${c.text}`)
          .join('\n\n') + '\n'
      );

    case 'sub': {
      const fps = 25;
      return (
        cues
          .map((c) => {
            const s = Math.round((c.startMs / 1000) * fps);
            const e = Math.round((c.endMs / 1000) * fps);
            return `{${s}}{${e}}${c.text.replace(/\n/g, '|')}`;
          })
          .join('\n') + '\n'
      );
    }

    case 'ass':
    case 'ssa': {
      const header = `[Script Info]
Title: Converted Subtitles
ScriptType: v4.00+
PlayResX: 1920
PlayResY: 1080

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,Arial,48,&H00FFFFFF,&H000000FF,&H00000000,&H64000000,0,0,0,0,100,100,0,0,1,2,0,2,20,20,30,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;
      const lines = cues.map(
        (c) =>
          `Dialogue: 0,${formatMsToAss(c.startMs)},${formatMsToAss(c.endMs)},Default,,0,0,0,,${c.text.replace(
            /\n/g,
            '\\N'
          )}`
      );
      return header + lines.join('\n') + '\n';
    }

    case 'ttml':
    case 'dfxp': {
      const body = cues
        .map(
          (c) =>
            `      <p begin="${formatMsToVtt(c.startMs)}" end="${formatMsToVtt(c.endMs)}">${escapeXml(c.text).replace(
              /\n/g,
              '<br/>'
            )}</p>`
        )
        .join('\n');
      return `<?xml version="1.0" encoding="UTF-8"?>
<tt xmlns="http://www.w3.org/ns/ttml" xml:lang="en">
  <body>
    <div>
${body}
    </div>
  </body>
</tt>
`;
    }
  }
}

export function convertSubtitleContent(
  input: string,
  sourceExt: string,
  targetExt: string,
  offsetMs = 0
): { output: string; cueCount: number; previewCues: SubtitleCue[] } {
  const parsed = parseSubtitles(input, sourceExt);
  if (parsed.length === 0) {
    throw new Error(`No valid subtitle cues found in ${sourceExt.toUpperCase()} input.`);
  }
  const shifted = shiftSubtitles(parsed, offsetMs);
  const output = serializeSubtitles(shifted, targetExt);
  return {
    output,
    cueCount: shifted.length,
    previewCues: shifted.slice(0, 12),
  };
}
