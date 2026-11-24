import { useCallback, useEffect, useState } from 'react';
import { Activity, CheckCircle2, RefreshCw, XCircle } from 'lucide-react';
import type { ActivityEvent, ConversionJob } from '../shared/types';
import { formatRelativeTime } from '../utils/formatters';
import { GlassSurface } from './glass/GlassSurface';

interface RecentActivityViewProps {
  jobs: ConversionJob[];
  onOpenFullHistory: () => void;
}

export function RecentActivityView({ jobs, onOpenFullHistory }: RecentActivityViewProps) {
  const [activities, setActivities] = useState<ActivityEvent[]>([]);
  const [loading, setLoading] = useState(true);

  const loadActivities = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/activities');
      if (res.ok) {
        const data = await res.json();
        setActivities(data.activities || []);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadActivities();
  }, [loadActivities]);

  return (
    <div className="space-y-6">
      <GlassSurface as="section" className="rounded-[22px] p-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="font-display text-lg font-semibold text-[var(--text-primary)]">Recent Activity</h2>
          <p className="text-xs text-[var(--text-muted)] mt-0.5">
            Live timeline of custom workflows, workspace operations, preset edits, and conversions.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={loadActivities}
            className="glass-interactive inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs text-[var(--text-primary)] cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
          <button
            type="button"
            onClick={onOpenFullHistory}
            className="rounded-xl bg-zinc-900 text-white dark:bg-white dark:text-black px-4 py-2 text-xs font-medium cursor-pointer"
          >
            Activity History
          </button>
        </div>
      </GlassSurface>

      <GlassSurface as="section" className="rounded-[22px] p-6 space-y-4">
        {activities.length === 0 && jobs.length === 0 ? (
          <div className="py-12 text-center space-y-2">
            <Activity className="w-7 h-7 text-[var(--text-secondary)] mx-auto" />
            <p className="text-sm text-[var(--text-primary)]">No recent events recorded yet</p>
            <p className="text-xs text-[var(--text-secondary)]">
              Run a workflow, batch conversion, preset change, or workspace operation to populate this timeline.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-black/8 dark:divide-white/8">
            {activities.map((ev) => (
              <div key={ev.id} className="py-3 flex items-start justify-between gap-3 text-xs">
                <div className="flex items-start gap-2.5 min-w-0">
                  {ev.status === 'failed' ? (
                    <XCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                  ) : (
                    <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                  )}
                  <div className="min-w-0">
                    <p className="font-medium text-[var(--text-primary)]">{ev.title}</p>
                    <p className="text-[var(--text-muted)] mt-0.5">
                      <span className="capitalize">{ev.kind}</span> · {ev.detail}
                    </p>
                  </div>
                </div>
                <span className="text-[var(--text-secondary)] tabular-nums shrink-0">
                  {formatRelativeTime(ev.timestamp)}
                </span>
              </div>
            ))}
          </div>
        )}
      </GlassSurface>
    </div>
  );
}
