import { execFile } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';
import AdmZip from 'adm-zip';
import * as tar from 'tar';
import zlib from 'zlib';
import { confinePath } from '../services/security';

const execFileAsync = promisify(execFile);

export interface ArchiveEntryInfo {
  name: string;
  size: number;
  isDirectory: boolean;
}

export async function inspectArchive(filePath: string, ext: string): Promise<ArchiveEntryInfo[]> {
  const format = ext.toLowerCase();
  if (format === 'zip') {
    const zip = new AdmZip(filePath);
    return zip.getEntries().slice(0, 100).map((e) => ({
      name: e.entryName,
      size: e.header.size,
      isDirectory: e.isDirectory,
    }));
  }

  if (['tar', 'tgz', 'gz', 'bz2', 'xz'].includes(format)) {
    try {
      const flag = format === 'bz2' ? '-tjvf' : format === 'xz' ? '-tJvf' : format === 'tgz' || format === 'gz' ? '-tzvf' : '-tvf';
      const { stdout } = await execFileAsync('tar', [flag, filePath], { timeout: 15000 });
      return stdout
        .split('\n')
        .filter(Boolean)
        .slice(0, 100)
        .map((line) => {
          const parts = line.trim().split(/\s+/);
          const name = parts.slice(5).join(' ') || parts[parts.length - 1] || 'entry';
          const size = parseInt(parts[2] || '0', 10) || 0;
          return { name, size, isDirectory: line.startsWith('d') };
        });
    } catch {
      return [{ name: path.basename(filePath, `.${format}`), size: fs.statSync(filePath).size, isDirectory: false }];
    }
  }

  return [];
}

/**
 * Safely extracts an archive into extractDir with strict path traversal checks.
 */
async function safeExtractArchive(inputPath: string, ext: string, extractDir: string): Promise<void> {
  fs.mkdirSync(extractDir, { recursive: true });
  const format = ext.toLowerCase();

  if (format === 'zip') {
    const zip = new AdmZip(inputPath);
    for (const entry of zip.getEntries()) {
      const target = confinePath(extractDir, entry.entryName);
      if (entry.isDirectory) {
        fs.mkdirSync(target, { recursive: true });
      } else {
        fs.mkdirSync(path.dirname(target), { recursive: true });
        fs.writeFileSync(target, entry.getData());
      }
    }
    return;
  }

  if (format === 'tar' || format === 'tgz') {
    await tar.x({
      file: inputPath,
      cwd: extractDir,
      strip: 0,
      filter: (entryPath) => {
        try {
          confinePath(extractDir, entryPath);
          return !entryPath.includes('..');
        } catch {
          return false;
        }
      },
    });
    return;
  }

  if (format === 'gz') {
    // Check if gzipped tarball or single gz stream
    try {
      await tar.x({
        file: inputPath,
        cwd: extractDir,
        filter: (entryPath) => !entryPath.includes('..'),
      });
      return;
    } catch {
      const gunzipped = zlib.gunzipSync(fs.readFileSync(inputPath));
      const base = path.basename(inputPath).replace(/\.gz$/i, '') || 'extracted_file';
      fs.writeFileSync(confinePath(extractDir, base), gunzipped);
      return;
    }
  }

  if (format === 'bz2') {
    await execFileAsync('tar', ['-xjf', inputPath, '-C', extractDir], { timeout: 60000 });
    return;
  }

  if (format === 'xz') {
    await execFileAsync('tar', ['-xJf', inputPath, '-C', extractDir], { timeout: 60000 });
    return;
  }

  throw new Error(`Unsupported archive input format: ${ext}`);
}

export async function packDirectoryToArchive(
  sourceDir: string,
  outputPath: string,
  targetExt: string,
  _compressionLevel = 6
): Promise<void> {
  const format = targetExt.toLowerCase();

  if (format === 'zip') {
    const zip = new AdmZip();
    zip.addLocalFolder(sourceDir);
    zip.writeZip(outputPath);
    return;
  }

  if (format === 'tar') {
    await tar.c({ file: outputPath, cwd: sourceDir }, fs.readdirSync(sourceDir));
    return;
  }

  if (format === 'tgz' || format === 'gz') {
    await tar.c({ gzip: true, file: outputPath, cwd: sourceDir }, fs.readdirSync(sourceDir));
    return;
  }

  if (format === 'bz2') {
    const items = fs.readdirSync(sourceDir);
    await execFileAsync('tar', ['-cjf', outputPath, '-C', sourceDir, ...(items.length ? items : ['.'])], {
      timeout: 60000,
    });
    return;
  }

  if (format === 'xz' || format === 'lzma') {
    const items = fs.readdirSync(sourceDir);
    await execFileAsync('tar', ['-cJf', outputPath, '-C', sourceDir, ...(items.length ? items : ['.'])], {
      timeout: 60000,
    });
    return;
  }

  throw new Error(`Unsupported archive target format: ${targetExt}`);
}

export async function convertArchive(
  inputPath: string,
  outputPath: string,
  sourceExt: string,
  targetExt: string,
  workDir: string,
  compressionLevel = 6
): Promise<{ note: string }> {
  const extractDir = path.join(workDir, `arc_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`);
  try {
    await safeExtractArchive(inputPath, sourceExt, extractDir);
    const items = fs.readdirSync(extractDir);
    if (items.length === 0) {
      throw new Error('Archive extracted zero entries.');
    }
    await packDirectoryToArchive(extractDir, outputPath, targetExt, compressionLevel);
    return { note: `Safely extracted ${sourceExt.toUpperCase()} and repacked into ${targetExt.toUpperCase()}.` };
  } finally {
    if (fs.existsSync(extractDir)) {
      fs.rmSync(extractDir, { recursive: true, force: true });
    }
  }
}

export async function createArchiveFromMultipleFiles(
  fileEntries: { path: string; originalName: string }[],
  outputPath: string,
  targetExt: string,
  workDir: string,
  compressionLevel = 6
): Promise<{ note: string }> {
  const stageDir = path.join(workDir, `pack_${Date.now()}`);
  fs.mkdirSync(stageDir, { recursive: true });
  try {
    for (const f of fileEntries) {
      const target = confinePath(stageDir, path.basename(f.originalName));
      fs.copyFileSync(f.path, target);
    }
    await packDirectoryToArchive(stageDir, outputPath, targetExt, compressionLevel);
    return { note: `Bundled ${fileEntries.length} file(s) into ${targetExt.toUpperCase()} archive.` };
  } finally {
    if (fs.existsSync(stageDir)) {
      fs.rmSync(stageDir, { recursive: true, force: true });
    }
  }
}
