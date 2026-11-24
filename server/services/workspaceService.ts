import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import sharp from 'sharp';
import AdmZip from 'adm-zip';
import { getFormatByExtension } from '../../src/shared/formats';
import { computeBatchRenamePlan, type BatchRenameRules } from '../../src/utils/batchRenamer';
import { computeOrganizationPlan, type OrganizerRuleMode } from '../../src/utils/smartOrganizer';
import type {
  DuplicateGroup,
  StorageAnalysisReport,
  WorkspaceFileEntry,
  WorkspaceTreeSummary,
} from '../../src/shared/types';
import { confinePath, sanitizeFilename, sanitizeRelativePath, UPLOAD_DIR, WORKSPACE_DIR } from './security';
import { storageService } from './storage';
import { generateBgSampleBuffer } from '../engines/bgRemovalEngine';
import { renderTextToPdfBuffer } from '../engines/documentEngine';

function ensureWorkspaceRoot(): void {
  if (!fs.existsSync(WORKSPACE_DIR)) {
    fs.mkdirSync(WORKSPACE_DIR, { recursive: true });
  }
}

function hashFileSha256(filePath: string): string {
  const hash = crypto.createHash('sha256');
  hash.update(fs.readFileSync(filePath));
  return hash.digest('hex');
}

function walkWorkspace(dir: string, baseRel = '', includeHash = false): WorkspaceFileEntry[] {
  ensureWorkspaceRoot();
  const entries: WorkspaceFileEntry[] = [];
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    const relPath = baseRel ? `${baseRel}/${name}` : name;
    const stat = fs.statSync(full);
    if (stat.isDirectory()) {
      entries.push({
        relPath,
        name,
        ext: '',
        category: 'unknown',
        sizeBytes: 0,
        modifiedAt: stat.mtime.toISOString(),
        isDirectory: true,
      });
      entries.push(...walkWorkspace(full, relPath, includeHash));
    } else if (stat.isFile()) {
      const ext = path.extname(name).slice(1).toLowerCase();
      const fmt = getFormatByExtension(ext);
      entries.push({
        relPath,
        name,
        ext,
        category: fmt?.category || 'unknown',
        sizeBytes: stat.size,
        modifiedAt: stat.mtime.toISOString(),
        isDirectory: false,
        sha256: includeHash ? hashFileSha256(full) : undefined,
      });
    }
  }
  return entries;
}

export function getWorkspaceTree(includeHash = false): WorkspaceTreeSummary {
  ensureWorkspaceRoot();
  const entries = walkWorkspace(WORKSPACE_DIR, '', includeHash);
  const files = entries.filter((e) => !e.isDirectory);
  const folders = entries.filter((e) => e.isDirectory);
  const totalBytes = files.reduce((acc, f) => acc + f.sizeBytes, 0);
  return {
    rootLabel: 'Managed Workspace',
    totalFiles: files.length,
    totalFolders: folders.length,
    totalBytes,
    entries: entries.sort((a, b) => {
      if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
      return a.relPath.localeCompare(b.relPath);
    }),
  };
}

export async function seedWorkspaceDemoFiles(): Promise<WorkspaceTreeSummary> {
  ensureWorkspaceRoot();
  const dirs = ['Incoming', 'Studio_Photos', 'Documents', 'Archives'];
  for (const d of dirs) {
    fs.mkdirSync(confinePath(WORKSPACE_DIR, d), { recursive: true });
  }

  const product = await generateBgSampleBuffer('product');
  const portrait = await generateBgSampleBuffer('portrait');
  const badge = await generateBgSampleBuffer('badge');

  fs.writeFileSync(confinePath(WORKSPACE_DIR, 'Incoming/watch_product.png'), product.buffer);
  fs.writeFileSync(confinePath(WORKSPACE_DIR, 'Incoming/watch_product_copy.png'), product.buffer); // intentional duplicate
  fs.writeFileSync(confinePath(WORKSPACE_DIR, 'Studio_Photos/portrait_raw.png'), portrait.buffer);
  fs.writeFileSync(confinePath(WORKSPACE_DIR, 'Studio_Photos/emblem_badge.png'), badge.buffer);

  // Larger raster (~1.4MB uncompressed BMP/TIFF for Large Files testing)
  const largeBmp = await sharp({
    create: { width: 900, height: 650, channels: 3, background: { r: 28, g: 28, b: 32 } },
  })
    .tiff({ compression: 'none' })
    .toBuffer();
  fs.writeFileSync(confinePath(WORKSPACE_DIR, 'Studio_Photos/uncompressed_studio_master.tiff'), largeBmp);

  const pdfBuf = await renderTextToPdfBuffer(
    'Quarterly Report',
    'OmniFiles Workspace Quarterly Asset Report\n\nSection 1: Pipeline Verification\nSection 2: Storage Audit\n'
  );
  fs.writeFileSync(confinePath(WORKSPACE_DIR, 'Documents/quarterly_report.pdf'), pdfBuf);
  fs.writeFileSync(confinePath(WORKSPACE_DIR, 'Documents/quarterly_report_backup.pdf'), pdfBuf); // intentional duplicate

  fs.writeFileSync(
    confinePath(WORKSPACE_DIR, 'Incoming/catalog_metrics.json'),
    JSON.stringify([{ sku: 'OMN-01', category: 'audio', status: 'active' }], null, 2),
    'utf8'
  );

  const zip = new AdmZip();
  zip.addFile('manifest.txt', Buffer.from('OmniFiles Demo Bundle\n', 'utf8'));
  zip.addFile('watch_product.png', product.buffer);
  zip.writeZip(confinePath(WORKSPACE_DIR, 'Archives/demo_assets.zip'));

  return getWorkspaceTree();
}

