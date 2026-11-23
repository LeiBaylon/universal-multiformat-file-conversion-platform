import { execFile } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';
import type { ConversionOptions } from '../../src/shared/types';

const execFileAsync = promisify(execFile);

export async function inspectMedia(filePath: string): Promise<Record<string, string | number>> {
  try {
    const { stdout } = await execFileAsync(
      'ffprobe',
      ['-v', 'quiet', '-print_format', 'json', '-show_format', '-show_streams', filePath],
      { timeout: 15000 }
    );
    const data = JSON.parse(stdout);
    const fmt = data.format || {};
    const streams = Array.isArray(data.streams) ? data.streams : [];
    const video = streams.find((s: { codec_type?: string }) => s.codec_type === 'video');
    const audio = streams.find((s: { codec_type?: string }) => s.codec_type === 'audio');
    const details: Record<string, string | number> = {};
    if (fmt.duration) details.durationSec = Number(Number(fmt.duration).toFixed(2));
    if (fmt.bit_rate) details.bitrateKbps = Math.round(Number(fmt.bit_rate) / 1000);
    if (video) {
      details.videoCodec = video.codec_name;
      details.resolution = `${video.width}×${video.height}`;
      if (video.r_frame_rate) details.fps = video.r_frame_rate;
    }
    if (audio) {
      details.audioCodec = audio.codec_name;
      if (audio.sample_rate) details.sampleRate = `${audio.sample_rate} Hz`;
      if (audio.channels) details.channels = audio.channels === 1 ? 'Mono' : 'Stereo';
    }
    return details;
  } catch {
    return {};
  }
}

