import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, MotionConfig, motion } from 'motion/react';
import { Menu, Plus, Search, X } from 'lucide-react';
import { FORMAT_REGISTRY } from './shared/formats';
import type {
  ConversionJob,
  ConversionOptions,
  FormatCategory,
  IdentifiedFileMetadata,
  StorageStats,
  UserSettings,
} from './shared/types';
import { getViewDirection, resolveDefaultTargetFormat } from './utils/converterHelpers';
import { DROPDOWN_VARIANTS, PAGE_SLIDE_VARIANTS, TOAST_VARIANTS } from './utils/motion';
import { LiquidSidebar, type NavView } from './components/glass/LiquidSidebar';
import { DashboardView } from './components/DashboardView';
import { UniversalConverterView, type StagedConversionItem } from './components/UniversalConverterView';
import { CategoriesView } from './components/CategoriesView';
import { BatchConverterView, type BatchQueueItem } from './components/BatchConverterView';
import { HistoryView } from './components/HistoryView';
import { SettingsView } from './components/SettingsView';

const SIDEBAR_STORAGE_KEY = 'aether_sidebar_collapsed';

const VIEW_ORDER: NavView[] = ['dashboard', 'converter', 'categories', 'batch', 'history', 'settings'];

const DEFAULT_CLIENT_SETTINGS: UserSettings = {
  theme: 'dark',
  defaultImageQuality: 88,
  defaultVideoCrf: 23,
  defaultAudioBitrate: '192k',
  stripMetadataByDefault: false,
  retentionMinutes: 60,
  maxUploadMb: 100,
  favoritePairs: ['png->webp', 'heic->jpg', 'docx->pdf', 'wav->mp3', 'yaml->json', 'srt->vtt'],
  recentFormats: ['webp', 'pdf', 'mp3', 'json'],
  defaultOutputFormats: {
    image: 'webp',
    document: 'pdf',
    spreadsheet: 'csv',
    audio: 'mp3',
    video: 'mp4',
    data: 'json',
  },
};

