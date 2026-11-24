import test from 'node:test';
import assert from 'node:assert/strict';
import {
  analyzeWorkflowCompatibility,
  createWorkflowStep,
  moveWorkflowStep,
  reorderWorkflowSteps,
} from './workflowEngine';
import { computeBatchRenamePlan, DEFAULT_RENAME_RULES } from './batchRenamer';
import { computeOrganizationPlan } from './smartOrganizer';

test('workflowEngine reorders steps deterministically', () => {
  const s1 = createWorkflowStep('bg-remover', '1');
  const s2 = createWorkflowStep('resize', '2');
  const s3 = createWorkflowStep('compress', '3');

  const movedDown = moveWorkflowStep([s1, s2, s3], 0, 'down');
  assert.deepEqual(
    movedDown.map((s) => s.id),
    [s2.id, s1.id, s3.id]
  );

  const dragged = reorderWorkflowSteps(movedDown, 2, 0);
  assert.deepEqual(
    dragged.map((s) => s.id),
    [s3.id, s2.id, s1.id]
  );
});

test('workflowEngine detects transparency flattening warnings & invalid step order with suggested patches', () => {
  const bgStep = createWorkflowStep('bg-remover', 'bg');
  const convertToJpg = {
    ...createWorkflowStep('convert', 'conv'),
    config: { targetFormat: 'jpg', quality: 88, stripMetadata: true },
  };
  const archiveStep = createWorkflowStep('archive', 'arc');
  const resizeAfterArchive = createWorkflowStep('resize', 'rsz');

  // 1. Transparent cutout -> JPG should trigger alpha-loss warning + webp suggestedPatch
  const alphaCheck = analyzeWorkflowCompatibility([bgStep, convertToJpg], ['png']);
  assert.equal(alphaCheck.valid, true);
  assert.equal(alphaCheck.hasWarnings, true);
  assert.equal(alphaCheck.issues[0].suggestedPatch?.config?.targetFormat, 'webp');

  // 2. Non-image input fed to Background Remover should fail with disableStep patch
  const badInputCheck = analyzeWorkflowCompatibility([bgStep], ['pdf']);
  assert.equal(badInputCheck.valid, false);
  assert.equal(badInputCheck.hasErrors, true);
  assert.equal(badInputCheck.issues[0].suggestedPatch?.disableStep, true);

  // 3. Operation after Archive should fail
  const postArchiveCheck = analyzeWorkflowCompatibility([archiveStep, resizeAfterArchive], ['png']);
  assert.equal(postArchiveCheck.valid, false);
  assert.equal(postArchiveCheck.hasErrors, true);
});

test('batchRenamer computes find/replace, case transforms, numbering, and detects internal & sibling collisions', () => {
  const items = [
    { id: '1', relPath: 'photos/StudioShotOne.PNG', name: 'StudioShotOne.PNG' },
    { id: '2', relPath: 'photos/StudioShotTwo.PNG', name: 'StudioShotTwo.PNG' },
  ];

  const okPlan = computeBatchRenamePlan(
    items,
    {
      ...DEFAULT_RENAME_RULES,
      prefix: 'asset_',
      caseMode: 'snake',
      numbering: 'suffix',
      startNumber: 1,
      padDigits: 3,
      extensionMode: 'lower',
    },
    new Set(['photos/existing.png']),
    new Date('2026-01-15T00:00:00Z')
  );

  assert.equal(okPlan.conflictCount, 0);
  assert.equal(okPlan.changedCount, 2);
  assert.equal(okPlan.plan[0].proposedName, 'asset_studio_shot_one_001.png');
  assert.equal(okPlan.plan[1].proposedName, 'asset_studio_shot_two_002.png');

  // Force duplicate batch collision
  const dupPlan = computeBatchRenamePlan(items, {
    ...DEFAULT_RENAME_RULES,
    find: 'StudioShotOne',
    replace: 'SameName',
    numbering: 'none',
  });
  const samePlan = computeBatchRenamePlan(
    [
      { id: '1', relPath: 'a.png', name: 'a.png' },
      { id: '2', relPath: 'b.png', name: 'b.png' },
    ],
    { ...DEFAULT_RENAME_RULES, find: 'a', replace: 'b' }
  );
  assert.equal(samePlan.conflictCount, 2);
  assert.ok(dupPlan.plan.length === 2);

  // Sibling collision detection
  const siblingCollision = computeBatchRenamePlan(
    [{ id: '1', relPath: 'photos/new.png', name: 'new.png' }],
    DEFAULT_RENAME_RULES,
    new Set(['photos/new.png'])
  );
  assert.equal(siblingCollision.conflictCount, 1);
});

test('smartOrganizer maps files by category, extension, date, size and catches target folder collisions', () => {
  const files = [
    {
      relPath: 'Incoming/watch.png',
      name: 'watch.png',
      ext: 'png',
      category: 'image' as const,
      sizeBytes: 120_000,
      modifiedAt: '2026-03-14T12:00:00Z',
    },
    {
      relPath: 'Incoming/report.pdf',
      name: 'report.pdf',
      ext: 'pdf',
      category: 'document' as const,
      sizeBytes: 6_500_000,
      modifiedAt: '2026-03-14T12:00:00Z',
    },
    {
      relPath: 'Other/watch.png',
      name: 'watch.png',
      ext: 'png',
      category: 'image' as const,
      sizeBytes: 90_000,
      modifiedAt: '2026-03-14T12:00:00Z',
    },
  ];

  const byCat = computeOrganizationPlan(files, 'by-category', 'Organized');
  assert.equal(byCat.plan[0].proposedRelPath, 'Organized/Images/watch.png');
  assert.equal(byCat.plan[1].proposedRelPath, 'Organized/Documents/report.pdf');
  assert.equal(byCat.conflictCount, 1); // Two watch.png mapping into Organized/Images/

  const bySize = computeOrganizationPlan(files.slice(0, 2), 'by-size', '');
  assert.equal(bySize.plan[0].targetFolder, 'Compact (Under 500KB)');
  assert.equal(bySize.plan[1].targetFolder, 'Large (5MB+)');
  assert.equal(bySize.conflictCount, 0);

  const byDate = computeOrganizationPlan(files.slice(0, 1), 'by-date', 'Sorted');
  assert.equal(byDate.plan[0].proposedRelPath, 'Sorted/2026-03/watch.png');
});
