import express from 'express';
import crypto from 'crypto';
import path from 'path';
import fs from 'fs';
import multer from 'multer';
import AdmZip from 'adm-zip';
import sharp from 'sharp';
import { execFileSync } from 'child_process';
import { createServer as createViteServer } from 'vite';
import { path7za } from '7zip-bin';
import { ARCHIVE_FORMAT_MATRIX, CATEGORIES, FORMAT_REGISTRY, getFormatByExtension, getSupportedStats } from './src/shared/formats';
import type {
  BgRemovalOptions,
  CompressionOptions,
  ConversionJob,
  ConversionOptions,
  ToolKind,
} from './src/shared/types';
import {
  confinePath,
  createSafeId,
  ensureExecutablePermission,
  ensureStorageDirs,
  OUTPUT_DIR,
  sanitizeFilename,
  sanitizeRelativePath,
  UPLOAD_DIR,
  WORK_DIR,
  WORKSPACE_DIR,
} from './server/services/security';
import { storageService } from './server/services/storage';
import {
  analyzeStorageReport,
  applyWorkspaceOrganize,
  applyWorkspaceRename,
  createWorkspaceFolder,
  deleteWorkspacePaths,
  getWorkspaceTree,
  previewWorkspaceOrganize,
  previewWorkspaceRename,
  promoteWorkspaceFilesToUploads,
  saveUploadedFileToWorkspace,
  scanWorkspaceDuplicates,
  seedWorkspaceDemoFiles,
} from './server/services/workspaceService';
import {
  executeConversion,
  executeMultiMerge,
  generateSampleFileBuffer,
  identifyFile,
} from './server/services/conversionDispatcher';
import {
  analyzeBackgroundWithGemini,
  generateBgSampleBuffer,
  removeImageBackground,
} from './server/engines/bgRemovalEngine';
import { compressFile } from './server/engines/compressorEngine';
import {
  compareArchives,
  createArchiveAdvanced,
  inspectArchiveFull,
  modifyArchive,
  readSingleArchiveEntryBuffer,
  safeExtractArchiveToDir,
  testArchiveIntegrity,
} from './server/engines/archiveManagerEngine';

ensureStorageDirs();
ensureExecutablePermission(path7za);

