import fs from 'fs';
import path from 'path';
import type {
  ActivityEvent,
  ConversionJob,
  SavedPreset,
  StorageStats,
  UserSettings,
} from '../../src/shared/types';
import {
  confinePath,
  createSafeId,
  ensureStorageDirs,
  OUTPUT_DIR,
  sanitizeFilename,
  sanitizeRelativePath,
  STATE_FILE,
  UPLOAD_DIR,
  WORK_DIR,
  WORKSPACE_DIR,
} from './security';

export const DEFAULT_SETTINGS: UserSettings = {
  theme: 'dark',
  defaultImageQuality: 88,
  defaultVideoCrf: 23,
  defaultAudioBitrate: '192k',
  stripMetadataByDefault: false,
  retentionMinutes: 60,
  maxUploadMb: 100,
  favoritePairs: [],
  recentFormats: ['webp', 'pdf', 'mp3', 'json'],
  defaultOutputFormats: {
    image: 'webp',
    document: 'pdf',
    spreadsheet: 'csv',
    audio: 'mp3',
    video: 'mp4',
    data: 'json',
  },
  defaultNamingPattern: '{name}_processed',
  defaultDestinationFolder: 'Exports',
};

export const DEFAULT_PRESETS: SavedPreset[] = [
  {
    id: 'preset_studio_cutout_webp',
    name: 'Product Cutout → 1200px WebP + ZIP',
    tool: 'workflow',
    kind: 'workflow',
    categoryTag: 'Workflow',
    description: 'Removes background cleanly, resizes to 1200×1200, optimizes WebP quality, and bundles into ZIP.',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    useCount: 0,
    outputRule: {
      namingPattern: '{name}_studio',
      destinationMode: 'download-queue',
    },
    batchSettings: { continueOnError: true },
    steps: [
      {
        id: 'wf_s1',
        tool: 'bg-remover',
        operationName: 'Remove Image Background',
        enabled: true,
        config: { modelPrecision: 'fast', outputFormat: 'png', backgroundMode: 'transparent', featherRadius: 1 },
      },
      {
        id: 'wf_s2',
        tool: 'resize',
        operationName: 'Resize Image',
        enabled: true,
        config: { width: 1200, height: 1200, fit: 'inside', maintainAspect: true },
      },
      {
        id: 'wf_s3',
        tool: 'compress',
        operationName: 'Compress File',
        enabled: true,
        config: { goal: 'balanced', quality: 82, stripMetadata: true },
      },
      {
        id: 'wf_s4',
        tool: 'convert',
        operationName: 'Convert Format',
        enabled: true,
        config: { targetFormat: 'webp', quality: 86, stripMetadata: true },
      },
      {
        id: 'wf_s5',
        tool: 'archive',
        operationName: 'Package Into Archive',
        enabled: true,
        config: { format: 'zip', level: 7 },
      },
    ],
    config: {},
  },
  {
    id: 'preset_webp_hero',
    name: 'WebP Hero Asset',
    tool: 'converter',
    kind: 'tool',
    categoryTag: 'Web Assets',
    description: 'Convert raster assets to 88% WebP preserving alpha transparency.',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    useCount: 0,
    config: { targetFormat: 'webp', quality: 88, stripMetadata: true },
  },
  {
    id: 'preset_studio_cutout',
    name: 'E-Commerce Studio Cutout',
    tool: 'bg-remover',
    kind: 'tool',
    categoryTag: 'Studio Cutout',
    description: 'High-detail cutout on crisp white studio backdrop with subtle drop shadow.',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    useCount: 0,
    config: {
      modelPrecision: 'high',
      outputFormat: 'png',
      backgroundMode: 'solid',
      backgroundColor: '#ffffff',
      shadowEnabled: true,
      shadowOpacity: 0.28,
      shadowBlur: 18,
      featherRadius: 1,
    },
  },
  {
    id: 'preset_balanced_compress',
    name: 'Balanced Web Optimization',
    tool: 'compressor',
    kind: 'batch',
    categoryTag: 'Compression',
    description: 'Optimal quality-to-size compression stripping non-essential EXIF metadata.',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    useCount: 0,
    config: { goal: 'balanced', quality: 78, stripMetadata: true },
  },
  {
    id: 'preset_7z_ultra',
    name: '7-Zip Ultra LZMA2',
    tool: 'archive',
    kind: 'tool',
    categoryTag: 'Archiving',
    description: 'Maximum-ratio 7Z container with level 9 compression.',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    useCount: 0,
    config: { format: '7z', level: 9, algorithm: 'lzma2' },
  },
];

