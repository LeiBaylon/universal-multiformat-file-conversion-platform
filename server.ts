import express from 'express';
import path from 'path';
import fs from 'fs';
import multer from 'multer';
import AdmZip from 'adm-zip';
import { execFileSync } from 'child_process';
import { createServer as createViteServer } from 'vite';
import { CATEGORIES, FORMAT_REGISTRY, getFormatByExtension, getSupportedStats } from './src/shared/formats';
import type { ConversionJob, ConversionOptions } from './src/shared/types';
import {
  confinePath,
  createSafeId,
  ensureStorageDirs,
  OUTPUT_DIR,
  sanitizeFilename,
  UPLOAD_DIR,
} from './server/services/security';
import { storageService } from './server/services/storage';
import {
  executeConversion,
  executeMultiMerge,
  generateSampleFileBuffer,
  identifyFile,
} from './server/services/conversionDispatcher';

ensureStorageDirs();

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
  sevenZip: hasBinary('7z'),
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

      const initialJob: ConversionJob = {
        id: jobId,
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
