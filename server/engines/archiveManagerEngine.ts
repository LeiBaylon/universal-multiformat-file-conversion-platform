import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import { execFile } from 'child_process';
import { promisify } from 'util';
import AdmZip from 'adm-zip';
import * as tar from 'tar';
import * as fzstd from 'fzstd';
import { path7za } from '7zip-bin';
import {
  ARCHIVE_BOMB_LIMITS,
  confinePath,
  ensureExecutablePermission,
  validateSafeArchiveEntry,
  WORK_DIR,
} from '../services/security';
import type { ArchiveEntryMetadata, ArchiveInspectReport } from '../../src/shared/types';

const execFileAsync = promisify(execFile);

export function getSevenZipBin(): string {
  return ensureExecutablePermission(path7za);
}

function parse7zaSltOutput(stdout: string): ArchiveEntryMetadata[] {
  const blocks = stdout.split(/\r?\n\r?\n/);
  const entries: ArchiveEntryMetadata[] = [];
  for (const block of blocks) {
    const lines = block.split(/\r?\n/);
    const map: Record<string, string> = {};
    for (const line of lines) {
      const idx = line.indexOf(' = ');
      if (idx > 0) {
        map[line.slice(0, idx).trim()] = line.slice(idx + 3).trim();
      }
    }
    if (!map.Path) continue;
    // Skip root archive summary block
    if (map.Type && !map.Size && !map.Attributes && !map.Folder && !map.Modified) continue;
    const isDir = map.Folder === '+' || String(map.Attributes || '').startsWith('D');
    entries.push({
      name: map.Path,
      size: parseInt(map.Size || '0', 10) || 0,
      compressedSize: map['Packed Size'] ? parseInt(map['Packed Size'], 10) || undefined : undefined,
      isDirectory: isDir,
      encrypted: map.Encrypted === '+',
      crc: map.CRC || undefined,
      modifiedAt: map.Modified || undefined,
    });
  }
  return entries;
}

