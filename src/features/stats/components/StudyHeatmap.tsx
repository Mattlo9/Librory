import { useMemo, useState } from 'react';
import { formatDurationCompact } from '@/features/pomodoro/lib/formatTime';
import { cn } from '@/lib/utils';
import {
  formatLocalDateKey,
  parseLocalDateKey,
} from '@/services/studySessionRepository';
import type { StudyHeatmapDay, StudyStatsRange } from '@/types/domain';

interface StudyHeatmapProps {
  days: StudyHeatmapDay[];
  range: StudyStatsRange;
  rangeStartDate: string | null;
}

const INTENSITY_CLASSES: Record<0 | 1 | 2 | 3 | 4, string> = {
  0: 'bg-zinc-200/75 dark:bg-zinc-800/75',
  1: 'bg-[#c7dec9] dark:bg-[#1d3b28]',
  2: 'bg-[#8ab890] dark:bg-[#2a5c3c]',
  3: 'bg-[#528a5d] dark:bg-[#3d8455]',
  4: 'bg-[#2d5e3b] dark:bg-[#5cb874]',
};

const DAY_ROW_LABELS: Array<{ row: number; label: string }> = [
  { row: 0, label: 'Lun' },
  { row: 2, label: 'Mié' },
  { row: 4, label: 'Vie' },
];

const SHORT_MONTH_FORMATTER = new Intl.DateTimeFormat('es', { month: 'short' });
const FULL_DATE_FORMATTER = new Intl.DateTimeFormat('es', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
});

function formatMonthLabel(dateKey: string): string {
  const parsed = parseLocalDateKey(dateKey);
  if (!parsed) return '';
  const raw = SHORT_MONTH_FORMATTER.format(parsed).replace(/\.$/, '');
  return raw.toLowerCase();
}

function formatDayDetail(day: StudyHeatmapDay): string {
  const parsed = parseLocalDateKey(day.date);
  const dateLabel = parsed ? FULL_DATE_FORMATTER.format(parsed) : day.date;
  if (day.sessions === 0) {
    return `${dateLabel}: Sin sesiones`;
  }
  const sessionWord = day.sessions === 1 ? 'sesión' : 'sesiones';
  return `${dateLabel}: ${day.sessions} ${sessionWord} · ${formatDurationCompact(day.focusSeconds)}`;
}

/**
 * 53-week Monday-first calendar heatmap showing daily focused study intensity in 5 green tiers.
 */
export function StudyHeatmap({
  days,
  range,
  rangeStartDate,
}: StudyHeatmapProps) {
  const [hoveredDay, setHoveredDay] = useState<StudyHeatmapDay | null>(null);
  const todayKey = useMemo(() => formatLocalDateKey(new Date()), []);

  const { weeks, monthLabels } = useMemo(() => {
    const columns: StudyHeatmapDay[][] = [];
    for (let idx = 0; idx < days.length; idx += 7) {
      columns.push(days.slice(idx, idx + 7));
    }

    const candidates: Array<{ col: number; label: string }> = [];
    let prevMonthKey: string | null = null;

    columns.forEach((week, colIndex) => {
      const anchor = week[0];
      if (!anchor) return;
      const monthKey = anchor.date.slice(0, 7);
      if (monthKey !== prevMonthKey) {
        candidates.push({ col: colIndex, label: formatMonthLabel(anchor.date) });
        prevMonthKey = monthKey;
      }
    });

    const filteredLabels = new Map<number, string>();
    candidates.forEach((entry, index) => {
      const next = candidates[index + 1];
      if (entry.col === 0 && next && next.col < 3) {
        return;
      }
      filteredLabels.set(entry.col, entry.label);
    });

    return { weeks: columns, monthLabels: filteredLabels };
  }, [days]);

  const gridColumnsStyle = useMemo(
    () => ({
      gridTemplateColumns: `repeat(${Math.max(1, weeks.length)}, minmax(11px, 1fr))`,
    }),
    [weeks.length],
  );

  return (
    <div className="space-y-2.5">
      <div className="scrollbar-subtle overflow-x-auto pb-1">
        <div className="inline-flex min-w-full flex-col gap-1.5">
          {/* Month labels row */}
          <div className="flex items-end gap-2">
            <div className="w-6 shrink-0" aria-hidden="true" />
            <div
              className="grid flex-1 gap-[3px]"
              style={gridColumnsStyle}
            >
              {weeks.map((week, colIndex) => {
                const label = monthLabels.get(colIndex);
                return (
                  <div
                    key={week[0]?.date ?? colIndex}
                    className="relative h-3.5"
                  >
                    {label ? (
                      <span className="absolute bottom-0 left-0 whitespace-nowrap text-[10px] leading-none text-muted-foreground">
                        {label}
                      </span>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Day labels + 7-row cells */}
          <div className="flex items-stretch gap-2">
            <div
              aria-hidden="true"
              className="grid w-6 shrink-0 grid-rows-7 gap-[3px] text-[10px] text-muted-foreground"
            >
              {Array.from({ length: 7 }, (_, rowIdx) => {
                const entry = DAY_ROW_LABELS.find((d) => d.row === rowIdx);
                return (
                  <span
                    key={rowIdx}
                    className="flex items-center leading-none"
                  >
                    {entry?.label ?? ''}
                  </span>
                );
              })}
            </div>

            <div
              className="grid flex-1 gap-[3px]"
              style={gridColumnsStyle}
              onMouseLeave={() => setHoveredDay(null)}
            >
              {weeks.map((week, colIndex) => (
                <div
                  key={week[0]?.date ?? colIndex}
                  className="grid grid-rows-7 gap-[3px]"
                >
                  {Array.from({ length: 7 }, (_, rowIdx) => {
                    const day = week[rowIdx];
                    if (!day) {
                      return (
                        <div
                          key={`empty-${colIndex}-${rowIdx}`}
                          aria-hidden="true"
                          className="aspect-square"
                        />
                      );
                    }

                    const detail = formatDayDetail(day);
                    const isToday = day.date === todayKey;
                    const isOutOfRange =
                      range !== 'all' &&
                      rangeStartDate !== null &&
                      day.date < rangeStartDate;

                    return (
                      <button
                        key={day.date}
                        type="button"
                        aria-label={detail}
                        title={detail}
                        onMouseEnter={() => setHoveredDay(day)}
                        onFocus={() => setHoveredDay(day)}
                        onBlur={() => setHoveredDay(null)}
                        className={cn(
                          'aspect-square w-full rounded-[3px] transition-opacity outline-none focus-visible:ring-1 focus-visible:ring-ring',
                          INTENSITY_CLASSES[day.intensity],
                          isToday && 'ring-1 ring-foreground/45',
                          isOutOfRange && 'opacity-35',
                        )}
                      />
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Bottom hover detail + legend */}
      <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-muted-foreground">
        <span className="min-h-4 truncate">
          {hoveredDay
            ? formatDayDetail(hoveredDay)
            : 'Pasa el cursor por un día para ver el detalle'}
        </span>

        <div className="flex items-center gap-1.5">
          <span>Menos</span>
          {([0, 1, 2, 3, 4] as const).map((level) => (
            <span
              key={level}
              aria-hidden="true"
              className={cn('size-2.5 rounded-[2px]', INTENSITY_CLASSES[level])}
            />
          ))}
          <span>Más</span>
        </div>
      </div>
    </div>
  );
}