interface PersistedState {
  jobs: ConversionJob[];
  settings: UserSettings;
  presets: SavedPreset[];
  activities: ActivityEvent[];
  lastCleanupAt: string | null;
}

class StorageService {
  private jobs: Map<string, ConversionJob> = new Map();
  private fileRegistry: Map<string, { uploadPath?: string; outputPath?: string; extraDir?: string }> = new Map();
  private settings: UserSettings = { ...DEFAULT_SETTINGS };
  private presets: SavedPreset[] = [...DEFAULT_PRESETS];
  private activities: ActivityEvent[] = [];
  private lastCleanupAt: string | null = null;
  private cleanupTimer: NodeJS.Timeout | null = null;

  constructor() {
    ensureStorageDirs();
    this.loadState();
    this.startCleanupLoop();
  }

  private loadState(): void {
    try {
      if (fs.existsSync(STATE_FILE)) {
        const raw = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')) as Partial<PersistedState>;
        if (raw.settings) {
          this.settings = {
            ...DEFAULT_SETTINGS,
            ...raw.settings,
            defaultOutputFormats: {
              ...DEFAULT_SETTINGS.defaultOutputFormats,
              ...(raw.settings.defaultOutputFormats || {}),
            },
          };
        }
        if (Array.isArray(raw.presets) && raw.presets.length > 0) {
          this.presets = raw.presets.map((p) => ({
            ...p,
            kind: p.kind || (p.tool === 'workflow' ? 'workflow' : 'tool'),
            updatedAt: p.updatedAt || p.createdAt,
          }));
        }
        if (Array.isArray(raw.activities)) {
          this.activities = raw.activities.slice(0, 200);
        }
        if (Array.isArray(raw.jobs)) {
          for (const job of raw.jobs) {
            if (job.status === 'processing' || job.status === 'queued') {
              job.status = 'failed';
              job.error = 'Interrupted by server restart.';
            }
            this.jobs.set(job.id, job);
            if (job.outputName) {
              try {
                const p = confinePath(OUTPUT_DIR, job.outputName);
                if (fs.existsSync(p)) {
                  this.fileRegistry.set(job.id, { outputPath: p });
                }
              } catch {
                // ignore invalid path
              }
            }
          }
        }
        this.lastCleanupAt = raw.lastCleanupAt || null;
      }
    } catch {
      // start fresh on corrupt state
    }
  }

  private saveState(): void {
    try {
      const payload: PersistedState = {
        jobs: Array.from(this.jobs.values()).slice(0, 300),
        settings: this.settings,
        presets: this.presets,
        activities: this.activities.slice(0, 200),
        lastCleanupAt: this.lastCleanupAt,
      };
      fs.writeFileSync(STATE_FILE, JSON.stringify(payload, null, 2), 'utf8');
    } catch {
      // best-effort persistence
    }
  }

  getSettings(): UserSettings {
    return { ...this.settings };
  }

  updateSettings(patch: Partial<UserSettings>): UserSettings {
    this.settings = {
      ...this.settings,
      ...patch,
      defaultOutputFormats: patch.defaultOutputFormats
        ? { ...(this.settings.defaultOutputFormats || {}), ...patch.defaultOutputFormats }
        : this.settings.defaultOutputFormats,
      maxUploadMb: Math.min(250, Math.max(5, Number(patch.maxUploadMb ?? this.settings.maxUploadMb))),
      retentionMinutes: Math.min(1440, Math.max(5, Number(patch.retentionMinutes ?? this.settings.retentionMinutes))),
    };
    this.saveState();
    return this.getSettings();
  }