export function saveUploadedFileToWorkspace(tempFilePath: string, originalRelativePath: string): WorkspaceFileEntry {
  ensureWorkspaceRoot();
  const cleanRel = sanitizeRelativePath(originalRelativePath) || sanitizeFilename(originalRelativePath);
  const dest = confinePath(WORKSPACE_DIR, cleanRel);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(tempFilePath, dest);
  fs.rmSync(tempFilePath, { force: true });
  const stat = fs.statSync(dest);
  const name = path.basename(dest);
  const ext = path.extname(name).slice(1).toLowerCase();
  const fmt = getFormatByExtension(ext);
  return {
    relPath: cleanRel,
    name,
    ext,
    category: fmt?.category || 'unknown',
    sizeBytes: stat.size,
    modifiedAt: stat.mtime.toISOString(),
    isDirectory: false,
  };
}

export function createWorkspaceFolder(relDir: string): string {
  const clean = sanitizeRelativePath(relDir);
  if (!clean) throw new Error('Provide a valid folder name.');
  const target = confinePath(WORKSPACE_DIR, clean);
  fs.mkdirSync(target, { recursive: true });
  return clean;
}

export function deleteWorkspacePaths(relPaths: string[]): { deletedCount: number; freedBytes: number } {
  let deletedCount = 0;
  let freedBytes = 0;
  for (const rel of relPaths) {
    const clean = sanitizeRelativePath(rel);
    if (!clean) continue;
    const target = confinePath(WORKSPACE_DIR, clean);
    if (!fs.existsSync(target) || target === WORKSPACE_DIR) continue;
    const stat = fs.statSync(target);
    if (stat.isFile()) {
      freedBytes += stat.size;
      fs.rmSync(target, { force: true });
      deletedCount++;
    } else if (stat.isDirectory()) {
      const inner = walkWorkspace(target, clean, false);
      freedBytes += inner.reduce((acc, f) => acc + f.sizeBytes, 0);
      fs.rmSync(target, { recursive: true, force: true });
      deletedCount++;
    }
  }
  return { deletedCount, freedBytes };
}

