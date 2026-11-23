import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Check, ChevronDown, Search } from 'lucide-react';
import { DROPDOWN_VARIANTS } from '../../utils/motion';

export interface GlassDropdownOption {
  value: string;
  label: string;
  sublabel?: string;
}

interface GlassDropdownProps {
  value: string;
  options: GlassDropdownOption[];
  onChange: (value: string) => void;
  placeholder?: string;
  ariaLabel?: string;
  id?: string;
  searchable?: boolean;
  disabled?: boolean;
  className?: string;
  size?: 'sm' | 'md';
}

export function GlassDropdown({
  value,
  options,
  onChange,
  placeholder = 'Select option...',
  ariaLabel,
  id,
  searchable = false,
  disabled = false,
  className = '',
  size = 'md',
}: GlassDropdownProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const containerRef = useRef<HTMLDivElement | null>(null);
  const searchRef = useRef<HTMLInputElement | null>(null);

  const selected = options.find((o) => o.value === value);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter(
      (o) =>
        o.label.toLowerCase().includes(q) ||
        o.value.toLowerCase().includes(q) ||
        (o.sublabel && o.sublabel.toLowerCase().includes(q))
    );
  }, [options, query]);

  useEffect(() => {
    if (!open) return;
    const handlePointerDown = (e: PointerEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setQuery('');
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        setQuery('');
      }
    };
    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    if (searchable) {
      setTimeout(() => searchRef.current?.focus(), 40);
    }
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open, searchable]);

  const triggerPadding = size === 'sm' ? 'px-3 py-1.5 text-xs' : 'px-3.5 py-2.5 text-xs sm:text-sm';

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      <button
        id={id}
        type="button"
        disabled={disabled}
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => !disabled && setOpen((v) => !v)}
        className={`w-full glass-interactive rounded-xl ${triggerPadding} flex items-center justify-between gap-2 text-left text-[var(--text-primary)] disabled:opacity-45 cursor-pointer`}
      >
        <span className="truncate font-mono">
          {selected ? selected.label : <span className="text-[var(--text-secondary)] font-sans">{placeholder}</span>}
        </span>
        <ChevronDown
          className={`w-3.5 h-3.5 text-[var(--text-secondary)] shrink-0 transition-transform duration-200 ${
            open ? 'rotate-180' : ''
          }`}
        />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            role="listbox"
            aria-label={ariaLabel || placeholder}
            variants={DROPDOWN_VARIANTS}
            initial="initial"
            animate="animate"
            exit="exit"
            className="absolute left-0 right-0 mt-2 z-50 glass-floating glass-rim rounded-xl overflow-hidden min-w-[180px]"
          >
            {searchable && (
              <div className="p-2 border-b border-black/10 dark:border-white/10">
                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-[var(--text-secondary)] absolute left-2.5 top-1/2 -translate-y-1/2" />
                  <input
                    ref={searchRef}
                    type="text"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Filter options..."
                    className="w-full rounded-lg border border-black/10 dark:border-white/12 bg-black/5 dark:bg-black/45 pl-8 pr-2.5 py-1.5 text-xs text-[var(--text-primary)] placeholder-[var(--text-secondary)] focus:outline-none focus:border-zinc-500 dark:focus:border-white/40"
                  />
                </div>
              </div>
            )}

            <div className="max-h-60 overflow-y-auto p-1 space-y-0.5">
              {filtered.length === 0 ? (
                <div className="px-3 py-4 text-center text-xs text-[var(--text-secondary)]">No matching options</div>
              ) : (
                filtered.map((opt) => {
                  const active = opt.value === value;
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      role="option"
                      aria-selected={active}
                      onClick={() => {
                        onChange(opt.value);
                        setOpen(false);
                        setQuery('');
                      }}
                      className={`w-full px-3 py-2 rounded-lg flex items-center justify-between gap-2 text-left text-xs transition-colors cursor-pointer ${
                        active
                          ? 'bg-zinc-900 text-white dark:bg-white dark:text-black font-medium'
                          : 'text-[var(--text-soft)] hover:bg-black/6 dark:hover:bg-white/10'
                      }`}
                    >
                      <span className="min-w-0 truncate">
                        <span className="font-mono">{opt.label}</span>
                        {opt.sublabel && (
                          <span className={`ml-2 font-sans ${active ? 'opacity-75' : 'text-[var(--text-secondary)]'}`}>
                            {opt.sublabel}
                          </span>
                        )}
                      </span>
                      {active && <Check className="w-3.5 h-3.5 shrink-0" />}
                    </button>
                  );
                })
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