export default function App() {
  const [view, setView] = useState<NavView>('dashboard');
  const [direction, setDirection] = useState(1);
  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(() => {
    try {
      return localStorage.getItem(SIDEBAR_STORAGE_KEY) === 'true';
    } catch {
      return false;
    }
  });
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<FormatCategory | 'all'>('all');

  const [jobs, setJobs] = useState<ConversionJob[]>([]);
  const [settings, setSettings] = useState<UserSettings>(DEFAULT_CLIENT_SETTINGS);
  const [storage, setStorage] = useState<StorageStats | null>(null);

  const [staged, setStaged] = useState<StagedConversionItem | null>(null);
  const [batchItems, setBatchItems] = useState<BatchQueueItem[]>([]);
  const [bulkOptions, setBulkOptions] = useState<ConversionOptions>({ quality: 88 });
  const [batchRunning, setBatchRunning] = useState(false);

  const [globalSearch, setGlobalSearch] = useState('');
  const [searchFocused, setSearchFocused] = useState(false);
  const [toast, setToast] = useState<{ message: string; kind: 'info' | 'error' } | null>(null);

  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const globalFileInputRef = useRef<HTMLInputElement | null>(null);

  const navigateTo = useCallback((nextView: NavView) => {
    setView((prev) => {
      if (prev === nextView) return prev;
      setDirection(getViewDirection(VIEW_ORDER.indexOf(prev), VIEW_ORDER.indexOf(nextView)));
      return nextView;
    });
  }, []);

  const toggleSidebarCollapsed = useCallback(() => {
    setSidebarCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(SIDEBAR_STORAGE_KEY, String(next));
      } catch {
        // ignore storage restrictions
      }
      return next;
    });
  }, []);

  const showToast = useCallback((message: string, kind: 'info' | 'error' = 'info') => {
    setToast({ message, kind });
    setTimeout(() => {
      setToast((curr) => (curr?.message === message ? null : curr));
    }, 4000);
  }, []);

  const refreshJobsAndSettings = useCallback(async () => {
    try {
      const [jobsRes, settingsRes] = await Promise.all([fetch('/api/jobs'), fetch('/api/settings')]);
      if (jobsRes.ok) {
        const data = await jobsRes.json();
        setJobs(data.jobs || []);
      }
      if (settingsRes.ok) {
        const data = await settingsRes.json();
        if (data.settings) setSettings(data.settings);
        if (data.storage) setStorage(data.storage);
      }
    } catch {
      // ignore transient startup polling
    }
  }, []);

  useEffect(() => {
    refreshJobsAndSettings();
  }, [refreshJobsAndSettings]);

  // Sync html theme class
  useEffect(() => {
    const root = document.documentElement;
    if (settings.theme === 'light') {
      root.classList.remove('dark');
      root.classList.add('light');
    } else {
      root.classList.remove('light');
      root.classList.add('dark');
    }
  }, [settings.theme]);

  // Keyboard shortcuts
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        searchInputRef.current?.focus();
      } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'u') {
        e.preventDefault();
        globalFileInputRef.current?.click();
      } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'b') {
        e.preventDefault();
        toggleSidebarCollapsed();
      } else if (e.altKey && ['1', '2', '3', '4', '5', '6'].includes(e.key)) {
        const map: Record<string, NavView> = {
          '1': 'dashboard',
          '2': 'converter',
          '3': 'categories',
          '4': 'batch',
          '5': 'history',
          '6': 'settings',
        };
        navigateTo(map[e.key]);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [navigateTo, toggleSidebarCollapsed]);

  const identifyUploadedFile = useCallback(
    async (file: File): Promise<{ uploadToken: string; info: IdentifiedFileMetadata }> => {
      const form = new FormData();
      form.append('file', file);
      const res = await fetch('/api/identify', { method: 'POST', body: form });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to identify file.');
      }
      return data;
    },
    []
  );

  const handleStageSingleFile = useCallback(
    async (file: File, preferredTarget?: string) => {
      try {
        const { uploadToken, info } = await identifyUploadedFile(file);
        const defaultTarget = resolveDefaultTargetFormat(info, settings, preferredTarget);

        setStaged({
          uploadToken,
          info,
          targetFormat: defaultTarget,
          options: {
            quality: settings.defaultImageQuality,
            crf: settings.defaultVideoCrf,
            bitrate: settings.defaultAudioBitrate,
            stripMetadata: settings.stripMetadataByDefault,
          },
        });
        navigateTo('converter');
      } catch (err) {
        showToast(err instanceof Error ? err.message : 'Upload failed.', 'error');
      }
    },
    [identifyUploadedFile, navigateTo, settings, showToast]
  );

  const handleAddBatchFiles = useCallback(
    async (files: File[]) => {
      try {
        const added: BatchQueueItem[] = [];
        for (const file of files) {
          const { uploadToken, info } = await identifyUploadedFile(file);
          added.push({
            localId: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
            uploadToken,
            info,
            targetFormat: resolveDefaultTargetFormat(info, settings),
            status: 'queued',
            progress: 0,
          });
        }
        setBatchItems((prev) => [...prev, ...added]);
        navigateTo('batch');
      } catch (err) {
        showToast(err instanceof Error ? err.message : 'Failed to queue batch files.', 'error');
      }
    },
    [identifyUploadedFile, navigateTo, settings, showToast]
  );

  const handleFilesSelected = useCallback(
    async (files: File[]) => {
      if (files.length === 1) {
        await handleStageSingleFile(files[0]);
      } else if (files.length > 1) {
        await handleAddBatchFiles(files);
      }
    },
    [handleAddBatchFiles, handleStageSingleFile]
  );

  const handleLoadSample = useCallback(
    async (ext: string, suggestedTarget?: string) => {
      try {
        const res = await fetch(`/api/sample/${encodeURIComponent(ext)}`);
        if (!res.ok) throw new Error('Sample generation failed.');
        const blob = await res.blob();
        const file = new File([blob], `sample.${ext}`, { type: blob.type });
        await handleStageSingleFile(file, suggestedTarget);
      } catch (err) {
        showToast(err instanceof Error ? err.message : 'Could not load sample.', 'error');
      }
    },
    [handleStageSingleFile, showToast]
  );

  const handleAddSampleBatch = useCallback(async () => {
    try {
      const specs = ['png', 'yaml', 'srt'];
      const files: File[] = [];
      for (const ext of specs) {
        const res = await fetch(`/api/sample/${ext}`);
        const blob = await res.blob();
        files.push(new File([blob], `sample.${ext}`, { type: blob.type }));
      }
      await handleAddBatchFiles(files);
      showToast('Added 3 sample files to batch queue.');
    } catch {
      showToast('Failed to load sample batch.', 'error');
    }
  }, [handleAddBatchFiles, showToast]);

  const handleConvertStaged = useCallback(async () => {
    if (!staged || !staged.targetFormat) return;
    setStaged((prev) => (prev ? { ...prev, converting: true, error: undefined } : prev));
    try {
      const res = await fetch('/api/convert', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          uploadToken: staged.uploadToken,
          originalName: staged.info.originalName,
          sourceFormat: staged.info.detectedExt,
          targetFormat: staged.targetFormat,
          options: staged.options,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Conversion failed.');
      }
      setStaged((prev) =>
        prev
          ? {
              ...prev,
              converting: false,
              job: data.job,
              note: data.note,
              outputPreviewData: data.previewData,
            }
          : prev
      );
      await refreshJobsAndSettings();
    } catch (err) {
      setStaged((prev) =>
        prev
          ? {
              ...prev,
              converting: false,
              error: err instanceof Error ? err.message : 'Conversion failed.',
            }
          : prev
      );
    }
  }, [refreshJobsAndSettings, staged]);

  const runBatchItem = useCallback(
    async (item: BatchQueueItem, batchId: string) => {
      if (!item.targetFormat) {
        setBatchItems((prev) =>
          prev.map((x) =>
            x.localId === item.localId
              ? { ...x, status: 'failed', progress: 0, error: 'No compatible output selected.' }
              : x
          )
        );
        return;
      }

      setBatchItems((prev) =>
        prev.map((x) =>
          x.localId === item.localId ? { ...x, status: 'processing', progress: 35, error: undefined } : x
        )
      );

      try {
        const res = await fetch('/api/convert', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            batchId,
            uploadToken: item.uploadToken,
            originalName: item.info.originalName,
            sourceFormat: item.info.detectedExt,
            targetFormat: item.targetFormat,
            options: bulkOptions,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed');
        setBatchItems((prev) =>
          prev.map((x) =>
            x.localId === item.localId ? { ...x, status: 'completed', progress: 100, job: data.job } : x
          )
        );
      } catch (err) {
        setBatchItems((prev) =>
          prev.map((x) =>
            x.localId === item.localId
              ? {
                  ...x,
                  status: 'failed',
                  progress: 0,
                  error: err instanceof Error ? err.message : 'Conversion failed',
                }
              : x
          )
        );
      }
    },
    [bulkOptions]
  );

  const handleStartBatch = useCallback(async () => {
    setBatchRunning(true);
    const batchId = `batch_${Date.now()}`;
    const pending = batchItems.filter((i) => i.status === 'queued' || i.status === 'failed');
    for (const item of pending) {
      await runBatchItem(item, batchId);
    }
    setBatchRunning(false);
    await refreshJobsAndSettings();
    showToast('Batch conversion queue finished.');
  }, [batchItems, refreshJobsAndSettings, runBatchItem, showToast]);

  const handleDownloadAllZip = useCallback(async () => {
    const jobIds = batchItems.filter((i) => i.status === 'completed' && i.job?.id).map((i) => i.job!.id);
    if (jobIds.length === 0) return;
    const res = await fetch('/api/jobs/batch-zip', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jobIds }),
    });
    if (!res.ok) {
      showToast('Failed to assemble ZIP archive.', 'error');
      return;
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `aether_batch_${Date.now()}.zip`;
    a.click();
    URL.revokeObjectURL(url);
  }, [batchItems, showToast]);

  const handleMergeFiles = useCallback(
    async (
      files: File[],
      mode: 'pdf-merge' | 'audio-merge' | 'video-merge' | 'archive-pack',
      targetExt: string
    ): Promise<ConversionJob | null> => {
      const form = new FormData();
      files.forEach((f) => form.append('files', f));
      form.append('mode', mode);
      form.append('targetFormat', targetExt);
      const res = await fetch('/api/merge', { method: 'POST', body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Merge failed.');
      await refreshJobsAndSettings();
      showToast(data.note || 'Merge complete.');
      return data.job;
    },
    [refreshJobsAndSettings, showToast]
  );

  const handleUpdateSettings = useCallback(async (patch: Partial<UserSettings>) => {
    const res = await fetch('/api/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    });
    if (res.ok) {
      const data = await res.json();
      setSettings(data.settings);
      setStorage(data.storage);
    }
  }, []);

  const handleToggleFavorite = useCallback(
    (pair: string) => {
      if (!pair) return;
      const exists = settings.favoritePairs.includes(pair);
      const next = exists
        ? settings.favoritePairs.filter((p) => p !== pair)
        : [pair, ...settings.favoritePairs];
      handleUpdateSettings({ favoritePairs: next });
    },
    [handleUpdateSettings, settings.favoritePairs]
  );

  const searchResults = useMemo(() => {
    const q = globalSearch.trim().toLowerCase();
    if (!q) return [];
    return FORMAT_REGISTRY.filter(
      (f) => f.ext.toLowerCase().includes(q) || f.name.toLowerCase().includes(q)
    ).slice(0, 8);
  }, [globalSearch]);

  const viewTitleMap: Record<NavView, string> = {
    dashboard: 'Dashboard',
    converter: 'Universal Converter',
    categories: 'Format Explorer',
    batch: 'Batch Converter',
    history: 'Conversion History',
    settings: 'Settings & Privacy',
  };

  return (
    <MotionConfig reducedMotion="user">
      <div className="min-h-screen flex bg-[var(--bg-canvas)] text-[var(--text-soft)] relative">
        {/* Monochrome visionOS spatial depth lighting behind translucent glass */}
        <div
          aria-hidden="true"
          className="pointer-events-none fixed inset-0 overflow-hidden"
        >
          <div className="absolute -top-[20%] right-[-10%] w-[780px] h-[780px] rounded-full bg-white/[0.045] dark:bg-white/[0.045] blur-[140px]" />
          <div className="absolute top-[35%] left-[12%] w-[560px] h-[560px] rounded-full bg-black/[0.04] dark:bg-white/[0.025] blur-[150px]" />
          <div className="absolute -bottom-[25%] right-[18%] w-[680px] h-[680px] rounded-full bg-black/[0.05] dark:bg-white/[0.03] blur-[160px]" />
        </div>

        {/* Hidden global file input */}
        <input
          ref={globalFileInputRef}
          type="file"
          multiple
          className="hidden"
          onChange={(e) => {
            const files = Array.from(e.target.files || []);
            if (files.length > 0) handleFilesSelected(files);
            e.target.value = '';
          }}
        />

        {/* Floating Collapsible Liquid Glass Sidebar */}
        <LiquidSidebar
          view={view}
          selectedCategory={selectedCategory}
          collapsed={sidebarCollapsed}
          mobileOpen={mobileNavOpen}
          batchCount={batchItems.length}
          historyCount={jobs.length}
          onToggleCollapse={toggleSidebarCollapsed}
          onCloseMobile={() => setMobileNavOpen(false)}
          onNavigate={navigateTo}
          onSelectCategory={(cat) => {
            setSelectedCategory(cat);
            navigateTo('categories');
          }}
        />

        {/* Main Content Shell (adapts padding in sync with floating sidebar width) */}
        <div
          className={`flex-1 flex flex-col min-w-0 relative z-10 transition-[padding-left] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] ${
            sidebarCollapsed ? 'lg:pl-[92px]' : 'lg:pl-[284px]'
          }`}
        >
          {/* Floating Liquid Glass Command Top Bar (Strict 3-Zone Contract) */}
          <div className="sticky top-3 z-30 px-4 md:px-6">
            <header className="glass-primary glass-rim rounded-[18px] h-14 px-4 md:px-5 flex items-center justify-between gap-4 md:gap-8">
              {/* Zone 1: Active View Title + Mobile Drawer Trigger */}
              <div className="flex items-center gap-3 min-w-0 shrink-0">
                <button
                  type="button"
                  onClick={() => setMobileNavOpen(true)}
                  aria-label="Open navigation"
                  className="lg:hidden glass-interactive p-1.5 rounded-lg text-[var(--text-primary)] cursor-pointer"
                >
                  <Menu className="w-4 h-4" />
                </button>
                <span className="font-display text-sm font-semibold text-[var(--text-primary)] whitespace-nowrap truncate max-w-[165px] sm:max-w-none">
                  {viewTitleMap[view]}
                </span>
              </div>

              {/* Zone 2: Global Format Search */}
              <div className="relative flex-1 max-w-md hidden sm:block">
                <Search className="w-3.5 h-3.5 text-[var(--text-secondary)] absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  ref={searchInputRef}
                  type="text"
                  value={globalSearch}
                  onFocus={() => setSearchFocused(true)}
                  onBlur={() => setTimeout(() => setSearchFocused(false), 180)}
                  onChange={(e) => setGlobalSearch(e.target.value)}
                  placeholder="Search 200+ formats (e.g. WEBP, FLAC, OBJ, YAML)  ⌘K"
                  className="w-full rounded-xl border border-[var(--control-border)] bg-[var(--control-bg)] pl-9 pr-4 py-1.5 text-xs text-[var(--text-primary)] placeholder-[var(--text-secondary)] focus:outline-none focus:border-zinc-500 dark:focus:border-white/40 transition-colors"
                />

                <AnimatePresence>
                  {searchFocused && searchResults.length > 0 && (
                    <motion.div
                      variants={DROPDOWN_VARIANTS}
                      initial="initial"
                      animate="animate"
                      exit="exit"
                      className="absolute left-0 right-0 mt-2 glass-floating glass-rim rounded-xl overflow-hidden divide-y divide-black/8 dark:divide-white/8 z-50"
                    >
                      {searchResults.map((fmt) => (
                        <button
                          key={`${fmt.category}:${fmt.ext}`}
                          type="button"
                          onMouseDown={() => {
                            setSelectedCategory(fmt.category);
                            navigateTo('categories');
                            setGlobalSearch('');
                          }}
                          className="w-full px-4 py-2.5 flex items-center justify-between text-left hover:bg-black/5 dark:hover:bg-white/8 text-xs cursor-pointer transition-colors"
                        >
                          <span>
                            <span className="font-mono font-semibold text-[var(--text-primary)] mr-2">
                              {fmt.ext.toUpperCase()}
                            </span>
                            <span className="text-[var(--text-muted)]">{fmt.name}</span>
                          </span>
                          <span className="text-[var(--text-secondary)] capitalize">{fmt.category}</span>
                        </button>
                      ))}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* Zone 3: 1 Primary Action */}
              <div className="shrink-0">
                <motion.button
                  type="button"
                  whileTap={{ scale: 0.97 }}
                  onClick={() => globalFileInputRef.current?.click()}
                  className="inline-flex items-center gap-2 rounded-xl bg-zinc-900 text-white dark:bg-white dark:text-black px-3.5 sm:px-4 py-2 text-xs font-medium hover:opacity-90 transition-opacity whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  New Conversion
                </motion.button>
              </div>
            </header>
          </div>

          {/* Active View Viewport with Zero-Latency Directional Sliding Transitions */}
          <main className="flex-1 px-4 md:px-6 py-6 max-w-[1280px] w-full mx-auto overflow-x-clip">
            <motion.div
              key={view}
              custom={direction}
              variants={PAGE_SLIDE_VARIANTS}
              initial="initial"
              animate="animate"
            >
              {view === 'dashboard' && (
                <DashboardView
                  jobs={jobs}
                  favoritePairs={settings.favoritePairs}
                  onFilesSelected={handleFilesSelected}
                  onLoadSample={handleLoadSample}
                  onSelectCategory={(cat) => {
                    setSelectedCategory(cat);
                    navigateTo('categories');
                  }}
                  onOpenHistory={() => navigateTo('history')}
                />
              )}

                {view === 'converter' && (
                  <UniversalConverterView
                    staged={staged}
                    favoritePairs={settings.favoritePairs}
                    onUploadFile={handleStageSingleFile}
                    onLoadSample={handleLoadSample}
                    onUpdateStaged={(patch) => setStaged((prev) => (prev ? { ...prev, ...patch } : prev))}
                    onConvert={handleConvertStaged}
                    onToggleFavorite={handleToggleFavorite}
                    onMergeFiles={handleMergeFiles}
                  />
                )}

                {view === 'categories' && (
                  <CategoriesView
                    selectedCategory={selectedCategory}
                    onSelectCategory={setSelectedCategory}
                    favoritePairs={settings.favoritePairs}
                    onToggleFavorite={handleToggleFavorite}
                    onLaunchSample={handleLoadSample}
                  />
                )}

                {view === 'batch' && (
                  <BatchConverterView
                    items={batchItems}
                    bulkOptions={bulkOptions}
                    onUpdateBulkOptions={setBulkOptions}
                    onAddFiles={handleAddBatchFiles}
                    onAddSampleSet={handleAddSampleBatch}
                    onSetItemTarget={(localId, targetFormat) =>
                      setBatchItems((prev) =>
                        prev.map((x) => (x.localId === localId ? { ...x, targetFormat } : x))
                      )
                    }
                    onRemoveItem={(localId) => setBatchItems((prev) => prev.filter((x) => x.localId !== localId))}
                    onClearQueue={() => setBatchItems([])}
                    onStartBatch={handleStartBatch}
                    onCancelItem={async (localId) => {
                      const target = batchItems.find((x) => x.localId === localId);
                      if (target?.job?.id) {
                        await fetch(`/api/jobs/${target.job.id}/cancel`, { method: 'POST' });
                      }
                      setBatchItems((prev) =>
                        prev.map((x) => (x.localId === localId ? { ...x, status: 'cancelled', progress: 0 } : x))
                      );
                    }}
                    onRetryItem={async (localId) => {
                      const target = batchItems.find((x) => x.localId === localId);
                      if (target) await runBatchItem(target, `retry_${Date.now()}`);
                    }}
                    onDownloadAllZip={handleDownloadAllZip}
                    running={batchRunning}
                  />
                )}

                {view === 'history' && (
                  <HistoryView
                    jobs={jobs}
                    onDeleteJob={async (id) => {
                      await fetch(`/api/jobs/${id}`, { method: 'DELETE' });
                      await refreshJobsAndSettings();
                    }}
                    onClearHistory={async () => {
                      await fetch('/api/history', { method: 'DELETE' });
                      await refreshJobsAndSettings();
                      showToast('Conversion history cleared.');
                    }}
                  />
                )}

                {view === 'settings' && (
                  <SettingsView
                    settings={settings}
                    storage={storage}
                    onUpdateSettings={handleUpdateSettings}
                    onPurgeStorage={async () => {
                      const res = await fetch('/api/storage/purge', { method: 'POST' });
                      if (res.ok) {
                        const data = await res.json();
                        setStorage(data.storage);
                        await refreshJobsAndSettings();
                        showToast(`Purged ${data.removedFiles} temporary file(s).`);
                      }
                    }}
                  />
                )}
              </motion.div>
          </main>
        </div>

        {/* Sliding Floating Glass Toast Notification */}
        <AnimatePresence>
          {toast && (
            <motion.div
              role="status"
              variants={TOAST_VARIANTS}
              initial="initial"
              animate="animate"
              exit="exit"
              className={`fixed top-[78px] right-6 z-50 glass-floating glass-rim rounded-xl px-4 py-2.5 text-xs font-medium flex items-center gap-3 max-w-sm ${
                toast.kind === 'error'
                  ? 'border-red-500/45 text-red-600 dark:text-red-300'
                  : 'text-[var(--text-primary)]'
              }`}
            >
              <span className="truncate">{toast.message}</span>
              <button
                type="button"
                aria-label="Dismiss notification"
                onClick={() => setToast(null)}
                className="text-[var(--text-secondary)] hover:text-[var(--text-primary)] shrink-0 cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </MotionConfig>
  );
}
