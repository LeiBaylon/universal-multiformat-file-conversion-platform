export type RenameCaseMode = 'keep' | 'lower' | 'upper' | 'title' | 'kebab' | 'snake';
export type RenameNumberingMode = 'none' | 'prefix' | 'suffix';

export interface BatchRenameRules {
  prefix: string;
  suffix: string;
  find: string;
  replace: string;
  useRegex: boolean;
  caseMode: RenameCaseMode;
  numbering: RenameNumberingMode;
  startNumber: number;
  padDigits: number;
  dateStamp: 'none' | 'YYYY-MM-DD' | 'YYYYMMDD';
  extensionMode: 'keep' | 'lower' | 'upper';
}

export const DEFAULT_RENAME_RULES: BatchRenameRules = {
  prefix: '',
  suffix: '',
  find: '',
  replace: '',
  useRegex: false,
  caseMode: 'keep',
  numbering: 'none',
  startNumber: 1,
  padDigits: 3,
  dateStamp: 'none',
  extensionMode: 'lower',
};

export interface BatchRenameInputItem {
  id: string;
  relPath: string;
  name: string;
}

export interface BatchRenamePlanItem {
  id: string;
  originalRelPath: string;
  originalName: string;
  proposedName: string;
  proposedRelPath: string;
  changed: boolean;
  conflict?: string;
}

function applyCaseTransform(stem: string, mode: RenameCaseMode): string {
  if (mode === 'lower') return stem.toLowerCase();
  if (mode === 'upper') return stem.toUpperCase();
  if (mode === 'title') {
    return stem.replace(/[_-]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  }
  if (mode === 'kebab') {
    return stem
      .trim()
      .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
      .replace(/[\s_]+/g, '-')
      .toLowerCase();
  }
  if (mode === 'snake') {
    return stem
      .trim()
      .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
      .replace(/[\s-]+/g, '_')
      .toLowerCase();
  }
  return stem;
}

function formatDateTag(mode: BatchRenameRules['dateStamp'], now = new Date()): string {
  if (mode === 'none') return '';
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, '0');
  const d = String(now.getUTCDate()).padStart(2, '0');
  return mode === 'YYYY-MM-DD' ? `${y}-${m}-${d}` : `${y}${m}${d}`;
}

export function computeBatchRenamePlan(
  items: BatchRenameInputItem[],
  rules: BatchRenameRules,
  unselectedSiblingPaths: Set<string> = new Set(),
  referenceDate?: Date
): {
  plan: BatchRenamePlanItem[];
  conflictCount: number;
  changedCount: number;
  regexError?: string;
} {
  let regex: RegExp | null = null;
  let regexError: string | undefined;
  if (rules.find && rules.useRegex) {
    try {
      regex = new RegExp(rules.find, 'g');
    } catch (err) {
      regexError = err instanceof Error ? err.message : 'Invalid regular expression.';
    }
  }

  const dateTag = formatDateTag(rules.dateStamp, referenceDate);

  const tentative: BatchRenamePlanItem[] = items.map((item, idx) => {
    const lastSlash = item.relPath.lastIndexOf('/');
    const dir = lastSlash >= 0 ? item.relPath.slice(0, lastSlash + 1) : '';
    const dotIdx = item.name.lastIndexOf('.');
    const hasExt = dotIdx > 0;
    let stem = hasExt ? item.name.slice(0, dotIdx) : item.name;
    let ext = hasExt ? item.name.slice(dotIdx + 1) : '';

    if (rules.find && !regexError) {
      if (regex) {
        stem = stem.replace(regex, rules.replace);
      } else {
        stem = stem.split(rules.find).join(rules.replace);
      }
    }

    stem = applyCaseTransform(stem, rules.caseMode);

    const numStr =
      rules.numbering !== 'none'
        ? String(Math.max(0, rules.startNumber) + idx).padStart(Math.max(1, Math.min(6, rules.padDigits)), '0')
        : '';

    const prefixPart = [rules.prefix, rules.numbering === 'prefix' ? numStr : ''].filter(Boolean).join('');
    const suffixPart = [rules.suffix, dateTag ? `_${dateTag}` : '', rules.numbering === 'suffix' ? `_${numStr}` : '']
      .filter(Boolean)
      .join('');

    const sanitizedStem = `${prefixPart}${stem}${suffixPart}`.replace(/[\\/:*?"<>|\0]/g, '_').trim();

    if (rules.extensionMode === 'lower') ext = ext.toLowerCase();
    else if (rules.extensionMode === 'upper') ext = ext.toUpperCase();

    const proposedName = sanitizedStem ? (ext ? `${sanitizedStem}.${ext}` : sanitizedStem) : '';
    const proposedRelPath = proposedName ? `${dir}${proposedName}` : dir;

    let conflict: string | undefined;
    if (!sanitizedStem || sanitizedStem === '.' || sanitizedStem === '..') {
      conflict = 'Resulting filename is empty or invalid.';
    } else if (unselectedSiblingPaths.has(proposedRelPath)) {
      conflict = 'Collides with an existing file in the same folder.';
    }

    return {
      id: item.id,
      originalRelPath: item.relPath,
      originalName: item.name,
      proposedName,
      proposedRelPath,
      changed: proposedRelPath !== item.relPath,
      conflict,
    };
  });

  // Detect duplicate targets within the batch itself
  const counts = new Map<string, number>();
  for (const row of tentative) {
    if (!row.proposedRelPath) continue;
    counts.set(row.proposedRelPath, (counts.get(row.proposedRelPath) || 0) + 1);
  }
  for (const row of tentative) {
    if (!row.conflict && (counts.get(row.proposedRelPath) || 0) > 1) {
      row.conflict = `Duplicate target filename "${row.proposedName}" in batch.`;
    }
  }

  return {
    plan: tentative,
    conflictCount: tentative.filter((r) => Boolean(r.conflict)).length,
    changedCount: tentative.filter((r) => r.changed).length,
    regexError,
  };
}
