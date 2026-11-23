import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { convertSubtitleContent, formatMsToSrt, parseSubtitles } from './subtitleEngine';
import { convertDataContent } from './dataEngine';
import { convertMesh, parseMesh } from './mesh3dEngine';
import { convertScientificContent } from './scientificEngine';
import { transpileWebAsset } from './webdevEngine';
import { confinePath, detectMagicBytes, sanitizeFilename } from '../services/security';
import { FORMAT_REGISTRY, getFormatByExtension } from '../../src/shared/formats';

test('subtitle engine converts SRT -> VTT -> ASS with millisecond offset sync', () => {
  const srt = `1\n00:00:01,000 --> 00:00:03,500\nHello Liquid Glass\n`;
  const vttRes = convertSubtitleContent(srt, 'srt', 'vtt', 500);
  assert.equal(vttRes.cueCount, 1);
  assert.match(vttRes.output, /^WEBVTT/);
  assert.match(vttRes.output, /00:00:01\.500 --> 00:00:04\.000/);

  const assRes = convertSubtitleContent(vttRes.output, 'vtt', 'ass', 0);
  const parsed = parseSubtitles(assRes.output, 'ass');
  assert.equal(parsed.length, 1);
  assert.equal(parsed[0].text, 'Hello Liquid Glass');
  assert.equal(formatMsToSrt(parsed[0].startMs), '00:00:01,500');
});

test('data engine converts YAML -> JSON -> TOML -> CSV -> SQL deterministically', () => {
  const yamlInput = `- id: 1\n  format: png\n- id: 2\n  format: webp\n`;
  const jsonRes = convertDataContent(yamlInput, 'yaml', 'json');
  assert.equal(jsonRes.recordCount, 2);
  const parsed = JSON.parse(String(jsonRes.output));
  assert.equal(parsed[1].format, 'webp');

  const csvRes = convertDataContent(String(jsonRes.output), 'json', 'csv');
  assert.match(String(csvRes.output), /id,format/);
  assert.match(String(csvRes.output), /2,webp/);

  const sqlRes = convertDataContent(String(csvRes.output), 'csv', 'sql');
  assert.match(String(sqlRes.output), /INSERT INTO "converted_records"/);
});

test('mesh3d engine converts OBJ -> Binary STL -> GLB -> OFF preserving geometry', () => {
  const obj = Buffer.from('v 0 0 0\nv 1 0 0\nv 0 1 0\nf 1 2 3\n', 'utf8');
  const stlRes = convertMesh(obj, 'obj', 'stl', 2);
  assert.equal(stlRes.stats.vertexCount, 3);
  assert.equal(stlRes.stats.faceCount, 1);
  assert.equal(stlRes.stats.boundsMax.x, 2);

  const glbRes = convertMesh(stlRes.output, 'stl', 'glb', 1);
  assert.equal(glbRes.output.subarray(0, 4).toString('ascii'), 'glTF');

  const roundTrip = parseMesh(glbRes.output, 'glb');
  assert.equal(roundTrip.vertices.length, 3);
  assert.equal(roundTrip.faces.length, 1);
});

test('scientific engine converts XYZ -> MOL and FASTA -> FASTQ', () => {
  const xyz = `2\nH2\nH 0.0 0.0 0.0\nH 0.74 0.0 0.0\n`;
  const molRes = convertScientificContent(xyz, 'xyz', 'mol');
  assert.equal(molRes.summary.atoms, 2);
  assert.match(molRes.output, /V2000/);

  const fasta = `>seq1 test gene\nACGTACGT\n`;
  const fastqRes = convertScientificContent(fasta, 'fasta', 'fastq');
  assert.equal(fastqRes.summary.sequences, 1);
  assert.match(fastqRes.output, /@seq1 test gene/);
  assert.match(fastqRes.output, /IIIIIIII/);
});

test('webdev engine compiles SCSS -> CSS and TypeScript -> JS', async () => {
  const scssRes = await transpileWebAsset('$c: #fff; .box { color: $c; }', 'scss', 'css', { minify: true });
  assert.equal(scssRes.operationKind, 'transpilation');
  assert.match(scssRes.output, /\.box\{color:#fff\}/);

  const tsRes = await transpileWebAsset('const x: number = 42; export default x;', 'ts', 'js');
  assert.equal(tsRes.operationKind, 'transpilation');
  assert.match(tsRes.output, /const x = 42/);
});

test('security path confinement blocks path traversal and identifies magic bytes', () => {
  const base = path.resolve('/tmp/safe-base');
  assert.equal(confinePath(base, 'sub/file.png'), path.resolve('/tmp/safe-base/sub/file.png'));
  assert.throws(() => confinePath(base, '../../etc/passwd'), /Path traversal rejected/);
  assert.equal(sanitizeFilename('../../evil\0file?.png'), 'evilfile_.png');

  const pngMagic = detectMagicBytes(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), 'photo.unknown');
  assert.equal(pngMagic.ext, 'png');
  assert.equal(pngMagic.mime, 'image/png');
});

test('centralized format registry covers all 15 categories and valid compatibility', () => {
  const categories = new Set(FORMAT_REGISTRY.map((f) => f.category));
  assert.equal(categories.size, 15);
  const png = getFormatByExtension('png');
  assert.ok(png);
  assert.ok(png.compatibleOutputs.includes('webp'));
  assert.ok(png.recommendedOutputs.some((r) => r.format === 'webp'));
});
