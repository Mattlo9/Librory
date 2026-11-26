import { invokeDb } from '@/services/db';
import type {
  CreateStudySessionInput,
  PomodoroBookOption,
  StudyEvolutionBookBreakdown,
  StudyEvolutionBucket,
  StudyEvolutionGranularity,
  StudyEvolutionStats,
  StudyHeatmapDay,
  StudyOverviewStats,
  StudySession,
  StudyStatsRange,
} from '@/types/domain';

export interface StudySessionWithItemRow extends StudySession {
  item_title: string | null;
  item_author: string | null;
}

const SHORT_DAY_MONTH_FMT = new Intl.DateTimeFormat('es', {
  day: 'numeric',
  month: 'short',
});
const FULL_DAY_FMT = new Intl.DateTimeFormat('es', {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  year: 'numeric',
});
const SHORT_MONTH_FMT = new Intl.DateTimeFormat('es', {
  month: 'short',
});
const FULL_MONTH_FMT = new Intl.DateTimeFormat('es', {
  month: 'long',
  year: 'numeric',
});

const ISO_DATE_KEY_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Formats a Date in the user's local calendar as YYYY-MM-DD (never UTC).
 */
export function formatLocalDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Parses a YYYY-MM-DD local date key at local noon to avoid DST shifts.
 * Returns null for malformed date strings.
 */
export function parseLocalDateKey(key: string): Date | null {
  if (!ISO_DATE_KEY_RE.test(key)) return null;
  const [yearStr, monthStr, dayStr] = key.split('-');
  const year = Number.parseInt(yearStr ?? '', 10);
  const month = Number.parseInt(monthStr ?? '', 10);
  const day = Number.parseInt(dayStr ?? '', 10);
  if (
    !Number.isFinite(year) ||
    !Number.isFinite(month) ||
    !Number.isFinite(day) ||
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > 31
  ) {
    return null;
  }
  const date = new Date(year, month - 1, day, 12, 0, 0, 0);
  return Number.isNaN(date.getTime()) ? null : date;
}

function addLocalDays(date: Date, deltaDays: number): Date {
  return new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate() + deltaDays,
    12,
    0,
    0,
    0,
  );
}

/**
 * Maps daily focused seconds to a 0-4 heatmap intensity bucket.
 */
export function computeHeatmapIntensity(
  focusSeconds: number,
): 0 | 1 | 2 | 3 | 4 {
  if (!Number.isFinite(focusSeconds) || focusSeconds <= 0) return 0;
  if (focusSeconds < 1500) return 1; // < 25 min
  if (focusSeconds < 3000) return 2; // 25–49 min
  if (focusSeconds < 5400) return 3; // 50–89 min
  return 4; // 90+ min
}

/**
 * Inserts a new Pomodoro study session into SQLite via Rust and returns the persisted row.
 */
export async function createStudySession(
  input: CreateStudySessionInput,
): Promise<StudySession> {
  if (
    !Number.isFinite(input.planned_seconds) ||
    !Number.isFinite(input.duration_seconds) ||
    !Number.isFinite(input.local_hour)
  ) {
    throw new Error('Los datos de duración de la sesión de estudio no son válidos.');
  }

  return invokeDb<StudySession>('db_create_study_session', { input });
}

/**
 * Lists library items ordered with currently reading items first for the Pomodoro selector.
 */
export async function listPomodoroBookOptions(): Promise<PomodoroBookOption[]> {
  return invokeDb<PomodoroBookOption[]>('db_list_pomodoro_book_options');
}