export async function inspectArchiveFull(
  filePath: string,
  ext: string,
  password?: string
): Promise<ArchiveInspectReport> {
  const format = ext.toLowerCase();
  const stat = fs.statSync(filePath);
  const bin7z = getSevenZipBin();
  let entries: ArchiveEntryMetadata[] = [];
  let engine = 'Archive Inspector';
  let hasEncryptedEntries = false;

  if (format === 'zip') {
    // Try AdmZip for fast listing, fallback to 7za if encrypted headers / special ZIP
    try {
      const zip = new AdmZip(filePath);
      entries = zip.getEntries().map((e) => {
        const encrypted = Boolean((e.header.flags & 0x01) !== 0);
        if (encrypted) hasEncryptedEntries = true;
        return {
          name: e.entryName,
          size: e.header.size,
          compressedSize: e.header.compressedSize,
          isDirectory: e.isDirectory,
          encrypted,
          crc: e.header.crc ? e.header.crc.toString(16).toUpperCase().padStart(8, '0') : undefined,
          modifiedAt: e.header.time ? new Date(e.header.time).toISOString() : undefined,
        };
      });
      engine = 'AdmZip + 7-Zip AES';
    } catch {
      const args = ['l', '-slt', ...(password ? [`-p${password}`] : ['-p-']), filePath];
      const { stdout } = await execFileAsync(bin7z, args, { timeout: 25000 });
      entries = parse7zaSltOutput(stdout);
      hasEncryptedEntries = entries.some((e) => e.encrypted);
      engine = '7-Zip (p7zip)';
    }
  } else if (['7z', 'cab', 'xz', 'bz2', 'gz', 'lzma'].includes(format)) {
    const args = ['l', '-slt', ...(password ? [`-p${password}`] : ['-p-']), filePath];
    const { stdout } = await execFileAsync(bin7z, args, { timeout: 30000 });
    entries = parse7zaSltOutput(stdout);
    hasEncryptedEntries = entries.some((e) => e.encrypted);
    engine = '7-Zip (p7zip)';
  } else if (format === 'tar' || format === 'tgz') {
    const flag = format === 'tgz' ? '-tzvf' : '-tvf';
    const { stdout } = await execFileAsync('tar', [flag, filePath], { timeout: 25000 });
    entries = stdout
      .split('\n')
      .filter(Boolean)
      .map((line) => {
        const parts = line.trim().split(/\s+/);
        const name = parts.slice(5).join(' ') || parts[parts.length - 1] || 'entry';
        return {
          name,
          size: parseInt(parts[2] || '0', 10) || 0,
          isDirectory: line.startsWith('d'),
        };
      });
    engine = 'GNU tar';
  } else if (format === 'zst') {
    const rawZst = fs.readFileSync(filePath);
    const decompressed = Buffer.from(fzstd.decompress(new Uint8Array(rawZst)));
    const tmpTar = path.join(WORK_DIR, `zst_tmp_${Date.now()}.tar`);
    fs.writeFileSync(tmpTar, decompressed);
    try {
      try {
        const { stdout } = await execFileAsync('tar', ['-tvf', tmpTar], { timeout: 20000 });
        entries = stdout
          .split('\n')
          .filter(Boolean)
          .map((line) => {
            const parts = line.trim().split(/\s+/);
            return {
              name: parts.slice(5).join(' ') || parts[parts.length - 1] || 'entry',
              size: parseInt(parts[2] || '0', 10) || 0,
              isDirectory: line.startsWith('d'),
            };
          });
        engine = 'fzstd + GNU tar';
      } catch {
        const baseName = path.basename(filePath).replace(/\.zst$/i, '') || 'payload';
        entries = [{ name: baseName, size: decompressed.length, compressedSize: stat.size, isDirectory: false }];
        engine = 'fzstd';
      }
    } finally {
      if (fs.existsSync(tmpTar)) fs.rmSync(tmpTar, { force: true });
    }
  } else if (format === 'deb') {
    const { stdout } = await execFileAsync('dpkg-deb', ['-c', filePath], { timeout: 25000 });
    entries = stdout
      .split('\n')
      .filter(Boolean)
      .map((line) => {
        const parts = line.trim().split(/\s+/);
        return {
          name: parts.slice(5).join(' ') || parts[parts.length - 1] || 'entry',
          size: parseInt(parts[2] || '0', 10) || 0,
          isDirectory: line.startsWith('d'),
        };
      });
    engine = 'dpkg-deb';
  } else {
    throw new Error(`Archive inspection for .${format.toUpperCase()} requires an external adapter not installed in this environment.`);
  }

  const fileEntries = entries.filter((e) => !e.isDirectory);
  const totalUncompressedBytes = fileEntries.reduce((acc, e) => acc + Math.max(0, e.size), 0);
  const compressionRatioPct =
    totalUncompressedBytes > 0
      ? Math.max(0, Number((((totalUncompressedBytes - stat.size) / totalUncompressedBytes) * 100).toFixed(1)))
      : 0;

  // Duplicate detection by basename + size (or CRC when present)
  const dupBuckets = new Map<string, { names: string[]; size: number }>();
  for (const e of fileEntries) {
    if (e.size === 0) continue;
    const key = e.crc ? `${e.size}:${e.crc}` : `${path.basename(e.name)}:${e.size}`;
    const prev = dupBuckets.get(key) || { names: [], size: e.size };
    prev.names.push(e.name);
    dupBuckets.set(key, prev);
  }
  const duplicateGroups = Array.from(dupBuckets.entries())
    .filter(([, g]) => g.names.length > 1)
    .map(([signature, g]) => ({ signature, names: g.names, size: g.size }));

  // Check archive bomb & path traversal hazards upfront
  let bombRiskWarning: string | undefined;
  if (entries.length > ARCHIVE_BOMB_LIMITS.maxEntries) {
    bombRiskWarning = `High entry count (${entries.length}) exceeds safe extraction cap (${ARCHIVE_BOMB_LIMITS.maxEntries}).`;
  } else if (totalUncompressedBytes > ARCHIVE_BOMB_LIMITS.maxTotalUncompressedBytes) {
    bombRiskWarning = `Expanded payload exceeds 512 MB safe extraction limit.`;
  } else if (stat.size > 1024 && totalUncompressedBytes / stat.size > ARCHIVE_BOMB_LIMITS.maxCompressionRatio) {
    bombRiskWarning = `Extreme compression ratio (${Math.round(totalUncompressedBytes / stat.size)}:1) flagged by archive bomb guard.`;
  } else if (entries.some((e) => e.name.includes('..') || path.isAbsolute(e.name))) {
    bombRiskWarning = 'Path traversal sequence (../ or absolute path) detected in archive headers — extraction will block unsafe entries.';
  }

  return {
    format,
    engine,
    fileSizeBytes: stat.size,
    entryCount: entries.length,
    totalUncompressedBytes,
    compressionRatioPct,
    hasEncryptedEntries,
    duplicateGroups,
    bombRiskWarning,
    entries: entries.slice(0, 600),
  };
}

