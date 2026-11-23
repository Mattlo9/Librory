import { useState } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import {
  formatDurationCompact,
  formatPeakHour,
} from '@/features/pomodoro/lib/formatTime';
import { StudyHeatmap } from '@/features/stats/components/StudyHeatmap';
import { useStudyOverviewStats } from '@/features/stats/hooks/useStudyStats';
import { cn } from '@/lib/utils';
import type { StudyStatsRange } from '@/types/domain';

interface StudyOverviewCardProps {
  onOpenItem: (itemId: string) => void;
}

const RANGE_OPTIONS: Array<{ value: StudyStatsRange; label: string }> = [
  { value: 'all', label: 'Todo' },
  { value: '30d', label: '30d' },
  { value: '7d', label: '7d' },
];

/**
 * Overview card displaying Pomodoro focus KPIs (2x3) and a 53-week green study heatmap.
 */
export function StudyOverviewCard({ onOpenItem }: StudyOverviewCardProps) {
  const [range, setRange] = useState<StudyStatsRange>('all');
  const studyQuery = useStudyOverviewStats(range, true);

  if (studyQuery.isLoading) {
    return (
      <section
        aria-label="Resumen de estudio"
        className="rounded-xl border border-border bg-card p-5 space-y-4"
      >
        <div className="flex items-center justify-between">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-7 w-32 rounded-lg" />
        </div>
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
          {Array.from({ length: 6 }, (_, idx) => (
            <Skeleton key={idx} className="h-14 rounded-lg" />
          ))}
        </div>
        <Skeleton className="h-32 w-full rounded-lg" />
      </section>
    );
  }

  const study = studyQuery.data;
  if (!study) return null;

  const avgPerActiveDaySeconds =
    study.activeDays > 0
      ? Math.round(study.totalFocusSeconds / study.activeDays)
      : 0;

  const summaryLine =
    study.totalSessions > 0
      ? `Hoy: ${study.todaySessions} ${study.todaySessions === 1 ? 'sesión' : 'sesiones'} (${formatDurationCompact(study.todayFocusSeconds)}) · Racha máxima: ${study.longestStreakDays} ${study.longestStreakDays === 1 ? 'día' : 'días'} · Promedio por día activo: ${formatDurationCompact(avgPerActiveDaySeconds)}`
      : study.longestStreakDays > 0
        ? `Sin sesiones registradas en los últimos ${range === '7d' ? '7' : '30'} días · Racha máxima histórica: ${study.longestStreakDays} ${study.longestStreakDays === 1 ? 'día' : 'días'}`
        : 'Aún no tienes sesiones registradas. Abre el botón Pomodoro en la barra superior para iniciar tu primera sesión.';

  return (
    <section
      aria-label="Resumen de estudio"
      className="rounded-xl border border-border bg-card p-5 space-y-4"
    >
      {/* Header + Range selector */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold tracking-tight text-foreground">
            Resumen de estudio
          </h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Sesiones Pomodoro y constancia diaria de lectura.
          </p>
        </div>

        <div
          role="group"
          aria-label="Periodo de estudio"
          className="inline-flex items-center gap-0.5 rounded-lg border border-border/60 bg-secondary/50 p-0.5"
        >
          {RANGE_OPTIONS.map((opt) => {
            const active = range === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                aria-pressed={active}
                onClick={() => setRange(opt.value)}
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

      {/* 2x3 compact metrics grid */}
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
        <div className="rounded-lg border border-border/50 bg-secondary/50 px-3.5 py-2.5">
          <p className="text-[11px] text-muted-foreground">Sesiones</p>
          <p className="mt-0.5 font-mono text-lg font-semibold tabular-nums text-foreground">
            {study.totalSessions.toLocaleString('es')}
          </p>
        </div>

        <div className="rounded-lg border border-border/50 bg-secondary/50 px-3.5 py-2.5">
          <p className="text-[11px] text-muted-foreground">Tiempo total</p>
          <p className="mt-0.5 font-mono text-lg font-semibold tabular-nums text-foreground">
            {formatDurationCompact(study.totalFocusSeconds)}
          </p>
        </div>

        <div className="rounded-lg border border-border/50 bg-secondary/50 px-3.5 py-2.5">
          <p className="text-[11px] text-muted-foreground">Días activos</p>
          <p className="mt-0.5 font-mono text-lg font-semibold tabular-nums text-foreground">
            {study.activeDays}
          </p>
        </div>

        <div className="rounded-lg border border-border/50 bg-secondary/50 px-3.5 py-2.5">
          <p className="text-[11px] text-muted-foreground">Hora pico</p>
          <p className="mt-0.5 font-mono text-lg font-semibold tabular-nums text-foreground">
            {formatPeakHour(study.peakHour)}
          </p>
        </div>

        <div className="rounded-lg border border-border/50 bg-secondary/50 px-3.5 py-2.5">
          <p className="text-[11px] text-muted-foreground">Racha actual</p>
          <p className="mt-0.5 font-mono text-lg font-semibold tabular-nums text-foreground">
            {study.currentStreakDays}{' '}
            <span className="text-xs font-normal text-muted-foreground">
              {study.currentStreakDays === 1 ? 'día' : 'días'}
            </span>
          </p>
        </div>

        <div className="min-w-0 rounded-lg border border-border/50 bg-secondary/50 px-3.5 py-2.5">
          <p className="text-[11px] text-muted-foreground">
            Libro más estudiado
          </p>
          {study.topBook ? (
            <button
              type="button"
              onClick={() => onOpenItem(study.topBook!.itemId)}
              title={`${study.topBook.title} · ${formatDurationCompact(study.topBook.focusSeconds)} (${study.topBook.sessions} ${study.topBook.sessions === 1 ? 'sesión' : 'sesiones'})`}
              className="mt-0.5 block w-full truncate text-left text-sm font-semibold text-foreground outline-none transition-colors hover:text-accent-brand focus-visible:underline"
            >
              {study.topBook.title}
            </button>
          ) : (
            <p className="mt-0.5 truncate text-sm font-semibold text-foreground">
              {study.totalSessions > 0 ? 'Estudio libre' : '—'}
            </p>
          )}
        </div>
      </div>

      {/* Annual green calendar heatmap */}
      <StudyHeatmap
        days={study.heatmapDays}
        range={range}
        rangeStartDate={study.rangeStartDate}
      />

      {/* Footer summary */}
      <p className="border-t border-border/50 pt-3 text-xs text-muted-foreground">
        {summaryLine}
      </p>
    </section>
  );
}