function computeStreaks(
  dailyMap: ReadonlyMap<string, { sessions: number; focusSeconds: number }>,
  today: Date,
): { currentStreakDays: number; longestStreakDays: number } {
  const activeDates = Array.from(dailyMap.entries())
    .filter(([dateKey, bucket]) => bucket.sessions > 0 && parseLocalDateKey(dateKey) !== null)
    .map(([dateKey]) => dateKey)
    .sort();

  if (activeDates.length === 0) {
    return { currentStreakDays: 0, longestStreakDays: 0 };
  }

  let longestStreakDays = 0;
  let running = 0;
  let previousKey: string | null = null;

  for (const dateKey of activeDates) {
    if (previousKey === null) {
      running = 1;
    } else {
      const prevDate = parseLocalDateKey(previousKey);
      const expectedNext = prevDate
        ? formatLocalDateKey(addLocalDays(prevDate, 1))
        : null;
      running = expectedNext === dateKey ? running + 1 : 1;
    }
    if (running > longestStreakDays) {
      longestStreakDays = running;
    }
    previousKey = dateKey;
  }

  const todayKey = formatLocalDateKey(today);
  const yesterdayKey = formatLocalDateKey(addLocalDays(today, -1));

  let cursorDate: Date | null = null;
  if ((dailyMap.get(todayKey)?.sessions ?? 0) > 0) {
    cursorDate = today;
  } else if ((dailyMap.get(yesterdayKey)?.sessions ?? 0) > 0) {
    cursorDate = addLocalDays(today, -1);
  }

  let currentStreakDays = 0;
  while (cursorDate !== null && currentStreakDays < 3660) {
    const key = formatLocalDateKey(cursorDate);
    if ((dailyMap.get(key)?.sessions ?? 0) > 0) {
      currentStreakDays += 1;
      cursorDate = addLocalDays(cursorDate, -1);
    } else {
      break;
    }
  }

  return { currentStreakDays, longestStreakDays };
}

/**
 * Aggregates Pomodoro focus sessions for the Overview metrics card and 53-week calendar heatmap.
 */
export async function getStudyOverviewStats(
  range: StudyStatsRange,
): Promise<StudyOverviewStats> {
  const rows = await invokeDb<StudySessionWithItemRow[]>('db_list_focus_sessions');

  const now = new Date();
  const today = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
    12,
    0,
    0,
    0,
  );
  const todayKey = formatLocalDateKey(today);

  const rangeStartDate =
    range === '30d'
      ? formatLocalDateKey(addLocalDays(today, -29))
      : range === '7d'
        ? formatLocalDateKey(addLocalDays(today, -6))
        : null;

  const dailyMap = new Map<
    string,
    { sessions: number; focusSeconds: number }
  >();

  const validRows = rows.filter((row) => parseLocalDateKey(row.local_date) !== null);

  for (const row of validRows) {
    const prev = dailyMap.get(row.local_date) ?? {
      sessions: 0,
      focusSeconds: 0,
    };
    const duration = Number.isFinite(Number(row.duration_seconds))
      ? Math.max(0, Number(row.duration_seconds))
      : 0;
    dailyMap.set(row.local_date, {
      sessions: prev.sessions + 1,
      focusSeconds: prev.focusSeconds + duration,
    });
  }

  const inRangeRows = rangeStartDate
    ? validRows.filter((row) => row.local_date >= rangeStartDate)
    : validRows;

  let totalSessions = 0;
  let completedSessions = 0;
  let totalFocusSeconds = 0;
  const activeDatesInRange = new Set<string>();
  const hourMap = new Map<number, { seconds: number; sessions: number }>();
  const bookMap = new Map<
    string,
    {
      itemId: string;
      title: string;
      author: string;
      focusSeconds: number;
      sessions: number;
    }
  >();

  for (const row of inRangeRows) {
    const duration = Number.isFinite(Number(row.duration_seconds))
      ? Math.max(0, Number(row.duration_seconds))
      : 0;
    totalSessions += 1;
    if (row.completed === 1) {
      completedSessions += 1;
    }
    totalFocusSeconds += duration;
    activeDatesInRange.add(row.local_date);

    const rawHour = Number(row.local_hour);
    const hour = Number.isFinite(rawHour) ? Math.min(23, Math.max(0, Math.floor(rawHour))) : 0;
    const hourBucket = hourMap.get(hour) ?? { seconds: 0, sessions: 0 };
    hourMap.set(hour, {
      seconds: hourBucket.seconds + duration,
      sessions: hourBucket.sessions + 1,
    });

    if (row.item_id && row.item_title) {
      const existingBook = bookMap.get(row.item_id) ?? {
        itemId: row.item_id,
        title: row.item_title,
        author: row.item_author ?? '',
        focusSeconds: 0,
        sessions: 0,
      };
      bookMap.set(row.item_id, {
        ...existingBook,
        focusSeconds: existingBook.focusSeconds + duration,
        sessions: existingBook.sessions + 1,
      });
    }
  }

  let peakHour: number | null = null;
  let bestHourSeconds = -1;
  let bestHourSessions = -1;
  for (const [hour, bucket] of hourMap.entries()) {
    if (
      bucket.seconds > bestHourSeconds ||
      (bucket.seconds === bestHourSeconds &&
        (bucket.sessions > bestHourSessions ||
          (bucket.sessions === bestHourSessions &&
            (peakHour === null || hour < peakHour))))
    ) {
      peakHour = hour;
      bestHourSeconds = bucket.seconds;
      bestHourSessions = bucket.sessions;
    }
  }

  let topBook: StudyOverviewStats['topBook'] = null;
  for (const book of bookMap.values()) {
    if (
      !topBook ||
      book.focusSeconds > topBook.focusSeconds ||
      (book.focusSeconds === topBook.focusSeconds &&
        book.sessions > topBook.sessions)
    ) {
      topBook = book;
    }
  }

  const { currentStreakDays, longestStreakDays } = computeStreaks(
    dailyMap,
    today,
  );

  // Build 53-week Monday-first calendar ending on today.
  const mondayOffset = (today.getDay() + 6) % 7;
  const mondayOfCurrentWeek = addLocalDays(today, -mondayOffset);
  const startDay = addLocalDays(mondayOfCurrentWeek, -52 * 7);

  const heatmapDays: StudyHeatmapDay[] = [];
  let cursor = startDay;
  while (formatLocalDateKey(cursor) <= todayKey) {
    const key = formatLocalDateKey(cursor);
    const bucket = dailyMap.get(key);
    const focusSeconds = bucket?.focusSeconds ?? 0;
    heatmapDays.push({
      date: key,
      sessions: bucket?.sessions ?? 0,
      focusSeconds,
      intensity: computeHeatmapIntensity(focusSeconds),
    });
    cursor = addLocalDays(cursor, 1);
  }

  const todayBucket = dailyMap.get(todayKey);

  return {
    range,
    totalSessions,
    completedSessions,
    totalFocusSeconds,
    activeDays: activeDatesInRange.size,
    peakHour,
    currentStreakDays,
    longestStreakDays,
    topBook,
    heatmapDays,
    todayFocusSeconds: todayBucket?.focusSeconds ?? 0,
    todaySessions: todayBucket?.sessions ?? 0,
    rangeStartDate,
  };
}