  // Unlimited user presets with full CRUD + duplicate + usage tracking
  getPresets(): SavedPreset[] {
    return [...this.presets];
  }

  addPreset(
    preset: Omit<SavedPreset, 'id' | 'createdAt' | 'updatedAt' | 'useCount'>
  ): SavedPreset {
    const now = new Date().toISOString();
    const created: SavedPreset = {
      ...preset,
      kind: preset.kind || (preset.tool === 'workflow' ? 'workflow' : 'tool'),
      id: createSafeId('preset'),
      createdAt: now,
      updatedAt: now,
      useCount: 0,
    };
    this.presets = [created, ...this.presets];
    this.saveState();
    return created;
  }

  updatePreset(id: string, patch: Partial<Omit<SavedPreset, 'id' | 'createdAt'>>): SavedPreset | null {
    const idx = this.presets.findIndex((p) => p.id === id);
    if (idx < 0) return null;
    const updated: SavedPreset = {
      ...this.presets[idx],
      ...patch,
      id,
      updatedAt: new Date().toISOString(),
    };
    this.presets[idx] = updated;
    this.saveState();
    return updated;
  }

  duplicatePreset(id: string): SavedPreset | null {
    const source = this.presets.find((p) => p.id === id);
    if (!source) return null;
    const now = new Date().toISOString();
    const copy: SavedPreset = {
      ...JSON.parse(JSON.stringify(source)),
      id: createSafeId('preset'),
      name: `${source.name} (Copy)`,
      createdAt: now,
      updatedAt: now,
      lastUsedAt: undefined,
      useCount: 0,
    };
    this.presets = [copy, ...this.presets];
    this.saveState();
    return copy;
  }

  markPresetUsed(id: string): SavedPreset | null {
    const idx = this.presets.findIndex((p) => p.id === id);
    if (idx < 0) return null;
    const updated: SavedPreset = {
      ...this.presets[idx],
      lastUsedAt: new Date().toISOString(),
      useCount: (this.presets[idx].useCount || 0) + 1,
    };
    this.presets[idx] = updated;
    this.saveState();
    return updated;
  }

  deletePreset(id: string): boolean {
    const prevLen = this.presets.length;
    this.presets = this.presets.filter((p) => p.id !== id);
    if (this.presets.length !== prevLen) {
      this.saveState();
      return true;
    }
    return false;
  }

  // Activity Feed
  addActivity(event: Omit<ActivityEvent, 'id' | 'timestamp'>): ActivityEvent {
    const entry: ActivityEvent = {
      ...event,
      id: createSafeId('act'),
      timestamp: new Date().toISOString(),
    };
    this.activities = [entry, ...this.activities].slice(0, 200);
    this.saveState();
    return entry;
  }

  getActivities(): ActivityEvent[] {
    return [...this.activities];
  }

  recordRecentFormat(ext: string): void {
    const clean = ext.toLowerCase();
    this.settings.recentFormats = [clean, ...this.settings.recentFormats.filter((x) => x !== clean)].slice(0, 8);
    this.saveState();
  }

  getJobs(): ConversionJob[] {
    return Array.from(this.jobs.values()).sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }

  getJob(id: string): ConversionJob | undefined {
    return this.jobs.get(id);
  }

  setJob(job: ConversionJob, paths?: { uploadPath?: string; outputPath?: string; extraDir?: string }): void {
    this.jobs.set(job.id, job);
    if (paths) {
      const prev = this.fileRegistry.get(job.id) || {};
      this.fileRegistry.set(job.id, { ...prev, ...paths });
    }
    this.saveState();
  }

  getJobPaths(id: string): { uploadPath?: string; outputPath?: string; extraDir?: string } {
    return this.fileRegistry.get(id) || {};
  }

