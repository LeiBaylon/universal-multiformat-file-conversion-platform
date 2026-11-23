import { useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  Archive,
  BookOpen,
  Box,
  Braces,
  Captions,
  ChevronDown,
  Clock,
  Code2,
  Compass,
  FileText,
  Film,
  FlaskConical,
  FolderKanban,
  Home,
  Image as ImageIcon,
  Layers,
  Music,
  PanelLeftClose,
  PanelLeftOpen,
  PenTool,
  Presentation,
  Settings,
  Table2,
  Type,
  X,
} from 'lucide-react';
import { CATEGORIES, getSupportedStats } from '../../shared/formats';
import type { FormatCategory } from '../../shared/types';
import { ACCORDION_VARIANTS, MOTION_EASE, SPRING_SNAPPY } from '../../utils/motion';
import { GlassTooltip } from './GlassTooltip';

export type NavView = 'dashboard' | 'converter' | 'categories' | 'batch' | 'history' | 'settings';

const CATEGORY_ICONS: Record<FormatCategory, typeof ImageIcon> = {
  image: ImageIcon,
  document: FileText,
  spreadsheet: Table2,
  presentation: Presentation,
  audio: Music,
  video: Film,
  ebook: BookOpen,
  archive: Archive,
  vector: PenTool,
  model3d: Box,
  font: Type,
  subtitle: Captions,
  data: Braces,
  webdev: Code2,
  scientific: FlaskConical,
};

interface LiquidSidebarProps {
  view: NavView;
  selectedCategory: FormatCategory | 'all';
  collapsed: boolean;
  mobileOpen: boolean;
  batchCount: number;
  historyCount: number;
  onToggleCollapse: () => void;
  onCloseMobile: () => void;
  onNavigate: (view: NavView) => void;
  onSelectCategory: (cat: FormatCategory) => void;
}