export function promoteWorkspaceFilesToUploads(relPaths: string[]): { absPath: string; token: string; originalName: string }[] {
  const results: { absPath: string; token: string; originalName: string }[] = [];
  for (const rel of relPaths) {
    const clean = sanitizeRelativePath(rel);
    if (!clean) continue;
    const src = confinePath(WORKSPACE_DIR, clean);
    if (!fs.existsSync(src) || !fs.statSync(src).isFile()) continue;
    const originalName = path.basename(src);
    const token = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}_${sanitizeFilename(originalName)}`;
    const dest = confinePath(UPLOAD_DIR, token);
    fs.copyFileSync(src, dest);
    results.push({ absPath: dest, token, originalName });
  }
  return results;
}

export function previewWorkspaceOrganize(
  relPaths: string[] | undefined,
  mode: OrganizerRuleMode,
  baseFolder = 'Organized'
) {
  const allFiles = getWorkspaceTree(false).entries.filter((e) => !e.isDirectory);
  const selectedSet = relPaths && relPaths.length > 0 ? new Set(relPaths.map(sanitizeRelativePath)) : null;
  const targets = selectedSet ? allFiles.filter((f) => selectedSet.has(f.relPath)) : allFiles;
  return computeOrganizationPlan(targets, mode, baseFolder);
}

export function applyWorkspaceOrganize(
  moves: { originalRelPath: string; proposedRelPath: string }[]
): { movedCount: number } {
  let movedCount = 0;
  for (const m of moves) {
    const srcClean = sanitizeRelativePath(m.originalRelPath);
    const dstClean = sanitizeRelativePath(m.proposedRelPath);
    if (!srcClean || !dstClean || srcClean === dstClean) continue;
    const src = confinePath(WORKSPACE_DIR, srcClean);
    const dst = confinePath(WORKSPACE_DIR, dstClean);
    if (!fs.existsSync(src) || !fs.statSync(src).isFile()) continue;
    fs.mkdirSync(path.dirname(dst), { recursive: true });
    if (!fs.existsSync(dst)) {
      fs.renameSync(src, dst);
      movedCount++;
    }
  }
  return { movedCount };
}

export function scanWorkspaceDuplicates(): { groups: DuplicateGroup[]; totalWastedBytes: number } {
  const files = getWorkspaceTree(true).entries.filter((e) => !e.isDirectory && e.sizeBytes > 0);
  const byHash = new Map<string, WorkspaceFileEntry[]>();
  for (const f of files) {
    if (!f.sha256) continue;
    const list = byHash.get(f.sha256) || [];
    list.push(f);
    byHash.set(f.sha256, list);
  }
  const groups: DuplicateGroup[] = [];
  let totalWastedBytes = 0;
  for (const [hash, list] of byHash.entries()) {
    if (list.length > 1) {
      const wastedBytes = list.slice(1).reduce((acc, f) => acc + f.sizeBytes, 0);
      totalWastedBytes += wastedBytes;
      groups.push({ hash, sizeBytes: list[0].sizeBytes, wastedBytes, files: list });
    }
  }
  groups.sort((a, b) => b.wastedBytes - a.wastedBytes);
  return { groups, totalWastedBytes };
}

export function previewWorkspaceRename(relPaths: string[], rules: BatchRenameRules) {
  const allFiles = getWorkspaceTree(false).entries.filter((e) => !e.isDirectory);
  const selectedSet = new Set(relPaths.map(sanitizeRelativePath));
  const selected = allFiles.filter((f) => selectedSet.has(f.relPath));
  const unselectedSiblingPaths = new Set(allFiles.filter((f) => !selectedSet.has(f.relPath)).map((f) => f.relPath));

  return computeBatchRenamePlan(
    selected.map((f) => ({ id: f.relPath, relPath: f.relPath, name: f.name })),
    rules,
    unselectedSiblingPaths
  );
}

export function applyWorkspaceRename(
  renames: { originalRelPath: string; proposedRelPath: string }[]
): { renamedCount: number } {
  const validPairs: { src: string; dst: string; tmp: string }[] = [];
  for (const item of renames) {
    const srcRel = sanitizeRelativePath(item.originalRelPath);
    const dstRel = sanitizeRelativePath(item.proposedRelPath);
    if (!srcRel || !dstRel || srcRel === dstRel) continue;
    const src = confinePath(WORKSPACE_DIR, srcRel);
    const dst = confinePath(WORKSPACE_DIR, dstRel);
    if (!fs.existsSync(src) || !fs.statSync(src).isFile()) continue;
    validPairs.push({
      src,
      dst,
      tmp: confinePath(WORKSPACE_DIR, `${srcRel}.__omnirename_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`),
    });
  }

  // Two-phase atomic rename prevents swap collisions (e.g. a->b and b->a)
  for (const p of validPairs) {
    fs.renameSync(p.src, p.tmp);
  }
  let renamedCount = 0;
  for (const p of validPairs) {
    fs.mkdirSync(path.dirname(p.dst), { recursive: true });
    fs.renameSync(p.tmp, p.dst);
    renamedCount++;
  }
  return { renamedCount };
}

export function analyzeStorageReport(largeThresholdBytes = 500 * 1024): StorageAnalysisReport {
  const files = getWorkspaceTree(false).entries.filter((e) => !e.isDirectory);
  const dup = scanWorkspaceDuplicates();
  const storageStats = storageService.getStorageStats();
  const workspaceBytes = files.reduce((acc, f) => acc + f.sizeBytes, 0);
  const largeFiles = files.filter((f) => f.sizeBytes >= largeThresholdBytes);

  const catMap = new Map<string, { files: number; bytes: number }>();
  const folderMap = new Map<string, { files: number; bytes: number }>();
  for (const f of files) {
    const c = catMap.get(f.category) || { files: 0, bytes: 0 };
    c.files += 1;
    c.bytes += f.sizeBytes;
    catMap.set(f.category, c);

    const topDir = f.relPath.includes('/') ? f.relPath.split('/')[0] : '(Root)';
    const fd = folderMap.get(topDir) || { files: 0, bytes: 0 };
    fd.files += 1;
    fd.bytes += f.sizeBytes;
    folderMap.set(topDir, fd);
  }

  const byCategory = Array.from(catMap.entries())
    .map(([category, v]) => ({
      category,
      files: v.files,
      bytes: v.bytes,
      sharePct: workspaceBytes > 0 ? Math.round((v.bytes / workspaceBytes) * 100) : 0,
    }))
    .sort((a, b) => b.bytes - a.bytes);

  const topFolders = Array.from(folderMap.entries())
    .map(([folder, v]) => ({ folder, files: v.files, bytes: v.bytes }))
    .sort((a, b) => b.bytes - a.bytes);

  return {
    workspaceBytes,
    workspaceFiles: files.length,
    duplicateWastedBytes: dup.totalWastedBytes,
    duplicateGroupCount: dup.groups.length,
    largeFilesBytes: largeFiles.reduce((acc, f) => acc + f.sizeBytes, 0),
    largeFileCount: largeFiles.length,
    tempUploadBytes: storageStats.uploadBytes,
    tempOutputBytes: storageStats.outputBytes,
    tempFileCount: storageStats.fileCount,
    byCategory,
    topFolders,
  };
}
