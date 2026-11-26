import { BarChart3, BookOpen, TrendingUp } from 'lucide-react';
import { useId, useMemo, useState } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { formatDurationCompact } from '@/features/pomodoro/lib/formatTime';
import { useStudyEvolutionStats } from '@/features/stats/hooks/useStudyStats';
import { cn } from '@/lib/utils';
import type {
  StudyEvolutionBucket,
  StudyEvolutionGranularity,
  StudyPeriodSummary,
} from '@/types/domain';

interface StudyEvolutionCardProps {
  onOpenItem: (itemId: string) => void;
}

type EvolutionChartMode = 'period' | 'cumulative';

const GRANULARITY_OPTIONS: Array<{
  value: StudyEvolutionGranularity;
  label: string;
}> = [
  { value: 'day14', label: '14d' },
  { value: 'day30', label: '30d' },
  { value: 'week12', label: 'Sem.' },
  { value: 'month12', label: 'Mes' },
  { value: 'year', label: 'Año' },
];

const CHART_MODE_OPTIONS: Array<{
  value: EvolutionChartMode;
  label: string;
}> = [
  { value: 'period', label: 'Por periodo' },
  { value: 'cumulative', label: 'Acumulado' },
];

const DURATION_STEP_CANDIDATES = [
  60, 120, 180, 300, 600, 900, 1800, 2700, 3600, 5400, 7200, 10800, 14400,
  18000, 28800, 36000, 54000, 72000, 108000, 144000, 180000, 360000, 720000,
  1800000, 3600000,
] as const;

const SVG_WIDTH = 600;
const SVG_HEIGHT = 200;

function formatAxisDuration(seconds: number): string {
  if (seconds <= 0) return '0m';
  const totalMinutes = Math.round(seconds / 60);
  if (totalMinutes < 60) {
    return `${totalMinutes}m`;
  }
  const hours = Math.floor(totalMinutes / 60);
  const rem = totalMinutes % 60;
  return rem === 0 ? `${hours}h` : `${hours}h ${rem}m`;
}

function computeNiceDurationAxis(maxSeconds: number): {
  yMaxSeconds: number;
  ticks: Array<{ seconds: number; label: string }>;
} {
  if (!Number.isFinite(maxSeconds) || maxSeconds <= 0) {
    const rawTicks = [3600, 2700, 1800, 900, 0];
    return {
      yMaxSeconds: 3600,
      ticks: rawTicks.map((s) => ({
        seconds: s,
        label: formatAxisDuration(s),
      })),
    };
  }

  const rawStep = maxSeconds / 4;
  let step = DURATION_STEP_CANDIDATES.find((c) => c >= rawStep);
  if (!step) {
    step = Math.ceil(rawStep / 360000) * 360000;
  }

  const yMaxSeconds = step * 4;
  const rawTicks = [yMaxSeconds, step * 3, step * 2, step, 0];
  return {
    yMaxSeconds,
    ticks: rawTicks.map((s) => ({
      seconds: s,
      label: formatAxisDuration(s),
    })),
  };
}

function shouldShowEvolutionXLabel(
  index: number,
  total: number,
  granularity: StudyEvolutionGranularity,
): boolean {
  if (granularity === 'year' || total <= 6) return true;
  if (granularity === 'day30') {
    return index === 0 || index === total - 1 || (index % 5 === 0 && total - 1 - index >= 3);
  }
  return index === 0 || index === total - 1 || (index % 2 === 0 && total - 1 - index >= 2);
}

function formatBucketDetail(bucket: StudyEvolutionBucket): string {
  const sessionsLabel = bucket.sessions === 1 ? 'sesión' : 'sesiones';
  return `${bucket.fullLabel}: ${formatDurationCompact(bucket.focusSeconds)} (${bucket.sessions} ${sessionsLabel}) · Acumulado: ${formatDurationCompact(bucket.cumulativeSeconds)}`;
}