export function LiquidSidebar({
  view,
  selectedCategory,
  collapsed,
  mobileOpen,
  batchCount,
  historyCount,
  onToggleCollapse,
  onCloseMobile,
  onNavigate,
  onSelectCategory,
}: LiquidSidebarProps) {
  const [categoriesOpen, setCategoriesOpen] = useState(true);
  const stats = getSupportedStats();

  const primaryNav: { id: NavView; label: string; shortcut: string; icon: typeof Home; count?: number }[] = [
    { id: 'dashboard', label: 'Dashboard', shortcut: 'Alt+1', icon: Home },
    { id: 'converter', label: 'Universal Converter', shortcut: 'Alt+2', icon: Layers },
    { id: 'categories', label: 'Format Explorer', shortcut: 'Alt+3', icon: Compass },
    { id: 'batch', label: 'Batch Converter', shortcut: 'Alt+4', icon: FolderKanban, count: batchCount },
    { id: 'history', label: 'Conversion History', shortcut: 'Alt+5', icon: Clock, count: historyCount },
  ];

  const renderNavContent = (isMobile: boolean) => {
    const isMini = collapsed && !isMobile;

    return (
      <div className="flex flex-col h-full select-none">
        {/* Brand + Collapse Control */}
        <div
          className={`flex items-center ${
            isMini ? 'flex-col gap-2.5 px-2 pt-3 pb-2' : 'justify-between px-3 pt-3 pb-2'
          }`}
        >
          <button
            type="button"
            onClick={() => {
              onNavigate('dashboard');
              if (isMobile) onCloseMobile();
            }}
            aria-label="Aether Convert Home"
            className={`flex items-center gap-2.5 text-left cursor-pointer group ${
              isMini ? 'justify-center' : 'min-w-0'
            }`}
          >
            <div className="w-8 h-8 rounded-xl glass-interactive flex items-center justify-center shrink-0">
              <svg
                viewBox="0 0 24 24"
                fill="none"
                aria-hidden="true"
                className="w-4 h-4 text-[var(--text-primary)]"
              >
                <path
                  d="M12 3L20 18.5H4L12 3Z"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinejoin="round"
                />
                <path
                  d="M8.5 13.5H15.5"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                />
              </svg>
            </div>
            <AnimatePresence initial={false}>
              {!isMini && (
                <motion.span
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -8 }}
                  transition={{ duration: 0.2, ease: MOTION_EASE }}
                  className="font-display text-sm font-semibold tracking-tight text-[var(--text-primary)] whitespace-nowrap truncate"
                >
                  Aether Convert
                </motion.span>
              )}
            </AnimatePresence>
          </button>

          {isMobile ? (
            <button
              type="button"
              onClick={onCloseMobile}
              aria-label="Close navigation"
              className="glass-interactive rounded-lg p-1.5 text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          ) : (
            <GlassTooltip label={isMini ? 'Expand sidebar' : 'Collapse sidebar'} enabled={isMini}>
              <button
                type="button"
                onClick={onToggleCollapse}
                aria-label={isMini ? 'Expand sidebar' : 'Collapse sidebar'}
                aria-expanded={!isMini}
                className="glass-interactive rounded-lg p-1.5 text-[var(--text-muted)] hover:text-[var(--text-primary)] shrink-0 cursor-pointer"
              >
                {isMini ? <PanelLeftOpen className="w-4 h-4" /> : <PanelLeftClose className="w-4 h-4" />}
              </button>
            </GlassTooltip>
          )}
        </div>

        {/* Workspace Group */}
        <div className="px-2.5 pt-2">
          {!isMini && (
            <p className="px-2.5 pb-1.5 text-[11px] font-medium text-[var(--text-secondary)]">Workspace</p>
          )}
          <nav aria-label="Primary navigation" className="space-y-1">
            {primaryNav.map((item) => {
              const Icon = item.icon;
              const active = view === item.id;
              return (
                <GlassTooltip
                  key={item.id}
                  label={`${item.label} (${item.shortcut})`}
                  enabled={isMini}
                >
                  <button
                    type="button"
                    aria-label={item.label}
                    aria-current={active ? 'page' : undefined}
                    onClick={() => {
                      onNavigate(item.id);
                      if (isMobile) onCloseMobile();
                    }}
                    className={`relative w-full flex items-center ${
                      isMini ? 'justify-center px-0 py-2.5' : 'justify-between px-3 py-2'
                    } rounded-xl text-xs font-medium transition-colors cursor-pointer`}
                  >
                    {active && (
                      <motion.span
                        layoutId={isMobile ? 'sidebar-active-pill-mobile' : 'sidebar-active-pill'}
                        transition={SPRING_SNAPPY}
                        className="absolute inset-0 rounded-xl bg-zinc-900 dark:bg-white shadow-sm"
                      />
                    )}
                    <span
                      className={`relative z-10 inline-flex items-center ${
                        isMini ? 'justify-center' : 'gap-2.5 min-w-0'
                      } ${
                        active
                          ? 'text-white dark:text-black'
                          : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                      }`}
                    >
                      <Icon className="w-4 h-4 shrink-0" />
                      {!isMini && <span className="whitespace-nowrap truncate">{item.label}</span>}
                    </span>
                    {!isMini && typeof item.count === 'number' && item.count > 0 && (
                      <span
                        className={`relative z-10 font-mono text-[11px] tabular-nums ${
                          active ? 'text-white/80 dark:text-black/75' : 'text-[var(--text-secondary)]'
                        }`}
                      >
                        {item.count}
                      </span>
                    )}
                  </button>
                </GlassTooltip>
              );
            })}
          </nav>
        </div>

        {/* Expandable Categories Group (Expanded Mode) */}
        <div className="flex-1 min-h-0 flex flex-col px-2.5 pt-3 mt-3 border-t border-black/8 dark:border-white/10">
          {!isMini ? (
            <>
              <button
                type="button"
                aria-expanded={categoriesOpen}
                onClick={() => setCategoriesOpen((v) => !v)}
                className="w-full px-2.5 py-1 flex items-center justify-between text-[11px] font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors cursor-pointer shrink-0"
              >
                <span>Categories ({CATEGORIES.length})</span>
                <ChevronDown
                  className={`w-3.5 h-3.5 transition-transform duration-200 ${
                    categoriesOpen ? 'rotate-0' : '-rotate-90'
                  }`}
                />
              </button>

              <AnimatePresence initial={false}>
                {categoriesOpen && (
                  <motion.div
                    variants={ACCORDION_VARIANTS}
                    initial="initial"
                    animate="animate"
                    exit="exit"
                    className="flex-1 min-h-0 overflow-y-auto pr-0.5 mt-1 space-y-0.5"
                  >
                    {CATEGORIES.map((cat) => {
                      const CatIcon = CATEGORY_ICONS[cat.id];
                      const active = view === 'categories' && selectedCategory === cat.id;
                      return (
                        <button
                          key={cat.id}
                          type="button"
                          onClick={() => {
                            onSelectCategory(cat.id);
                            if (isMobile) onCloseMobile();
                          }}
                          className={`relative w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-xs transition-[background-color] duration-150 cursor-pointer ${
                            active
                              ? 'bg-black/8 text-[var(--text-primary)] dark:bg-white/14 dark:text-white font-medium'
                              : 'text-zinc-700 dark:text-[#C5C5C5] hover:text-[var(--text-primary)] hover:bg-black/5 dark:hover:bg-white/6'
                          }`}
                        >
                          <CatIcon className="w-3.5 h-3.5 shrink-0 opacity-85" />
                          <span className="truncate">{cat.label}</span>
                        </button>
                      );
                    })}
                  </motion.div>
                )}
              </AnimatePresence>
            </>
          ) : (
            <div className="flex-1" />
          )}
        </div>

        {/* System / Settings Group */}
        <div className="px-2.5 pt-2.5 pb-3 mt-2 border-t border-black/8 dark:border-white/10 space-y-2 shrink-0">
          <GlassTooltip label="Settings & Preferences (Alt+6)" enabled={isMini}>
            <button
              type="button"
              aria-label="Settings"
              aria-current={view === 'settings' ? 'page' : undefined}
              onClick={() => {
                onNavigate('settings');
                if (isMobile) onCloseMobile();
              }}
              className={`relative w-full flex items-center ${
                isMini ? 'justify-center px-0 py-2.5' : 'gap-2.5 px-3 py-2'
              } rounded-xl text-xs font-medium transition-colors cursor-pointer`}
            >
              {view === 'settings' && (
                <motion.span
                  layoutId={isMobile ? 'sidebar-active-pill-mobile' : 'sidebar-active-pill'}
                  transition={SPRING_SNAPPY}
                  className="absolute inset-0 rounded-xl bg-zinc-900 dark:bg-white shadow-sm"
                />
              )}
              <span
                className={`relative z-10 inline-flex items-center gap-2.5 ${
                  view === 'settings'
                    ? 'text-white dark:text-black'
                    : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                }`}
              >
                <Settings className="w-4 h-4 shrink-0" />
                {!isMini && <span>Settings</span>}
              </span>
            </button>
          </GlassTooltip>

          {!isMini && (
            <div className="px-2.5 text-[11px] text-[var(--text-secondary)] tabular-nums">
              {stats.full + stats.partial} Active Formats · {CATEGORIES.length} Engines
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <>
      {/* Desktop Floating Liquid Glass Dock */}
      <motion.aside
        aria-label="Application Sidebar"
        data-collapsed={collapsed}
        initial={false}
        animate={{ width: collapsed ? 76 : 268 }}
        transition={{ duration: 0.32, ease: MOTION_EASE }}
        className="hidden lg:flex fixed top-3 bottom-3 left-3 z-40 glass-primary glass-rim rounded-[24px] flex-col"
      >
        {renderNavContent(false)}
      </motion.aside>

      {/* Mobile Sliding Liquid Glass Drawer */}
      <AnimatePresence>
        {mobileOpen && (
          <div className="fixed inset-0 z-50 lg:hidden">
            <motion.div
              aria-hidden="true"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              onClick={onCloseMobile}
              className="fixed inset-0 bg-black/70 backdrop-blur-sm"
            />
            <motion.aside
              aria-label="Mobile Navigation"
              initial={{ x: -292, opacity: 0.5 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: -292, opacity: 0 }}
              transition={{ duration: 0.28, ease: MOTION_EASE }}
              className="fixed top-3 bottom-3 left-3 w-[272px] glass-primary glass-rim rounded-[24px] flex flex-col overflow-hidden"
            >
              {renderNavContent(true)}
            </motion.aside>
          </div>
        )}
      </AnimatePresence>
    </>
  );
}
