import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';
import sharp from 'sharp';
import { analyzeCutoutAlpha, generateBgSampleBuffer, removeImageBackground } from './bgRemovalEngine';
import { compressFile } from './compressorEngine';
import {
  compareArchives,
  createArchiveAdvanced,
  inspectArchiveFull,
  modifyArchive,
  safeExtractArchiveToDir,
  testArchiveIntegrity,
} from './archiveManagerEngine';
import { renderTextToPdfBuffer } from './documentEngine';
import { validateSafeArchiveEntry, WORK_DIR } from '../services/security';
import type { BgRemovalOptions } from '../../src/shared/types';

const BASE_BG_OPTIONS: BgRemovalOptions = {
  modelPrecision: 'fast',
  outputFormat: 'png',
  quality: 92,
  featherRadius: 1,
  edgeRefinement: 0,
  backgroundMode: 'transparent',
  backgroundColor: '#ffffff',
  gradientFrom: '#141414',
  gradientTo: '#e4e4e7',
  gradientAngle: 135,
  backgroundBlurRadius: 18,
  shadowEnabled: false,
  shadowOpacity: 0.35,
  shadowBlur: 14,
  subjectScale: 1,
  offsetX: 0,
  offsetY: 0,
  cropAspect: 'original',
  brightness: 1,
  contrast: 1,
  saturation: 1,
};

