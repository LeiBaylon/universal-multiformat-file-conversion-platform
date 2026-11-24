import test from 'node:test';
import assert from 'node:assert/strict';
import { computeConversionActivity, getViewDirection, resolveDefaultTargetFormat } from './converterHelpers';
import type { ConversionJob, IdentifiedFileMetadata, UserSettings } from '../shared/types';

const baseSettings: UserSettings = {
  theme: 'dark',
  defaultImageQuality: 88,
  defaultVideoCrf: 23,
  defaultAudioBitrate: '192k',
  stripMetadataByDefault: false,
  retentionMinutes: 60,
  maxUploadMb: 100,
  favoritePairs: [],
  recentFormats: [],
  defaultOutputFormats: {
    image: 'avif',
    audio: 'flac',
  },
};

const baseInfo: IdentifiedFileMetadata = {
  originalName: 'photo.png',
  sizeBytes: 1024,
  detectedExt: 'png',
  detectedMime: 'image/png',
  category: 'image',
  supportLevel: 'full',
  engine: 'imagemagick',
  compatibleOutputs: ['jpg', 'webp', 'avif', 'pdf'],
  recommendedOutputs: [{ format: 'webp', badge: 'Web', reason: 'Smallest web raster' }],
  details: {},
};

test('resolveDefaultTargetFormat prioritizes explicit preference, then category default, then recommendation', () => {
  assert.equal(resolveDefaultTargetFormat(baseInfo, baseSettings, 'jpg'), 'jpg');
  assert.equal(resolveDefaultTargetFormat(baseInfo, baseSettings), 'avif');
  assert.equal(
    resolveDefaultTargetFormat(baseInfo, { ...baseSettings, defaultOutputFormats: { image: 'heic' } }),
    'webp'
  );
});

test('computeConversionActivity summarizes completed jobs accurately', () => {
  const jobs: ConversionJob[] = [
    {
      id: '1',
      originalName: 'a.png',
      sourceExt: 'png',
      targetExt: 'webp',
      category: 'image',
      operationKind: 'conversion',
      status: 'completed',
      progress: 100,
      inputSizeBytes: 2000,
      createdAt: '2026-11-23T00:00:00.000Z',
      options: {},
    },
    {
      id: '2',
      originalName: 'b.wav',
      sourceExt: 'wav',
      targetExt: 'mp3',
      category: 'audio',
      operationKind: 'conversion',
      status: 'completed',
      progress: 100,
      inputSizeBytes: 5000,
      createdAt: '2026-11-23T00:01:00.000Z',
      options: {},
    },
    {
      id: '3',
      originalName: 'c.wav',
      sourceExt: 'wav',
      targetExt: 'mp3',
      category: 'audio',
      operationKind: 'conversion',
      status: 'failed',
      progress: 0,
      inputSizeBytes: 5000,
      createdAt: '2026-11-23T00:02:00.000Z',
      options: {},
    },
  ];
  const stats = computeConversionActivity(jobs);
  assert.equal(stats.length, 2);
  assert.equal(stats[0].category, 'audio');
  assert.equal(stats[0].sharePercent, 50);
  assert.equal(stats[1].category, 'image');
  assert.equal(stats[1].bytes, 2000);
});

test('getViewDirection computes directional sign for page slides', () => {
  assert.equal(getViewDirection(0, 3), 1);
  assert.equal(getViewDirection(4, 1), -1);
  assert.equal(getViewDirection(2, 2), 1);
});

import {
  buildCompressionPresetOptions,
  estimateArchiveFootprint,
  recommendConversionIntelligence,
} from './processingIntelligence';

test('recommendConversionIntelligence re-ranks compatible outputs by user intent', () => {
  const alphaRecs = recommendConversionIntelligence(
    {
      detectedExt: 'png',
      category: 'image',
      compatibleOutputs: ['jpg', 'bmp', 'webp', 'avif', 'pdf'],
      recommendedOutputs: [{ format: 'jpg', badge: 'Photo', reason: 'Standard photo' }],
    },
    'transparency'
  );
  assert.ok(['webp', 'avif'].includes(alphaRecs[0].format));
  assert.equal(alphaRecs[0].badge, 'Alpha Safe');

  const printRecs = recommendConversionIntelligence(
    {
      detectedExt: 'png',
      category: 'image',
      compatibleOutputs: ['jpg', 'webp', 'pdf', 'avif'],
      recommendedOutputs: [{ format: 'webp', badge: 'Web', reason: 'Web' }],
    },
    'print'
  );
  assert.equal(printRecs[0].format, 'pdf');
  assert.equal(printRecs[0].badge, 'Print Master');
});

test('buildCompressionPresetOptions builds calibrated parameters per category and goal', () => {
  const imgSmallest = buildCompressionPresetOptions('image', 'smallest');
  assert.equal(imgSmallest.quality, 58);
  assert.equal(imgSmallest.stripMetadata, true);
  assert.equal(imgSmallest.preserveDimensions, false);

  const imgTarget = buildCompressionPresetOptions('image', 'target-size', 45);
  assert.equal(imgTarget.targetSizeKb, 45);
  assert.equal(imgTarget.goal, 'target-size');

  const pdfPrinter = buildCompressionPresetOptions('document', 'best-quality');
  assert.equal(pdfPrinter.pdfPreset, 'printer');
});

test('estimateArchiveFootprint differentiates compressible text vs pre-compressed binaries', () => {
  const textEst = estimateArchiveFootprint(
    [{ name: 'notes.txt', size: 100_000 }],
    '7z',
    9
  );
  const binEst = estimateArchiveFootprint(
    [{ name: 'photo.jpg', size: 100_000 }],
    'zip',
    6
  );
  assert.ok(textEst.estimatedOutputBytes < binEst.estimatedOutputBytes);
  assert.ok(textEst.estimatedReductionPct > 40);
  const tarEst = estimateArchiveFootprint([{ name: 'notes.txt', size: 100_000 }], 'tar', 0);
  assert.equal(tarEst.estimatedReductionPct, 0);
});
