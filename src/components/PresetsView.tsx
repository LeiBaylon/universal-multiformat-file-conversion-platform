import { useMemo, useState } from 'react';
import { motion } from 'motion/react';
import {
  Archive,
  ArrowUpRight,
  Bookmark,
  Copy,
  Eraser,
  Eye,
  Layers,
  Minimize2,
  Pencil,
  Plus,
  Search,
  Trash2,
  Workflow,
} from 'lucide-react';
import type { PresetKind, SavedPreset, ToolKind } from '../shared/types';
import { formatRelativeTime } from '../utils/formatters';
import { SPRING_SNAPPY } from '../utils/motion';
import { GlassSurface } from './glass/GlassSurface';
import { GlassDropdown } from './glass/GlassDropdown';
import { GlassModal } from './glass/GlassModal';

interface PresetsViewProps {
  presets: SavedPreset[];
  onApplyPreset: (preset: SavedPreset) => void;
  onCreatePreset: (preset: Omit<SavedPreset, 'id' | 'createdAt'>) => Promise<void>;
  onUpdatePreset: (id: string, patch: Partial<Omit<SavedPreset, 'id' | 'createdAt'>>) => Promise<void>;
  onDuplicatePreset: (id: string) => Promise<void>;
  onDeletePreset: (id: string) => Promise<void>;
  onOpenWorkflowBuilder: () => void;
}

const TOOL_LABELS: Record<ToolKind, string> = {
  converter: 'Universal Converter',
  'bg-remover': 'Background Remover',
  compressor: 'File Compressor',
  archive: 'ZIP & Archive Manager',
  workflow: 'Workflow Builder',
};

const TOOL_ICONS: Record<ToolKind, typeof Layers> = {
  converter: Layers,
  'bg-remover': Eraser,
  compressor: Minimize2,
  archive: Archive,
  workflow: Workflow,
};

function summarizeConfig(config: Record<string, unknown>): string {
  const entries = Object.entries(config).filter(([, v]) => v !== undefined && v !== '');
  if (entries.length === 0) return 'Default settings';
  return entries
    .map(([k, v]) => {
      if (k === 'stripMetadata') return v ? 'Strip EXIF' : 'Keep EXIF';
      if (k === 'shadowEnabled') return v ? 'Drop Shadow' : '';
      if (k === 'quality') return `Quality ${v}%`;
      if (k === 'targetFormat') return String(v).toUpperCase();
      if (k === 'format') return String(v).toUpperCase();
      return `${k}: ${String(v)}`;
    })
    .filter(Boolean)
    .join(' · ');
}

