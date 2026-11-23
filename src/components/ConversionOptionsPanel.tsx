import type { ConversionOptions, FormatCategory } from '../shared/types';
import { GlassDropdown } from './glass/GlassDropdown';

interface ConversionOptionsPanelProps {
  category: FormatCategory | 'unknown';
  sourceExt: string;
  targetExt: string;
  options: ConversionOptions;
  onChange: (next: ConversionOptions) => void;
  availableSheets?: string[];
}

export function ConversionOptionsPanel({
  category,
  sourceExt,
  targetExt,
  options,
  onChange,
  availableSheets,
}: ConversionOptionsPanelProps) {
  const patch = (partial: Partial<ConversionOptions>) => onChange({ ...options, ...partial });

  const inputCls =
    'w-full rounded-xl border border-[var(--control-border)] bg-[var(--input-bg)] px-3 py-2 text-xs text-[var(--text-primary)] placeholder-[var(--text-secondary)] focus:outline-none focus:border-zinc-500 dark:focus:border-white/45 transition-colors tabular-nums';
  const labelCls = 'block text-xs text-[var(--text-muted)] mb-1.5';
  const checkboxCls = 'accent-zinc-900 dark:accent-white rounded cursor-pointer';

  if (category === 'image' || category === 'vector') {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <div>
          <label className={labelCls}>Quality ({options.quality ?? 88}%)</label>
          <input
            type="range"
            min={10}
            max={100}
            value={options.quality ?? 88}
            onChange={(e) => patch({ quality: Number(e.target.value) })}
            className="w-full accent-zinc-900 dark:accent-white mt-1.5 cursor-pointer"
          />
        </div>
        <div>
          <label className={labelCls}>Width (px)</label>
          <input
            type="number"
            min={1}
            placeholder="Original"
            value={options.width ?? ''}
            onChange={(e) => patch({ width: e.target.value ? Number(e.target.value) : undefined })}
            className={inputCls}
          />
        </div>
        <div>
          <label className={labelCls}>Height (px)</label>
          <input
            type="number"
            min={1}
            placeholder="Auto"
            value={options.height ?? ''}
            onChange={(e) => patch({ height: e.target.value ? Number(e.target.value) : undefined })}
            className={inputCls}
          />
        </div>
        <div>
          <label className={labelCls}>DPI Resolution</label>
          <GlassDropdown
            size="sm"
            ariaLabel="DPI Resolution"
            value={options.dpi ? String(options.dpi) : ''}
            onChange={(v) => patch({ dpi: v ? Number(v) : undefined })}
            options={[
              { value: '', label: 'Default' },
              { value: '72', label: '72 DPI', sublabel: 'Screen' },
              { value: '150', label: '150 DPI', sublabel: 'Standard' },
              { value: '300', label: '300 DPI', sublabel: 'Print' },
            ]}
          />
        </div>
        <div>
          <label className={labelCls}>Rotation</label>
          <GlassDropdown
            size="sm"
            ariaLabel="Image rotation"
            value={String(options.rotate ?? 0)}
            onChange={(v) => patch({ rotate: Number(v) })}
            options={[
              { value: '0', label: '0°', sublabel: 'Original' },
              { value: '90', label: '90°', sublabel: 'Clockwise' },
              { value: '180', label: '180°' },
              { value: '270', label: '270°', sublabel: 'Clockwise' },
            ]}
          />
        </div>
        <div className="sm:col-span-2 lg:col-span-3 flex flex-wrap items-center gap-x-6 gap-y-2 pt-1">
          <label className="flex items-center gap-2 text-xs text-[var(--text-soft)] whitespace-nowrap cursor-pointer">
            <input
              type="checkbox"
              checked={Boolean(options.stripMetadata)}
              onChange={(e) => patch({ stripMetadata: e.target.checked })}
              className={checkboxCls}
            />
            Strip EXIF / metadata
          </label>
          <label className="flex items-center gap-2 text-xs text-[var(--text-soft)] whitespace-nowrap cursor-pointer">
            <input
              type="checkbox"
              checked={Boolean(options.removeBackground)}
              onChange={(e) => patch({ removeBackground: e.target.checked })}
              className={checkboxCls}
            />
            Remove light background
          </label>
          <label className="flex items-center gap-2 text-xs text-[var(--text-soft)] whitespace-nowrap cursor-pointer">
            <input
              type="checkbox"
              checked={Boolean(options.grayscale)}
              onChange={(e) => patch({ grayscale: e.target.checked })}
              className={checkboxCls}
            />
            Monochrome grayscale
          </label>
        </div>
      </div>
    );
  }

  if (
    category === 'audio' ||
    (category === 'video' && ['mp3', 'wav', 'flac', 'aac', 'm4a', 'ogg', 'opus'].includes(targetExt))
  ) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <div>
          <label className={labelCls}>Audio Bitrate</label>
          <GlassDropdown
            size="sm"
            ariaLabel="Audio Bitrate"
            value={options.bitrate ?? '192k'}
            onChange={(v) => patch({ bitrate: v })}
            options={[
              { value: '96k', label: '96 kbps', sublabel: 'Voice' },
              { value: '128k', label: '128 kbps', sublabel: 'Standard' },
              { value: '192k', label: '192 kbps', sublabel: 'High' },
              { value: '256k', label: '256 kbps', sublabel: 'Studio' },
              { value: '320k', label: '320 kbps', sublabel: 'Max MP3' },
            ]}
          />
        </div>
        <div>
          <label className={labelCls}>Sample Rate</label>
          <GlassDropdown
            size="sm"
            ariaLabel="Sample Rate"
            value={options.sampleRate ? String(options.sampleRate) : ''}
            onChange={(v) => patch({ sampleRate: v ? Number(v) : undefined })}
            options={[
              { value: '', label: 'Original' },
              { value: '22050', label: '22,050 Hz' },
              { value: '44100', label: '44,100 Hz', sublabel: 'CD' },
              { value: '48000', label: '48,000 Hz', sublabel: 'Studio' },
              { value: '96000', label: '96,000 Hz', sublabel: 'Hi-Res' },
            ]}
          />
        </div>
        <div>
          <label className={labelCls}>Channels</label>
          <GlassDropdown
            size="sm"
            ariaLabel="Channels"
            value={options.channels ? String(options.channels) : ''}
            onChange={(v) => patch({ channels: v ? (Number(v) as 1 | 2) : undefined })}
            options={[
              { value: '', label: 'Original' },
              { value: '2', label: 'Stereo', sublabel: '2 ch' },
              { value: '1', label: 'Mono', sublabel: '1 ch' },
            ]}
          />
        </div>
        <div>
          <label className={labelCls}>Trim Start (sec or HH:MM:SS)</label>
          <input
            type="text"
            placeholder="00:00:00"
            value={options.trimStart ?? ''}
            onChange={(e) => patch({ trimStart: e.target.value || undefined })}
            className={inputCls}
          />
        </div>
        <div>
          <label className={labelCls}>Trim End</label>
          <input
            type="text"
            placeholder="End of track"
            value={options.trimEnd ?? ''}
            onChange={(e) => patch({ trimEnd: e.target.value || undefined })}
            className={inputCls}
          />
        </div>
        <div>
          <label className={labelCls}>Volume Gain ({options.volume ?? 1}×)</label>
          <input
            type="range"
            min={0.2}
            max={2.5}
            step={0.1}
            value={options.volume ?? 1}
            onChange={(e) => patch({ volume: Number(e.target.value) })}
            className="w-full accent-zinc-900 dark:accent-white mt-1.5 cursor-pointer"
          />
        </div>
      </div>
    );
  }

  if (category === 'video') {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <div>
          <label className={labelCls}>Resolution</label>
          <GlassDropdown
            size="sm"
            ariaLabel="Video Resolution"
            value={options.resolution ?? 'original'}
            onChange={(v) => patch({ resolution: v })}
            options={[
              { value: 'original', label: 'Original Resolution' },
              { value: '1920x1080', label: '1080p', sublabel: '1920×1080' },
              { value: '1280x720', label: '720p', sublabel: '1280×720' },
              { value: '854x480', label: '480p', sublabel: '854×480' },
            ]}
          />
        </div>
        <div>
          <label className={labelCls}>Frame Rate (FPS)</label>
          <GlassDropdown
            size="sm"
            ariaLabel="Frame Rate"
            value={options.fps ? String(options.fps) : ''}
            onChange={(v) => patch({ fps: v ? Number(v) : undefined })}
            options={[
              { value: '', label: 'Original FPS' },
              { value: '24', label: '24 fps', sublabel: 'Cinema' },
              { value: '30', label: '30 fps', sublabel: 'Standard' },
              { value: '60', label: '60 fps', sublabel: 'Smooth' },
            ]}
          />
        </div>
        <div>
          <label className={labelCls}>Compression CRF ({options.crf ?? 23})</label>
          <input
            type="range"
            min={16}
            max={35}
            value={options.crf ?? 23}
            onChange={(e) => patch({ crf: Number(e.target.value) })}
            className="w-full accent-zinc-900 dark:accent-white mt-1.5 cursor-pointer"
          />
        </div>
        <div>
          <label className={labelCls}>Trim Start</label>
          <input
            type="text"
            placeholder="00:00:00"
            value={options.trimStart ?? ''}
            onChange={(e) => patch({ trimStart: e.target.value || undefined })}
            className={inputCls}
          />
        </div>
        <div>
          <label className={labelCls}>Trim End</label>
          <input
            type="text"
            placeholder="Full duration"
            value={options.trimEnd ?? ''}
            onChange={(e) => patch({ trimEnd: e.target.value || undefined })}
            className={inputCls}
          />
        </div>
        <div>
          <label className={labelCls}>Rotate Video</label>
          <GlassDropdown
            size="sm"
            ariaLabel="Rotate Video"
            value={String(options.rotate ?? 0)}
            onChange={(v) => patch({ rotate: Number(v) })}
            options={[
              { value: '0', label: '0°', sublabel: 'Original' },
              { value: '90', label: '90°', sublabel: 'Clockwise' },
              { value: '180', label: '180°' },
              { value: '270', label: '270°', sublabel: 'Clockwise' },
            ]}
          />
        </div>
      </div>
    );
  }

  if (category === 'document' && sourceExt === 'pdf') {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div>
          <label className={labelCls}>Page Range (e.g. 1-3,5)</label>
          <input
            type="text"
            placeholder="All pages"
            value={options.pageRange ?? ''}
            onChange={(e) => patch({ pageRange: e.target.value || undefined })}
            className={inputCls}
          />
        </div>
        <div>
          <label className={labelCls}>Rotate Pages</label>
          <GlassDropdown
            size="sm"
            ariaLabel="Rotate Pages"
            value={String(options.rotate ?? 0)}
            onChange={(v) => patch({ rotate: Number(v) })}
            options={[
              { value: '0', label: '0°' },
              { value: '90', label: '90° Clockwise' },
              { value: '180', label: '180°' },
              { value: '270', label: '270°' },
            ]}
          />
        </div>
        <div>
          <label className={labelCls}>PDF Compression</label>
          <GlassDropdown
            size="sm"
            ariaLabel="PDF Compression"
            value={options.compressLevel ?? ''}
            onChange={(v) => patch({ compressLevel: (v || undefined) as ConversionOptions['compressLevel'] })}
            options={[
              { value: '', label: 'None', sublabel: 'Preserve quality' },
              { value: 'low', label: 'Low', sublabel: '300 DPI Print' },
              { value: 'medium', label: 'Medium', sublabel: '150 DPI eBook' },
              { value: 'high', label: 'High', sublabel: '72 DPI Screen' },
            ]}
          />
        </div>
      </div>
    );
  }

  if (category === 'spreadsheet') {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {availableSheets && availableSheets.length > 0 && (
          <div>
            <label className={labelCls}>Worksheet Selection</label>
            <GlassDropdown
              size="sm"
              ariaLabel="Worksheet Selection"
              value={options.sheetName ?? availableSheets[0]}
              onChange={(v) => patch({ sheetName: v })}
              options={availableSheets.map((s) => ({ value: s, label: s }))}
            />
          </div>
        )}
        <div>
          <label className={labelCls}>Delimiter (CSV/TSV)</label>
          <GlassDropdown
            size="sm"
            ariaLabel="Delimiter"
            value={options.delimiter ?? ','}
            onChange={(v) => patch({ delimiter: v as ConversionOptions['delimiter'] })}
            options={[
              { value: ',', label: 'Comma (,)' },
              { value: ';', label: 'Semicolon (;)' },
              { value: '\t', label: 'Tab (\\t)' },
              { value: '|', label: 'Pipe (|)' },
            ]}
          />
        </div>
        <div>
          <label className={labelCls}>Text Encoding</label>
          <GlassDropdown
            size="sm"
            ariaLabel="Text Encoding"
            value={options.encoding ?? 'utf8'}
            onChange={(v) => patch({ encoding: v as ConversionOptions['encoding'] })}
            options={[
              { value: 'utf8', label: 'UTF-8' },
              { value: 'utf16le', label: 'UTF-16 LE' },
              { value: 'latin1', label: 'ISO-8859-1 (Latin-1)' },
            ]}
          />
        </div>
      </div>
    );
  }

  if (category === 'subtitle') {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className={labelCls}>Time Sync Offset (ms, e.g. +1500 or -500)</label>
          <input
            type="number"
            step={100}
            value={options.timeOffsetMs ?? 0}
            onChange={(e) => patch({ timeOffsetMs: Number(e.target.value) })}
            className={inputCls}
          />
        </div>
        <div>
          <label className={labelCls}>Output Encoding</label>
          <GlassDropdown
            size="sm"
            ariaLabel="Output Encoding"
            value={options.encoding ?? 'utf8'}
            onChange={(v) => patch({ encoding: v as ConversionOptions['encoding'] })}
            options={[
              { value: 'utf8', label: 'UTF-8' },
              { value: 'latin1', label: 'Latin-1' },
            ]}
          />
        </div>
      </div>
    );
  }

  if (category === 'model3d') {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className={labelCls}>Geometry Scale Multiplier</label>
          <input
            type="number"
            step={0.1}
            min={0.01}
            value={options.scale ?? 1}
            onChange={(e) => patch({ scale: Number(e.target.value) || 1 })}
            className={inputCls}
          />
        </div>
      </div>
    );
  }

  if (category === 'data' || category === 'webdev') {
    return (
      <div className="flex flex-wrap items-center gap-6">
        <label className="flex items-center gap-2 text-xs text-[var(--text-soft)] cursor-pointer">
          <input
            type="checkbox"
            checked={Boolean(options.minify)}
            onChange={(e) => patch({ minify: e.target.checked, prettyPrint: !e.target.checked })}
            className={checkboxCls}
          />
          Minify output
        </label>
        {category === 'data' && (
          <label className="flex items-center gap-2 text-xs text-[var(--text-soft)] cursor-pointer">
            <input
              type="checkbox"
              checked={options.prettyPrint !== false && !options.minify}
              onChange={(e) => patch({ prettyPrint: e.target.checked, minify: !e.target.checked })}
              className={checkboxCls}
            />
            Pretty-print indentation
          </label>
        )}
      </div>
    );
  }

  if (category === 'ebook') {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className={labelCls}>Override Book Title</label>
          <input
            type="text"
            placeholder="Keep original title"
            value={options.ebookTitle ?? ''}
            onChange={(e) => patch({ ebookTitle: e.target.value || undefined })}
            className={inputCls}
          />
        </div>
        <div>
          <label className={labelCls}>Override Author</label>
          <input
            type="text"
            placeholder="Keep original author"
            value={options.ebookAuthor ?? ''}
            onChange={(e) => patch({ ebookAuthor: e.target.value || undefined })}
            className={inputCls}
          />
        </div>
      </div>
    );
  }

  return (
    <p className="text-xs text-[var(--text-muted)]">
      Standard lossless structural conversion settings active for {sourceExt.toUpperCase()} to {targetExt.toUpperCase()}.
    </p>
  );
}
