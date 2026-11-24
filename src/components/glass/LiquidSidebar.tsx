import { AnimatePresence, motion } from 'motion/react';
import {
  Activity,
  Archive,
  Bookmark,
  Clock,
  CopyCheck,
  Eraser,
  FileSearch,
  FileText,
  FolderKanban,
  FolderOpen,
  FolderTree,
  HardDrive,
  Home,
  Layers,
  Minimize2,
  PanelLeftClose,
  PanelLeftOpen,
  Settings,
  Sparkles,
  Trash2,
  Workflow,
  X,
} from 'lucide-react';
import type { NavView } from '../../shared/types';
import { MOTION_EASE, SPRING_SNAPPY } from '../../utils/motion';
import { GlassTooltip } from './GlassTooltip';

export type { NavView };

interface LiquidSidebarProps {
  view: NavView;
  collapsed: boolean;
  mobileOpen: boolean;
  batchCount: number;
  historyCount: number;
  presetsCount: number;
  onToggleCollapse: () => void;
  onCloseMobile: () => void;
  onNavigate: (view: NavView) => void;
}

interface NavItemDef {
  id: NavView;
  label: string;
  icon: typeof Home;
  count?: number;
}

export function LiquidSidebar({
  view,
  collapsed,
  mobileOpen,
  batchCount,
  historyCount,
  presetsCount,
  onToggleCollapse,
  onCloseMobile,
  onNavigate,
}: LiquidSidebarProps) {
  const sections: { title: string; items: NavItemDef[] }[] = [
    {
      title: 'Overview',
      items: [
        { id: 'dashboard', label: 'Dashboard', icon: Home },
        { id: 'recent-activity', label: 'Recent Activity', icon: Activity },
      ],
    },
    {
      title: 'File Management',
      items: [
        { id: 'explorer', label: 'File Explorer', icon: FolderOpen },
        { id: 'organizer', label: 'Smart Organizer', icon: FolderTree },
        { id: 'duplicates', label: 'Duplicate Finder', icon: CopyCheck },
        { id: 'large-files', label: 'Large Files', icon: HardDrive },
        { id: 'renamer', label: 'Batch Renamer', icon: FileText },
        { id: 'inspector', label: 'File Inspector', icon: FileSearch },
      ],
    },
    {
      title: 'Storage Intelligence',
      items: [
        { id: 'storage-analyzer', label: 'Storage Analyzer', icon: Sparkles },
        { id: 'cleanup', label: 'Cleanup Center', icon: Trash2 },
      ],
    },
    {
      title: 'Processing',
      items: [
        { id: 'converter', label: 'Universal Converter', icon: Layers },
        { id: 'bg-remover', label: 'Background Remover', icon: Eraser },
        { id: 'compressor', label: 'File Compressor', icon: Minimize2 },
        { id: 'archive', label: 'ZIP & Archive Manager', icon: Archive },
        { id: 'batch', label: 'Batch Processing', icon: FolderKanban, count: batchCount },
      ],
    },
    {
      title: 'Presets',
      items: [
        { id: 'presets', label: 'My Presets', icon: Bookmark, count: presetsCount },
        { id: 'workflow-builder', label: 'Workflow Builder', icon: Workflow },
      ],
    },
    {
      title: 'System',
      items: [
        { id: 'history', label: 'Activity History', icon: Clock, count: historyCount },
        { id: 'settings', label: 'Settings', icon: Settings },
      ],
    },
  ];

  const renderNavButton = (item: NavItemDef, isMobile: boolean, isMini: boolean) => {
    const Icon = item.icon;
    const active = view === item.id;
    return (
      <GlassTooltip key={item.id} label={item.label} enabled={isMini}>
        <button
          type="button"
          aria-label={item.label}
          aria-current={active ? 'page' : undefined}
          onClick={() => {
            onNavigate(item.id);
            if (isMobile) onCloseMobile();
          }}
          className={`relative w-full flex items-center ${
            isMini ? 'justify-center px-0 py-2' : 'justify-between px-3 py-1.5'
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
            <Icon className="w-3.5 h-3.5 shrink-0" />
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
  };

  const renderNavContent = (isMobile: boolean) => {
    const isMini = collapsed && !isMobile;

    return (
      <div className="flex flex-col h-full select-none">
        {/* Brand + Collapse Control */}
        <div
          className={`flex items-center shrink-0 ${
            isMini ? 'flex-col gap-2.5 px-2 pt-3 pb-2' : 'justify-between px-3 pt-3 pb-2'
          }`}
        >
          <button
            type="button"
            onClick={() => {
              onNavigate('dashboard');
              if (isMobile) onCloseMobile();
            }}
            aria-label="OmniFiles Home"
            className={`flex items-center gap-2.5 text-left cursor-pointer group ${
              isMini ? 'justify-center' : 'min-w-0'
            }`}
          >
            <div className="w-8 h-8 rounded-xl glass-interactive flex items-center justify-center shrink-0">
              <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className="w-4 h-4 text-[var(--text-primary)]">
                <path d="M12 3L20 18.5H4L12 3Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
                <path d="M8.5 13.5H15.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
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
                  OmniFiles
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

        {/* Structured Multi-Section Navigation */}
        <div className="flex-1 min-h-0 overflow-y-auto px-2.5 pb-3 space-y-3">
          {sections.map((section, idx) => (
            <div
              key={section.title}
              className={idx > 0 ? 'pt-2.5 border-t border-black/8 dark:border-white/10' : 'pt-1'}
            >
              {!isMini && (
                <p className="px-2.5 pb-1 text-[11px] font-medium text-[var(--text-secondary)]">{section.title}</p>
              )}
              <nav aria-label={`${section.title} navigation`} className="space-y-0.5">
                {section.items.map((item) => renderNavButton(item, isMobile, isMini))}
              </nav>
            </div>
          ))}
        </div>
      </div>
    );
  };

  return (
    <>
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
