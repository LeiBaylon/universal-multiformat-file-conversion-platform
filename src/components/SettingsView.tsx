import { useCallback, useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { Activity, RefreshCw, ShieldCheck, Trash2 } from 'lucide-react';
import type { StorageStats, SystemResourceStats, UserSettings } from '../shared/types';
import { formatBytes } from '../utils/formatters';
import { SPRING_SNAPPY } from '../utils/motion';
import { GlassSurface } from './glass/GlassSurface';
import { GlassDropdown } from './glass/GlassDropdown';

interface SettingsViewProps {
  settings: UserSettings;
  storage: StorageStats | null;
  onUpdateSettings: (patch: Partial<UserSettings>) => Promise<void>;
  onPurgeStorage: () => Promise<void>;
}

const CATEGORY_OUTPUT_PRESETS: {
  key: string;
  label: string;
  options: { value: string; label: string }[];
}[] = [
  {
    key: 'image',
    label: 'Default Image Output',
    options: [
      { value: 'webp', label: 'WEBP' },
      { value: 'png', label: 'PNG' },
      { value: 'jpg', label: 'JPG' },
      { value: 'avif', label: 'AVIF' },
    ],
  },
  {
    key: 'document',
    label: 'Default Document Output',
    options: [
      { value: 'pdf', label: 'PDF' },
      { value: 'docx', label: 'DOCX' },
      { value: 'md', label: 'Markdown' },
      { value: 'txt', label: 'TXT' },
    ],
  },
  {
    key: 'audio',
    label: 'Default Audio Output',
    options: [
      { value: 'mp3', label: 'MP3' },
      { value: 'flac', label: 'FLAC' },
      { value: 'wav', label: 'WAV' },
      { value: 'opus', label: 'OPUS' },
    ],
  },
  {
    key: 'video',
    label: 'Default Video Output',
    options: [
      { value: 'mp4', label: 'MP4' },
      { value: 'webm', label: 'WEBM' },
      { value: 'mkv', label: 'MKV' },
      { value: 'gif', label: 'GIF' },
    ],
  },
  {
    key: 'spreadsheet',
    label: 'Default Spreadsheet Output',
    options: [
      { value: 'csv', label: 'CSV' },
      { value: 'xlsx', label: 'XLSX' },
      { value: 'json', label: 'JSON' },
    ],
  },
  {
    key: 'data',
    label: 'Default Data Output',
    options: [
      { value: 'json', label: 'JSON' },
      { value: 'yaml', label: 'YAML' },
      { value: 'toml', label: 'TOML' },
      { value: 'csv', label: 'CSV' },
    ],
  },
];

const ENGINE_LABELS: { key: string; label: string }[] = [
  { key: 'sharp', label: 'Sharp (libvips)' },
  { key: 'imglyIsnet', label: 'ISNet AI Segmentation' },
  { key: 'imagemagick', label: 'ImageMagick' },
  { key: 'ffmpeg', label: 'FFmpeg' },
  { key: 'ghostscript', label: 'Ghostscript' },
  { key: 'sevenZip', label: '7-Zip (p7zip)' },
  { key: 'tar', label: 'GNU tar' },
  { key: 'bzip2', label: 'BZip2' },
  { key: 'xz', label: 'XZ / LZMA' },
  { key: 'libreoffice', label: 'LibreOffice' },
  { key: 'pandoc', label: 'Pandoc' },
  { key: 'calibre', label: 'Calibre' },
];

function formatUptime(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (m < 60) return `${m}m ${s}s`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}

export function SettingsView({ settings, storage, onUpdateSettings, onPurgeStorage }: SettingsViewProps) {
  const defaultsMap = settings.defaultOutputFormats || {};
  const [resources, setResources] = useState<SystemResourceStats | null>(null);
  const [loadingRes, setLoadingRes] = useState(false);

  const fetchResources = useCallback(async () => {
    setLoadingRes(true);
    try {
      const res = await fetch('/api/resources');
      if (res.ok) {
        const data = (await res.json()) as SystemResourceStats;
        setResources(data);
      }
    } catch {
      // ignore transient error
    } finally {
      setLoadingRes(false);
    }
  }, []);

  useEffect(() => {
    fetchResources();
  }, [fetchResources]);

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Appearance & Conversion Defaults */}
      <section className="glass-secondary glass-rim rounded-[22px] p-6 space-y-5 overflow-visible relative z-30">
        <div>
          <h2 className="font-display text-lg font-semibold text-[var(--text-primary)]">
            Preferences &amp; Conversion Defaults
          </h2>
          <p className="text-xs text-[var(--text-muted)] mt-0.5">
            Configure Liquid Glass surface appearance, default output formats, and compression parameters.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 pt-2">
          <div>
            <label className="block text-xs text-[var(--text-muted)] mb-2">Interface Theme</label>
            <div className="inline-flex rounded-xl border border-black/12 dark:border-white/14 p-1 bg-black/5 dark:bg-black/40">
              {(['dark', 'light'] as const).map((t) => {
                const active = settings.theme === t;
                return (
                  <button
                    key={t}
                    type="button"
                    onClick={() => onUpdateSettings({ theme: t })}
                    className="relative px-4 py-1.5 rounded-lg text-xs font-medium capitalize cursor-pointer whitespace-nowrap"
                  >
                    {active && (
                      <motion.span
                        layoutId="theme-toggle-pill"
                        transition={SPRING_SNAPPY}
                        className="absolute inset-0 rounded-lg bg-zinc-900 dark:bg-white"
                      />
                    )}
                    <span
                      className={`relative z-10 ${
                        active
                          ? 'text-white dark:text-black'
                          : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                      }`}
                    >
                      {t === 'dark' ? 'Liquid Black' : 'Frosted Light'}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <label className="block text-xs text-[var(--text-muted)] mb-2">
              Default Image Quality ({settings.defaultImageQuality}%)
            </label>
            <input
              type="range"
              min={30}
              max={100}
              value={settings.defaultImageQuality}
              onChange={(e) => onUpdateSettings({ defaultImageQuality: Number(e.target.value) })}
              className="w-full accent-zinc-900 dark:accent-white mt-1.5 cursor-pointer"
            />
          </div>

          <div>
            <label className="block text-xs text-[var(--text-muted)] mb-2">Default Audio Bitrate</label>
            <GlassDropdown
              size="sm"
              ariaLabel="Default Audio Bitrate"
              value={settings.defaultAudioBitrate}
              onChange={(v) => onUpdateSettings({ defaultAudioBitrate: v })}
              options={[
                { value: '128k', label: '128 kbps' },
                { value: '192k', label: '192 kbps' },
                { value: '256k', label: '256 kbps' },
                { value: '320k', label: '320 kbps' },
              ]}
            />
          </div>

          <div>
            <label className="block text-xs text-[var(--text-muted)] mb-2">
              Default Video CRF ({settings.defaultVideoCrf})
            </label>
            <input
              type="range"
              min={18}
              max={32}
              value={settings.defaultVideoCrf}
              onChange={(e) => onUpdateSettings({ defaultVideoCrf: Number(e.target.value) })}
              className="w-full accent-zinc-900 dark:accent-white mt-1.5 cursor-pointer"
            />
          </div>
        </div>

        {/* Default Output Formats Per Category */}
        <div className="pt-4 border-t border-black/10 dark:border-white/10 space-y-3">
          <h3 className="text-xs font-medium text-[var(--text-primary)]">Default Output Formats</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {CATEGORY_OUTPUT_PRESETS.map((preset) => (
              <div key={preset.key}>
                <label className="block text-xs text-[var(--text-muted)] mb-1.5">{preset.label}</label>
                <GlassDropdown
                  size="sm"
                  ariaLabel={preset.label}
                  value={defaultsMap[preset.key] || preset.options[0].value}
                  onChange={(v) =>
                    onUpdateSettings({
                      defaultOutputFormats: { ...defaultsMap, [preset.key]: v },
                    })
                  }
                  options={preset.options}
                />
              </div>
            ))}
          </div>
        </div>

        <div className="pt-4 border-t border-black/10 dark:border-white/10 grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label htmlFor="default-naming-input" className="block text-xs text-[var(--text-muted)] mb-1.5">
              Default Output Naming Pattern
            </label>
            <input
              id="default-naming-input"
              type="text"
              value={settings.defaultNamingPattern || '{name}_processed'}
              onChange={(e) => onUpdateSettings({ defaultNamingPattern: e.target.value })}
              placeholder="{name}_processed"
              className="w-full rounded-xl border border-[var(--control-border)] bg-[var(--input-bg)] px-3 py-2 text-xs font-mono text-[var(--text-primary)]"
            />
          </div>
          <div>
            <label htmlFor="default-dest-input" className="block text-xs text-[var(--text-muted)] mb-1.5">
              Default Workspace Destination Folder
            </label>
            <input
              id="default-dest-input"
              type="text"
              value={settings.defaultDestinationFolder || ''}
              onChange={(e) => onUpdateSettings({ defaultDestinationFolder: e.target.value })}
              placeholder="Leave blank for download queue"
              className="w-full rounded-xl border border-[var(--control-border)] bg-[var(--input-bg)] px-3 py-2 text-xs text-[var(--text-primary)]"
            />
          </div>
        </div>

        <div className="pt-3 border-t border-black/10 dark:border-white/10">
          <label className="flex items-center gap-2.5 text-xs text-[var(--text-soft)] cursor-pointer">
            <input
              type="checkbox"
              checked={settings.stripMetadataByDefault}
              onChange={(e) => onUpdateSettings({ stripMetadataByDefault: e.target.checked })}
              className="accent-zinc-900 dark:accent-white rounded cursor-pointer"
            />
            Strip EXIF, GPS, and camera metadata from images by default
          </label>
        </div>
      </section>

      {/* Privacy, Retention & Temporary Storage */}
      <section className="glass-secondary glass-rim rounded-[22px] p-6 space-y-5 overflow-visible relative z-20">
        <div className="flex items-start gap-3">
          <ShieldCheck className="w-5 h-5 text-[var(--text-primary)] shrink-0 mt-0.5" />
          <div>
            <h3 className="font-display text-base font-semibold text-[var(--text-primary)]">
              Security, Retention &amp; Storage
            </h3>
            <p className="text-xs text-[var(--text-muted)] mt-0.5">
              Uploaded files are stored in a confined temporary workspace with no public directory listing, magic-byte validation, and an active TTL cleanup loop running every 5 minutes.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2">
          <div className="rounded-xl border border-black/10 dark:border-white/10 bg-black/4 dark:bg-black/40 p-4">
            <p className="text-xs text-[var(--text-muted)]">Staged Uploads</p>
            <p className="font-display text-xl font-semibold text-[var(--text-primary)] mt-1 tabular-nums">
              {storage ? formatBytes(storage.uploadBytes) : '—'}
            </p>
          </div>
          <div className="rounded-xl border border-black/10 dark:border-white/10 bg-black/4 dark:bg-black/40 p-4">
            <p className="text-xs text-[var(--text-muted)]">Converted Outputs</p>
            <p className="font-display text-xl font-semibold text-[var(--text-primary)] mt-1 tabular-nums">
              {storage ? formatBytes(storage.outputBytes) : '—'}
            </p>
          </div>
          <div className="rounded-xl border border-black/10 dark:border-white/10 bg-black/4 dark:bg-black/40 p-4">
            <p className="text-xs text-[var(--text-muted)]">Temporary Files</p>
            <p className="font-display text-xl font-semibold text-[var(--text-primary)] mt-1 tabular-nums">
              {storage ? storage.fileCount : 0}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs text-[var(--text-muted)] mb-1.5">
              Automatic File Retention Window
            </label>
            <GlassDropdown
              size="sm"
              ariaLabel="Automatic File Retention Window"
              value={String(settings.retentionMinutes)}
              onChange={(v) => onUpdateSettings({ retentionMinutes: Number(v) })}
              options={[
                { value: '15', label: '15 Minutes' },
                { value: '60', label: '1 Hour', sublabel: 'Default' },
                { value: '360', label: '6 Hours' },
                { value: '1440', label: '24 Hours' },
              ]}
            />
          </div>
          <div>
            <label className="block text-xs text-[var(--text-muted)] mb-1.5">Max File Upload Limit</label>
            <GlassDropdown
              size="sm"
              ariaLabel="Max File Upload Limit"
              value={String(settings.maxUploadMb)}
              onChange={(v) => onUpdateSettings({ maxUploadMb: Number(v) })}
              options={[
                { value: '25', label: '25 MB' },
                { value: '100', label: '100 MB', sublabel: 'Default' },
                { value: '250', label: '250 MB' },
              ]}
            />
          </div>
        </div>

        <div className="pt-3 border-t border-black/10 dark:border-white/10 flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-[var(--text-secondary)] tabular-nums">
            Last cleanup pass:{' '}
            {storage?.lastCleanupAt ? new Date(storage.lastCleanupAt).toLocaleTimeString() : 'Scheduled'}
          </p>
          <motion.button
            type="button"
            whileTap={{ scale: 0.98 }}
            onClick={onPurgeStorage}
            className="glass-interactive inline-flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-medium text-[var(--text-primary)] cursor-pointer"
          >
            <Trash2 className="w-3.5 h-3.5" />
            Purge All Temporary Files Now
          </motion.button>
        </div>
      </section>

      {/* Live System Resource & Engine Monitor */}
      <GlassSurface as="section" className="rounded-[22px] p-6 space-y-4 relative z-10">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <Activity className="w-4 h-4 text-[var(--text-primary)]" />
            <div>
              <h3 className="font-display text-sm font-semibold text-[var(--text-primary)]">
                System Resource &amp; Engine Monitor
              </h3>
              <p className="text-xs text-[var(--text-muted)]">
                Live worker memory, job telemetry, and verified server-side processing engines.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={fetchResources}
            disabled={loadingRes}
            className="glass-interactive inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-medium text-[var(--text-primary)] cursor-pointer whitespace-nowrap disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loadingRes ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="rounded-xl border border-black/10 dark:border-white/10 bg-black/4 dark:bg-black/40 p-3.5">
            <p className="text-[11px] text-[var(--text-muted)]">Memory RSS</p>
            <p className="font-display text-lg font-semibold text-[var(--text-primary)] mt-1 tabular-nums">
              {resources ? `${resources.memoryRssMb} MB` : '—'}
            </p>
          </div>
          <div className="rounded-xl border border-black/10 dark:border-white/10 bg-black/4 dark:bg-black/40 p-3.5">
            <p className="text-[11px] text-[var(--text-muted)]">Worker Uptime</p>
            <p className="font-display text-lg font-semibold text-[var(--text-primary)] mt-1 tabular-nums">
              {resources ? formatUptime(resources.uptimeSec) : '—'}
            </p>
          </div>
          <div className="rounded-xl border border-black/10 dark:border-white/10 bg-black/4 dark:bg-black/40 p-3.5">
            <p className="text-[11px] text-[var(--text-muted)]">Active Jobs</p>
            <p className="font-display text-lg font-semibold text-[var(--text-primary)] mt-1 tabular-nums">
              {resources ? resources.activeJobs : '—'}
            </p>
          </div>
          <div className="rounded-xl border border-black/10 dark:border-white/10 bg-black/4 dark:bg-black/40 p-3.5">
            <p className="text-[11px] text-[var(--text-muted)]">Session Jobs</p>
            <p className="font-display text-lg font-semibold text-[var(--text-primary)] mt-1 tabular-nums">
              {resources ? resources.totalJobs : '—'}
            </p>
          </div>
        </div>

        {resources?.engines && (
          <div className="pt-2 border-t border-black/10 dark:border-white/10">
            <p className="text-[11px] text-[var(--text-muted)] mb-2.5">Detected Processing Engines</p>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
              {ENGINE_LABELS.map((item) => {
                const available = Boolean(resources.engines[item.key]);
                return (
                  <div
                    key={item.key}
                    className="flex items-center justify-between gap-2 rounded-lg border border-black/8 dark:border-white/8 bg-black/3 dark:bg-black/30 px-2.5 py-1.5 text-[11px]"
                  >
                    <span className="text-[var(--text-soft)] truncate">{item.label}</span>
                    <span
                      className={`shrink-0 font-mono text-[10px] ${
                        available ? 'text-[var(--text-primary)]' : 'text-[var(--text-muted)] opacity-60'
                      }`}
                    >
                      {available ? 'READY' : 'N/A'}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </GlassSurface>

      {/* Workspace Controls */}
      <GlassSurface as="section" className="rounded-[22px] p-6 relative z-10">
        <h3 className="font-display text-sm font-semibold text-[var(--text-primary)] mb-3">Interface Controls</h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-xs">
          <div className="flex items-center justify-between py-1.5 border-b border-black/8 dark:border-white/8">
            <span className="text-[var(--text-muted)]">Global Format Search</span>
            <kbd className="font-mono text-[var(--text-primary)]">⌘K / Ctrl+K</kbd>
          </div>
          <div className="flex items-center justify-between py-1.5 border-b border-black/8 dark:border-white/8">
            <span className="text-[var(--text-muted)]">Open File Picker</span>
            <kbd className="font-mono text-[var(--text-primary)]">⌘U / Ctrl+U</kbd>
          </div>
          <div className="flex items-center justify-between py-1.5 border-b border-black/8 dark:border-white/8">
            <span className="text-[var(--text-muted)]">Toggle Sidebar Rail</span>
            <kbd className="font-mono text-[var(--text-primary)]">⌘B / Ctrl+B</kbd>
          </div>
        </div>
      </GlassSurface>
    </div>
  );
}