function hasBinary(cmd: string): boolean {
  try {
    execFileSync('which', [cmd], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

const ENGINE_CAPABILITIES = {
  ffmpeg: hasBinary('ffmpeg'),
  imagemagick: hasBinary('convert'),
  ghostscript: hasBinary('gs'),
  tar: hasBinary('tar'),
  bzip2: hasBinary('bzip2'),
  xz: hasBinary('xz'),
  libreoffice: hasBinary('soffice'),
  pandoc: hasBinary('pandoc'),
  calibre: hasBinary('ebook-convert'),
  sevenZip: fs.existsSync(path7za) || hasBinary('7z'),
  sharp: true,
  imglyIsnet: true,
  fontforge: hasBinary('fontforge'),
  assimp: hasBinary('assimp'),
};

const activeControllers = new Map<string, { cancelled: boolean }>();

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
    filename: (_req, file, cb) => {
      const safe = sanitizeFilename(file.originalname);
      cb(null, `${Date.now()}_${Math.random().toString(36).slice(2, 8)}_${safe}`);
    },
  }),
  limits: {
    fileSize: 250 * 1024 * 1024, // hard ceiling 250 MB; settings checked per route
  },
});

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '10mb' }));

  // Health & system capability check
  app.get('/api/health', (_req, res) => {
    res.json({
      ok: true,
      engines: ENGINE_CAPABILITIES,
      stats: getSupportedStats(),
    });
  });

  // Centralized Format Registry
  app.get('/api/formats', (_req, res) => {
    res.json({
      categories: CATEGORIES,
      formats: FORMAT_REGISTRY,
      stats: getSupportedStats(),
      engines: ENGINE_CAPABILITIES,
    });
  });

  // Sample Generator for instant 1-click live testing
  app.get('/api/sample/:ext', async (req, res) => {
    try {
      const ext = sanitizeFilename(req.params.ext).toLowerCase();
      const sample = await generateSampleFileBuffer(ext);
      res.setHeader('Content-Type', sample.mime);
      res.setHeader('Content-Disposition', `attachment; filename="${sample.filename}"`);
      res.send(sample.buffer);
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'Failed to generate sample.' });
    }
  });

  // Identify uploaded file (magic bytes, MIME, metadata, compatible targets, smart recs)
  app.post('/api/identify', upload.single('file'), async (req, res) => {
    const file = req.file;
    if (!file) {
      res.status(400).json({ error: 'No file uploaded for identification.' });
      return;
    }
    try {
      const settings = storageService.getSettings();
      if (file.size > settings.maxUploadMb * 1024 * 1024) {
        fs.rmSync(file.path, { force: true });
        res.status(413).json({ error: `File exceeds configured ${settings.maxUploadMb} MB upload limit.` });
        return;
      }
      const info = await identifyFile(file.path, file.originalname, file.mimetype);
      const token = path.basename(file.path);
      res.json({
        uploadToken: token,
        info,
      });
    } catch (err) {
      fs.rmSync(file.path, { force: true });
      res.status(500).json({ error: err instanceof Error ? err.message : 'Identification failed.' });
    }
  });

  // Preview a staged upload safely
  app.get('/api/uploads/:token/preview', (req, res) => {
    try {
      const token = sanitizeFilename(req.params.token);
      const filePath = confinePath(UPLOAD_DIR, token);
      if (!fs.existsSync(filePath)) {
        res.status(404).json({ error: 'Staged file expired or not found.' });
        return;
      }
      res.sendFile(filePath);
    } catch {
      res.status(400).json({ error: 'Invalid upload token.' });
    }
  });

  // Run single conversion (either from staged uploadToken or direct multipart upload)
  app.post('/api/convert', upload.single('file'), async (req, res) => {
    let inputPath = '';
    let originalName = '';
    let inputSizeBytes = 0;

    try {
      const settings = storageService.getSettings();
      const targetExt = String(req.body.targetFormat || '').toLowerCase().replace(/^\./, '').trim();
      if (!targetExt) {
        res.status(400).json({ error: 'Missing targetFormat parameter.' });
        return;
      }

      if (req.file) {
        if (req.file.size > settings.maxUploadMb * 1024 * 1024) {
          fs.rmSync(req.file.path, { force: true });
          res.status(413).json({ error: `File exceeds ${settings.maxUploadMb} MB limit.` });
          return;
        }
        inputPath = req.file.path;
        originalName = req.file.originalname;
        inputSizeBytes = req.file.size;
      } else if (req.body.uploadToken) {
        const token = sanitizeFilename(String(req.body.uploadToken));
        inputPath = confinePath(UPLOAD_DIR, token);
        if (!fs.existsSync(inputPath)) {
          res.status(404).json({ error: 'Uploaded source file expired or missing. Please re-upload.' });
          return;
        }
        originalName = String(req.body.originalName || token);
        inputSizeBytes = fs.statSync(inputPath).size;
      } else {
        res.status(400).json({ error: 'Provide either a file upload or uploadToken.' });
        return;
      }

      let options: ConversionOptions = {};
      if (req.body.options) {
        options = typeof req.body.options === 'string' ? JSON.parse(req.body.options) : req.body.options;
      }
      if (settings.stripMetadataByDefault && options.stripMetadata === undefined) {
        options.stripMetadata = true;
      }

      const detected = await identifyFile(inputPath, originalName);
      const sourceExt = String(req.body.sourceFormat || detected.detectedExt).toLowerCase();
      const srcFmt = getFormatByExtension(sourceExt);
      const jobId = createSafeId('job');
      const baseName = path.basename(sanitizeFilename(originalName), path.extname(originalName)) || 'converted';
      const outputFilename = `${jobId}_${baseName}.${targetExt}`;
      const outputPath = confinePath(OUTPUT_DIR, outputFilename);

      const ctrl = { cancelled: false };
      activeControllers.set(jobId, ctrl);

      const startedAt = Date.now();
      const initialJob: ConversionJob = {
        id: jobId,
        tool: 'converter',
        batchId: req.body.batchId ? String(req.body.batchId) : undefined,
        originalName,
        sourceExt,
        targetExt,
        category: srcFmt?.category || 'data',
        operationKind: srcFmt?.operationKind || 'conversion',
        status: 'processing',
        progress: 25,
        inputSizeBytes,
        createdAt: new Date().toISOString(),
        options,
      };
      storageService.setJob(initialJob, { uploadPath: inputPath, outputPath });

      try {
        const result = await executeConversion({
          inputPath,
          outputPath,
          sourceExt,
          targetExt,
          originalName,
          options,
        });

        if (ctrl.cancelled) {
          if (fs.existsSync(outputPath)) fs.rmSync(outputPath, { force: true });
          const cancelledJob: ConversionJob = {
            ...initialJob,
            status: 'cancelled',
            progress: 0,
            error: 'Cancelled by user.',
          };
          storageService.setJob(cancelledJob);
          res.json({ job: cancelledJob });
          return;
        }

        const outStat = fs.statSync(outputPath);
        storageService.recordRecentFormat(targetExt);

        const completedJob: ConversionJob = {
          ...initialJob,
          status: 'completed',
          progress: 100,
          operationKind: result.operationKind,
          engineUsed: result.engineUsed,
          outputSizeBytes: outStat.size,
          outputName: outputFilename,
          durationMs: Date.now() - startedAt,
          completedAt: new Date().toISOString(),
          downloadUrl: `/api/jobs/${jobId}/download`,
          previewKind: result.previewKind,
          previewUrl: `/api/jobs/${jobId}/preview`,
          details: result.details,
        };
        storageService.setJob(completedJob, { uploadPath: inputPath, outputPath });
        res.json({ job: completedJob, note: result.note, previewData: result.previewData });
      } catch (convErr) {
        const failedJob: ConversionJob = {
          ...initialJob,
          status: 'failed',
          progress: 0,
          error: convErr instanceof Error ? convErr.message : 'Conversion failed.',
        };
        storageService.setJob(failedJob);
        res.status(422).json({ job: failedJob, error: failedJob.error });
      } finally {
        activeControllers.delete(jobId);
      }
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Server conversion error.' });
    }
  });

  // Multi-file merge / archive creation endpoint (PDF merge, Audio/Video merge, Archive packing)
  app.post('/api/merge', upload.array('files', 30), async (req, res) => {
    const files = (req.files as Express.Multer.File[]) || [];
    if (files.length < 2) {
      res.status(400).json({ error: 'Select at least 2 files to merge or bundle.' });
      return;
    }
    try {
      const mode = String(req.body.mode || 'archive-pack') as
        | 'pdf-merge'
        | 'audio-merge'
        | 'video-merge'
        | 'archive-pack';
      const targetExt = String(req.body.targetFormat || (mode === 'pdf-merge' ? 'pdf' : 'zip')).toLowerCase();
      const jobId = createSafeId('merge');
      const outputFilename = `${jobId}_merged.${targetExt}`;
      const outputPath = confinePath(OUTPUT_DIR, outputFilename);

      const category =
        mode === 'pdf-merge'
          ? 'document'
          : mode === 'audio-merge'
          ? 'audio'
          : mode === 'video-merge'
          ? 'video'
          : 'archive';

      const job: ConversionJob = {
        id: jobId,
        originalName: `${files.length} files (${files[0].originalname}...)`,
        sourceExt: path.extname(files[0].originalname).slice(1).toLowerCase() || 'multi',
        targetExt,
        category,
        operationKind: mode === 'archive-pack' ? 'archive' : 'conversion',
        status: 'processing',
        progress: 40,
        inputSizeBytes: files.reduce((a, f) => a + f.size, 0),
        createdAt: new Date().toISOString(),
        options: {},
      };
      storageService.setJob(job, { outputPath });

      const result = await executeMultiMerge(
        files.map((f) => ({ path: f.path, originalName: f.originalname })),
        outputPath,
        mode,
        targetExt
      );
      const outStat = fs.statSync(outputPath);
      const completed: ConversionJob = {
        ...job,
        status: 'completed',
        progress: 100,
        engineUsed: result.engineUsed,
        outputSizeBytes: outStat.size,
        outputName: outputFilename,
        completedAt: new Date().toISOString(),
        downloadUrl: `/api/jobs/${jobId}/download`,
        previewKind: targetExt === 'pdf' ? 'pdf' : 'none',
        previewUrl: `/api/jobs/${jobId}/preview`,
      };
      storageService.setJob(completed, { outputPath });
      res.json({ job: completed, note: result.note });
    } catch (err) {
      res.status(422).json({ error: err instanceof Error ? err.message : 'Merge operation failed.' });
    } finally {
      for (const f of files) {
        if (fs.existsSync(f.path)) fs.rmSync(f.path, { force: true });
      }
    }
  });

  // Jobs & History endpoints
  app.get('/api/jobs', (_req, res) => {
    res.json({ jobs: storageService.getJobs() });
  });

  app.post('/api/jobs/:id/cancel', (req, res) => {
    const ctrl = activeControllers.get(req.params.id);
    if (ctrl) ctrl.cancelled = true;
    const job = storageService.getJob(req.params.id);
    if (job && (job.status === 'queued' || job.status === 'processing')) {
      job.status = 'cancelled';
      job.progress = 0;
      job.error = 'Cancelled by user.';
      storageService.setJob(job);
    }
    res.json({ ok: true, job });
  });

  app.post('/api/jobs/:id/retry', async (req, res) => {
    const job = storageService.getJob(req.params.id);
    const paths = storageService.getJobPaths(req.params.id);
    if (!job || !paths.uploadPath || !fs.existsSync(paths.uploadPath)) {
      res.status(404).json({ error: 'Original uploaded source file is no longer in temporary storage.' });
      return;
    }
    const outputFilename = `${job.id}_retry.${job.targetExt}`;
    const outputPath = confinePath(OUTPUT_DIR, outputFilename);
    try {
      const result = await executeConversion({
        inputPath: paths.uploadPath,
        outputPath,
        sourceExt: job.sourceExt,
        targetExt: job.targetExt,
        originalName: job.originalName,
        options: job.options || {},
      });
      const outStat = fs.statSync(outputPath);
      const updated: ConversionJob = {
        ...job,
        status: 'completed',
        progress: 100,
        error: undefined,
        engineUsed: result.engineUsed,
        outputSizeBytes: outStat.size,
        outputName: outputFilename,
        completedAt: new Date().toISOString(),
        downloadUrl: `/api/jobs/${job.id}/download`,
        previewKind: result.previewKind,
        previewUrl: `/api/jobs/${job.id}/preview`,
      };
      storageService.setJob(updated, { outputPath });
      res.json({ job: updated });
    } catch (err) {
      res.status(422).json({ error: err instanceof Error ? err.message : 'Retry failed.' });
    }
  });

  app.get('/api/jobs/:id/download', (req, res) => {
    const job = storageService.getJob(req.params.id);
    const paths = storageService.getJobPaths(req.params.id);
    if (!job || !paths.outputPath || !fs.existsSync(paths.outputPath)) {
      res.status(404).json({ error: 'Converted output file expired or not found.' });
      return;
    }
    const base = path.basename(sanitizeFilename(job.originalName), path.extname(job.originalName)) || 'converted';
    res.download(paths.outputPath, `${base}.${job.targetExt}`);
  });

  app.get('/api/jobs/:id/preview', (req, res) => {
    const job = storageService.getJob(req.params.id);
    const paths = storageService.getJobPaths(req.params.id);
    if (!job || !paths.outputPath || !fs.existsSync(paths.outputPath)) {
      res.status(404).json({ error: 'Preview not available.' });
      return;
    }
    res.sendFile(paths.outputPath);
  });

  app.post('/api/jobs/batch-zip', (req, res) => {
    const jobIds = Array.isArray(req.body.jobIds) ? (req.body.jobIds as string[]) : [];
    const valid = jobIds
      .map((id) => ({ job: storageService.getJob(id), paths: storageService.getJobPaths(id) }))
      .filter((item) => item.job && item.paths.outputPath && fs.existsSync(item.paths.outputPath));

    if (valid.length === 0) {
      res.status(404).json({ error: 'No completed output files available for ZIP bundling.' });
      return;
    }

    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="aether_batch_${Date.now()}.zip"`);

    const zip = new AdmZip();
    const usedNames = new Set<string>();
    for (const item of valid) {
      const job = item.job!;
      const base = path.basename(sanitizeFilename(job.originalName), path.extname(job.originalName)) || 'file';
      let name = `${base}.${job.targetExt}`;
      let counter = 1;
      while (usedNames.has(name)) {
        name = `${base}_${counter++}.${job.targetExt}`;
      }
      usedNames.add(name);
      zip.addLocalFile(item.paths.outputPath!, '', name);
    }
    res.send(zip.toBuffer());
  });

  app.delete('/api/jobs/:id', (req, res) => {
    const ok = storageService.deleteJob(req.params.id);
    res.json({ ok });
  });

  app.delete('/api/history', (_req, res) => {
    storageService.clearHistory();
    res.json({ ok: true });
  });

  // Settings & Storage Privacy Management
  app.get('/api/settings', (_req, res) => {
    res.json({
      settings: storageService.getSettings(),
      storage: storageService.getStorageStats(),
    });
  });

  app.put('/api/settings', (req, res) => {
    const settings = storageService.updateSettings(req.body || {});
    res.json({
      settings,
      storage: storageService.getStorageStats(),
    });
  });

  app.post('/api/storage/purge', (_req, res) => {
    const result = storageService.runTtlCleanup(true);
    res.json({
      ok: true,
      removedFiles: result.removedFiles,
      storage: storageService.getStorageStats(),
    });
  });

  // Tool-to-tool output handoff
  app.post('/api/jobs/:id/promote', async (req, res) => {
    try {
      const promoted = storageService.promoteOutputToUpload(req.params.id);
      const info = await identifyFile(promoted.uploadPath, promoted.filename);
      res.json({ uploadToken: promoted.token, info });
    } catch (err) {
      res.status(404).json({ error: err instanceof Error ? err.message : 'Unable to promote output.' });
    }
  });

  // Saved Presets management (Create, Edit, Duplicate, Rename, Mark Used, Delete)
  app.get('/api/presets', (_req, res) => {
    res.json({ presets: storageService.getPresets() });
  });

  app.post('/api/presets', (req, res) => {
    const { name, tool, kind, description, categoryTag, outputRule, batchSettings, steps, config } = req.body || {};
    if (!name || !tool) {
      res.status(400).json({ error: 'Preset requires a name and tool.' });
      return;
    }
    const created = storageService.addPreset({
      name: String(name).slice(0, 80),
      tool,
      kind: kind || (tool === 'workflow' ? 'workflow' : 'tool'),
      description: String(description || '').slice(0, 240),
      categoryTag: categoryTag ? String(categoryTag).slice(0, 48) : undefined,
      outputRule,
      batchSettings,
      steps: Array.isArray(steps) ? steps : undefined,
      config: config || {},
    });
    storageService.addActivity({
      kind: 'preset',
      title: `Created preset "${created.name}"`,
      detail: `${created.kind} preset for ${created.tool}`,
      status: 'completed',
    });
    res.json({ preset: created });
  });

  app.put('/api/presets/:id', (req, res) => {
    const updated = storageService.updatePreset(req.params.id, req.body || {});
    if (!updated) {
      res.status(404).json({ error: 'Preset not found.' });
      return;
    }
    res.json({ preset: updated });
  });

  app.post('/api/presets/:id/duplicate', (req, res) => {
    const copy = storageService.duplicatePreset(req.params.id);
    if (!copy) {
      res.status(404).json({ error: 'Preset not found.' });
      return;
    }
    res.json({ preset: copy });
  });

  app.post('/api/presets/:id/use', (req, res) => {
    const updated = storageService.markPresetUsed(req.params.id);
    if (!updated) {
      res.status(404).json({ error: 'Preset not found.' });
      return;
    }
    res.json({ preset: updated });
  });

  app.delete('/api/presets/:id', (req, res) => {
    res.json({ ok: storageService.deletePreset(req.params.id) });
  });

  app.get('/api/activities', (_req, res) => {
    res.json({ activities: storageService.getActivities() });
  });

  // ===========================================================================
  // FILE MANAGEMENT & STORAGE INTELLIGENCE (CONFINED MANAGED WORKSPACE)
  // ===========================================================================
  app.get('/api/workspace/tree', (req, res) => {
    const includeHash = req.query.hash === '1';
    res.json(getWorkspaceTree(includeHash));
  });

  app.post('/api/workspace/seed-demo', async (_req, res) => {
    try {
      const tree = await seedWorkspaceDemoFiles();
      storageService.addActivity({
        kind: 'organize',
        title: 'Populated Workspace Demo Files',
        detail: `${tree.totalFiles} files across ${tree.totalFolders} folders`,
        status: 'completed',
      });
      res.json(tree);
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to seed demo files.' });
    }
  });

  app.post('/api/workspace/upload', upload.array('files', 100), (req, res) => {
    const uploaded = (req.files as Express.Multer.File[]) || [];
    if (uploaded.length === 0) {
      res.status(400).json({ error: 'No files provided for workspace upload.' });
      return;
    }
    try {
      const relPathsRaw = req.body.relativePaths;
      const relPaths: string[] = relPathsRaw
        ? typeof relPathsRaw === 'string'
          ? JSON.parse(relPathsRaw)
          : relPathsRaw
        : [];
      const baseDir = req.body.folder ? sanitizeRelativePath(String(req.body.folder)) : '';
      const saved = uploaded.map((f, idx) => {
        const relHint = relPaths[idx] || f.originalname;
        const targetRel = baseDir && !relHint.includes('/') ? `${baseDir}/${relHint}` : relHint;
        return saveUploadedFileToWorkspace(f.path, targetRel);
      });
      res.json({ saved, tree: getWorkspaceTree(false) });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'Workspace upload failed.' });
    }
  });

  app.post('/api/workspace/folder', (req, res) => {
    try {
      const folder = createWorkspaceFolder(String(req.body?.path || ''));
      res.json({ ok: true, folder, tree: getWorkspaceTree(false) });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'Invalid folder path.' });
    }
  });

  app.post('/api/workspace/delete', (req, res) => {
    try {
      const paths: string[] = Array.isArray(req.body?.paths) ? req.body.paths : [];
      const result = deleteWorkspacePaths(paths);
      storageService.addActivity({
        kind: 'cleanup',
        title: `Removed ${result.deletedCount} workspace item(s)`,
        detail: `Freed ${result.freedBytes} bytes`,
        status: 'completed',
      });
      res.json({ ...result, tree: getWorkspaceTree(false) });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'Delete failed.' });
    }
  });

  app.post('/api/workspace/promote', async (req, res) => {
    try {
      const paths: string[] = Array.isArray(req.body?.paths) ? req.body.paths : [];
      const promoted = promoteWorkspaceFilesToUploads(paths);
      const items = await Promise.all(
        promoted.map(async (p) => ({
          uploadToken: p.token,
          info: await identifyFile(p.absPath, p.originalName),
        }))
      );
      res.json({ items });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'Promote failed.' });
    }
  });

  app.get('/api/workspace/file/preview', (req, res) => {
    try {
      const rel = sanitizeRelativePath(String(req.query.path || ''));
      const full = confinePath(WORKSPACE_DIR, rel);
      if (!fs.existsSync(full) || !fs.statSync(full).isFile()) {
        res.status(404).json({ error: 'Workspace file not found.' });
        return;
      }
      res.sendFile(full);
    } catch {
      res.status(400).json({ error: 'Invalid workspace file path.' });
    }
  });

  app.post('/api/workspace/organize/preview', (req, res) => {
    try {
      const { paths, mode, baseFolder } = req.body || {};
      const result = previewWorkspaceOrganize(paths, mode || 'by-category', baseFolder || 'Organized');
      res.json(result);
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'Preview failed.' });
    }
  });

  app.post('/api/workspace/organize/apply', (req, res) => {
    try {
      const moves = Array.isArray(req.body?.moves) ? req.body.moves : [];
      const result = applyWorkspaceOrganize(moves);
      storageService.addActivity({
        kind: 'organize',
        title: `Organized ${result.movedCount} file(s)`,
        detail: 'Applied user-approved Smart Organizer plan',
        status: 'completed',
      });
      res.json({ ...result, tree: getWorkspaceTree(false) });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'Organization failed.' });
    }
  });

  app.get('/api/workspace/duplicates', (_req, res) => {
    res.json(scanWorkspaceDuplicates());
  });

  app.post('/api/workspace/rename/preview', (req, res) => {
    try {
      const { paths, rules } = req.body || {};
      res.json(previewWorkspaceRename(Array.isArray(paths) ? paths : [], rules));
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'Rename preview failed.' });
    }
  });

  app.post('/api/workspace/rename/apply', (req, res) => {
    try {
      const renames = Array.isArray(req.body?.renames) ? req.body.renames : [];
      const result = applyWorkspaceRename(renames);
      storageService.addActivity({
        kind: 'rename',
        title: `Batch renamed ${result.renamedCount} file(s)`,
        detail: 'Applied conflict-checked rename plan',
        status: 'completed',
      });
      res.json({ ...result, tree: getWorkspaceTree(false) });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'Rename failed.' });
    }
  });

  app.post('/api/workspace/inspect-batch', upload.array('files', 60), async (req, res) => {
    try {
      const uploaded = (req.files as Express.Multer.File[]) || [];
      const workspacePaths: string[] = req.body.workspacePaths
        ? typeof req.body.workspacePaths === 'string'
          ? JSON.parse(req.body.workspacePaths)
          : req.body.workspacePaths
        : [];

      const inspected: {
        name: string;
        source: 'upload' | 'workspace';
        relPath?: string;
        sha256: string;
        info: Awaited<ReturnType<typeof identifyFile>>;
      }[] = [];

      for (const f of uploaded) {
        const sha256 = crypto.createHash('sha256').update(fs.readFileSync(f.path)).digest('hex');
        const info = await identifyFile(f.path, f.originalname, f.mimetype);
        inspected.push({ name: f.originalname, source: 'upload', sha256, info });
      }
      for (const rel of workspacePaths) {
        const clean = sanitizeRelativePath(rel);
        const full = confinePath(WORKSPACE_DIR, clean);
        if (fs.existsSync(full) && fs.statSync(full).isFile()) {
          const sha256 = crypto.createHash('sha256').update(fs.readFileSync(full)).digest('hex');
          const info = await identifyFile(full, path.basename(full));
          inspected.push({ name: path.basename(full), source: 'workspace', relPath: clean, sha256, info });
        }
      }
      res.json({ count: inspected.length, items: inspected });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'Batch inspection failed.' });
    }
  });

  app.get('/api/storage/analyze', (req, res) => {
    const thresholdKb = Number(req.query.thresholdKb || 500);
    res.json(analyzeStorageReport(Math.max(1, thresholdKb) * 1024));
  });

  app.post('/api/storage/cleanup', (req, res) => {
    try {
      const { workspacePaths, purgeTemp } = req.body || {};
      let freedBytes = 0;
      let removedCount = 0;
      if (Array.isArray(workspacePaths) && workspacePaths.length > 0) {
        const del = deleteWorkspacePaths(workspacePaths);
        freedBytes += del.freedBytes;
        removedCount += del.deletedCount;
      }
      if (purgeTemp) {
        const stats = storageService.getStorageStats();
        freedBytes += stats.uploadBytes + stats.outputBytes;
        const purged = storageService.runTtlCleanup(true);
        removedCount += purged.removedFiles;
      }
      storageService.addActivity({
        kind: 'cleanup',
        title: `Storage Cleanup Completed`,
        detail: `Removed ${removedCount} candidate(s), freed ${freedBytes} bytes`,
        status: 'completed',
      });
      res.json({ ok: true, removedCount, freedBytes, report: analyzeStorageReport() });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'Cleanup failed.' });
    }
  });

  // Live System Resource & Engine Monitor
  app.get('/api/resources', (_req, res) => {
    const allJobs = storageService.getJobs();
    const activeJobs = allJobs.filter((j) => j.status === 'processing' || j.status === 'queued').length;
    res.json({
      storage: storageService.getStorageStats(),
      activeJobs,
      totalJobs: allJobs.length,
      memoryRssMb: Math.round(process.memoryUsage().rss / (1024 * 1024)),
      uptimeSec: Math.round(process.uptime()),
      engines: ENGINE_CAPABILITIES,
    });
  });

  // ===========================================================================
  // CORE TOOL 2: AI BACKGROUND REMOVER
  // ===========================================================================
  app.get('/api/bg-remove/sample/:preset', async (req, res) => {
    try {
      const preset = req.params.preset === 'portrait' || req.params.preset === 'badge' ? req.params.preset : 'product';
      const sample = await generateBgSampleBuffer(preset);
      res.setHeader('Content-Type', sample.mime);
      res.setHeader('Content-Disposition', `attachment; filename="${sample.filename}"`);
      res.send(sample.buffer);
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to build sample.' });
    }
  });

  app.post(
    '/api/bg-remove/process',
    upload.fields([
      { name: 'file', maxCount: 1 },
      { name: 'customBackground', maxCount: 1 },
    ]),
    async (req, res) => {
      try {
        const filesMap = (req.files as Record<string, Express.Multer.File[]> | undefined) || {};
        const mainFile = filesMap.file?.[0];
        const customBgFile = filesMap.customBackground?.[0];

        let inputPath = '';
        let originalName = '';
        if (mainFile) {
          inputPath = mainFile.path;
          originalName = mainFile.originalname;
        } else if (req.body.uploadToken) {
          const token = sanitizeFilename(String(req.body.uploadToken));
          inputPath = confinePath(UPLOAD_DIR, token);
          originalName = String(req.body.originalName || token);
        } else {
          res.status(400).json({ error: 'Provide an image file or uploadToken.' });
          return;
        }

        if (!fs.existsSync(inputPath)) {
          res.status(404).json({ error: 'Source image expired or not found.' });
          return;
        }

        const options: BgRemovalOptions =
          typeof req.body.options === 'string' ? JSON.parse(req.body.options) : req.body.options || {};
        const targetExt = options.outputFormat === 'webp' ? 'webp' : 'png';
        const jobId = createSafeId('bgr');
        const baseName = path.basename(sanitizeFilename(originalName), path.extname(originalName)) || 'cutout';
        const outputFilename = `${jobId}_${baseName}.${targetExt}`;
        const outputPath = confinePath(OUTPUT_DIR, outputFilename);

        let customBgPath = customBgFile?.path;
        if (!customBgPath && options.customBackgroundToken) {
          const cand = confinePath(UPLOAD_DIR, sanitizeFilename(options.customBackgroundToken));
          if (fs.existsSync(cand)) customBgPath = cand;
        }

        const result = await removeImageBackground(inputPath, outputPath, options, customBgPath);
        const outStat = fs.statSync(outputPath);

        const job: ConversionJob = {
          id: jobId,
          tool: 'bg-remover',
          originalName,
          sourceExt: path.extname(originalName).slice(1).toLowerCase() || 'png',
          targetExt,
          category: 'image',
          operationKind: 'segmentation',
          status: 'completed',
          progress: 100,
          inputSizeBytes: fs.statSync(inputPath).size,
          outputSizeBytes: outStat.size,
          outputName: outputFilename,
          durationMs: result.durationMs,
          engineUsed: `ISNet AI (${options.modelPrecision === 'high' ? 'Medium/Precision' : 'Fast'})`,
          createdAt: new Date().toISOString(),
          completedAt: new Date().toISOString(),
          options,
          previewKind: 'image',
          previewUrl: `/api/jobs/${jobId}/preview`,
          downloadUrl: `/api/jobs/${jobId}/download`,
          qualityMetrics: result.analysis,
        };
        storageService.setJob(job, { uploadPath: inputPath, outputPath });

        res.json({ job, analysis: result.analysis });
      } catch (err) {
        res.status(422).json({ error: err instanceof Error ? err.message : 'Background removal failed.' });
      }
    }
  );

  app.post('/api/bg-remove/analyze', async (req, res) => {
    try {
      const token = sanitizeFilename(String(req.body.uploadToken || ''));
      if (!token) {
        res.status(400).json({ error: 'Missing uploadToken.' });
        return;
      }
      const inputPath = confinePath(UPLOAD_DIR, token);
      if (!fs.existsSync(inputPath)) {
        res.status(404).json({ error: 'Uploaded image not found.' });
        return;
      }
      const insights = await analyzeBackgroundWithGemini(inputPath);
      res.json({ insights });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'Gemini Vision edge analysis unavailable.' });
    }
  });

  // ===========================================================================
  // CORE TOOL 3: ADVANCED FILE COMPRESSOR
  // ===========================================================================
  app.post('/api/compress', upload.single('file'), async (req, res) => {
    try {
      let inputPath = '';
      let originalName = '';
      if (req.file) {
        inputPath = req.file.path;
        originalName = req.file.originalname;
      } else if (req.body.uploadToken) {
        const token = sanitizeFilename(String(req.body.uploadToken));
        inputPath = confinePath(UPLOAD_DIR, token);
        originalName = String(req.body.originalName || token);
      } else {
        res.status(400).json({ error: 'Provide a file upload or uploadToken.' });
        return;
      }

      if (!fs.existsSync(inputPath)) {
        res.status(404).json({ error: 'Source file not found or expired.' });
        return;
      }

      const detected = await identifyFile(inputPath, originalName);
      const ext = detected.detectedExt || path.extname(originalName).slice(1).toLowerCase() || 'bin';
      const options: CompressionOptions =
        typeof req.body.options === 'string' ? JSON.parse(req.body.options) : req.body.options || { goal: 'balanced' };

      const jobId = createSafeId('cmp');
      const baseName = path.basename(sanitizeFilename(originalName), path.extname(originalName)) || 'compressed';
      const outputFilename = `${jobId}_${baseName}.${ext}`;
      const outputPath = confinePath(OUTPUT_DIR, outputFilename);

      const { stats, engineUsed, previewKind } = await compressFile(
        inputPath,
        outputPath,
        ext,
        detected.category,
        options
      );

      const job: ConversionJob = {
        id: jobId,
        tool: 'compressor',
        originalName,
        sourceExt: ext,
        targetExt: ext,
        category: detected.category === 'unknown' ? 'data' : detected.category,
        operationKind: 'compression',
        status: 'completed',
        progress: 100,
        inputSizeBytes: stats.originalBytes,
        outputSizeBytes: stats.outputBytes,
        outputName: outputFilename,
        durationMs: stats.durationMs,
        engineUsed,
        createdAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
        options,
        previewKind,
        previewUrl: `/api/jobs/${jobId}/preview`,
        downloadUrl: `/api/jobs/${jobId}/download`,
        compressionStats: stats,
      };
      storageService.setJob(job, { uploadPath: inputPath, outputPath });

      res.json({ job, stats });
    } catch (err) {
      res.status(422).json({ error: err instanceof Error ? err.message : 'Compression failed.' });
    }
  });

  // ===========================================================================
  // CORE TOOL 4: ZIP & ARCHIVE MANAGER
  // ===========================================================================
  app.get('/api/archive/matrix', (_req, res) => {
    res.json({ matrix: ARCHIVE_FORMAT_MATRIX });
  });

  app.post('/api/archive/inspect', upload.single('file'), async (req, res) => {
    try {
      let inputPath = '';
      let originalName = '';
      let uploadToken = '';
      if (req.file) {
        inputPath = req.file.path;
        originalName = req.file.originalname;
        uploadToken = path.basename(req.file.path);
      } else if (req.body.uploadToken) {
        uploadToken = sanitizeFilename(String(req.body.uploadToken));
        inputPath = confinePath(UPLOAD_DIR, uploadToken);
        originalName = String(req.body.originalName || uploadToken);
      } else {
        res.status(400).json({ error: 'Upload an archive or provide uploadToken.' });
        return;
      }

      if (!fs.existsSync(inputPath)) {
        res.status(404).json({ error: 'Archive file expired or missing.' });
        return;
      }

      const detected = await identifyFile(inputPath, originalName);
      const ext = String(req.body.ext || detected.detectedExt || path.extname(originalName).slice(1)).toLowerCase();
      const password = req.body.password ? String(req.body.password) : undefined;
      const report = await inspectArchiveFull(inputPath, ext, password);
      res.json({ uploadToken, originalName, report });
    } catch (err) {
      res.status(422).json({ error: err instanceof Error ? err.message : 'Failed to inspect archive.' });
    }
  });

  app.post('/api/archive/test', async (req, res) => {
    try {
      const token = sanitizeFilename(String(req.body.uploadToken || ''));
      const ext = String(req.body.ext || '').toLowerCase();
      const password = req.body.password ? String(req.body.password) : undefined;
      const inputPath = confinePath(UPLOAD_DIR, token);
      if (!fs.existsSync(inputPath)) {
        res.status(404).json({ error: 'Archive file not found.' });
        return;
      }
      const result = await testArchiveIntegrity(inputPath, ext, password);
      res.json(result);
    } catch (err) {
      res.status(422).json({ error: err instanceof Error ? err.message : 'Integrity test failed.' });
    }
  });

  app.post('/api/archive/entry-preview', async (req, res) => {
    try {
      const token = sanitizeFilename(String(req.body.uploadToken || ''));
      const ext = String(req.body.ext || '').toLowerCase();
      const entryName = String(req.body.entryName || '');
      const password = req.body.password ? String(req.body.password) : undefined;
      const inputPath = confinePath(UPLOAD_DIR, token);
      if (!fs.existsSync(inputPath)) {
        res.status(404).json({ error: 'Archive expired.' });
        return;
      }
      const buf = await readSingleArchiveEntryBuffer(inputPath, ext, entryName, password);
      const entryExt = path.extname(entryName).toLowerCase().slice(1);
      if (['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg'].includes(entryExt)) {
        const mime = entryExt === 'svg' ? 'image/svg+xml' : `image/${entryExt === 'jpg' ? 'jpeg' : entryExt}`;
        res.json({ kind: 'image', dataUrl: `data:${mime};base64,${buf.toString('base64')}`, size: buf.length });
        return;
      }
      const isText = buf.subarray(0, 512).every((b) => b === 9 || b === 10 || b === 13 || (b >= 32 && b <= 126) || b >= 128);
      if (isText) {
        res.json({ kind: 'text', text: buf.subarray(0, 12000).toString('utf8'), size: buf.length });
        return;
      }
      res.json({ kind: 'binary', size: buf.length });
    } catch (err) {
      res.status(422).json({ error: err instanceof Error ? err.message : 'Failed to preview entry.' });
    }
  });

  app.get('/api/archive/entry-download', async (req, res) => {
    try {
      const token = sanitizeFilename(String(req.query.uploadToken || ''));
      const ext = String(req.query.ext || '').toLowerCase();
      const entryName = String(req.query.entryName || '');
      const password = req.query.password ? String(req.query.password) : undefined;
      const inputPath = confinePath(UPLOAD_DIR, token);
      const buf = await readSingleArchiveEntryBuffer(inputPath, ext, entryName, password);
      res.setHeader('Content-Disposition', `attachment; filename="${sanitizeFilename(path.basename(entryName))}"`);
      res.send(buf);
    } catch (err) {
      res.status(422).json({ error: err instanceof Error ? err.message : 'Entry extraction failed.' });
    }
  });

  app.post('/api/archive/extract', async (req, res) => {
    try {
      const token = sanitizeFilename(String(req.body.uploadToken || ''));
      const ext = String(req.body.ext || '').toLowerCase();
      const originalName = String(req.body.originalName || 'archive');
      const selectedEntries = Array.isArray(req.body.selectedEntries) ? (req.body.selectedEntries as string[]) : undefined;
      const password = req.body.password ? String(req.body.password) : undefined;
      const inputPath = confinePath(UPLOAD_DIR, token);
      if (!fs.existsSync(inputPath)) {
        res.status(404).json({ error: 'Archive file expired.' });
        return;
      }

      const jobId = createSafeId('ext');
      const extractDir = path.join(WORK_DIR, `${jobId}_dir`);
      const startedAt = Date.now();
      const { extractedFiles } = await safeExtractArchiveToDir(inputPath, ext, extractDir, password, selectedEntries);

      const outName = `${jobId}_${path.basename(sanitizeFilename(originalName), path.extname(originalName))}_extracted.zip`;
      const outputPath = confinePath(OUTPUT_DIR, outName);
      const zip = new AdmZip();
      for (const rel of extractedFiles) {
        const full = confinePath(extractDir, rel);
        zip.addLocalFile(full, path.dirname(rel) === '.' ? '' : path.dirname(rel), path.basename(rel));
      }
      zip.writeZip(outputPath);
      fs.rmSync(extractDir, { recursive: true, force: true });

      const outStat = fs.statSync(outputPath);
      const job: ConversionJob = {
        id: jobId,
        tool: 'archive',
        originalName,
        sourceExt: ext,
        targetExt: 'zip',
        category: 'archive',
        operationKind: 'extraction',
        status: 'completed',
        progress: 100,
        inputSizeBytes: fs.statSync(inputPath).size,
        outputSizeBytes: outStat.size,
        outputName: outName,
        durationMs: Date.now() - startedAt,
        engineUsed: 'Safe Archive Extractor',
        createdAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
        options: { selectedCount: extractedFiles.length },
        downloadUrl: `/api/jobs/${jobId}/download`,
      };
      storageService.setJob(job, { outputPath });
      res.json({ job, extractedFiles });
    } catch (err) {
      res.status(422).json({ error: err instanceof Error ? err.message : 'Extraction failed.' });
    }
  });

  app.post('/api/archive/create', upload.array('files', 40), async (req, res) => {
    const files = (req.files as Express.Multer.File[]) || [];
    if (files.length === 0) {
      res.status(400).json({ error: 'Upload at least 1 file to pack into an archive.' });
      return;
    }
    try {
      const format = String(req.body.format || 'zip').toLowerCase();
      const level = Number(req.body.level ?? 6);
      const algorithm = req.body.algorithm ? String(req.body.algorithm) : undefined;
      const password = req.body.password ? String(req.body.password) : undefined;
      const splitSizeMb = req.body.splitSizeMb ? Number(req.body.splitSizeMb) : undefined;
      const archiveName = sanitizeFilename(String(req.body.archiveName || 'aether_bundle')).replace(/\.[a-z0-9]+$/i, '') || 'aether_bundle';

      const jobId = createSafeId('arc');
      const outputFilename = `${jobId}_${archiveName}.${format}`;
      const outputPath = confinePath(OUTPUT_DIR, outputFilename);
      const startedAt = Date.now();

      const result = await createArchiveAdvanced({
        fileEntries: files.map((f) => ({ path: f.path, originalName: f.originalname })),
        outputPath,
        format,
        level,
        algorithm,
        password,
        splitSizeMb,
        workDir: WORK_DIR,
      });

      const outStat = fs.statSync(outputPath);
      const job: ConversionJob = {
        id: jobId,
        tool: 'archive',
        originalName: `${archiveName}.${format}`,
        sourceExt: `${files.length} files`,
        targetExt: format,
        category: 'archive',
        operationKind: 'archive',
        status: 'completed',
        progress: 100,
        inputSizeBytes: files.reduce((a, f) => a + f.size, 0),
        outputSizeBytes: outStat.size,
        outputName: outputFilename,
        durationMs: Date.now() - startedAt,
        engineUsed: result.engineUsed,
        createdAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
        options: { level, algorithm, encrypted: Boolean(password), splitSizeMb },
        downloadUrl: `/api/jobs/${jobId}/download`,
      };
      storageService.setJob(job, {
        outputPath,
        extraDir: result.volumeFiles ? `${outputPath}.parts` : undefined,
      });

      res.json({
        job,
        note: result.note,
        volumes: result.volumeFiles?.map((v) => ({
          name: v.name,
          sizeBytes: v.sizeBytes,
          downloadUrl: `/api/archive/volume/${jobId}/${encodeURIComponent(v.name)}`,
        })),
      });
    } catch (err) {
      res.status(422).json({ error: err instanceof Error ? err.message : 'Archive creation failed.' });
    } finally {
      for (const f of files) {
        if (fs.existsSync(f.path)) fs.rmSync(f.path, { force: true });
      }
    }
  });

  app.get('/api/archive/volume/:jobId/:partName', (req, res) => {
    try {
      const paths = storageService.getJobPaths(req.params.jobId);
      if (!paths.extraDir || !fs.existsSync(paths.extraDir)) {
        res.status(404).json({ error: 'Split volume folder expired.' });
        return;
      }
      const partPath = confinePath(paths.extraDir, sanitizeFilename(req.params.partName));
      if (!fs.existsSync(partPath)) {
        res.status(404).json({ error: 'Volume part not found.' });
        return;
      }
      res.download(partPath, path.basename(partPath));
    } catch {
      res.status(400).json({ error: 'Invalid volume path.' });
    }
  });

  app.post('/api/archive/modify', upload.array('addFiles', 20), async (req, res) => {
    const added = (req.files as Express.Multer.File[]) || [];
    try {
      const token = sanitizeFilename(String(req.body.uploadToken || ''));
      const ext = String(req.body.ext || 'zip').toLowerCase();
      const action = String(req.body.action || 'delete') as 'add' | 'delete' | 'rename';
      const password = req.body.password ? String(req.body.password) : undefined;
      const deleteEntries = req.body.deleteEntries
        ? typeof req.body.deleteEntries === 'string'
          ? JSON.parse(req.body.deleteEntries)
          : req.body.deleteEntries
        : undefined;
      const inputPath = confinePath(UPLOAD_DIR, token);
      if (!fs.existsSync(inputPath)) {
        res.status(404).json({ error: 'Source archive expired.' });
        return;
      }

      const jobId = createSafeId('mod');
      const outputFilename = `${jobId}_modified.${ext}`;
      const outputPath = confinePath(OUTPUT_DIR, outputFilename);
      const startedAt = Date.now();

      const { note, report } = await modifyArchive({
        inputPath,
        ext,
        outputPath,
        action,
        deleteEntries,
        renameFrom: req.body.renameFrom ? String(req.body.renameFrom) : undefined,
        renameTo: req.body.renameTo ? String(req.body.renameTo) : undefined,
        addFiles: added.map((f) => ({ path: f.path, originalName: f.originalname })),
        password,
      });

      // Also promote modified archive to uploadDir so user can keep inspecting/modifying in session
      const nextToken = `${Date.now()}_mod_${sanitizeFilename(outputFilename)}`;
      fs.copyFileSync(outputPath, confinePath(UPLOAD_DIR, nextToken));

      const job: ConversionJob = {
        id: jobId,
        tool: 'archive',
        originalName: `modified.${ext}`,
        sourceExt: ext,
        targetExt: ext,
        category: 'archive',
        operationKind: 'archive',
        status: 'completed',
        progress: 100,
        inputSizeBytes: fs.statSync(inputPath).size,
        outputSizeBytes: fs.statSync(outputPath).size,
        outputName: outputFilename,
        durationMs: Date.now() - startedAt,
        engineUsed: '7-Zip Modifier',
        createdAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
        options: { action },
        downloadUrl: `/api/jobs/${jobId}/download`,
      };
      storageService.setJob(job, { outputPath });

      res.json({ job, note, report, nextUploadToken: nextToken });
    } catch (err) {
      res.status(422).json({ error: err instanceof Error ? err.message : 'Archive modification failed.' });
    } finally {
      for (const f of added) {
        if (fs.existsSync(f.path)) fs.rmSync(f.path, { force: true });
      }
    }
  });

  app.post(
    '/api/archive/compare',
    upload.fields([
      { name: 'archiveA', maxCount: 1 },
      { name: 'archiveB', maxCount: 1 },
    ]),
    async (req, res) => {
      const filesMap = (req.files as Record<string, Express.Multer.File[]> | undefined) || {};
      const fileA = filesMap.archiveA?.[0];
      const fileB = filesMap.archiveB?.[0];
      if (!fileA || !fileB) {
        res.status(400).json({ error: 'Upload two archives (Archive A and Archive B) to compare.' });
        return;
      }
      try {
        const extA = path.extname(fileA.originalname).slice(1).toLowerCase();
        const extB = path.extname(fileB.originalname).slice(1).toLowerCase();
        const diff = await compareArchives(
          fileA.path,
          extA,
          fileB.path,
          extB,
          req.body.passwordA ? String(req.body.passwordA) : undefined,
          req.body.passwordB ? String(req.body.passwordB) : undefined
        );
        res.json({ nameA: fileA.originalname, nameB: fileB.originalname, diff });
      } catch (err) {
        res.status(422).json({ error: err instanceof Error ? err.message : 'Archive comparison failed.' });
      } finally {
        if (fs.existsSync(fileA.path)) fs.rmSync(fileA.path, { force: true });
        if (fs.existsSync(fileB.path)) fs.rmSync(fileB.path, { force: true });
      }
    }
  );

  // ===========================================================================
  // SHARED CHAIINED WORKFLOW RUNNER (OPTIONAL WORKFLOW AUTOMATION)
  // ===========================================================================
  app.post('/api/workflow/run', upload.single('file'), async (req, res) => {
    try {
      let currentPath = '';
      let currentName = '';
      if (req.file) {
        currentPath = req.file.path;
        currentName = req.file.originalname;
      } else if (req.body.uploadToken) {
        const token = sanitizeFilename(String(req.body.uploadToken));
        currentPath = confinePath(UPLOAD_DIR, token);
        currentName = String(req.body.originalName || token);
      } else {
        res.status(400).json({ error: 'Upload a file or provide uploadToken to run workflow.' });
        return;
      }

      const steps: { tool: string; operationName?: string; enabled?: boolean; config?: Record<string, unknown> }[] =
        typeof req.body.steps === 'string' ? JSON.parse(req.body.steps) : req.body.steps || [];
      const activeSteps = Array.isArray(steps) ? steps.filter((s) => s.enabled !== false) : [];
      if (activeSteps.length === 0) {
        res.status(400).json({ error: 'Enable at least 1 workflow operation before running.' });
        return;
      }

      const namingPattern = String(req.body.namingPattern || '{name}_processed');
      const destinationFolder = req.body.destinationFolder ? String(req.body.destinationFolder) : '';

      const stepReports: { tool: string; summary: string; sizeBytes: number }[] = [];
      let currentExt = path.extname(currentName).slice(1).toLowerCase() || 'png';
      const initialBytes = fs.statSync(currentPath).size;
      const startedAt = Date.now();
      const baseStem = path.basename(sanitizeFilename(currentName), path.extname(currentName)) || 'output';

      for (let i = 0; i < activeSteps.length; i++) {
        const step = activeSteps[i];
        const cfg = step.config || {};
        const isLast = i === activeSteps.length - 1;
        const jobId = createSafeId('wf');

        try {
          if (step.tool === 'bg-remover') {
            const outExt = cfg.outputFormat === 'webp' ? 'webp' : 'png';
            const outPath = isLast
              ? confinePath(OUTPUT_DIR, `${jobId}_workflow.${outExt}`)
              : path.join(WORK_DIR, `${jobId}_step.${outExt}`);
            const bgOpts: BgRemovalOptions = {
              modelPrecision: cfg.modelPrecision === 'high' ? 'high' : 'fast',
              outputFormat: outExt,
              quality: Number(cfg.quality ?? 92),
              featherRadius: Number(cfg.featherRadius ?? 1),
              edgeRefinement: Number(cfg.edgeRefinement ?? 0),
              backgroundMode: (cfg.backgroundMode as BgRemovalOptions['backgroundMode']) || 'transparent',
              backgroundColor: String(cfg.backgroundColor || '#ffffff'),
              gradientFrom: String(cfg.gradientFrom || '#141414'),
              gradientTo: String(cfg.gradientTo || '#e4e4e7'),
              gradientAngle: 135,
              backgroundBlurRadius: 18,
              shadowEnabled: Boolean(cfg.shadowEnabled),
              shadowOpacity: Number(cfg.shadowOpacity ?? 0.3),
              shadowBlur: Number(cfg.shadowBlur ?? 14),
              subjectScale: 1,
              offsetX: 0,
              offsetY: 0,
              cropAspect: 'original',
              brightness: 1,
              contrast: 1,
              saturation: 1,
            };
            await removeImageBackground(currentPath, outPath, bgOpts);
            currentPath = outPath;
            currentExt = outExt;
            stepReports.push({
              tool: 'bg-remover',
              summary: `Background removed (${bgOpts.backgroundMode} backdrop)`,
              sizeBytes: fs.statSync(outPath).size,
            });
          } else if (step.tool === 'resize') {
            const targetW = Math.max(16, Math.min(8000, Number(cfg.width || 1200)));
            const targetH = Math.max(16, Math.min(8000, Number(cfg.height || 1200)));
            const fit = (cfg.fit as 'inside' | 'cover' | 'contain') || 'inside';
            const outExt = ['png', 'jpg', 'jpeg', 'webp', 'avif', 'tiff'].includes(currentExt) ? currentExt : 'png';
            const outPath = isLast
              ? confinePath(OUTPUT_DIR, `${jobId}_workflow.${outExt}`)
              : path.join(WORK_DIR, `${jobId}_step.${outExt}`);
            await sharp(currentPath)
              .rotate()
              .resize({
                width: targetW,
                height: targetH,
                fit: cfg.maintainAspect === false ? 'fill' : fit,
                background: { r: 0, g: 0, b: 0, alpha: 0 },
                withoutEnlargement: false,
              })
              .toFile(outPath);
            currentPath = outPath;
            currentExt = outExt;
            stepReports.push({
              tool: 'resize',
              summary: `Resized to ${targetW}×${targetH} (${cfg.maintainAspect === false ? 'stretch' : fit})`,
              sizeBytes: fs.statSync(outPath).size,
            });
          } else if (step.tool === 'compressor' || step.tool === 'compress') {
            const outPath = isLast
              ? confinePath(OUTPUT_DIR, `${jobId}_workflow.${currentExt}`)
              : path.join(WORK_DIR, `${jobId}_step.${currentExt}`);
            const detected = await identifyFile(currentPath, `file.${currentExt}`);
            const cmp = await compressFile(currentPath, outPath, currentExt, detected.category, {
              goal: (cfg.goal as CompressionOptions['goal']) || 'balanced',
              quality: cfg.quality ? Number(cfg.quality) : 78,
              targetSizeKb: cfg.targetSizeKb ? Number(cfg.targetSizeKb) : undefined,
              stripMetadata: cfg.stripMetadata !== false,
            });
            currentPath = outPath;
            stepReports.push({
              tool: 'compress',
              summary: `${cmp.stats.strategyUsed} (${cmp.stats.percentDelta}%)`,
              sizeBytes: cmp.stats.outputBytes,
            });
          } else if (step.tool === 'converter' || step.tool === 'convert') {
            const targetExt = String(cfg.targetFormat || 'webp').toLowerCase();
            const outPath = isLast
              ? confinePath(OUTPUT_DIR, `${jobId}_workflow.${targetExt}`)
              : path.join(WORK_DIR, `${jobId}_step.${targetExt}`);
            const conv = await executeConversion({
              inputPath: currentPath,
              outputPath: outPath,
              sourceExt: currentExt,
              targetExt,
              originalName: currentName,
              options: {
                ...((cfg.options as ConversionOptions) || {}),
                quality: cfg.quality ? Number(cfg.quality) : undefined,
                stripMetadata: cfg.stripMetadata !== undefined ? Boolean(cfg.stripMetadata) : undefined,
              },
            });
            currentPath = outPath;
            currentExt = targetExt;
            stepReports.push({
              tool: 'convert',
              summary: conv.note,
              sizeBytes: fs.statSync(outPath).size,
            });
          } else if (step.tool === 'archive') {
            const arcFmt = String(cfg.format || 'zip').toLowerCase();
            const outPath = isLast
              ? confinePath(OUTPUT_DIR, `${jobId}_workflow.${arcFmt}`)
              : path.join(WORK_DIR, `${jobId}_step.${arcFmt}`);
            const cleanName = `${namingPattern.replace('{name}', baseStem)}.${currentExt}`;
            const arc = await createArchiveAdvanced({
              fileEntries: [{ path: currentPath, originalName: cleanName }],
              outputPath: outPath,
              format: arcFmt,
              level: Number(cfg.level ?? 7),
              password: cfg.password ? String(cfg.password) : undefined,
              workDir: WORK_DIR,
            });
            currentPath = outPath;
            currentExt = arcFmt;
            stepReports.push({
              tool: 'archive',
              summary: arc.note,
              sizeBytes: fs.statSync(outPath).size,
            });
          }
        } catch (stepErr) {
          const stepLabel = step.operationName || step.tool;
          const msg = stepErr instanceof Error ? stepErr.message : 'Operation error.';
          storageService.addActivity({
            kind: 'workflow',
            title: `Workflow failed at Step ${i + 1}: ${stepLabel}`,
            detail: `${currentName} — ${msg}`,
            status: 'failed',
          });
          res.status(422).json({
            error: `Step ${i + 1} (${stepLabel}) failed: ${msg}`,
            failedStepIndex: i,
            failedStepLabel: stepLabel,
            completedSteps: stepReports,
          });
          return;
        }
      }

      const finalJobId = createSafeId('wf');
      const finalStem = sanitizeFilename(namingPattern.replace('{name}', baseStem));
      const finalFile = `${finalJobId}_${finalStem}.${currentExt}`;
      const finalPath = confinePath(OUTPUT_DIR, finalFile);
      if (currentPath !== finalPath) {
        fs.copyFileSync(currentPath, finalPath);
      }

      let savedWorkspacePath: string | undefined;
      if (destinationFolder) {
        savedWorkspacePath = storageService.saveOutputToWorkspace(finalPath, destinationFolder, `${finalStem}.${currentExt}`);
      }

      const outSize = fs.statSync(finalPath).size;
      const job: ConversionJob = {
        id: finalJobId,
        tool: 'workflow',
        originalName: currentName,
        sourceExt: path.extname(currentName).slice(1).toLowerCase() || 'bin',
        targetExt: currentExt,
        category: 'ecosystem',
        operationKind: 'conversion',
        status: 'completed',
        progress: 100,
        inputSizeBytes: initialBytes,
        outputSizeBytes: outSize,
        outputName: finalFile,
        durationMs: Date.now() - startedAt,
        engineUsed: `${stepReports.length}-Step Custom Sequence`,
        createdAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
        options: { steps: stepReports, namingPattern, destinationFolder },
        downloadUrl: `/api/jobs/${finalJobId}/download`,
        previewUrl: `/api/jobs/${finalJobId}/preview`,
        previewKind: ['png', 'jpg', 'jpeg', 'webp'].includes(currentExt) ? 'image' : currentExt === 'pdf' ? 'pdf' : 'none',
        details: savedWorkspacePath ? { workspaceSavedPath: savedWorkspacePath } : undefined,
      };
      storageService.setJob(job, { outputPath: finalPath });
      storageService.addActivity({
        kind: 'workflow',
        title: `Workflow completed for ${currentName}`,
        detail: `${stepReports.length} step(s) → ${currentExt.toUpperCase()} (${outSize} bytes)`,
        status: 'completed',
      });
      res.json({ job, stepReports, savedWorkspacePath });
    } catch (err) {
      res.status(422).json({ error: err instanceof Error ? err.message : 'Workflow execution failed.' });
    }
  });

  // Serve Vite in development or static dist in production
  if (process.env.NODE_ENV === 'production') {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  } else {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  const port = Number(process.env.PORT) || 3000;
  app.listen(port, '0.0.0.0', () => {
    console.log(`Aether Convert server listening on http://localhost:${port}`);
  });
}

startServer();
