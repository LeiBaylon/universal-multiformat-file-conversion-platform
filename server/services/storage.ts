import fs from 'fs';
import path from 'path';
import type { ConversionJob, StorageStats, UserSettings } from '../../src/shared/types';
import { ensureStorageDirs, OUTPUT_DIR, STATE_FILE, UPLOAD_DIR, WORK_DIR, confinePath } from './security';

export const DEFAULT_SETTINGS: UserSettings = {
  theme: 'dark',
  defaultImageQuality: 88,
  defaultVideoCrf: 23,
  defaultAudioBitrate: '192k',
  stripMetadataByDefault: false,
  retentionMinutes: 60,
  maxUploadMb: 100,
  favoritePairs: ['png->webp', 'heic->jpg', 'docx->pdf', 'wav->mp3', 'yaml->json', 'srt->vtt'],
  recentFormats: ['webp', 'pdf', 'mp3', 'json'],
  defaultOutputFormats: {
    image: 'webp',
    document: 'pdf',
    spreadsheet: 'csv',
    audio: 'mp3',
    video: 'mp4',
    data: 'json',
  },
};

interface PersistedState {
  jobs: ConversionJob[];
  settings: UserSettings;
  lastCleanupAt: string | null;
}

class StorageService {
  private jobs: Map<string, ConversionJob> = new Map();
  private fileRegistry: Map<string, { uploadPath?: string; outputPath?: string }> = new Map();
  private settings: UserSettings = { ...DEFAULT_SETTINGS };
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
        jobs: Array.from(this.jobs.values()).slice(0, 200),
        settings: this.settings,
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

  setJob(job: ConversionJob, paths?: { uploadPath?: string; outputPath?: string }): void {
    this.jobs.set(job.id, job);
    if (paths) {
      const prev = this.fileRegistry.get(job.id) || {};
      this.fileRegistry.set(job.id, { ...prev, ...paths });
    }
    this.saveState();
  }

  getJobPaths(id: string): { uploadPath?: string; outputPath?: string } {
    return this.fileRegistry.get(id) || {};
  }

  deleteJob(id: string): boolean {
    const paths = this.fileRegistry.get(id);
    if (paths?.uploadPath && fs.existsSync(paths.uploadPath)) {
      fs.rmSync(paths.uploadPath, { force: true });
    }
    if (paths?.outputPath && fs.existsSync(paths.outputPath)) {
      fs.rmSync(paths.outputPath, { force: true });
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