export async function convertMedia(
  inputPath: string,
  outputPath: string,
  sourceExt: string,
  targetExt: string,
  options: ConversionOptions = {}
): Promise<{ note: string }> {
  const dst = targetExt.toLowerCase();
  const isImageThumb = ['png', 'jpg', 'jpeg', 'webp'].includes(dst);
  const isAudioOut = [
    'mp3', 'wav', 'flac', 'aac', 'm4a', 'ogg', 'opus', 'wma', 'aiff', 'aif',
    'alac', 'ac3', 'dts', 'wv', 'caf', 'au', 'voc', 'mp2', 'gsm', 'spx',
  ].includes(dst);

  // Video -> Thumbnail image frame
  if (isImageThumb) {
    const args = ['-y'];
    if (options.trimStart) args.push('-ss', options.trimStart);
    args.push('-i', inputPath, '-vframes', '1');
    if (options.width || options.height) {
      args.push('-vf', `scale=${options.width || -1}:${options.height || -1}`);
    }
    args.push(outputPath);
    await execFileAsync('ffmpeg', args, { timeout: 60000 });
    return { note: 'Extracted video frame thumbnail via FFmpeg.' };
  }

  // Video -> Animated GIF
  if (dst === 'gif') {
    const args = ['-y'];
    if (options.trimStart) args.push('-ss', options.trimStart);
    if (options.trimEnd) args.push('-to', options.trimEnd);
    args.push('-i', inputPath);
    const fps = options.fps || 12;
    const width = options.width || 480;
    args.push(
      '-vf',
      `fps=${fps},scale=${width}:-1:flags=lanczos,split[s0][s1];[s0]palettegen[p];[s1][p]paletteuse`,
      '-loop',
      '0',
      outputPath
    );
    await execFileAsync('ffmpeg', args, { timeout: 120000 });
    return { note: `Generated palette-optimized GIF at ${fps} fps via FFmpeg.` };
  }

  const args: string[] = ['-y'];
  if (options.trimStart) args.push('-ss', options.trimStart);
  if (options.trimEnd) args.push('-to', options.trimEnd);
  args.push('-i', inputPath);

  if (isAudioOut || options.extractAudioOnly) {
    args.push('-vn');

    const audioFilters: string[] = [];
    if (options.volume && options.volume !== 1) {
      audioFilters.push(`volume=${options.volume}`);
    }
    if (options.fadeInSec && options.fadeInSec > 0) {
      audioFilters.push(`afade=t=in:st=0:d=${options.fadeInSec}`);
    }
    if (options.fadeOutSec && options.fadeOutSec > 0) {
      const info = await inspectMedia(inputPath);
      const dur = Number(info.durationSec) || 0;
      const start = Math.max(0, dur - options.fadeOutSec);
      if (dur > options.fadeOutSec) {
        audioFilters.push(`afade=t=out:st=${start}:d=${options.fadeOutSec}`);
      }
    }
    if (audioFilters.length > 0) {
      args.push('-af', audioFilters.join(','));
    }

    if (options.sampleRate) args.push('-ar', String(options.sampleRate));
    if (options.channels) args.push('-ac', String(options.channels));
    if (options.bitrate && !['wav', 'flac', 'alac', 'aiff', 'aif', 'wv'].includes(dst)) {
      args.push('-b:a', options.bitrate);
    }

    if (dst === 'mp3') args.push('-c:a', 'libmp3lame');
    else if (dst === 'aac') args.push('-c:a', 'aac', '-f', 'adts');
    else if (dst === 'm4a') args.push('-c:a', 'aac');
    else if (dst === 'alac') args.push('-c:a', 'alac', '-f', 'mp4');
    else if (dst === 'flac') args.push('-c:a', 'flac');
    else if (dst === 'ogg') args.push('-c:a', 'libvorbis');
    else if (dst === 'opus') args.push('-c:a', 'libopus');
    else if (dst === 'spx') args.push('-c:a', 'libspeex', '-f', 'ogg');
    else if (dst === 'wma') args.push('-c:a', 'wmav2');
    else if (dst === 'ac3') args.push('-c:a', 'ac3');
    else if (dst === 'dts') args.push('-c:a', 'dca', '-strict', '-2');
    else if (dst === 'wv') args.push('-c:a', 'wavpack');
    else if (dst === 'mp2') args.push('-c:a', 'mp2');
    else if (dst === 'gsm') {
      args.push('-c:a', 'libgsm', '-ar', '8000', '-ac', '1');
    } else if (dst === 'au') {
      args.push('-c:a', 'pcm_s16be', '-f', 'au');
    } else if (dst === 'aif' || dst === 'aiff') {
      args.push('-c:a', 'pcm_s16be', '-f', 'aiff');
    }

    if (options.metaTitle) args.push('-metadata', `title=${options.metaTitle}`);
    if (options.metaArtist) args.push('-metadata', `artist=${options.metaArtist}`);

    args.push(outputPath);
    await execFileAsync('ffmpeg', args, { timeout: 120000 });
    return { note: `Encoded ${dst.toUpperCase()} audio stream via FFmpeg.` };
  }

  // Video output
  const vFilters: string[] = [];
  if (options.resolution && options.resolution !== 'original' && options.resolution.includes('x')) {
    const [w, h] = options.resolution.split('x');
    vFilters.push(`scale=${w}:${h}:force_original_aspect_ratio=decrease,pad=ceil(iw/2)*2:ceil(ih/2)*2`);
  } else {
    vFilters.push('scale=ceil(iw/2)*2:ceil(ih/2)*2');
  }
  if (options.rotate === 90) vFilters.push('transpose=1');
  else if (options.rotate === 180) vFilters.push('transpose=1,transpose=1');
  else if (options.rotate === 270) vFilters.push('transpose=2');
  if (vFilters.length > 0) args.push('-vf', vFilters.join(','));
  if (options.fps) args.push('-r', String(options.fps));

  const crf = options.crf ?? 23;
  if (['mp4', 'mkv', 'mov', 'm4v', 'ts', 'mts', 'm2ts'].includes(dst)) {
    args.push('-c:v', 'libx264', '-crf', String(crf), '-preset', 'veryfast', '-pix_fmt', 'yuv420p', '-c:a', 'aac');
    if (dst === 'mp4' || dst === 'm4v' || dst === 'mov') args.push('-movflags', '+faststart');
  } else if (dst === 'webm') {
    args.push('-c:v', 'libvpx-vp9', '-crf', String(Math.max(24, crf)), '-b:v', '0', '-c:a', 'libopus');
  } else if (dst === 'ogv') {
    args.push('-c:v', 'libtheora', '-q:v', '7', '-c:a', 'libvorbis');
  } else if (dst === 'avi') {
    args.push('-c:v', 'mpeg4', '-q:v', '5', '-c:a', 'libmp3lame');
  } else if (dst === 'wmv' || dst === 'asf') {
    args.push('-c:v', 'wmv2', '-c:a', 'wmav2');
  } else if (dst === 'flv') {
    args.push('-c:v', 'flv', '-c:a', 'libmp3lame', '-ar', '44100');
  } else if (dst === '3gp' || dst === '3g2') {
    args.push('-c:v', 'mpeg4', '-c:a', 'aac', '-ar', '8000', '-ac', '1');
  } else if (dst === 'mpeg' || dst === 'mpg' || dst === 'vob') {
    args.push('-c:v', 'mpeg2video', '-c:a', 'mp2');
  } else if (dst === 'dv') {
    args.push('-target', 'ntsc-dv');
  }

  if (options.bitrate) args.push('-b:v', options.bitrate);
  args.push(outputPath);

  await execFileAsync('ffmpeg', args, { timeout: 180000 });
  return { note: `Transcoded to ${dst.toUpperCase()} via FFmpeg (${sourceExt.toUpperCase()} -> ${dst.toUpperCase()}).` };
}

export async function mergeMediaFiles(
  inputPaths: string[],
  outputPath: string,
  targetExt: string,
  workDir: string
): Promise<{ note: string }> {
  const listFile = path.join(workDir, `concat_${Date.now()}.txt`);
  const content = inputPaths.map((p) => `file '${p.replace(/'/g, "'\\''")}'`).join('\n');
  fs.writeFileSync(listFile, content, 'utf8');
  try {
    await execFileAsync(
      'ffmpeg',
      ['-y', '-f', 'concat', '-safe', '0', '-i', listFile, outputPath],
      { timeout: 180000 }
    );
    return { note: `Merged ${inputPaths.length} media files into ${targetExt.toUpperCase()} via FFmpeg concat.` };
  } finally {
    if (fs.existsSync(listFile)) fs.unlinkSync(listFile);
  }
}