export async function testArchiveIntegrity(
  filePath: string,
  ext: string,
  password?: string
): Promise<{ ok: boolean; testedEntries: number; message: string }> {
  const format = ext.toLowerCase();
  const bin7z = getSevenZipBin();

  if (['zip', '7z', 'cab', 'xz', 'bz2', 'gz', 'lzma'].includes(format)) {
    const args = ['t', '-y', ...(password ? [`-p${password}`] : ['-p-']), filePath];
    const { stdout } = await execFileAsync(bin7z, args, { timeout: 60000 });
    const countMatch = stdout.match(/Files:\s+(\d+)/i);
    const everythingOk = /Everything is Ok/i.test(stdout);
    return {
      ok: everythingOk,
      testedEntries: countMatch ? Number(countMatch[1]) : 1,
      message: everythingOk ? 'Integrity check passed: CRC & container headers verified.' : 'Archive verification warning.',
    };
  }

  if (format === 'tar' || format === 'tgz') {
    const report = await inspectArchiveFull(filePath, format);
    return {
      ok: true,
      testedEntries: report.entryCount,
      message: `TAR index stream validated (${report.entryCount} entries).`,
    };
  }

  if (format === 'zst') {
    const raw = fs.readFileSync(filePath);
    const out = fzstd.decompress(new Uint8Array(raw));
    return {
      ok: out.length >= 0,
      testedEntries: 1,
      message: `Zstandard frame verified (${out.length} decompressed bytes).`,
    };
  }

  if (format === 'deb') {
    const report = await inspectArchiveFull(filePath, 'deb');
    return {
      ok: true,
      testedEntries: report.entryCount,
      message: `Debian ar container verified (${report.entryCount} entries).`,
    };
  }

  throw new Error(`Integrity check for .${format.toUpperCase()} is unavailable in this environment.`);
}