  promoteOutputToUpload(jobId: string): { uploadPath: string; token: string; filename: string } {
    const job = this.jobs.get(jobId);
    const paths = this.fileRegistry.get(jobId);
    if (!job || !paths?.outputPath || !fs.existsSync(paths.outputPath)) {
      throw new Error('Completed output file is no longer available in temporary storage.');
    }
    const base = path.basename(sanitizeFilename(job.originalName), path.extname(job.originalName)) || 'processed';
    const filename = `${base}.${job.targetExt}`;
    const token = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}_${sanitizeFilename(filename)}`;
    const dest = confinePath(UPLOAD_DIR, token);
    fs.copyFileSync(paths.outputPath, dest);
    return { uploadPath: dest, token, filename };
  }

  saveOutputToWorkspace(outputPath: string, folder: string, targetFilename: string): string {
    const cleanDir = sanitizeRelativePath(folder || 'Exports');
    const cleanFile = sanitizeFilename(targetFilename);
    const relTarget = cleanDir ? `${cleanDir}/${cleanFile}` : cleanFile;
    const dest = confinePath(WORKSPACE_DIR, relTarget);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(outputPath, dest);
    return relTarget;
  }

  deleteJob(id: string): boolean {
    const paths = this.fileRegistry.get(id);
    if (paths?.uploadPath && fs.existsSync(paths.uploadPath)) {
      fs.rmSync(paths.uploadPath, { force: true });
    }
    if (paths?.outputPath && fs.existsSync(paths.outputPath)) {
      fs.rmSync(paths.outputPath, { force: true });
    }
    if (paths?.extraDir && fs.existsSync(paths.extraDir)) {
      fs.rmSync(paths.extraDir, { recursive: true, force: true });
    }
    this.fileRegistry.delete(id);
    const deleted = this.jobs.delete(id);
    this.saveState();
    return deleted;
  }

  clearHistory(): void {
    for (const id of Array.from(this.jobs.keys())) {
      this.deleteJob(id);
    }
    this.activities = [];
    this.saveState();
  }

  private getDirSize(dir: string): { bytes: number; count: number } {
    if (!fs.existsSync(dir)) return { bytes: 0, count: 0 };
    let bytes = 0;
    let count = 0;
    for (const entry of fs.readdirSync(dir)) {
      const full = path.join(dir, entry);
      const stat = fs.statSync(full);
      if (stat.isFile()) {
        bytes += stat.size;
        count++;
      }
    }
    return { bytes, count };
  }

  getStorageStats(): StorageStats {
    const up = this.getDirSize(UPLOAD_DIR);
    const out = this.getDirSize(OUTPUT_DIR);
    return {
      uploadBytes: up.bytes,
      outputBytes: out.bytes,
      fileCount: up.count + out.count,
      retentionMinutes: this.settings.retentionMinutes,
      lastCleanupAt: this.lastCleanupAt,
    };
  }

  runTtlCleanup(forceAll = false): { removedFiles: number } {
    const cutoff = forceAll ? Infinity : Date.now() - this.settings.retentionMinutes * 60 * 1000;
    let removedFiles = 0;
    for (const dir of [UPLOAD_DIR, OUTPUT_DIR, WORK_DIR]) {
      if (!fs.existsSync(dir)) continue;
      for (const entry of fs.readdirSync(dir)) {
        const full = path.join(dir, entry);
        try {
          const stat = fs.statSync(full);
          if (forceAll || stat.mtimeMs < cutoff) {
            fs.rmSync(full, { recursive: true, force: true });
            removedFiles++;
          }
        } catch {
          // ignore
        }
      }
    }
    if (forceAll) {
      for (const job of this.jobs.values()) {
        job.downloadUrl = undefined;
        job.previewUrl = undefined;
      }
      this.fileRegistry.clear();
      this.saveState();
    }
    this.lastCleanupAt = new Date().toISOString();
    return { removedFiles };
  }

  private startCleanupLoop(): void {
    this.cleanupTimer = setInterval(() => {
      this.runTtlCleanup(false);
    }, 5 * 60 * 1000);
    this.cleanupTimer.unref();
  }
}

export const storageService = new StorageService();
