import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, FolderTree, RefreshCw } from 'lucide-react';
import type { OrganizerPlanItem, OrganizerRuleMode } from '../utils/smartOrganizer';
import { GlassSurface } from './glass/GlassSurface';
import { GlassDropdown } from './glass/GlassDropdown';
import { GlassModal } from './glass/GlassModal';

interface SmartOrganizerViewProps {
  onShowToast: (msg: string, kind?: 'info' | 'error') => void;
}

export function SmartOrganizerView({ onShowToast }: SmartOrganizerViewProps) {
  const [mode, setMode] = useState<OrganizerRuleMode>('by-category');
  const [baseFolder, setBaseFolder] = useState('Organized');
  const [plan, setPlan] = useState<OrganizerPlanItem[]>([]);
  const [changedCount, setChangedCount] = useState(0);
  const [conflictCount, setConflictCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const loadPreview = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/workspace/organize/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode, baseFolder }),
      });
      const data = await res.json();
      if (res.ok) {
        setPlan(data.plan || []);
        setChangedCount(data.changedCount || 0);
        setConflictCount(data.conflictCount || 0);
      }
    } catch {
      onShowToast('Failed to preview organization plan.', 'error');
    } finally {
      setLoading(false);
    }
  }, [baseFolder, mode, onShowToast]);

  useEffect(() => {
    loadPreview();
  }, [loadPreview]);

  const handleApply = async () => {
    setConfirmOpen(false);
    const moves = plan
      .filter((p) => p.changed && !p.conflict)
      .map((p) => ({ originalRelPath: p.originalRelPath, proposedRelPath: p.proposedRelPath }));
    const res = await fetch('/api/workspace/organize/apply', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ moves }),
    });
    const data = await res.json();
    if (!res.ok) {
      onShowToast(data.error || 'Organization failed.', 'error');
      return;
    }
    onShowToast(`Organized ${data.movedCount} file(s) into /${baseFolder || 'Workspace'}.`);
    await loadPreview();
  };

  return (
    <div className="space-y-6">
      <GlassSurface as="section" className="rounded-[22px] p-6 space-y-4 overflow-visible relative z-20">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="font-display text-lg font-semibold text-[var(--text-primary)]">Smart Organizer</h2>
            <p className="text-xs text-[var(--text-muted)] mt-0.5">
              Preview folder classification across workspace files before confirming moves.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={loadPreview}
              className="glass-interactive inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs text-[var(--text-primary)] cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              Refresh Preview
            </button>
            <button
              type="button"
              disabled={changedCount === 0}
              onClick={() => setConfirmOpen(true)}
              className="rounded-xl bg-zinc-900 text-white dark:bg-white dark:text-black px-4 py-2 text-xs font-medium disabled:opacity-40 cursor-pointer whitespace-nowrap"
            >
              Review &amp; Apply ({changedCount} moves)
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
          <div>
            <label className="block text-xs text-[var(--text-muted)] mb-1.5">Organization Rule</label>
            <GlassDropdown
              size="sm"
              ariaLabel="Organization Rule"
              value={mode}
              onChange={(v) => setMode(v as OrganizerRuleMode)}
              options={[
                { value: 'by-category', label: 'By File Category (Images, Documents, Audio...)' },
                { value: 'by-extension', label: 'By File Extension (PNG, PDF, JSON...)' },
                { value: 'by-date', label: 'By Modified Month (YYYY-MM)' },
                { value: 'by-size', label: 'By File Size Tier (Compact / Medium / Large)' },
              ]}
            />
          </div>
          <div>
            <label className="block text-xs text-[var(--text-muted)] mb-1.5">Target Root Folder</label>
            <input
              type="text"
              value={baseFolder}
              onChange={(e) => setBaseFolder(e.target.value)}
              placeholder="Organized"
              className="w-full rounded-xl border border-[var(--control-border)] bg-[var(--input-bg)] px-3 py-2 text-xs text-[var(--text-primary)]"
            />
          </div>
        </div>
      </GlassSurface>

      <GlassSurface as="section" className="rounded-[22px] p-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
          <span className="font-medium text-[var(--text-primary)] tabular-nums">
            Proposed Moves Preview ({changedCount} changed · {plan.length} total files)
          </span>
          {conflictCount > 0 ? (
            <span className="inline-flex items-center gap-1 text-amber-500 font-medium tabular-nums">
              <AlertTriangle className="w-3.5 h-3.5" />
              {conflictCount} filename collision(s) will be skipped
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 text-[var(--text-muted)]">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
              No collisions detected
            </span>
          )}
        </div>

        {plan.length === 0 ? (
          <div className="py-10 text-center border border-dashed border-black/12 dark:border-white/14 rounded-xl space-y-2">
            <FolderTree className="w-7 h-7 text-[var(--text-secondary)] mx-auto" />
            <p className="text-xs text-[var(--text-muted)]">
              No workspace files found. Upload files or load Demo Workspace in File Explorer first.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-black/10 dark:border-white/10 text-[var(--text-muted)]">
                  <th className="py-2 pr-4 font-medium">Current Path</th>
                  <th className="py-2 pr-4 font-medium">Proposed Destination</th>
                  <th className="py-2 text-right font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-black/8 dark:divide-white/8 font-mono text-[11px]">
                {plan.map((item) => (
                  <tr key={item.originalRelPath}>
                    <td className="py-2.5 pr-4 text-[var(--text-muted)]">/{item.originalRelPath}</td>
                    <td className="py-2.5 pr-4 text-[var(--text-primary)]">/{item.proposedRelPath}</td>
                    <td className="py-2.5 text-right font-sans">
                      {item.conflict ? (
                        <span className="text-amber-500">{item.conflict}</span>
                      ) : item.changed ? (
                        <span className="text-[var(--text-primary)]">Ready to move</span>
                      ) : (
                        <span className="text-[var(--text-secondary)]">Already organized</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </GlassSurface>

      <GlassModal
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        title="Confirm Smart Organization"
        subtitle="Review destination folders before moving workspace files."
        maxWidthClass="max-w-lg"
      >
        <div className="space-y-4 text-xs">
          <p className="text-[var(--text-soft)] tabular-nums">
            {plan.filter((p) => p.changed && !p.conflict).length} file(s) will be relocated under /{baseFolder || 'Workspace'} using the &ldquo;{mode}&rdquo; rule.
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
              onClick={handleApply}
              className="rounded-xl bg-zinc-900 text-white dark:bg-white dark:text-black px-4 py-2 font-medium cursor-pointer"
            >
              Confirm &amp; Organize
            </button>
          </div>
        </div>
      </GlassModal>
    </div>
  );
}