export async function createArchiveAdvanced(params: {
  fileEntries: { path: string; originalName: string }[];
  outputPath: string;
  format: string;
  level: number;
  algorithm?: string;
  password?: string;
  splitSizeMb?: number;
  workDir: string;
}): Promise<{
  note: string;
  engineUsed: string;
  volumeFiles?: { name: string; path: string; sizeBytes: number }[];
}> {
  const { fileEntries, outputPath, format, level, algorithm, password, splitSizeMb, workDir } = params;
  const fmt = format.toLowerCase();
  const lvl = Math.max(0, Math.min(9, level));
  const stageDir = path.join(workDir, `arc_create_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`);
  fs.mkdirSync(stageDir, { recursive: true });

  try {
    const usedNames = new Set<string>();
    for (const f of fileEntries) {
      const safeName = path.basename(f.originalName);
      let candidate = safeName;
      let n = 1;
      while (usedNames.has(candidate)) {
        const ext = path.extname(safeName);
        const stem = path.basename(safeName, ext);
        candidate = `${stem}_${n++}${ext}`;
      }
      usedNames.add(candidate);
      fs.copyFileSync(f.path, confinePath(stageDir, candidate));
    }

    const bin7z = getSevenZipBin();

    // Multi-volume split archive via 7-Zip
    if (splitSizeMb && splitSizeMb > 0 && ['zip', '7z'].includes(fmt)) {
      const splitDir = `${outputPath}.parts`;
      fs.mkdirSync(splitDir, { recursive: true });
      const basePartPath = path.join(splitDir, path.basename(outputPath));
      const args = [
        'a',
        '-y',
        `-t${fmt}`,
        `-mx=${lvl}`,
        `-v${Math.max(1, Math.round(splitSizeMb))}m`,
        ...(password ? [`-p${password}`, ...(fmt === 'zip' ? ['-mem=AES256'] : ['-mhe=on'])] : []),
        basePartPath,
        '.',
      ];
      await execFileAsync(bin7z, args, { cwd: stageDir, timeout: 120000 });
      const parts = fs
        .readdirSync(splitDir)
        .sort()
        .map((name) => {
          const full = path.join(splitDir, name);
          return { name, path: full, sizeBytes: fs.statSync(full).size };
        });

      // Also write combined ZIP wrapper at outputPath so standard job download always works cleanly
      const bundleZip = new AdmZip();
      for (const p of parts) {
        bundleZip.addLocalFile(p.path, '', p.name);
      }
      bundleZip.writeZip(outputPath);

      return {
        note: `Created split ${fmt.toUpperCase()} archive across ${parts.length} volume part(s) (${splitSizeMb} MB max each)${password ? ' with AES-256 encryption' : ''}.`,
        engineUsed: '7-Zip Split Volume Engine',
        volumeFiles: parts,
      };
    }

    // Encrypted ZIP (AES-256 via 7-Zip)
    if (fmt === 'zip' && password) {
      await execFileAsync(
        bin7z,
        ['a', '-y', '-tzip', `-mx=${lvl}`, '-mem=AES256', `-p${password}`, outputPath, '.'],
        { cwd: stageDir, timeout: 120000 }
      );
      return {
        note: `Created AES-256 encrypted ZIP archive via 7-Zip (${fileEntries.length} file(s), level ${lvl}).`,
        engineUsed: '7-Zip (AES-256)',
      };
    }

    if (fmt === '7z') {
      const methodFlag =
        algorithm === 'ppmd' ? '-m0=PPMd' : algorithm === 'bzip2' ? '-m0=BZip2' : algorithm === 'lzma' ? '-m0=LZMA' : '-m0=LZMA2';
      const args = [
        'a',
        '-y',
        '-t7z',
        `-mx=${lvl}`,
        methodFlag,
        ...(password ? [`-p${password}`, '-mhe=on'] : []),
        outputPath,
        '.',
      ];
      await execFileAsync(bin7z, args, { cwd: stageDir, timeout: 120000 });
      return {
        note: `Created 7Z archive (${algorithm?.toUpperCase() || 'LZMA2'}, level ${lvl})${password ? ' with AES-256 header encryption' : ''}.`,
        engineUsed: '7-Zip (p7zip)',
      };
    }

    if (fmt === 'zip') {
      await execFileAsync(bin7z, ['a', '-y', '-tzip', `-mx=${lvl}`, outputPath, '.'], {
        cwd: stageDir,
        timeout: 120000,
      });
      return {
        note: `Created standard ZIP archive (${fileEntries.length} file(s), level ${lvl}).`,
        engineUsed: '7-Zip (Deflate)',
      };
    }

    const stagedItems = fs.readdirSync(stageDir);
    if (fmt === 'tar') {
      await tar.c({ file: outputPath, cwd: stageDir }, stagedItems);
      return { note: `Created uncompressed TAR container (${fileEntries.length} file(s)).`, engineUsed: 'node-tar' };
    }

    if (fmt === 'tgz' || fmt === 'gz') {
      await tar.c({ gzip: { level: lvl }, file: outputPath, cwd: stageDir }, stagedItems);
      return { note: `Created Gzip TAR (.${fmt}) archive (level ${lvl}).`, engineUsed: 'node-tar (gzip)' };
    }

    if (fmt === 'bz2') {
      await execFileAsync('tar', ['-cjf', outputPath, '-C', stageDir, ...stagedItems], { timeout: 90000 });
      return { note: `Created BZip2 TAR archive (${fileEntries.length} file(s)).`, engineUsed: 'GNU tar + bzip2' };
    }

    if (fmt === 'xz' || fmt === 'lzma') {
      await execFileAsync('tar', ['-cJf', outputPath, '-C', stageDir, ...stagedItems], { timeout: 90000 });
      return { note: `Created XZ/LZMA TAR archive (${fileEntries.length} file(s)).`, engineUsed: 'GNU tar + xz' };
    }

    throw new Error(`Archive creation for .${fmt.toUpperCase()} is unavailable in this environment.`);
  } finally {
    if (fs.existsSync(stageDir)) fs.rmSync(stageDir, { recursive: true, force: true });
  }
}