export function PresetsView({
  presets,
  onApplyPreset,
  onCreatePreset,
  onUpdatePreset,
  onDuplicatePreset,
  onDeletePreset,
  onOpenWorkflowBuilder,
}: PresetsViewProps) {
  const [search, setSearch] = useState('');
  const [filterKind, setFilterKind] = useState<'all' | PresetKind>('all');
  const [filterTool, setFilterTool] = useState<'all' | ToolKind>('all');

  const [editingId, setEditingId] = useState<string | null>(null);
  const [showEditor, setShowEditor] = useState(false);
  const [previewPreset, setPreviewPreset] = useState<SavedPreset | null>(null);

  // Editor form fields
  const [formName, setFormName] = useState('');
  const [formTool, setFormTool] = useState<ToolKind>('compressor');
  const [formKind, setFormKind] = useState<PresetKind>('tool');
  const [formCategoryTag, setFormCategoryTag] = useState('General');
  const [formDesc, setFormDesc] = useState('');
  const [formNamingPattern, setFormNamingPattern] = useState('{name}_processed');
  const [formDestFolder, setFormDestFolder] = useState('');
  const [formConfigJson, setFormConfigJson] = useState('{"goal": "balanced", "quality": 80, "stripMetadata": true}');
  const [formError, setFormError] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return presets.filter((p) => {
      if (filterKind !== 'all' && (p.kind || 'tool') !== filterKind) return false;
      if (filterTool !== 'all' && p.tool !== filterTool) return false;
      if (!q) return true;
      return (
        p.name.toLowerCase().includes(q) ||
        p.description.toLowerCase().includes(q) ||
        (p.categoryTag || '').toLowerCase().includes(q) ||
        p.tool.toLowerCase().includes(q)
      );
    });
  }, [filterKind, filterTool, presets, search]);

  const openCreateForm = () => {
    setEditingId(null);
    setFormName('');
    setFormTool('compressor');
    setFormKind('tool');
    setFormCategoryTag('Web Assets');
    setFormDesc('');
    setFormNamingPattern('{name}_processed');
    setFormDestFolder('');
    setFormConfigJson('{"goal": "balanced", "quality": 80, "stripMetadata": true}');
    setFormError(null);
    setShowEditor(true);
  };

  const openEditForm = (p: SavedPreset) => {
    setEditingId(p.id);
    setFormName(p.name);
    setFormTool(p.tool);
    setFormKind(p.kind || (p.tool === 'workflow' ? 'workflow' : 'tool'));
    setFormCategoryTag(p.categoryTag || 'General');
    setFormDesc(p.description);
    setFormNamingPattern(p.outputRule?.namingPattern || '{name}_processed');
    setFormDestFolder(p.outputRule?.destinationFolder || '');
    setFormConfigJson(JSON.stringify(p.tool === 'workflow' ? { steps: p.steps || [] } : p.config, null, 2));
    setFormError(null);
    setShowEditor(true);
  };

  const handleSaveForm = async () => {
    setFormError(null);
    if (!formName.trim()) {
      setFormError('Enter a preset name.');
      return;
    }
    try {
      const parsed = JSON.parse(formConfigJson || '{}');
      const outputRule = {
        namingPattern: formNamingPattern.trim() || '{name}_processed',
        destinationMode: formDestFolder.trim() ? ('workspace-folder' as const) : ('download-queue' as const),
        destinationFolder: formDestFolder.trim() || undefined,
      };

      if (editingId) {
        const existing = presets.find((p) => p.id === editingId);
        await onUpdatePreset(editingId, {
          name: formName.trim(),
          tool: formTool,
          kind: formKind,
          categoryTag: formCategoryTag.trim() || 'General',
          description: formDesc.trim() || `${TOOL_LABELS[formTool]} configuration`,
          outputRule,
          steps: formTool === 'workflow' ? (Array.isArray(parsed.steps) ? parsed.steps : existing?.steps) : undefined,
          config: formTool === 'workflow' ? existing?.config || {} : parsed,
        });
      } else {
        await onCreatePreset({
          name: formName.trim(),
          tool: formTool,
          kind: formKind,
          categoryTag: formCategoryTag.trim() || 'General',
          description: formDesc.trim() || `${TOOL_LABELS[formTool]} configuration`,
          outputRule,
          steps: formTool === 'workflow' && Array.isArray(parsed.steps) ? parsed.steps : undefined,
          config: formTool === 'workflow' ? {} : parsed,
        });
      }
      setShowEditor(false);
    } catch {
      setFormError('Configuration parameters must be valid JSON.');
    }
  };

  return (
    <div className="space-y-6">
      <GlassSurface as="section" className="rounded-[22px] p-6 space-y-4 overflow-visible relative z-20">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="font-display text-lg font-semibold text-[var(--text-primary)]">My Processing Presets</h2>
            <p className="text-xs text-[var(--text-muted)] mt-0.5 tabular-nums">
              {presets.length} saved preset(s) · Create, edit, duplicate, organize, and apply across workflows without automatic execution.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={onOpenWorkflowBuilder}
              className="glass-interactive inline-flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-medium text-[var(--text-primary)] cursor-pointer whitespace-nowrap"
            >
              <Workflow className="w-3.5 h-3.5" />
              Create from Workflow
            </button>
            <button
              type="button"
              onClick={openCreateForm}
              className="inline-flex items-center gap-2 rounded-xl bg-zinc-900 text-white dark:bg-white dark:text-black px-4 py-2 text-xs font-medium hover:opacity-90 cursor-pointer whitespace-nowrap"
            >
              <Plus className="w-3.5 h-3.5" />
              New Preset
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-center">
          <div className="md:col-span-5 relative">
            <Search className="w-3.5 h-3.5 text-[var(--text-secondary)] absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search presets by name, category, or tool..."
              className="w-full rounded-xl border border-[var(--control-border)] bg-[var(--input-bg)] pl-9 pr-4 py-2 text-xs text-[var(--text-primary)]"
            />
          </div>

          <div className="md:col-span-4 inline-flex items-center gap-1 p-1 rounded-xl border border-black/10 dark:border-white/12 bg-black/4 dark:bg-black/35">
            {(
              [
                { id: 'all', label: 'All' },
                { id: 'tool', label: 'Tool' },
                { id: 'workflow', label: 'Workflow' },
                { id: 'batch', label: 'Batch' },
              ] as const
            ).map((k) => {
              const active = filterKind === k.id;
              return (
                <button
                  key={k.id}
                  type="button"
                  onClick={() => setFilterKind(k.id)}
                  className="relative flex-1 px-2.5 py-1.5 rounded-lg text-xs font-medium cursor-pointer whitespace-nowrap"
                >
                  {active && (
                    <motion.span
                      layoutId="preset-kind-tab"
                      transition={SPRING_SNAPPY}
                      className="absolute inset-0 rounded-lg bg-zinc-900 dark:bg-white"
                    />
                  )}
                  <span
                    className={`relative z-10 ${
                      active ? 'text-white dark:text-black' : 'text-[var(--text-muted)]'
                    }`}
                  >
                    {k.label}
                  </span>
                </button>
              );
            })}
          </div>

          <div className="md:col-span-3">
            <GlassDropdown
              size="sm"
              ariaLabel="Filter presets by tool"
              value={filterTool}
              onChange={(v) => setFilterTool(v as 'all' | ToolKind)}
              options={[
                { value: 'all', label: 'All Engines' },
                { value: 'workflow', label: 'Workflow Builder' },
                { value: 'converter', label: 'Universal Converter' },
                { value: 'bg-remover', label: 'Background Remover' },
                { value: 'compressor', label: 'File Compressor' },
                { value: 'archive', label: 'ZIP & Archive Manager' },
              ]}
            />
          </div>
        </div>
      </GlassSurface>

      {/* Preset Cards Grid */}
      {filtered.length === 0 ? (
        <GlassSurface as="section" className="rounded-[22px] p-12 text-center">
          <Bookmark className="w-7 h-7 text-[var(--text-secondary)] mx-auto mb-2" />
          <p className="text-sm text-[var(--text-primary)]">No matching presets found</p>
          <p className="text-xs text-[var(--text-secondary)] mt-1">
            Create a new preset or save a custom operation sequence from Workflow Builder.
          </p>
        </GlassSurface>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filtered.map((preset) => {
            const Icon = TOOL_ICONS[preset.tool] || Layers;
            return (
              <GlassSurface
                key={preset.id}
                as="article"
                interactiveLight
                className="rounded-[20px] p-5 flex flex-col justify-between gap-4"
              >
                <div className="space-y-2.5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-8 h-8 rounded-xl glass-interactive flex items-center justify-center shrink-0">
                        <Icon className="w-4 h-4 text-[var(--text-primary)]" />
                      </div>
                      <div className="min-w-0">
                        <h3 className="font-display text-sm font-semibold text-[var(--text-primary)] truncate">
                          {preset.name}
                        </h3>
                        <p className="text-[11px] text-[var(--text-secondary)] truncate">
                          {[
                            TOOL_LABELS[preset.tool],
                            preset.kind && preset.kind !== preset.tool ? preset.kind : null,
                            preset.categoryTag || null,
                          ]
                            .filter(Boolean)
                            .join(' · ')}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        aria-label={`Preview preset ${preset.name}`}
                        onClick={() => setPreviewPreset(preset)}
                        className="text-[var(--text-secondary)] hover:text-[var(--text-primary)] p-1.5 cursor-pointer"
                      >
                        <Eye className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        aria-label={`Edit preset ${preset.name}`}
                        onClick={() => openEditForm(preset)}
                        className="text-[var(--text-secondary)] hover:text-[var(--text-primary)] p-1.5 cursor-pointer"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        aria-label={`Duplicate preset ${preset.name}`}
                        onClick={() => onDuplicatePreset(preset.id)}
                        className="text-[var(--text-secondary)] hover:text-[var(--text-primary)] p-1.5 cursor-pointer"
                      >
                        <Copy className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        aria-label={`Delete preset ${preset.name}`}
                        onClick={() => onDeletePreset(preset.id)}
                        className="text-[var(--text-secondary)] hover:text-[var(--text-primary)] p-1.5 cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  <p className="text-xs text-[var(--text-muted)] leading-relaxed">{preset.description}</p>

                  {preset.steps && preset.steps.length > 0 ? (
                    <div className="text-[11px] text-[var(--text-soft)] font-mono border border-black/8 dark:border-white/10 rounded-lg px-3 py-2 bg-black/3 dark:bg-black/35">
                      Sequence ({preset.steps.length} steps):{' '}
                      {preset.steps.map((s) => s.operationName).join(' → ')}
                    </div>
                  ) : (
                    <div className="rounded-lg border border-black/8 dark:border-white/10 bg-black/4 dark:bg-black/40 px-3 py-2 text-[11px] font-mono text-[var(--text-secondary)] truncate">
                      {summarizeConfig(preset.config)}
                    </div>
                  )}

                  <div className="flex flex-wrap items-center gap-2 text-[11px] text-[var(--text-secondary)] tabular-nums">
                    {[
                      preset.outputRule?.namingPattern ? `Naming: ${preset.outputRule.namingPattern}` : null,
                      preset.outputRule?.destinationFolder ? `Dest: /${preset.outputRule.destinationFolder}` : null,
                      preset.lastUsedAt
                        ? `Last used ${formatRelativeTime(preset.lastUsedAt)}`
                        : `Updated ${formatRelativeTime(preset.updatedAt || preset.createdAt)}`,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </div>
                </div>

                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={() => onApplyPreset(preset)}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-zinc-900 text-white dark:bg-white dark:text-black px-3.5 py-2 text-xs font-medium hover:opacity-90 cursor-pointer whitespace-nowrap"
                  >
                    Configure in {TOOL_LABELS[preset.tool]}
                    <ArrowUpRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </GlassSurface>
            );
          })}
        </div>
      )}

      {/* Create / Edit Preset Modal */}
      <GlassModal
        open={showEditor}
        onClose={() => setShowEditor(false)}
        title={editingId ? 'Edit Preset' : 'Create Processing Preset'}
        subtitle="Store tool settings, naming rules, destination folder, or workflow sequences."
        maxWidthClass="max-w-2xl"
      >
        <div className="space-y-4 text-xs">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-[var(--text-muted)] mb-1">Preset Name</label>
              <input
                type="text"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                placeholder="e.g. Studio WebP Cutout"
                className="w-full rounded-xl border border-[var(--control-border)] bg-[var(--input-bg)] px-3 py-2 text-[var(--text-primary)]"
              />
            </div>
            <div>
              <label className="block text-[var(--text-muted)] mb-1">Category Tag</label>
              <input
                type="text"
                value={formCategoryTag}
                onChange={(e) => setFormCategoryTag(e.target.value)}
                placeholder="Web Assets, Print, Archiving..."
                className="w-full rounded-xl border border-[var(--control-border)] bg-[var(--input-bg)] px-3 py-2 text-[var(--text-primary)]"
              />
            </div>
            <div>
              <label className="block text-[var(--text-muted)] mb-1">Target Workspace</label>
              <GlassDropdown
                size="sm"
                ariaLabel="Target Workspace"
                value={formTool}
                onChange={(v) => setFormTool(v as ToolKind)}
                options={[
                  { value: 'converter', label: 'Universal Converter' },
                  { value: 'bg-remover', label: 'Background Remover' },
                  { value: 'compressor', label: 'File Compressor' },
                  { value: 'archive', label: 'ZIP & Archive Manager' },
                  { value: 'workflow', label: 'Workflow Builder' },
                ]}
              />
            </div>
            <div>
              <label className="block text-[var(--text-muted)] mb-1">Preset Type</label>
              <GlassDropdown
                size="sm"
                ariaLabel="Preset Type"
                value={formKind}
                onChange={(v) => setFormKind(v as PresetKind)}
                options={[
                  { value: 'tool', label: 'Tool Configuration' },
                  { value: 'workflow', label: 'Multi-Step Workflow' },
                  { value: 'batch', label: 'Batch Processing Preset' },
                ]}
              />
            </div>
            <div>
              <label className="block text-[var(--text-muted)] mb-1">Output Naming Pattern</label>
              <input
                type="text"
                value={formNamingPattern}
                onChange={(e) => setFormNamingPattern(e.target.value)}
                placeholder="{name}_processed"
                className="w-full rounded-xl border border-[var(--control-border)] bg-[var(--input-bg)] px-3 py-2 font-mono text-[var(--text-primary)]"
              />
            </div>
            <div>
              <label className="block text-[var(--text-muted)] mb-1">Workspace Destination Folder (Optional)</label>
              <input
                type="text"
                value={formDestFolder}
                onChange={(e) => setFormDestFolder(e.target.value)}
                placeholder="Leave blank for Download Queue"
                className="w-full rounded-xl border border-[var(--control-border)] bg-[var(--input-bg)] px-3 py-2 text-[var(--text-primary)]"
              />
            </div>
          </div>

          <div>
            <label className="block text-[var(--text-muted)] mb-1">Description</label>
            <input
              type="text"
              value={formDesc}
              onChange={(e) => setFormDesc(e.target.value)}
              placeholder="Describe what this preset configures"
              className="w-full rounded-xl border border-[var(--control-border)] bg-[var(--input-bg)] px-3 py-2 text-[var(--text-primary)]"
            />
          </div>

          <div>
            <label className="block text-[var(--text-muted)] mb-1">Configuration Parameters (JSON)</label>
            <textarea
              rows={5}
              value={formConfigJson}
              onChange={(e) => setFormConfigJson(e.target.value)}
              className="w-full rounded-xl border border-[var(--control-border)] bg-[var(--input-bg)] px-3 py-2 font-mono text-[var(--text-primary)]"
            />
          </div>

          {formError && <p className="text-red-500">{formError}</p>}

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setShowEditor(false)}
              className="glass-interactive rounded-xl px-4 py-2 text-[var(--text-muted)] cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSaveForm}
              className="rounded-xl bg-zinc-900 text-white dark:bg-white dark:text-black px-4 py-2 font-medium cursor-pointer"
            >
              {editingId ? 'Save Changes' : 'Create Preset'}
            </button>
          </div>
        </div>
      </GlassModal>

      {/* Preset Preview Modal */}
      <GlassModal
        open={Boolean(previewPreset)}
        onClose={() => setPreviewPreset(null)}
        title={previewPreset?.name || ''}
        subtitle={previewPreset ? `${TOOL_LABELS[previewPreset.tool]} · ${previewPreset.kind}` : ''}
        maxWidthClass="max-w-xl"
      >
        {previewPreset && (
          <div className="space-y-3 text-xs">
            <p className="text-[var(--text-muted)]">{previewPreset.description}</p>
            <div className="grid grid-cols-2 gap-3 border-t border-black/10 dark:border-white/10 pt-3 tabular-nums">
              <div>
                <span className="text-[var(--text-secondary)]">Created</span>
                <p className="text-[var(--text-primary)] mt-0.5">
                  {new Date(previewPreset.createdAt).toLocaleString()}
                </p>
              </div>
              <div>
                <span className="text-[var(--text-secondary)]">Last Used</span>
                <p className="text-[var(--text-primary)] mt-0.5">
                  {previewPreset.lastUsedAt ? new Date(previewPreset.lastUsedAt).toLocaleString() : 'Never'}
                </p>
              </div>
            </div>
            <pre className="rounded-xl border border-black/10 dark:border-white/12 bg-black/5 dark:bg-black/45 p-3 font-mono text-[11px] overflow-x-auto max-h-64">
              {JSON.stringify(
                {
                  outputRule: previewPreset.outputRule,
                  steps: previewPreset.steps,
                  config: previewPreset.config,
                },
                null,
                2
              )}
            </pre>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => {
                  const p = previewPreset;
                  setPreviewPreset(null);
                  onApplyPreset(p);
                }}
                className="rounded-xl bg-zinc-900 text-white dark:bg-white dark:text-black px-4 py-2 font-medium cursor-pointer"
              >
                Load into {TOOL_LABELS[previewPreset.tool]}
              </button>
            </div>
          </div>
        )}
      </GlassModal>
    </div>
  );
}
