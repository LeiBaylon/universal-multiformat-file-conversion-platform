import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, FileText, RefreshCw } from 'lucide-react';
import type { WorkspaceFileEntry } from '../shared/types';
import {
  computeBatchRenamePlan,
  DEFAULT_RENAME_RULES,
  type BatchRenameRules,
  type RenameCaseMode,
  type RenameNumberingMode,
} from '../utils/batchRenamer';
import { GlassSurface } from './glass/GlassSurface';
import { GlassDropdown } from './glass/GlassDropdown';
import { GlassModal } from './glass/GlassModal';

interface BatchRenamerViewProps {
  initialSelectedPaths?: string[] | null;
  onClearInitialSelection?: () => void;
  onShowToast: (msg: string, kind?: 'info' | 'error') => void;
}

export function BatchRenamerView({
  initialSelectedPaths,
  onClearInitialSelection,
  onShowToast,
}: BatchRenamerViewProps) {
  const [files, setFiles] = useState<WorkspaceFileEntry[]>([]);
  const [selectedPaths, setSelectedPaths] = useState<string[]>([]);
  const [rules, setRules] = useState<BatchRenameRules>(DEFAULT_RENAME_RULES);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const loadWorkspaceFiles = useCallback(async () => {
    const res = await fetch('/api/workspace/tree');
    if (res.ok) {
      const data = await res.json();
      const list = (data.entries || []).filter((e: WorkspaceFileEntry) => !e.isDirectory);
      setFiles(list);
      if (initialSelectedPaths && initialSelectedPaths.length > 0) {
        setSelectedPaths(initialSelectedPaths);
        onClearInitialSelection?.();
      } else {
        setSelectedPaths((prev) => (prev.length > 0 ? prev.filter((p) => list.some((f: WorkspaceFileEntry) => f.relPath === p)) : list.map((f: WorkspaceFileEntry) => f.relPath)));
      }
    }
  }, [initialSelectedPaths, onClearInitialSelection]);

  useEffect(() => {
    loadWorkspaceFiles();
  }, [loadWorkspaceFiles]);

  const unselectedSiblings = useMemo(
    () => new Set(files.filter((f) => !selectedPaths.includes(f.relPath)).map((f) => f.relPath)),
    [files, selectedPaths]
  );

  const preview = useMemo(() => {
    const targetItems = files
      .filter((f) => selectedPaths.includes(f.relPath))
      .map((f) => ({ id: f.relPath, relPath: f.relPath, name: f.name }));
    return computeBatchRenamePlan(targetItems, rules, unselectedSiblings);
  }, [files, rules, selectedPaths, unselectedSiblings]);

  const handleApplyRename = async () => {
    setConfirmOpen(false);
    const renames = preview.plan
      .filter((p) => p.changed && !p.conflict)
      .map((p) => ({ originalRelPath: p.originalRelPath, proposedRelPath: p.proposedRelPath }));
    const res = await fetch('/api/workspace/rename/apply', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ renames }),
    });
    const data = await res.json();
    if (!res.ok) {
      onShowToast(data.error || 'Batch rename failed.', 'error');
      return;
    }
    onShowToast(`Renamed ${data.renamedCount} workspace file(s).`);
    setSelectedPaths([]);
    await loadWorkspaceFiles();
  };

  return (
    <div className="space-y-6">
      <GlassSurface as="section" className="rounded-[22px] p-6 space-y-4 overflow-visible relative z-20">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="font-display text-lg font-semibold text-[var(--text-primary)]">Batch Renamer</h2>
            <p className="text-xs text-[var(--text-muted)] mt-0.5">
              Pattern rules, regex find/replace, numbering, case styles, and automatic collision detection before applying.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setRules(DEFAULT_RENAME_RULES)}
              className="glass-interactive rounded-xl px-3.5 py-2 text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer"
            >
              Reset Rules
            </button>
            <button
              type="button"
              onClick={loadWorkspaceFiles}
              className="glass-interactive inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs text-[var(--text-primary)] cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Reload Files
            </button>
            <button
              type="button"
              disabled={preview.changedCount === 0 || preview.conflictCount > 0 || Boolean(preview.regexError)}
              onClick={() => setConfirmOpen(true)}
              className="rounded-xl bg-zinc-900 text-white dark:bg-white dark:text-black px-4 py-2 text-xs font-medium disabled:opacity-40 cursor-pointer whitespace-nowrap"
            >
              Review &amp; Apply ({preview.changedCount})
            </button>
          </div>
        </div>

        {/* Rule Controls */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs pt-2">
          <div>
            <label className="block text-[var(--text-muted)] mb-1">Prefix</label>
            <input
              type="text"
              value={rules.prefix}
              onChange={(e) => setRules((r) => ({ ...r, prefix: e.target.value }))}
              placeholder="e.g. prod_"
              className="w-full rounded-xl border border-[var(--control-border)] bg-[var(--input-bg)] px-3 py-2 text-[var(--text-primary)]"
            />
          </div>
          <div>
            <label className="block text-[var(--text-muted)] mb-1">Suffix</label>
            <input
              type="text"
              value={rules.suffix}
              onChange={(e) => setRules((r) => ({ ...r, suffix: e.target.value }))}
              placeholder="e.g. _v2"
              className="w-full rounded-xl border border-[var(--control-border)] bg-[var(--input-bg)] px-3 py-2 text-[var(--text-primary)]"
            />
          </div>
          <div>
            <label className="block text-[var(--text-muted)] mb-1">Find Text / Pattern</label>
            <input
              type="text"
              value={rules.find}
              onChange={(e) => setRules((r) => ({ ...r, find: e.target.value }))}
              placeholder="Text or regex..."
              className="w-full rounded-xl border border-[var(--control-border)] bg-[var(--input-bg)] px-3 py-2 text-[var(--text-primary)]"
            />
          </div>
          <div>
            <label className="block text-[var(--text-muted)] mb-1">Replace With</label>
            <input
              type="text"
              value={rules.replace}
              onChange={(e) => setRules((r) => ({ ...r, replace: e.target.value }))}
              placeholder="Replacement..."
              className="w-full rounded-xl border border-[var(--control-border)] bg-[var(--input-bg)] px-3 py-2 text-[var(--text-primary)]"
            />
          </div>

          <div>
            <label className="block text-[var(--text-muted)] mb-1">Case Format</label>
            <GlassDropdown
              size="sm"
              ariaLabel="Case Format"
              value={rules.caseMode}
              onChange={(v) => setRules((r) => ({ ...r, caseMode: v as RenameCaseMode }))}
              options={[
                { value: 'keep', label: 'Keep Original' },
                { value: 'lower', label: 'lowercase' },
                { value: 'upper', label: 'UPPERCASE' },
                { value: 'title', label: 'Title Case' },
                { value: 'kebab', label: 'kebab-case' },
                { value: 'snake', label: 'snake_case' },
              ]}
            />
          </div>
          <div>
            <label className="block text-[var(--text-muted)] mb-1">Sequential Numbering</label>
            <GlassDropdown
              size="sm"
              ariaLabel="Sequential Numbering"
              value={rules.numbering}
              onChange={(v) => setRules((r) => ({ ...r, numbering: v as RenameNumberingMode }))}
              options={[
                { value: 'none', label: 'No Numbering' },
                { value: 'prefix', label: 'Number Prefix (001_name)' },
                { value: 'suffix', label: 'Number Suffix (name_001)' },
              ]}
            />
          </div>
          <div>
            <label className="block text-[var(--text-muted)] mb-1">Date Stamp</label>
            <GlassDropdown
              size="sm"
              ariaLabel="Date Stamp"
              value={rules.dateStamp}
              onChange={(v) => setRules((r) => ({ ...r, dateStamp: v as BatchRenameRules['dateStamp'] }))}
              options={[
                { value: 'none', label: 'None' },
                { value: 'YYYY-MM-DD', label: 'YYYY-MM-DD' },
                { value: 'YYYYMMDD', label: 'YYYYMMDD' },
              ]}
            />
          </div>
          <div className="flex items-end pb-1.5">
            <label className="inline-flex items-center gap-2 cursor-pointer text-[var(--text-soft)]">
              <input
                type="checkbox"
                checked={rules.useRegex}
                onChange={(e) => setRules((r) => ({ ...r, useRegex: e.target.checked }))}
                className="accent-zinc-900 dark:accent-white"
              />
              Use Regular Expression
            </label>
          </div>
        </div>

        {(preview.regexError || preview.conflictCount > 0) && (
          <div className="rounded-xl border border-red-500/35 bg-red-500/10 p-3 flex items-center gap-2 text-xs text-red-500">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>
              {preview.regexError ||
                `${preview.conflictCount} naming conflict(s) detected in preview. Adjust rules or deselect colliding files before applying.`}
            </span>
          </div>
        )}
      </GlassSurface>

      {/* Live Preview Table */}
      <GlassSurface as="section" className="rounded-[22px] p-6 space-y-3">
        <div className="flex items-center justify-between text-xs">
          <span className="font-medium text-[var(--text-primary)] tabular-nums">
            Target Files ({selectedPaths.length} / {files.length}) · {preview.changedCount} pending rename(s)
          </span>
          <div className="flex items-center gap-2 text-[var(--text-secondary)]">
            <button
              type="button"
              onClick={() => setSelectedPaths(files.map((f) => f.relPath))}
              className="hover:text-[var(--text-primary)] cursor-pointer"
            >
              Select All
            </button>
            <span>·</span>
            <button
              type="button"
              onClick={() => setSelectedPaths([])}
              className="hover:text-[var(--text-primary)] cursor-pointer"
            >
              Clear Selection
            </button>
          </div>
        </div>

        {files.length === 0 ? (
          <div className="py-10 text-center space-y-2">
            <FileText className="w-7 h-7 text-[var(--text-secondary)] mx-auto" />
            <p className="text-xs text-[var(--text-muted)]">No workspace files available to rename.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-black/10 dark:border-white/10 text-[var(--text-muted)]">
                  <th className="py-2 pr-3 w-8">Sel</th>
                  <th className="py-2 pr-4 font-medium">Original Filename</th>
                  <th className="py-2 pr-4 font-medium">Proposed New Filename</th>
                  <th className="py-2 text-right font-medium">Validation</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-black/8 dark:divide-white/8">
                {files.map((f) => {
                  const row = preview.plan.find((p) => p.originalRelPath === f.relPath);
                  const checked = selectedPaths.includes(f.relPath);
                  return (
                    <tr key={f.relPath}>
                      <td className="py-2.5 pr-3">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(e) =>
                            setSelectedPaths((prev) =>
                              e.target.checked ? [...prev, f.relPath] : prev.filter((p) => p !== f.relPath)
                            )
                          }
                          className="accent-zinc-900 dark:accent-white cursor-pointer"
                        />
                      </td>
                      <td className="py-2.5 pr-4 font-mono text-[11px] text-[var(--text-muted)]">{f.relPath}</td>
                      <td className="py-2.5 pr-4 font-mono text-[11px] text-[var(--text-primary)]">
                        {row ? row.proposedRelPath : '—'}
                      </td>
                      <td className="py-2.5 text-right">
                        {!row ? (
                          <span className="text-[var(--text-secondary)]">Excluded</span>
                        ) : row.conflict ? (
                          <span className="text-red-500">{row.conflict}</span>
                        ) : row.changed ? (
                          <span className="inline-flex items-center gap-1 text-[var(--text-primary)]">
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                            Ready
                          </span>
                        ) : (
                          <span className="text-[var(--text-secondary)]">Unchanged</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </GlassSurface>

      <GlassModal
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        title="Confirm Batch Rename"
        subtitle="Two-phase atomic rename will update filenames inside Managed Workspace."
        maxWidthClass="max-w-lg"
      >
        <div className="space-y-4 text-xs">
          <p className="text-[var(--text-soft)] tabular-nums">
            Apply {preview.changedCount} conflict-free rename(s) across selected workspace files?
          </p>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setConfirmOpen(false)}
              className="glass-interactive rounded-xl px-4 py-2 text-[var(--text-muted)] cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleApplyRename}
              className="rounded-xl bg-zinc-900 text-white dark:bg-white dark:text-black px-4 py-2 font-medium cursor-pointer"
            >
              Confirm Rename
            </button>
          </div>
        </div>
      </GlassModal>
    </div>
  );
}