function PeriodSummaryCard({
  title,
  summary,
  comparisonLabel,
}: {
  title: string;
  summary: StudyPeriodSummary;
  comparisonLabel: string;
}) {
  const sessionsText = `${summary.currentSessions} ${summary.currentSessions === 1 ? 'sesión' : 'sesiones'}`;

  let deltaText = '—';
  let deltaTone = 'text-muted-foreground';

  if (summary.deltaPercent !== null) {
    if (summary.deltaPercent > 0) {
      deltaText = `+${summary.deltaPercent}% ${comparisonLabel}`;
      deltaTone = 'text-emerald-600 dark:text-emerald-400';
    } else if (summary.deltaPercent < 0) {
      deltaText = `${summary.deltaPercent}% ${comparisonLabel}`;
      deltaTone = 'text-amber-600 dark:text-amber-400';
    } else {
      deltaText = `0% ${comparisonLabel}`;
      deltaTone = 'text-muted-foreground';
    }
  } else if (summary.currentSeconds > 0) {
    deltaText = `Nuevo ${comparisonLabel}`;
    deltaTone = 'text-emerald-600 dark:text-emerald-400';
  }

  return (
    <div className="rounded-lg border border-border/50 bg-secondary/45 px-3.5 py-2.5">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] text-muted-foreground">{title}</p>
        <span className="font-mono text-[10.5px] tabular-nums text-muted-foreground">
          {sessionsText}
        </span>
      </div>
      <p className="mt-0.5 font-mono text-lg font-semibold tabular-nums text-foreground">
        {formatDurationCompact(summary.currentSeconds)}
      </p>
      <p className={cn('mt-0.5 font-mono text-[10.5px] tabular-nums', deltaTone)}>
        {deltaText}
      </p>
    </div>
  );
}

/**
 * Dedicated Pomodoro accumulated focus time & chronological evolution card
 * with Day/Week/Month/Year toggles, period bars vs cumulative curve, and book breakdown.
 */