export async function safeExtractArchiveToDir(
  inputPath: string,
  ext: string,
  extractDir: string,
  password?: string,
  selectedEntries?: string[]
): Promise<{ extractedFiles: string[] }> {
  fs.mkdirSync(extractDir, { recursive: true });
  const format = ext.toLowerCase();
  const report = await inspectArchiveFull(inputPath, format, password);

  // Enforce entry count & bomb limits across entire archive or selected set
  const targetList = selectedEntries && selectedEntries.length > 0
    ? report.entries.filter((e) => selectedEntries.includes(e.name))
    : report.entries;

  let cumulativeBytes = 0;
  let count = 0;
  for (const e of targetList) {
    count++;
    const check = validateSafeArchiveEntry({
      baseDir: extractDir,
      entryName: e.name,
      uncompressedSize: e.size,
      compressedSize: e.compressedSize,
      cumulativeBytes,
      entryCount: count,
    });
    cumulativeBytes = check.nextCumulativeBytes;
  }

  const bin7z = getSevenZipBin();

  if (['zip', '7z', 'cab', 'xz', 'bz2', 'gz', 'lzma'].includes(format)) {
    const args = ['x', '-y', ...(password ? [`-p${password}`] : ['-p-']), `-o${extractDir}`, inputPath];
    if (selectedEntries && selectedEntries.length > 0) {
      args.push(...selectedEntries);
    }
    try {
      await execFileAsync(bin7z, args, { timeout: 90000 });
    } catch (err) {
      // Single-stream .gz fallback
      if (format === 'gz') {
        const gunzipped = zlib.gunzipSync(fs.readFileSync(inputPath));
        const base = path.basename(inputPath).replace(/\.gz$/i, '') || 'extracted_file';
        fs.writeFileSync(confinePath(extractDir, base), gunzipped);
      } else {
        throw err;
      }
    }
  } else if (format === 'tar' || format === 'tgz') {
    await tar.x({
      file: inputPath,
      cwd: extractDir,
      filter: (entryPath) => {
        if (entryPath.includes('..') || path.isAbsolute(entryPath)) return false;
        if (selectedEntries && selectedEntries.length > 0) {
          return selectedEntries.some((sel) => entryPath === sel || entryPath.startsWith(`${sel}/`));
        }
        return true;
      },
    });
  } else if (format === 'zst') {
    const decompressed = Buffer.from(fzstd.decompress(new Uint8Array(fs.readFileSync(inputPath))));
    const tmpTar = path.join(WORK_DIR, `zst_ext_${Date.now()}.tar`);
    fs.writeFileSync(tmpTar, decompressed);
    try {
      try {
        await tar.x({
          file: tmpTar,
          cwd: extractDir,
          filter: (p) => !p.includes('..') && !path.isAbsolute(p),
        });
      } catch {
        const base = path.basename(inputPath).replace(/\.zst$/i, '') || 'extracted_zst.bin';
        fs.writeFileSync(confinePath(extractDir, base), decompressed);
      }
    } finally {
      if (fs.existsSync(tmpTar)) fs.rmSync(tmpTar, { force: true });
    }
  } else if (format === 'deb') {
    await execFileAsync('dpkg-deb', ['-x', inputPath, extractDir], { timeout: 60000 });
  } else {
    throw new Error(`Archive extraction for .${format.toUpperCase()} requires an external adapter.`);
  }

  // Walk extracted dir safely
  const extractedFiles: string[] = [];
  const walk = (dir: string, rel = '') => {
    for (const item of fs.readdirSync(dir)) {
      const full = path.join(dir, item);
      const nextRel = rel ? `${rel}/${item}` : item;
      if (fs.statSync(full).isDirectory()) walk(full, nextRel);
      else extractedFiles.push(nextRel);
    }
  };
  walk(extractDir);
  return { extractedFiles };
}