function sanitizeDurationSeconds(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(0, Math.round(n)) : 0;
}

function cleanFormattedDate(fmt: Intl.DateTimeFormat, date: Date): string {
  return fmt.format(date).replace(/\./g, '').trim();
}

function capitalizeFirst(text: string): string {
  if (!text) return text;
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function computeDeltaPercent(current: number, previous: number): number | null {
  if (previous <= 0) return null;
  return Math.round(((current - previous) / previous) * 100);
}

function getMondayOfDate(date: Date): Date {
  const mondayOffset = (date.getDay() + 6) % 7;
  return addLocalDays(date, -mondayOffset);
}

/**
 * Computes Pomodoro accumulated totals, period comparisons, chronological evolution buckets,
 * and per-book time breakdown from focus sessions.
 */
export function computeStudyEvolutionStats(
  rows: StudySessionWithItemRow[],
  granularity: StudyEvolutionGranularity,
  referenceDate: Date = new Date(),
): StudyEvolutionStats {
  const today = new Date(
    referenceDate.getFullYear(),
    referenceDate.getMonth(),
    referenceDate.getDate(),
    12,
    0,
    0,
    0,
  );
  const todayKey = formatLocalDateKey(today);
  const yesterdayKey = formatLocalDateKey(addLocalDays(today, -1));

  const validRows = rows.filter((row) => parseLocalDateKey(row.local_date) !== null);

  const dailyMap = new Map<string, { sessions: number; focusSeconds: number }>();
  let allTimeSeconds = 0;
  let allTimeSessions = 0;

  for (const row of validRows) {
    const duration = sanitizeDurationSeconds(row.duration_seconds);
    allTimeSeconds += duration;
    allTimeSessions += 1;

    const prev = dailyMap.get(row.local_date) ?? { sessions: 0, focusSeconds: 0 };
    dailyMap.set(row.local_date, {
      sessions: prev.sessions + 1,
      focusSeconds: prev.focusSeconds + duration,
    });
  }

  // Summary periods: today vs yesterday, this week vs last week, this month vs last month
  const currentWeekStart = getMondayOfDate(today);
  const currentWeekStartKey = formatLocalDateKey(currentWeekStart);
  const prevWeekStartKey = formatLocalDateKey(addLocalDays(currentWeekStart, -7));
  const prevWeekEndKey = formatLocalDateKey(addLocalDays(currentWeekStart, -1));

  const currentMonthStart = new Date(
    today.getFullYear(),
    today.getMonth(),
    1,
    12,
    0,
    0,
    0,
  );
  const prevMonthStart = new Date(
    today.getFullYear(),
    today.getMonth() - 1,
    1,
    12,
    0,
    0,
    0,
  );
  const prevMonthEnd = new Date(
    today.getFullYear(),
    today.getMonth(),
    0,
    12,
    0,
    0,
    0,
  );
  const currentMonthStartKey = formatLocalDateKey(currentMonthStart);
  const prevMonthStartKey = formatLocalDateKey(prevMonthStart);
  const prevMonthEndKey = formatLocalDateKey(prevMonthEnd);

  let thisWeekSeconds = 0;
  let thisWeekSessions = 0;
  let prevWeekSeconds = 0;
  let thisMonthSeconds = 0;
  let thisMonthSessions = 0;
  let prevMonthSeconds = 0;

  for (const row of validRows) {
    const duration = sanitizeDurationSeconds(row.duration_seconds);
    const key = row.local_date;
    if (key >= currentWeekStartKey && key <= todayKey) {
      thisWeekSeconds += duration;
      thisWeekSessions += 1;
    } else if (key >= prevWeekStartKey && key <= prevWeekEndKey) {
      prevWeekSeconds += duration;
    }

    if (key >= currentMonthStartKey && key <= todayKey) {
      thisMonthSeconds += duration;
      thisMonthSessions += 1;
    } else if (key >= prevMonthStartKey && key <= prevMonthEndKey) {
      prevMonthSeconds += duration;
    }
  }

  const todayBucket = dailyMap.get(todayKey);
  const yesterdayBucket = dailyMap.get(yesterdayKey);
  const todaySeconds = todayBucket?.focusSeconds ?? 0;
  const yesterdaySeconds = yesterdayBucket?.focusSeconds ?? 0;

  const summaries: StudyEvolutionStats['summaries'] = {
    today: {
      currentSeconds: todaySeconds,
      previousSeconds: yesterdaySeconds,
      currentSessions: todayBucket?.sessions ?? 0,
      deltaPercent: computeDeltaPercent(todaySeconds, yesterdaySeconds),
    },
    thisWeek: {
      currentSeconds: thisWeekSeconds,
      previousSeconds: prevWeekSeconds,
      currentSessions: thisWeekSessions,
      deltaPercent: computeDeltaPercent(thisWeekSeconds, prevWeekSeconds),
    },
    thisMonth: {
      currentSeconds: thisMonthSeconds,
      previousSeconds: prevMonthSeconds,
      currentSessions: thisMonthSessions,
      deltaPercent: computeDeltaPercent(thisMonthSeconds, prevMonthSeconds),
    },
    allTimeSeconds,
    allTimeSessions,
  };

  // Chronological buckets
  const buckets: StudyEvolutionBucket[] = [];
  let periodStartKey = todayKey;

  if (granularity === 'day14' || granularity === 'day30') {
    const count = granularity === 'day14' ? 14 : 30;
    const start = addLocalDays(today, -(count - 1));
    periodStartKey = formatLocalDateKey(start);

    for (let i = 0; i < count; i += 1) {
      const d = addLocalDays(start, i);
      const key = formatLocalDateKey(d);
      const bucket = dailyMap.get(key);
      buckets.push({
        key,
        label: cleanFormattedDate(SHORT_DAY_MONTH_FMT, d),
        fullLabel: capitalizeFirst(cleanFormattedDate(FULL_DAY_FMT, d)),
        focusSeconds: bucket?.focusSeconds ?? 0,
        cumulativeSeconds: 0,
        sessions: bucket?.sessions ?? 0,
        isCurrentPeriod: key === todayKey,
      });
    }
  } else if (granularity === 'week12') {
    const firstMonday = addLocalDays(currentWeekStart, -11 * 7);
    periodStartKey = formatLocalDateKey(firstMonday);

    const weekMap = new Map<string, { sessions: number; focusSeconds: number }>();
    for (const row of validRows) {
      if (row.local_date > todayKey) continue;
      const d = parseLocalDateKey(row.local_date);
      if (!d) continue;
      const mondayKey = formatLocalDateKey(getMondayOfDate(d));
      const prev = weekMap.get(mondayKey) ?? { sessions: 0, focusSeconds: 0 };
      weekMap.set(mondayKey, {
        sessions: prev.sessions + 1,
        focusSeconds: prev.focusSeconds + sanitizeDurationSeconds(row.duration_seconds),
      });
    }

    for (let w = 0; w < 12; w += 1) {
      const start = addLocalDays(firstMonday, w * 7);
      const end = addLocalDays(start, 6);
      const key = formatLocalDateKey(start);
      const bucket = weekMap.get(key);
      buckets.push({
        key,
        label: cleanFormattedDate(SHORT_DAY_MONTH_FMT, start),
        fullLabel: `Sem. ${cleanFormattedDate(SHORT_DAY_MONTH_FMT, start)} – ${cleanFormattedDate(SHORT_DAY_MONTH_FMT, end)}`,
        focusSeconds: bucket?.focusSeconds ?? 0,
        cumulativeSeconds: 0,
        sessions: bucket?.sessions ?? 0,
        isCurrentPeriod: w === 11,
      });
    }
  } else if (granularity === 'month12') {
    const firstMonth = new Date(
      today.getFullYear(),
      today.getMonth() - 11,
      1,
      12,
      0,
      0,
      0,
    );
    periodStartKey = formatLocalDateKey(firstMonth);

    const monthMap = new Map<string, { sessions: number; focusSeconds: number }>();
    for (const row of validRows) {
      if (row.local_date > todayKey) continue;
      const monthKey = row.local_date.slice(0, 7);
      const prev = monthMap.get(monthKey) ?? { sessions: 0, focusSeconds: 0 };
      monthMap.set(monthKey, {
        sessions: prev.sessions + 1,
        focusSeconds: prev.focusSeconds + sanitizeDurationSeconds(row.duration_seconds),
      });
    }

    for (let m = 0; m < 12; m += 1) {
      const d = new Date(
        firstMonth.getFullYear(),
        firstMonth.getMonth() + m,
        1,
        12,
        0,
        0,
        0,
      );
      const year = d.getFullYear();
      const monthStr = String(d.getMonth() + 1).padStart(2, '0');
      const key = `${year}-${monthStr}`;
      const shortMonth = capitalizeFirst(cleanFormattedDate(SHORT_MONTH_FMT, d));
      const label =
        d.getMonth() === 0 || m === 0
          ? `${shortMonth} '${String(year).slice(-2)}`
          : shortMonth;
      const bucket = monthMap.get(key);
      buckets.push({
        key,
        label,
        fullLabel: capitalizeFirst(FULL_MONTH_FMT.format(d)),
        focusSeconds: bucket?.focusSeconds ?? 0,
        cumulativeSeconds: 0,
        sessions: bucket?.sessions ?? 0,
        isCurrentPeriod: m === 11,
      });
    }
  } else {
    const currentYear = today.getFullYear();
    let minYear = currentYear - 2;
    const yearMap = new Map<string, { sessions: number; focusSeconds: number }>();

    for (const row of validRows) {
      if (row.local_date > todayKey) continue;
      const d = parseLocalDateKey(row.local_date);
      if (!d) continue;
      const year = d.getFullYear();
      if (year < minYear) minYear = year;
      const yearKey = String(year);
      const prev = yearMap.get(yearKey) ?? { sessions: 0, focusSeconds: 0 };
      yearMap.set(yearKey, {
        sessions: prev.sessions + 1,
        focusSeconds: prev.focusSeconds + sanitizeDurationSeconds(row.duration_seconds),
      });
    }

    periodStartKey = `${minYear}-01-01`;
    for (let y = minYear; y <= currentYear; y += 1) {
      const key = String(y);
      const bucket = yearMap.get(key);
      buckets.push({
        key,
        label: key,
        fullLabel: `Año ${key}`,
        focusSeconds: bucket?.focusSeconds ?? 0,
        cumulativeSeconds: 0,
        sessions: bucket?.sessions ?? 0,
        isCurrentPeriod: y === currentYear,
      });
    }
  }

  let cumulativeSeconds = 0;
  let periodSessions = 0;
  let activeCount = 0;
  let bestBucket: StudyEvolutionBucket | null = null;

  for (const bucket of buckets) {
    cumulativeSeconds += bucket.focusSeconds;
    bucket.cumulativeSeconds = cumulativeSeconds;
    periodSessions += bucket.sessions;
    if (bucket.focusSeconds > 0) {
      activeCount += 1;
      if (!bestBucket || bucket.focusSeconds > bestBucket.focusSeconds) {
        bestBucket = bucket;
      }
    }
  }

  const periodTotalSeconds = cumulativeSeconds;
  const averageBucketSeconds =
    buckets.length > 0 ? Math.round(periodTotalSeconds / buckets.length) : 0;
  const averageActiveBucketSeconds =
    activeCount > 0 ? Math.round(periodTotalSeconds / activeCount) : 0;

  // Per-book breakdown for the selected granularity period
  const bookMap = new Map<
    string,
    {
      itemId: string | null;
      title: string;
      author: string;
      focusSeconds: number;
      sessions: number;
    }
  >();

  for (const row of validRows) {
    if (row.local_date < periodStartKey || row.local_date > todayKey) {
      continue;
    }
    const duration = sanitizeDurationSeconds(row.duration_seconds);
    const mapKey = row.item_id ?? '__free__';
    const existing = bookMap.get(mapKey) ?? {
      itemId: row.item_id ?? null,
      title: row.item_id ? row.item_title || 'Recurso eliminado' : 'Estudio libre',
      author: row.item_id ? (row.item_author ?? '') : '',
      focusSeconds: 0,
      sessions: 0,
    };
    bookMap.set(mapKey, {
      ...existing,
      focusSeconds: existing.focusSeconds + duration,
      sessions: existing.sessions + 1,
    });
  }

  const sortedBooks = Array.from(bookMap.values()).sort((a, b) => {
    if (b.focusSeconds !== a.focusSeconds) return b.focusSeconds - a.focusSeconds;
    if (b.sessions !== a.sessions) return b.sessions - a.sessions;
    return a.title.localeCompare(b.title, 'es');
  });

  const breakdownTotalSeconds = sortedBooks.reduce(
    (sum, entry) => sum + entry.focusSeconds,
    0,
  );

  const visibleBooks = sortedBooks.slice(0, 6);
  if (sortedBooks.length > 6) {
    const rest = sortedBooks.slice(6);
    visibleBooks.push({
      itemId: null,
      title: 'Otros recursos',
      author: '',
      focusSeconds: rest.reduce((sum, entry) => sum + entry.focusSeconds, 0),
      sessions: rest.reduce((sum, entry) => sum + entry.sessions, 0),
    });
  }

  const bookBreakdown: StudyEvolutionBookBreakdown[] = visibleBooks.map((entry) => ({
    ...entry,
    sharePercent:
      breakdownTotalSeconds > 0
        ? Math.round((entry.focusSeconds / breakdownTotalSeconds) * 1000) / 10
        : 0,
  }));

  return {
    granularity,
    buckets,
    periodTotalSeconds,
    periodSessions,
    averageBucketSeconds,
    averageActiveBucketSeconds,
    bestBucket,
    summaries,
    bookBreakdown,
  };
}

/**
 * Fetches Pomodoro focus sessions from SQLite and aggregates evolution stats.
 */
export async function getStudyEvolutionStats(
  granularity: StudyEvolutionGranularity,
): Promise<StudyEvolutionStats> {
  const rows = await invokeDb<StudySessionWithItemRow[]>('db_list_focus_sessions');
  return computeStudyEvolutionStats(rows, granularity);
}
