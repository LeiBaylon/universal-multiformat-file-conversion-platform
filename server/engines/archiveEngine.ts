import fs from 'fs';
import path from 'path';
import {
  createArchiveAdvanced,
  inspectArchiveFull,
  safeExtractArchiveToDir,
} from './archiveManagerEngine';

export interface ArchiveEntryInfo {
  name: string;
  size: number;
  isDirectory: boolean;
}

export async function inspectArchive(filePath: string, ext: string): Promise<ArchiveEntryInfo[]> {
  try {
    const report = await inspectArchiveFull(filePath, ext);
    return report.entries.slice(0, 100).map((e) => ({
      name: e.name,
      size: e.size,
      isDirectory: e.isDirectory,
    }));
  } catch {
    return [];
  }
}

export async function packDirectoryToArchive(
  sourceDir: string,
  outputPath: string,
  targetExt: string,
  compressionLevel = 6
): Promise<void> {
  const collected: { path: string; originalName: string }[] = [];
  for (const item of fs.readdirSync(sourceDir)) {
    const full = path.join(sourceDir, item);
    if (fs.statSync(full).isFile()) {
      collected.push({ path: full, originalName: item });
    }
  }
  await createArchiveAdvanced({
    fileEntries: collected,
    outputPath,
    format: targetExt,
    level: compressionLevel,
    workDir: path.dirname(outputPath),
  });
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
    const { extractedFiles } = await safeExtractArchiveToDir(inputPath, sourceExt, extractDir);
    if (extractedFiles.length === 0) {
      throw new Error('Archive extracted zero entries.');
    }
    const entries = extractedFiles.map((rel) => ({
      path: path.join(extractDir, rel),
      originalName: path.basename(rel),
    }));
    await createArchiveAdvanced({
      fileEntries: entries,
      outputPath,
      format: targetExt,
      level: compressionLevel,
      workDir,
    });
    return {
      note: `Safely extracted ${extractedFiles.length} entry(s) from ${sourceExt.toUpperCase()} and repacked into ${targetExt.toUpperCase()}.`,
    };
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
  const res = await createArchiveAdvanced({
    fileEntries,
    outputPath,
    format: targetExt,
    level: compressionLevel,
    workDir,
  });
  return { note: res.note };
}