export function StudyEvolutionCard({ onOpenItem }: StudyEvolutionCardProps) {
  const [granularity, setGranularity] =
    useState<StudyEvolutionGranularity>('day14');
  const [chartMode, setChartMode] = useState<EvolutionChartMode>('period');
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const gradientId = useId();

  const evolutionQuery = useStudyEvolutionStats(granularity, true);

  const { yMaxSeconds, ticks } = useMemo(() => {
    const buckets = evolutionQuery.data?.buckets ?? [];
    const maxVal = Math.max(
      0,
      ...buckets.map((b) =>
        chartMode === 'period' ? b.focusSeconds : b.cumulativeSeconds,
      ),
    );
    return computeNiceDurationAxis(maxVal);
  }, [evolutionQuery.data?.buckets, chartMode]);

  const cumulativeGeometry = useMemo(() => {
    const buckets = evolutionQuery.data?.buckets ?? [];
    if (buckets.length === 0) {
      return { linePoints: '', areaPath: '', coords: [] as Array<{ xPct: number; yPct: number }> };
    }

    const n = buckets.length;
    const coords = buckets.map((bucket, idx) => {
      const xPct = ((idx + 0.5) / n) * 100;
      const yPct = Math.min(
        100,
        Math.max(0, (bucket.cumulativeSeconds / yMaxSeconds) * 100),
      );
      return {
        xPct,
        yPct,
        svgX: (xPct / 100) * SVG_WIDTH,
        svgY: SVG_HEIGHT - (yPct / 100) * SVG_HEIGHT,
      };
    });

    const linePoints = coords.map((p) => `${p.svgX.toFixed(2)},${p.svgY.toFixed(2)}`).join(' ');
    const first = coords[0]!;
    const last = coords[coords.length - 1]!;
    const areaPath =
      coords.length === 1
        ? `M 0 ${first.svgY.toFixed(2)} L ${SVG_WIDTH} ${first.svgY.toFixed(2)} L ${SVG_WIDTH} ${SVG_HEIGHT} L 0 ${SVG_HEIGHT} Z`
        : `M ${first.svgX.toFixed(2)} ${SVG_HEIGHT} L ${coords
            .map((p) => `${p.svgX.toFixed(2)} ${p.svgY.toFixed(2)}`)
            .join(' L ')} L ${last.svgX.toFixed(2)} ${SVG_HEIGHT} Z`;

    return {
      linePoints,
      areaPath,
      coords: coords.map(({ xPct, yPct }) => ({ xPct, yPct })),
    };
  }, [evolutionQuery.data?.buckets, yMaxSeconds]);

  if (evolutionQuery.isLoading) {
    return (
      <section
        aria-label="Evolución de tiempo Pomodoro"
        className="space-y-4 rounded-xl border border-border bg-card p-5"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Skeleton className="h-5 w-56" />
          <Skeleton className="h-7 w-64 rounded-lg" />
        </div>
        <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }, (_, idx) => (
            <Skeleton key={idx} className="h-20 rounded-lg" />
          ))}
        </div>
        <Skeleton className="h-52 w-full rounded-lg" />
        <Skeleton className="h-24 w-full rounded-lg" />
      </section>
    );
  }

  const data = evolutionQuery.data;
  if (!data) return null;

  const {
    buckets,
    summaries,
    bookBreakdown,
    periodTotalSeconds,
    periodSessions,
    averageBucketSeconds,
    averageActiveBucketSeconds,
    bestBucket,
  } = data;

  const hoveredBucket =
    hoveredIndex !== null ? (buckets[hoveredIndex] ?? null) : null;

  const averagePct =
    chartMode === 'period' && averageBucketSeconds > 0
      ? Math.min(100, Math.max(0, (averageBucketSeconds / yMaxSeconds) * 100))
      : null;

  const maxBookSeconds = Math.max(
    1,
    ...bookBreakdown.map((b) => b.focusSeconds),
  );

  return (
    <section
      aria-label="Evolución de tiempo Pomodoro"
      className="space-y-4 rounded-xl border border-border bg-card p-5"
    >
      {/* Header + controls */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold tracking-tight text-foreground">
            Evolución de estudio (Pomodoro)
          </h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Tiempo enfocado acumulado y evolución por día, semana, mes y año.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div
            role="group"
            aria-label="Granularidad de evolución"
            className="inline-flex items-center gap-0.5 rounded-lg border border-border/60 bg-secondary/50 p-0.5"
          >
            {GRANULARITY_OPTIONS.map((opt) => {
              const active = granularity === opt.value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  aria-pressed={active}
                  onClick={() => {
                    setGranularity(opt.value);
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

          <div
            role="group"
            aria-label="Modo de visualización"
            className="inline-flex items-center gap-0.5 rounded-lg border border-border/60 bg-secondary/50 p-0.5"
          >
            {CHART_MODE_OPTIONS.map((opt) => {
              const active = chartMode === opt.value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setChartMode(opt.value)}
                  className={cn(
                    'inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring',
                    active
                      ? 'bg-background text-foreground shadow-xs'
                      : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  {opt.value === 'period' ? (
                    <BarChart3 className="size-3" />
                  ) : (
                    <TrendingUp className="size-3" />
                  )}
                  <span>{opt.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* 4 Summary cards: Hoy / Esta semana / Este mes / Total acumulado */}
      <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
        <PeriodSummaryCard
          title="Hoy"
          summary={summaries.today}
          comparisonLabel="vs ayer"
        />
        <PeriodSummaryCard
          title="Esta semana"
          summary={summaries.thisWeek}
          comparisonLabel="vs sem. ant."
        />
        <PeriodSummaryCard
          title="Este mes"
          summary={summaries.thisMonth}
          comparisonLabel="vs mes ant."
        />
        <div className="rounded-lg border border-border/50 bg-secondary/45 px-3.5 py-2.5">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[11px] text-muted-foreground">Total acumulado</p>
            <span className="font-mono text-[10.5px] tabular-nums text-muted-foreground">
              histórico
            </span>
          </div>
          <p className="mt-0.5 font-mono text-lg font-semibold tabular-nums text-foreground">
            {formatDurationCompact(summaries.allTimeSeconds)}
          </p>
          <p className="mt-0.5 font-mono text-[10.5px] tabular-nums text-muted-foreground">
            {summaries.allTimeSessions.toLocaleString('es')}{' '}
            {summaries.allTimeSessions === 1 ? 'sesión' : 'sesiones'}
          </p>
        </div>
      </div>

      {/* Interactive chart */}
      <div className="space-y-1.5 pt-1">
        <div className="flex items-stretch gap-2">
          {/* Y-axis duration ticks */}
          <div
            aria-hidden="true"
            className="flex h-52 w-11 shrink-0 flex-col justify-between text-right font-mono text-[10.5px] leading-none tabular-nums text-muted-foreground"
          >
            {ticks.map((tick) => (
              <span key={tick.seconds}>{tick.label}</span>
            ))}
          </div>

          {/* Plot canvas */}
          <div
            className="relative h-52 min-w-0 flex-1"
            onMouseLeave={() => setHoveredIndex(null)}
          >
            {/* Horizontal grid lines */}
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 flex flex-col justify-between"
            >
              {ticks.map((tick, idx) => (
                <div
                  key={tick.seconds}
                  className={cn(
                    'w-full border-b',
                    idx === ticks.length - 1
                      ? 'border-border'
                      : 'border-border/40',
                  )}
                />
              ))}
            </div>

            {chartMode === 'period' ? (
              <>
                {/* Average reference line */}
                {averagePct !== null ? (
                  <div
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-x-0 z-20 flex items-center justify-end border-t border-dashed border-emerald-500/60"
                    style={{ bottom: `${averagePct}%` }}
                  >
                    <span className="-translate-y-1/2 rounded border border-emerald-500/35 bg-popover/90 px-1.5 py-0.5 font-mono text-[9.5px] tabular-nums text-emerald-700 shadow-xs dark:text-emerald-300">
                      Prom. {formatDurationCompact(averageBucketSeconds)}
                    </span>
                  </div>
                ) : null}

                {/* Period bars */}
                <div
                  className={cn(
                    'relative z-10 flex h-full items-end px-1',
                    granularity === 'day30' ? 'gap-1 sm:gap-1.5' : 'gap-2 sm:gap-3.5',
                  )}
                >
                  {buckets.map((bucket, idx) => {
                    const heightPct =
                      bucket.focusSeconds > 0
                        ? Math.max(2.5, (bucket.focusSeconds / yMaxSeconds) * 100)
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
                          dimmed ? 'opacity-40' : 'opacity-100',
                        )}
                      >
                        {bucket.focusSeconds > 0 ? (
                          <div
                            className={cn(
                              'w-full max-w-10 rounded-t-[4px] transition-[height]',
                              bucket.isCurrentPeriod
                                ? 'bg-emerald-600 ring-1 ring-emerald-500/40 dark:bg-emerald-400'
                                : 'bg-emerald-500/80 dark:bg-emerald-500/75',
                            )}
                            style={{
                              height: `${Math.min(100, heightPct)}%`,
                            }}
                          />
                        ) : (
                          <div className="h-[2px] w-full max-w-10 rounded-full bg-border/60" />
                        )}
                      </button>
                    );
                  })}
                </div>
              </>
            ) : (
              <>
                {/* Cumulative area + line SVG */}
                <svg
                  aria-hidden="true"
                  viewBox={`0 0 ${SVG_WIDTH} ${SVG_HEIGHT}`}
                  preserveAspectRatio="none"
                  className="pointer-events-none absolute inset-0 z-10 h-full w-full overflow-visible"
                >
                  <defs>
                    <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                      <stop
                        offset="0%"
                        stopColor="rgb(16 185 129)"
                        stopOpacity="0.32"
                      />
                      <stop
                        offset="100%"
                        stopColor="rgb(16 185 129)"
                        stopOpacity="0.02"
                      />
                    </linearGradient>
                  </defs>

                  {cumulativeGeometry.areaPath ? (
                    <path
                      d={cumulativeGeometry.areaPath}
                      fill={`url(#${gradientId})`}
                    />
                  ) : null}

                  {cumulativeGeometry.linePoints ? (
                    <polyline
                      fill="none"
                      stroke="rgb(16 185 129)"
                      strokeWidth="2"
                      strokeLinejoin="round"
                      strokeLinecap="round"
                      vectorEffect="non-scaling-stroke"
                      points={cumulativeGeometry.linePoints}
                    />
                  ) : null}
                </svg>

                {/* Circular data dots & vertical hover guide */}
                <div
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-0 z-15"
                >
                  {hoveredIndex !== null && cumulativeGeometry.coords[hoveredIndex] ? (
                    <div
                      className="absolute inset-y-0 w-px bg-emerald-500/45"
                      style={{
                        left: `${cumulativeGeometry.coords[hoveredIndex]!.xPct}%`,
                      }}
                    />
                  ) : null}

                  {cumulativeGeometry.coords.map((coord, idx) => {
                    const isHovered = hoveredIndex === idx;
                    const isEndpoint = idx === buckets.length - 1;
                    const showDot =
                      isHovered ||
                      isEndpoint ||
                      granularity === 'day14' ||
                      granularity === 'year';

                    if (!showDot) return null;

                    return (
                      <span
                        key={buckets[idx]?.key ?? idx}
                        className={cn(
                          'absolute -translate-x-1/2 translate-y-1/2 rounded-full border border-card transition-transform',
                          isHovered
                            ? 'size-3 scale-110 bg-emerald-500 ring-2 ring-emerald-500/35'
                            : 'size-2 bg-emerald-500',
                        )}
                        style={{
                          left: `${coord.xPct}%`,
                          bottom: `${coord.yPct}%`,
                        }}
                      />
                    );
                  })}
                </div>

                {/* Interactive hit-columns */}
                <div className="relative z-20 flex h-full items-stretch">
                  {buckets.map((bucket, idx) => {
                    const detail = formatBucketDetail(bucket);
                    return (
                      <button
                        key={bucket.key}
                        type="button"
                        aria-label={detail}
                        title={detail}
                        onMouseEnter={() => setHoveredIndex(idx)}
                        onFocus={() => setHoveredIndex(idx)}
                        onBlur={() => setHoveredIndex(null)}
                        className="h-full min-w-0 flex-1 bg-transparent outline-none"
                      />
                    );
                  })}
                </div>
              </>
            )}
          </div>
        </div>

        {/* X-axis labels */}
        <div className="flex items-start gap-2">
          <div className="w-11 shrink-0" aria-hidden="true" />
          <div
            className={cn(
              'flex min-w-0 flex-1 px-1',
              chartMode === 'period'
                ? granularity === 'day30'
                  ? 'gap-1 sm:gap-1.5'
                  : 'gap-2 sm:gap-3.5'
                : 'gap-0',
            )}
          >
            {buckets.map((bucket, idx) => {
              const show = shouldShowEvolutionXLabel(
                idx,
                buckets.length,
                granularity,
              );
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

      {/* Live hover / summary detail line */}
      <p className="min-h-4 text-[11px] text-muted-foreground">
        {hoveredBucket ? (
          <span className="font-medium text-foreground">
            {formatBucketDetail(hoveredBucket)}
          </span>
        ) : periodTotalSeconds > 0 ? (
          `Total del rango: ${formatDurationCompact(periodTotalSeconds)} (${periodSessions} ${periodSessions === 1 ? 'sesión' : 'sesiones'}) · Promedio por periodo activo: ${formatDurationCompact(averageActiveBucketSeconds)}${bestBucket ? ` · Mejor: ${bestBucket.fullLabel} (${formatDurationCompact(bestBucket.focusSeconds)})` : ''}`
        ) : (
          'Aún no hay sesiones Pomodoro registradas en este rango.'
        )}
      </p>

      {/* Per-book time breakdown */}
      <div className="space-y-2.5 border-t border-border/60 pt-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 text-xs font-medium text-foreground">
            <BookOpen className="size-3.5 text-emerald-600 dark:text-emerald-400" />
            <span>Tiempo por recurso en este periodo</span>
          </div>
          {periodTotalSeconds > 0 ? (
            <span className="font-mono text-[11px] tabular-nums text-muted-foreground">
              {formatDurationCompact(periodTotalSeconds)}
            </span>
          ) : null}
        </div>

        {bookBreakdown.length === 0 ? (
          <p className="py-2 text-xs text-muted-foreground">
            No hay sesiones registradas por libro en el periodo seleccionado.
          </p>
        ) : (
          <div className="space-y-2">
            {bookBreakdown.map((entry, idx) => {
              const widthPct = Math.max(
                4,
                Math.round((entry.focusSeconds / maxBookSeconds) * 100),
              );
              const sessionsLabel =
                entry.sessions === 1 ? '1 sesión' : `${entry.sessions} sesiones`;

              return (
                <div
                  key={entry.itemId ?? `free-${idx}-${entry.title}`}
                  className="space-y-1"
                >
                  <div className="flex items-center justify-between gap-3 text-xs">
                    {entry.itemId ? (
                      <button
                        type="button"
                        onClick={() => onOpenItem(entry.itemId!)}
                        title={
                          entry.author
                            ? `${entry.title} — ${entry.author}`
                            : entry.title
                        }
                        className="min-w-0 truncate text-left font-medium text-foreground outline-none transition-colors hover:text-accent-brand focus-visible:underline"
                      >
                        {entry.title}
                      </button>
                    ) : (
                      <span className="min-w-0 truncate font-medium text-muted-foreground">
                        {entry.title}
                      </span>
                    )}

                    <div className="flex shrink-0 items-center gap-3 font-mono text-[11px] tabular-nums">
                      <span className="hidden text-muted-foreground sm:inline">
                        {sessionsLabel}
                      </span>
                      <span className="font-medium text-foreground">
                        {formatDurationCompact(entry.focusSeconds)}
                      </span>
                      <span className="w-11 text-right text-muted-foreground">
                        {entry.sharePercent.toFixed(0)}%
                      </span>
                    </div>
                  </div>

                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-secondary">
                    <div
                      className={cn(
                        'h-full rounded-full transition-[width]',
                        entry.itemId
                          ? 'bg-emerald-500/85 dark:bg-emerald-400/85'
                          : 'bg-emerald-500/45 dark:bg-emerald-400/45',
                      )}
                      style={{ width: `${widthPct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}
