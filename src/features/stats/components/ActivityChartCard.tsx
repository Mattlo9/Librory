import { useMemo, useState } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { useActivityStats } from '@/features/stats/hooks/useReadingStats';
import { cn } from '@/lib/utils';
import type { ActivityBucket, ActivityRange } from '@/types/domain';

const RANGE_OPTIONS: Array<{ value: ActivityRange; label: string }> = [
  { value: '6m', label: '6m' },
  { value: '30d', label: '30d' },
  { value: '7d', label: '7d' },
];

const SERIES_META = [
  {
    key: 'addedCount',
    label: 'Añadidos',
    unitSingular: 'recurso',
    unitPlural: 'recursos',
    barClass: 'bg-indigo-500 dark:bg-indigo-400',
  },
  {
    key: 'finishedCount',
    label: 'Terminados',
    unitSingular: 'libro',
    unitPlural: 'libros',
    barClass: 'bg-emerald-500 dark:bg-emerald-400',
  },
  {
    key: 'highlightsCount',
    label: 'Subrayados',
    unitSingular: 'cita',
    unitPlural: 'citas',
    barClass: 'bg-amber-400 dark:bg-amber-400',
  },
  {
    key: 'notesCount',
    label: 'Notas',
    unitSingular: 'nota',
    unitPlural: 'notas',
    barClass: 'bg-sky-500 dark:bg-sky-400',
  },
] as const;

function computeNiceYAxis(maxTotal: number): {
  yMax: number;
  ticks: number[];
} {
  if (maxTotal <= 4) {
    return { yMax: 4, ticks: [4, 3, 2, 1, 0] };
  }
  const rawStep = maxTotal / 4;
  const magnitude = 10 ** Math.floor(Math.log10(rawStep));
  const fraction = rawStep / magnitude;
  let niceFactor = 1;
  if (fraction <= 1) niceFactor = 1;
  else if (fraction <= 2) niceFactor = 2;
  else if (fraction <= 2.5) niceFactor = 2.5;
  else if (fraction <= 5) niceFactor = 5;
  else niceFactor = 10;

  const step = Math.max(1, Math.ceil(niceFactor * magnitude));
  const yMax = step * 4;
  return {
    yMax,
    ticks: [yMax, step * 3, step * 2, step, 0],
  };
}

function shouldShowXLabel(
  index: number,
  totalBuckets: number,
  range: ActivityRange,
): boolean {
  if (range !== '30d') return true;
  if (index === 0 || index === totalBuckets - 1) return true;
  return index % 5 === 0 && totalBuckets - 1 - index >= 3;
}

function formatBucketDetail(bucket: ActivityBucket): string {
  return `${bucket.fullLabel}: ${bucket.addedCount} añadidos · ${bucket.finishedCount} terminados · ${bucket.highlightsCount} subrayados · ${bucket.notesCount} notas`;
}

/**
 * Stacked bar activity chart with numeric Y-axis, 6m/30d/7d toggles, and breakdown table.
 */
