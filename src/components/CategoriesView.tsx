import { useMemo, useState } from 'react';
import { motion } from 'motion/react';
import { ArrowRight, Check, Info, Search, Sliders, Star } from 'lucide-react';
import { CATEGORIES, FORMAT_REGISTRY } from '../shared/formats';
import type { FormatCategory, FormatDefinition, SupportLevel } from '../shared/types';
import { SPRING_SNAPPY } from '../utils/motion';
import { GlassSurface } from './glass/GlassSurface';
import { GlassModal } from './glass/GlassModal';

interface CategoriesViewProps {
  selectedCategory: FormatCategory | 'all';
  onSelectCategory: (cat: FormatCategory | 'all') => void;
  favoritePairs: string[];
  onToggleFavorite: (pair: string) => void;
  onLaunchSample: (ext: string, suggestedTarget?: string) => void;
}

export function CategoriesView({
  selectedCategory,
  onSelectCategory,
  favoritePairs,
  onToggleFavorite,
  onLaunchSample,
}: CategoriesViewProps) {
  const [query, setQuery] = useState('');
  const [supportFilter, setSupportFilter] = useState<SupportLevel | 'all'>('all');
  const [inspectedFormat, setInspectedFormat] = useState<FormatDefinition | null>(null);

  const filteredFormats = useMemo(() => {
    const q = query.trim().toLowerCase();
    return FORMAT_REGISTRY.filter((f) => {
      if (selectedCategory !== 'all' && f.category !== selectedCategory) return false;
      if (supportFilter !== 'all' && f.supportLevel !== supportFilter) return false;
      if (!q) return true;
      return (
        f.ext.toLowerCase().includes(q) ||
        f.name.toLowerCase().includes(q) ||
        f.category.toLowerCase().includes(q) ||
        f.compatibleOutputs.some((o) => o.includes(q))
      );
    });
  }, [selectedCategory, supportFilter, query]);

  const activeCategoryMeta =
    selectedCategory === 'all' ? null : CATEGORIES.find((c) => c.id === selectedCategory);

  return (
    <div className="space-y-6">
      {/* Format Explorer Header & Filters */}
      <GlassSurface as="section" className="rounded-[22px] p-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="font-display text-lg font-semibold text-[var(--text-primary)]">
              {activeCategoryMeta ? activeCategoryMeta.label : 'Format Explorer & Compatibility Matrix'}
            </h2>
            <p className="text-xs text-[var(--text-muted)] mt-0.5">
              {activeCategoryMeta
                ? `${activeCategoryMeta.description} · Engine: ${activeCategoryMeta.engineSummary}`
                : 'Searchable directory of all 15 format families with truthful engine availability and conversion pathways.'}
            </p>
          </div>

          <div className="inline-flex items-center gap-1 p-1 rounded-xl border border-black/10 dark:border-white/12 bg-black/4 dark:bg-black/35">
            {(['all', 'full', 'partial', 'unavailable'] as const).map((lvl) => {
              const active = supportFilter === lvl;
              return (
                <button
                  key={lvl}
                  type="button"
                  onClick={() => setSupportFilter(lvl)}
                  className="relative px-3 py-1.5 rounded-lg text-xs font-medium capitalize cursor-pointer whitespace-nowrap"
                >
                  {active && (
                    <motion.span
                      layoutId="explorer-support-pill"
                      transition={SPRING_SNAPPY}
                      className="absolute inset-0 rounded-lg bg-zinc-900 dark:bg-white"
                    />
                  )}
                  <span
                    className={`relative z-10 ${
                      active
                        ? 'text-white dark:text-black'
                        : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                    }`}
                  >
                    {lvl === 'unavailable' ? 'Adapter Needed' : lvl}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex flex-wrap gap-1.5">
          <button
            type="button"
            onClick={() => onSelectCategory('all')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
              selectedCategory === 'all'
                ? 'bg-zinc-900 text-white dark:bg-white dark:text-black'
                : 'glass-interactive text-[var(--text-muted)] hover:text-[var(--text-primary)]'
            }`}
          >
            All ({FORMAT_REGISTRY.length})
          </button>
          {CATEGORIES.map((cat) => (
            <button
              key={cat.id}
              type="button"
              onClick={() => onSelectCategory(cat.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
                selectedCategory === cat.id
                  ? 'bg-zinc-900 text-white dark:bg-white dark:text-black'
                  : 'glass-interactive text-[var(--text-muted)] hover:text-[var(--text-primary)]'
              }`}
            >
              {cat.shortLabel}
            </button>
          ))}
        </div>

        <div className="relative">
          <Search className="w-4 h-4 text-[var(--text-secondary)] absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter by extension, format name, or compatible output (e.g. webp, flac, glb, ttf)..."
            className="w-full rounded-xl border border-[var(--control-border)] bg-[var(--input-bg)] pl-10 pr-4 py-2.5 text-xs text-[var(--text-primary)] placeholder-[var(--text-secondary)] focus:outline-none focus:border-zinc-500 dark:focus:border-white/45 transition-colors"
          />
        </div>
      </GlassSurface>

      {/* Pinned Favorite Pairs */}
      {favoritePairs.length > 0 && (
        <GlassSurface as="section" className="rounded-[22px] p-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-xs font-medium text-[var(--text-primary)]">Pinned Favorite Conversions</h3>
            <span className="text-xs text-[var(--text-secondary)] tabular-nums">{favoritePairs.length} pairs</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {favoritePairs.map((pair) => {
              const [from, to] = pair.split('->');
              return (
                <div
                  key={pair}
                  className="glass-interactive inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs"
                >
                  <button
                    type="button"
                    onClick={() => onLaunchSample(from, to)}
                    className="inline-flex items-center gap-1.5 font-mono text-[var(--text-primary)] hover:underline cursor-pointer"
                  >
                    {from?.toUpperCase()}
                    <ArrowRight className="w-3 h-3" />
                    {to?.toUpperCase()}
                  </button>
                  <button
                    type="button"
                    onClick={() => onToggleFavorite(pair)}
                    aria-label={`Remove favorite ${pair}`}
                    className="text-[var(--text-secondary)] hover:text-[var(--text-primary)] cursor-pointer"
                  >
                    <Star className="w-3 h-3 fill-zinc-900 text-zinc-900 dark:fill-white dark:text-white" />
                  </button>
                </div>
              );
            })}
          </div>
        </GlassSurface>
      )}

      {/* Compatibility Matrix Table */}
      <GlassSurface as="section" className="rounded-[22px] p-6">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-black/10 dark:border-white/12 text-[var(--text-muted)]">
                <th className="py-2.5 pr-4 font-medium">Format</th>
                <th className="py-2.5 pr-4 font-medium">Category</th>
                <th className="py-2.5 pr-4 font-medium">Support Status</th>
                <th className="py-2.5 pr-4 font-medium">Processing Engine</th>
                <th className="py-2.5 pr-4 font-medium">Compatible Outputs</th>
                <th className="py-2.5 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-black/8 dark:divide-white/8">
              {filteredFormats.map((fmt) => {
                const defaultTarget = fmt.recommendedOutputs[0]?.format || fmt.compatibleOutputs[0];
                return (
                  <tr key={`${fmt.category}:${fmt.ext}`} className="hover:bg-black/4 dark:hover:bg-white/4 align-top transition-colors">
                    <td className="py-3 pr-4">
                      <span className="font-mono font-semibold text-[var(--text-primary)]">
                        {fmt.ext.toUpperCase()}
                      </span>
                      <p className="text-[var(--text-muted)] mt-0.5">{fmt.name}</p>
                      {fmt.notes && (
                        <p className="text-[var(--text-secondary)] mt-1 flex items-start gap-1 max-w-xs">
                          <Info className="w-3 h-3 shrink-0 mt-0.5" />
                          <span>{fmt.notes}</span>
                        </p>
                      )}
                    </td>
                    <td className="py-3 pr-4 text-[var(--text-soft)] capitalize">{fmt.category}</td>
                    <td className="py-3 pr-4">
                      {fmt.supportLevel === 'full' ? (
                        <span className="inline-flex items-center gap-1 text-[var(--text-primary)]">
                          <Check className="w-3.5 h-3.5" /> Full Support
                        </span>
                      ) : fmt.supportLevel === 'partial' ? (
                        <span className="text-[var(--text-soft)]">Partial / Read</span>
                      ) : (
                        <span className="text-[var(--text-secondary)]">Adapter Required</span>
                      )}
                    </td>
                    <td className="py-3 pr-4 font-mono text-[var(--text-muted)]">{fmt.engine}</td>
                    <td className="py-3 pr-4 text-[var(--text-muted)] max-w-sm">
                      {fmt.compatibleOutputs.length > 0 ? (
                        <span className="font-mono">
                          {fmt.compatibleOutputs.slice(0, 10).map((x) => x.toUpperCase()).join(', ')}
                          {fmt.compatibleOutputs.length > 10 ? ` +${fmt.compatibleOutputs.length - 10} more` : ''}
                        </span>
                      ) : (
                        <span className="text-[var(--text-secondary)]">Unavailable in container</span>
                      )}
                    </td>
                    <td className="py-3 text-right whitespace-nowrap">
                      <div className="inline-flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setInspectedFormat(fmt)}
                          className="glass-interactive rounded-lg px-2.5 py-1.5 text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)] inline-flex items-center gap-1 cursor-pointer"
                        >
                          <Sliders className="w-3 h-3" />
                          Details
                        </button>
                        {fmt.supportLevel !== 'unavailable' && defaultTarget && (
                          <button
                            type="button"
                            onClick={() => onLaunchSample(fmt.ext, defaultTarget)}
                            className="glass-interactive rounded-lg px-3 py-1.5 text-xs text-[var(--text-primary)] font-medium cursor-pointer"
                          >
                            Convert Sample
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {filteredFormats.length === 0 && (
            <div className="py-10 text-center text-xs text-[var(--text-secondary)]">
              No formats match your current filter.
            </div>
          )}
        </div>
      </GlassSurface>

      {/* Format Inspector Modal */}
      <GlassModal
        open={Boolean(inspectedFormat)}
        onClose={() => setInspectedFormat(null)}
        title={inspectedFormat ? `${inspectedFormat.ext.toUpperCase()} — ${inspectedFormat.name}` : ''}
        subtitle={
          inspectedFormat
            ? `${inspectedFormat.category} · Engine: ${inspectedFormat.engine} · ${
                inspectedFormat.supportLevel === 'full'
                  ? 'Full Support'
                  : inspectedFormat.supportLevel === 'partial'
                  ? 'Partial / Read Support'
                  : 'Adapter Required'
              }`
            : ''
        }
        maxWidthClass="max-w-xl"
      >
        {inspectedFormat && (
          <div className="space-y-4 text-xs">
            <div className="grid grid-cols-2 gap-3 border-t border-black/10 dark:border-white/10 pt-3">
              <div>
                <span className="text-[var(--text-secondary)]">Input Reading</span>
                <p className="text-[var(--text-primary)] font-medium mt-0.5">
                  {inspectedFormat.inputSupported ? 'Supported' : 'Not Supported'}
                </p>
              </div>
              <div>
                <span className="text-[var(--text-secondary)]">Output Writing</span>
                <p className="text-[var(--text-primary)] font-medium mt-0.5">
                  {inspectedFormat.outputSupported ? 'Supported' : 'Not Supported'}
                </p>
              </div>
              <div className="col-span-2">
                <span className="text-[var(--text-secondary)]">MIME Types</span>
                <p className="font-mono text-[var(--text-soft)] mt-0.5 break-all">
                  {inspectedFormat.mimeTypes.join(', ')}
                </p>
              </div>
            </div>

            {inspectedFormat.notes && (
              <p className="text-[var(--text-muted)] border-t border-black/10 dark:border-white/10 pt-3">
                {inspectedFormat.notes}
              </p>
            )}

            <div className="border-t border-black/10 dark:border-white/10 pt-3 space-y-2">
              <p className="text-[var(--text-muted)] font-medium">
                Compatible Output Targets ({inspectedFormat.compatibleOutputs.length})
              </p>
              {inspectedFormat.compatibleOutputs.length > 0 ? (
                <div className="flex flex-wrap gap-1.5">
                  {inspectedFormat.compatibleOutputs.map((out) => (
                    <button
                      key={out}
                      type="button"
                      onClick={() => {
                        const src = inspectedFormat.ext;
                        setInspectedFormat(null);
                        onLaunchSample(src, out);
                      }}
                      className="glass-interactive rounded-lg px-2.5 py-1 font-mono text-xs text-[var(--text-primary)] cursor-pointer"
                    >
                      {out.toUpperCase()}
                    </button>
                  ))}
                </div>
              ) : (
                <p className="text-[var(--text-secondary)]">
                  Requires an external container binary before conversions can run.
                </p>
              )}
            </div>
          </div>
        )}
      </GlassModal>
    </div>
  );
}