export async function readSingleArchiveEntryBuffer(
  inputPath: string,
  ext: string,
  entryName: string,
  password?: string
): Promise<Buffer> {
  if (entryName.includes('..') || path.isAbsolute(entryName)) {
    throw new Error('Rejected unsafe archive entry path.');
  }
  const tmpDir = path.join(WORK_DIR, `entry_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`);
  try {
    await safeExtractArchiveToDir(inputPath, ext, tmpDir, password, [entryName]);
    const target = confinePath(tmpDir, entryName);
    if (!fs.existsSync(target) || fs.statSync(target).isDirectory()) {
      throw new Error(`Entry "${entryName}" not found or is a directory.`);
    }
    return fs.readFileSync(target);
  } finally {
    if (fs.existsSync(tmpDir)) fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

export async function modifyArchive(params: {
  inputPath: string;
  ext: string;
  outputPath: string;
  action: 'add' | 'delete' | 'rename';
  deleteEntries?: string[];
  renameFrom?: string;
  renameTo?: string;
  addFiles?: { path: string; originalName: string }[];
  password?: string;
}): Promise<{ note: string; report: ArchiveInspectReport }> {
  const { inputPath, ext, outputPath, action, deleteEntries, renameFrom, renameTo, addFiles, password } = params;
  const format = ext.toLowerCase();
  if (format !== 'zip' && format !== '7z') {
    throw new Error(`In-place modification is supported for ZIP and 7Z archives (received .${format.toUpperCase()}).`);
  }

  fs.copyFileSync(inputPath, outputPath);
  const bin7z = getSevenZipBin();
  const pwdArgs = password ? [`-p${password}`] : [];

  if (action === 'delete') {
    if (!deleteEntries || deleteEntries.length === 0) {
      throw new Error('Select at least one archive entry to delete.');
    }
    await execFileAsync(bin7z, ['d', '-y', ...pwdArgs, outputPath, ...deleteEntries], { timeout: 60000 });
    const report = await inspectArchiveFull(outputPath, format, password);
    return { note: `Deleted ${deleteEntries.length} entry(s) from ${format.toUpperCase()}.`, report };
  }

  if (action === 'rename') {
    if (!renameFrom || !renameTo || renameTo.includes('..') || path.isAbsolute(renameTo)) {
      throw new Error('Provide valid, relative source and destination entry paths.');
    }
    if (format === '7z') {
      await execFileAsync(bin7z, ['rn', '-y', ...pwdArgs, outputPath, renameFrom, renameTo], { timeout: 60000 });
    } else {
      // Reliable rename via extract & repack for ZIP
      const tmpDir = path.join(WORK_DIR, `rn_${Date.now()}`);
      try {
        await safeExtractArchiveToDir(outputPath, 'zip', tmpDir, password);
        const src = confinePath(tmpDir, renameFrom);
        const dst = confinePath(tmpDir, renameTo);
        if (!fs.existsSync(src)) throw new Error(`Entry "${renameFrom}" not found.`);
        fs.mkdirSync(path.dirname(dst), { recursive: true });
        fs.renameSync(src, dst);
        fs.rmSync(outputPath, { force: true });
        await execFileAsync(bin7z, ['a', '-y', '-tzip', ...pwdArgs, outputPath, '.'], { cwd: tmpDir, timeout: 60000 });
      } finally {
        if (fs.existsSync(tmpDir)) fs.rmSync(tmpDir, { recursive: true, force: true });
      }
    }
    const report = await inspectArchiveFull(outputPath, format, password);
    return { note: `Renamed "${renameFrom}" → "${renameTo}".`, report };
  }

  // Add files
  if (!addFiles || addFiles.length === 0) {
    throw new Error('Upload at least one file to add into the archive.');
  }
  const addDir = path.join(WORK_DIR, `add_${Date.now()}`);
  fs.mkdirSync(addDir, { recursive: true });
  try {
    for (const f of addFiles) {
      fs.copyFileSync(f.path, confinePath(addDir, path.basename(f.originalName)));
    }
    await execFileAsync(bin7z, ['a', '-y', ...pwdArgs, outputPath, '.'], { cwd: addDir, timeout: 60000 });
    const report = await inspectArchiveFull(outputPath, format, password);
    return { note: `Added ${addFiles.length} file(s) into ${format.toUpperCase()}.`, report };
  } finally {
    if (fs.existsSync(addDir)) fs.rmSync(addDir, { recursive: true, force: true });
  }
}

export async function compareArchives(
  pathA: string,
  extA: string,
  pathB: string,
  extB: string,
  passA?: string,
  passB?: string
): Promise<{
  summary: { onlyInA: number; onlyInB: number; sizeChanged: number; identical: number };
  onlyInA: ArchiveEntryMetadata[];
  onlyInB: ArchiveEntryMetadata[];
  sizeChanged: { name: string; sizeA: number; sizeB: number }[];
}> {
  const [repA, repB] = await Promise.all([
    inspectArchiveFull(pathA, extA, passA),
    inspectArchiveFull(pathB, extB, passB),
  ]);

  const mapA = new Map<string, ArchiveEntryMetadata>();
  for (const e of repA.entries.filter((x) => !x.isDirectory)) mapA.set(e.name, e);
  const mapB = new Map<string, ArchiveEntryMetadata>();
  for (const e of repB.entries.filter((x) => !x.isDirectory)) mapB.set(e.name, e);

  const onlyInA: ArchiveEntryMetadata[] = [];
  const onlyInB: ArchiveEntryMetadata[] = [];
  const sizeChanged: { name: string; sizeA: number; sizeB: number }[] = [];
  let identical = 0;

  for (const [name, entryA] of mapA.entries()) {
    const entryB = mapB.get(name);
    if (!entryB) onlyInA.push(entryA);
    else if (entryA.size !== entryB.size || (entryA.crc && entryB.crc && entryA.crc !== entryB.crc)) {
      sizeChanged.push({ name, sizeA: entryA.size, sizeB: entryB.size });
    } else {
      identical++;
    }
  }
  for (const [name, entryB] of mapB.entries()) {
    if (!mapA.has(name)) onlyInB.push(entryB);
  }

  return {
    summary: {
      onlyInA: onlyInA.length,
      onlyInB: onlyInB.length,
      sizeChanged: sizeChanged.length,
      identical,
    },
    onlyInA,
    onlyInB,
    sizeChanged,
  };
}
