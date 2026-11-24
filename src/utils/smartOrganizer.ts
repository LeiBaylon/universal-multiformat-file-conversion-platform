import type { FormatCategory } from '../shared/types';

export type OrganizerRuleMode = 'by-category' | 'by-extension' | 'by-date' | 'by-size';

export interface OrganizerInputFile {
  relPath: string;
  name: string;
  ext: string;
  category: FormatCategory | 'unknown';
  sizeBytes: number;
  modifiedAt: string;
}

export interface OrganizerPlanItem {
  originalRelPath: string;
  proposedRelPath: string;
  targetFolder: string;
  changed: boolean;
  conflict?: string;
}

const CATEGORY_FOLDER_MAP: Record<string, string> = {
  image: 'Images',
  document: 'Documents',
  spreadsheet: 'Spreadsheets',
  presentation: 'Presentations',
  audio: 'Audio',
  video: 'Video',
  ebook: 'Ebooks',
  archive: 'Archives',
  vector: 'Vectors',
  model3d: '3D Models',
  font: 'Fonts',
  subtitle: 'Subtitles',
  data: 'Structured Data',
  webdev: 'Web Assets',
  scientific: 'Scientific Data',
  unknown: 'Other',
};

export function computeOrganizationPlan(
  files: OrganizerInputFile[],
  mode: OrganizerRuleMode,
  baseFolder = ''
): {
  plan: OrganizerPlanItem[];
  changedCount: number;
  conflictCount: number;
} {
  const cleanBase = baseFolder.replace(/^\/+|\/+$/g, '');
  const seenTargets = new Set<string>();

  const plan: OrganizerPlanItem[] = files.map((file) => {
    let subFolder = 'Other';
    if (mode === 'by-category') {
      subFolder = CATEGORY_FOLDER_MAP[file.category] || 'Other';
    } else if (mode === 'by-extension') {
      subFolder = file.ext ? file.ext.toUpperCase() : 'NO_EXT';
    } else if (mode === 'by-date') {
      const dt = new Date(file.modifiedAt);
      const valid = !Number.isNaN(dt.getTime());
      subFolder = valid
        ? `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}`
        : 'Undated';
    } else if (mode === 'by-size') {
      if (file.sizeBytes >= 5 * 1024 * 1024) subFolder = 'Large (5MB+)';
      else if (file.sizeBytes >= 500 * 1024) subFolder = 'Medium (500KB-5MB)';
      else subFolder = 'Compact (Under 500KB)';
    }

    const targetFolder = cleanBase ? `${cleanBase}/${subFolder}` : subFolder;
    const proposedRelPath = `${targetFolder}/${file.name}`;
    let conflict: string | undefined;
    if (seenTargets.has(proposedRelPath)) {
      conflict = `Two files named "${file.name}" map into "${targetFolder}".`;
    }
    seenTargets.add(proposedRelPath);

    return {
      originalRelPath: file.relPath,
      proposedRelPath,
      targetFolder,
      changed: proposedRelPath !== file.relPath,
      conflict,
    };
  });

  return {
    plan,
    changedCount: plan.filter((p) => p.changed).length,
    conflictCount: plan.filter((p) => Boolean(p.conflict)).length,
  };
}