test('bgRemovalEngine isolates foreground subject with real RGBA transparency and solid backdrop compositing', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aether-bgr-test-'));
  try {
    const sample = await generateBgSampleBuffer('badge');
    const inPath = path.join(tmpDir, 'badge.png');
    const outTransparent = path.join(tmpDir, 'cutout.png');
    const outSolidShadow = path.join(tmpDir, 'solid_shadow.png');
    fs.writeFileSync(inPath, sample.buffer);

    const res = await removeImageBackground(inPath, outTransparent, BASE_BG_OPTIONS);
    assert.ok(fs.existsSync(outTransparent));
    assert.ok(res.durationMs >= 0);

    const meta = await sharp(outTransparent).metadata();
    assert.equal(meta.channels, 4);
    assert.ok((meta.width || 0) >= 700);

    // Verify genuine background transparency + opaque foreground coverage
    const raw = await sharp(outTransparent).ensureAlpha().raw().toBuffer();
    let transparentCount = 0;
    let opaqueCount = 0;
    for (let i = 3; i < raw.length; i += 4) {
      if (raw[i] < 16) transparentCount++;
      else if (raw[i] > 235) opaqueCount++;
    }
    assert.ok(transparentCount > 1000, 'Expected substantial transparent background pixels');
    assert.ok(opaqueCount > 1000, 'Expected substantial opaque foreground subject pixels');
    assert.ok(res.analysis.foregroundCoveragePct > 5 && res.analysis.foregroundCoveragePct < 95);

    const alphaAnalysis = await analyzeCutoutAlpha(res.cutoutBuffer);
    assert.equal(alphaAnalysis.width, meta.width);

    // Verify solid + drop shadow compositing
    await removeImageBackground(inPath, outSolidShadow, {
      ...BASE_BG_OPTIONS,
      backgroundMode: 'solid',
      backgroundColor: '#ffffff',
      shadowEnabled: true,
    });
    assert.ok(fs.statSync(outSolidShadow).size > 5000);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('compressorEngine performs honest target-size PNG solving and Ghostscript PDF compression', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aether-cmp-test-'));
  try {
    const sample = await generateBgSampleBuffer('product');
    const pngIn = path.join(tmpDir, 'product.png');
    const pngOut = path.join(tmpDir, 'product_target.png');
    fs.writeFileSync(pngIn, sample.buffer);

    const targetKb = 22;
    const pngRes = await compressFile(pngIn, pngOut, 'png', 'image', {
      goal: 'target-size',
      targetSizeKb: targetKb,
      stripMetadata: true,
    });
    assert.ok(fs.existsSync(pngOut));
    assert.equal(pngRes.stats.originalBytes, sample.buffer.length);
    assert.equal(pngRes.stats.outputBytes, fs.statSync(pngOut).size);
    assert.ok(pngRes.stats.outputBytes < pngRes.stats.originalBytes);
    assert.ok(pngRes.stats.outputBytes <= targetKb * 1024, 'Expected target-size PNG budget to be satisfied');
    assert.equal(pngRes.stats.targetAchieved, true);

    // PDF Ghostscript compression
    const pdfBuf = await renderTextToPdfBuffer(
      'Test PDF',
      'Aether Convert Ecosystem Verification\n'.repeat(40)
    );
    const pdfIn = path.join(tmpDir, 'doc.pdf');
    const pdfOut = path.join(tmpDir, 'doc_min.pdf');
    fs.writeFileSync(pdfIn, pdfBuf);

    const pdfRes = await compressFile(pdfIn, pdfOut, 'pdf', 'document', {
      goal: 'smallest',
      pdfPreset: 'screen',
    });
    assert.ok(fs.existsSync(pdfOut));
    assert.equal(pdfRes.stats.originalBytes, pdfBuf.length);
    assert.equal(pdfRes.stats.outputBytes, fs.statSync(pdfOut).size);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('archiveManagerEngine creates, inspects, verifies integrity, modifies, compares, and enforces Zip-Slip & bomb security', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aether-arc-test-'));
  try {
    const f1 = path.join(tmpDir, 'alpha.txt');
    const f2 = path.join(tmpDir, 'beta.json');
    const f3 = path.join(tmpDir, 'gamma.txt');
    fs.writeFileSync(f1, 'Hello Archive World\n'.repeat(30));
    fs.writeFileSync(f2, JSON.stringify({ engine: '7za', aes: 256 }));
    fs.writeFileSync(f3, 'Extra file to add\n'.repeat(10));

    // 1. Create & inspect 7Z
    const out7z = path.join(tmpDir, 'bundle.7z');
    await createArchiveAdvanced({
      fileEntries: [
        { path: f1, originalName: 'alpha.txt' },
        { path: f2, originalName: 'beta.json' },
      ],
      outputPath: out7z,
      format: '7z',
      level: 7,
      algorithm: 'lzma2',
      workDir: WORK_DIR,
    });
    const rep7z = await inspectArchiveFull(out7z, '7z');
    assert.equal(rep7z.entryCount, 2);
    const integrity7z = await testArchiveIntegrity(out7z, '7z');
    assert.equal(integrity7z.ok, true);

    // 2. Create AES-256 encrypted ZIP and verify inspection + extraction
    const encZip = path.join(tmpDir, 'secret.zip');
    await createArchiveAdvanced({
      fileEntries: [
        { path: f1, originalName: 'alpha.txt' },
        { path: f2, originalName: 'beta.json' },
      ],
      outputPath: encZip,
      format: 'zip',
      level: 6,
      password: 'aether-secret-pass',
      workDir: WORK_DIR,
    });
    const repEnc = await inspectArchiveFull(encZip, 'zip', 'aether-secret-pass');
    assert.equal(repEnc.hasEncryptedEntries, true);
    assert.equal(repEnc.entryCount, 2);

    const extractOut = path.join(tmpDir, 'extracted');
    await safeExtractArchiveToDir(encZip, 'zip', extractOut, 'aether-secret-pass', ['beta.json']);
    assert.ok(fs.existsSync(path.join(extractOut, 'beta.json')));
    assert.equal(fs.existsSync(path.join(extractOut, 'alpha.txt')), false);

    // 3. Modify (add, rename, delete) and Compare
    const out7zAdded = path.join(tmpDir, 'bundle_added.7z');
    const modAdd = await modifyArchive({
      inputPath: out7z,
      ext: '7z',
      outputPath: out7zAdded,
      action: 'add',
      addFiles: [{ path: f3, originalName: 'gamma.txt' }],
    });
    assert.equal(modAdd.report.entryCount, 3);

    const out7zRenamed = path.join(tmpDir, 'bundle_renamed.7z');
    const modRen = await modifyArchive({
      inputPath: out7zAdded,
      ext: '7z',
      outputPath: out7zRenamed,
      action: 'rename',
      renameFrom: 'gamma.txt',
      renameTo: 'renamed_gamma.txt',
    });
    assert.ok(modRen.report.entries.some((e) => e.name === 'renamed_gamma.txt'));

    const diff = await compareArchives(out7z, '7z', out7zAdded, '7z');
    assert.equal(diff.summary.identical, 2);
    assert.equal(diff.summary.onlyInB, 1);
    assert.equal(diff.onlyInB[0].name, 'gamma.txt');

    // 4. Zip-Slip and Archive Bomb security assertions
    assert.throws(
      () =>
        validateSafeArchiveEntry({
          baseDir: tmpDir,
          entryName: '../../etc/passwd',
          uncompressedSize: 100,
          compressedSize: 10,
          cumulativeBytes: 0,
          entryCount: 1,
        }),
      /Security rejection:/
    );
    assert.throws(
      () =>
        validateSafeArchiveEntry({
          baseDir: tmpDir,
          entryName: '/etc/shadow',
          uncompressedSize: 100,
          compressedSize: 10,
          cumulativeBytes: 0,
          entryCount: 1,
        }),
      /Security rejection:/
    );
    assert.throws(
      () =>
        validateSafeArchiveEntry({
          baseDir: tmpDir,
          entryName: 'bomb.bin',
          uncompressedSize: 200 * 1024 * 1024,
          compressedSize: 512 * 1024,
          cumulativeBytes: 0,
          entryCount: 1,
        }),
      /Archive bomb guard triggered:/
    );
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('workspaceService seeds demo files, detects exact SHA-256 duplicates, previews/applies renames & organization, and deletes safely', async () => {
  const {
    applyWorkspaceOrganize,
    applyWorkspaceRename,
    deleteWorkspacePaths,
    previewWorkspaceOrganize,
    previewWorkspaceRename,
    scanWorkspaceDuplicates,
    seedWorkspaceDemoFiles,
  } = await import('../services/workspaceService');
  const { DEFAULT_RENAME_RULES } = await import('../../src/utils/batchRenamer');

  try {
    const tree = await seedWorkspaceDemoFiles();
    assert.ok(tree.totalFiles >= 8);
    assert.ok(tree.totalFolders >= 4);

    // Duplicate detection on demo workspace
    const dup = scanWorkspaceDuplicates();
    assert.ok(dup.groups.length >= 2, 'Expected at least 2 duplicate pairs in seeded demo workspace');
    assert.ok(dup.totalWastedBytes > 0);

    // Rename preview + apply
    const renamePreview = previewWorkspaceRename(['Incoming/watch_product.png'], {
      ...DEFAULT_RENAME_RULES,
      prefix: 'hero_',
    });
    assert.equal(renamePreview.conflictCount, 0);
    assert.equal(renamePreview.changedCount, 1);
    assert.equal(renamePreview.plan[0].proposedRelPath, 'Incoming/hero_watch_product.png');

    const renamed = applyWorkspaceRename([
      {
        originalRelPath: renamePreview.plan[0].originalRelPath,
        proposedRelPath: renamePreview.plan[0].proposedRelPath,
      },
    ]);
    assert.equal(renamed.renamedCount, 1);

    // Organize preview + apply
    const orgPreview = previewWorkspaceOrganize(['Incoming/hero_watch_product.png'], 'by-category', 'Organized_Test');
    assert.equal(orgPreview.conflictCount, 0);
    assert.equal(orgPreview.plan[0].proposedRelPath, 'Organized_Test/Images/hero_watch_product.png');

    const orgApplied = applyWorkspaceOrganize([
      {
        originalRelPath: orgPreview.plan[0].originalRelPath,
        proposedRelPath: orgPreview.plan[0].proposedRelPath,
      },
    ]);
    assert.equal(orgApplied.movedCount, 1);

    // Clean up test folder deletion
    const del = deleteWorkspacePaths(['Organized_Test', 'Incoming', 'Studio_Photos', 'Documents', 'Archives']);
    assert.ok(del.deletedCount >= 5);
  } finally {
    deleteWorkspacePaths(['Organized_Test', 'Incoming', 'Studio_Photos', 'Documents', 'Archives']);
  }
});