export function ActivityChartCard() {
  const [range, setRange] = useState<ActivityRange>('30d');
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  const activityQuery = useActivityStats(range, true);

  const { yMax, ticks } = useMemo(() => {
    const buckets = activityQuery.data?.buckets ?? [];
    const maxTotal = Math.max(
      0,
      ...buckets.map(
        (b) =>
          b.addedCount + b.finishedCount + b.highlightsCount + b.notesCount,
      ),
    );
    return computeNiceYAxis(maxTotal);
  }, [activityQuery.data?.buckets]);

  if (activityQuery.isLoading) {
    return (
      <section className="rounded-xl border border-border bg-card p-5 space-y-4">
        <div className="flex items-center justify-between">
          <Skeleton className="h-5 w-36" />
          <Skeleton className="h-7 w-28 rounded-lg" />
        </div>
        <Skeleton className="h-48 w-full rounded-lg" />
        <Skeleton className="h-24 w-full rounded-lg" />
      </section>
    );
  }

  const snapshot = activityQuery.data;
  if (!snapshot) return null;

  const { buckets, totals } = snapshot;
  const hoveredBucket =
    hoveredIndex !== null ? (buckets[hoveredIndex] ?? null) : null;

  const seriesCounts: Record<(typeof SERIES_META)[number]['key'], number> = {
    addedCount: totals.added,
    finishedCount: totals.finished,
    highlightsCount: totals.highlights,
    notesCount: totals.notes,
  };

  return (
    <section
      aria-label="Actividad de lectura y notas"
      className="rounded-xl border border-border bg-card p-5 space-y-4"
    >
      {/* Header + range pills */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold tracking-tight text-foreground">
            Actividad
          </h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Recursos añadidos, terminados, subrayados y notas creadas.
          </p>
        </div>

        <div
          role="group"
          aria-label="Periodo de actividad"
          className="inline-flex items-center gap-0.5 rounded-lg border border-border/60 bg-secondary/50 p-0.5"
        >
          {RANGE_OPTIONS.map((opt) => {
            const active = range === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                aria-pressed={active}
                onClick={() => {
                  setRange(opt.value);
                  setHoveredIndex(null);
                }}
                className={cn(
                  'rounded-md px-2.5 py-1 text-xs font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  active
                    ? 'bg-background text-foreground shadow-xs'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Stacked bar chart */}
      <div className="space-y-1.5 pt-1">
        <div className="flex items-stretch gap-2">
          {/* Y-axis numeric ticks */}
          <div
            aria-hidden="true"
            className="flex h-48 w-7 shrink-0 flex-col justify-between text-right font-mono text-[10.5px] leading-none tabular-nums text-muted-foreground"
          >
            {ticks.map((tick) => (
              <span key={tick}>{tick}</span>
            ))}
          </div>

          {/* Plot canvas */}
          <div
            className="relative h-48 min-w-0 flex-1"
            onMouseLeave={() => setHoveredIndex(null)}
          >
            {/* Horizontal grid lines */}
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 flex flex-col justify-between"
            >
              {ticks.map((tick, idx) => (
                <div
                  key={tick}
                  className={cn(
                    'w-full border-b',
                    idx === ticks.length - 1
                      ? 'border-border'
                      : 'border-border/40',
                  )}
                />
              ))}
            </div>

            {/* Columns */}
            <div
              className={cn(
                'relative z-10 flex h-full items-end px-1',
                range === '30d' ? 'gap-1 sm:gap-1.5' : 'gap-3 sm:gap-5',
              )}
            >
              {buckets.map((bucket, idx) => {
                const bucketTotal =
                  bucket.addedCount +
                  bucket.finishedCount +
                  bucket.highlightsCount +
                  bucket.notesCount;
                const totalHeightPct =
                  bucketTotal > 0
                    ? Math.max(2.5, (bucketTotal / yMax) * 100)
                    : 0;
                const detail = formatBucketDetail(bucket);
                const dimmed =
                  hoveredIndex !== null && hoveredIndex !== idx;

                return (
                  <button
                    key={bucket.key}
                    type="button"
                    aria-label={detail}
                    title={detail}
                    onMouseEnter={() => setHoveredIndex(idx)}
                    onFocus={() => setHoveredIndex(idx)}
                    onBlur={() => setHoveredIndex(null)}
                    className={cn(
                      'flex h-full min-w-0 flex-1 flex-col items-center justify-end outline-none transition-opacity',
                      dimmed ? 'opacity-45' : 'opacity-100',
                    )}
                  >
                    {bucketTotal > 0 ? (
                      <div
                        className="flex w-full max-w-10 flex-col-reverse overflow-hidden rounded-t-[4px] transition-[height]"
                        style={{ height: `${Math.min(100, totalHeightPct)}%` }}
                      >
                        {SERIES_META.map((series) => {
                          const count = bucket[series.key];
                          if (count <= 0) return null;
                          return (
                            <div
                              key={series.key}
                              className={cn('w-full', series.barClass)}
                              style={{
                                height: `${(count / bucketTotal) * 100}%`,
                              }}
                            />
                          );
                        })}
                      </div>
                    ) : (
                      <div className="h-[2px] w-full max-w-10 rounded-full bg-border/60" />
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* X-axis labels */}
        <div className="flex items-start gap-2">
          <div className="w-7 shrink-0" aria-hidden="true" />
          <div
            className={cn(
              'flex min-w-0 flex-1 px-1',
              range === '30d' ? 'gap-1 sm:gap-1.5' : 'gap-3 sm:gap-5',
            )}
          >
            {buckets.map((bucket, idx) => {
              const show = shouldShowXLabel(idx, buckets.length, range);
              return (
                <div
                  key={bucket.key}
                  className="relative flex h-4 min-w-0 flex-1 justify-center"
                >
                  {show ? (
                    <span className="whitespace-nowrap font-mono text-[10.5px] text-muted-foreground">
                      {bucket.label}
                    </span>
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Hover detail line */}
      <p className="min-h-4 text-[11px] text-muted-foreground">
        {hoveredBucket
          ? formatBucketDetail(hoveredBucket)
          : 'Pasa el cursor por una barra para ver el detalle del periodo.'}
      </p>

      {/* Bottom breakdown table */}
      <div className="divide-y divide-border/50 border-t border-border/60 pt-1">
        {SERIES_META.map((series) => {
          const count = seriesCounts[series.key];
          const pct =
            totals.total > 0 ? ((count / totals.total) * 100).toFixed(1) : '0.0';
          const unit = count === 1 ? series.unitSingular : series.unitPlural;

          return (
            <div
              key={series.key}
              className="flex items-center justify-between gap-4 py-2 text-xs"
            >
              <span className="flex items-center gap-2.5 text-foreground">
                <span
                  aria-hidden="true"
                  className={cn('size-2.5 shrink-0 rounded-[3px]', series.barClass)}
                />
                <span className="font-medium">{series.label}</span>
              </span>

              <div className="flex items-center gap-4 tabular-nums">
                <span className="font-mono text-[11.5px] text-muted-foreground">
                  {count.toLocaleString('es')} {unit}
                </span>
                <span className="w-12 text-right font-mono text-xs font-medium text-foreground">
                  {pct}%
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
