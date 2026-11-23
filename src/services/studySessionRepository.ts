import { getDb } from '@/services/db';
import type {
  CreateStudySessionInput,
  PomodoroBookOption,
  StudyHeatmapDay,
  StudyOverviewStats,
  StudySession,
  StudyStatsRange,
} from '@/types/domain';

interface StudySessionWithItemRow extends StudySession {
  item_title: string | null;
  item_author: string | null;
}

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
 */
export function parseLocalDateKey(key: string): Date {
  const [yearStr, monthStr, dayStr] = key.split('-');
  const year = Number.parseInt(yearStr ?? '1970', 10);
  const month = Number.parseInt(monthStr ?? '1', 10);
  const day = Number.parseInt(dayStr ?? '1', 10);
  return new Date(year, month - 1, day, 12, 0, 0, 0);
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
  if (focusSeconds <= 0) return 0;
  if (focusSeconds < 1500) return 1; // < 25 min
  if (focusSeconds < 3000) return 2; // 25–49 min
  if (focusSeconds < 5400) return 3; // 50–89 min
  return 4; // 90+ min
}

/**
 * Inserts a new Pomodoro study session into SQLite and returns the persisted row.
 */
export async function createStudySession(
  input: CreateStudySessionInput,
): Promise<StudySession> {
  const db = await getDb();
  const id = crypto.randomUUID();

  await db.execute(
    `INSERT INTO study_sessions (
      id, item_id, phase, planned_seconds, duration_seconds, completed,
      started_at, ended_at, local_date, local_hour
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
    [
      id,
      input.item_id ?? null,
      input.phase,
      Math.max(1, Math.round(input.planned_seconds)),
      Math.max(1, Math.round(input.duration_seconds)),
      input.completed ? 1 : 0,
      input.started_at,
      input.ended_at,
      input.local_date,
      Math.min(23, Math.max(0, Math.floor(input.local_hour))),
    ],
  );

  const rows = await db.select<StudySession[]>(
    'SELECT * FROM study_sessions WHERE id = $1 LIMIT 1',
    [id],
  );
  const created = rows[0];
  if (!created) {
    throw new Error(`No se pudo recuperar la sesión de estudio (${id}).`);
  }
  return created;
}

/**
 * Lists library items ordered with currently reading items first for the Pomodoro selector.
 */
export async function listPomodoroBookOptions(): Promise<PomodoroBookOption[]> {
  const db = await getDb();
  return db.select<PomodoroBookOption[]>(
    `SELECT id, title, author, status
     FROM items
     ORDER BY
       CASE WHEN status = 'reading' THEN 0 ELSE 1 END,
       COALESCE(last_opened_at, updated_at) DESC
     LIMIT 100`,
  );
}

function computeStreaks(
  dailyMap: ReadonlyMap<string, { sessions: number; focusSeconds: number }>,
  today: Date,
): { currentStreakDays: number; longestStreakDays: number } {
  const activeDates = Array.from(dailyMap.entries())
    .filter(([, bucket]) => bucket.sessions > 0)
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
      const expectedNext = formatLocalDateKey(
        addLocalDays(parseLocalDateKey(previousKey), 1),
      );
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
  while (cursorDate !== null) {
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
  const db = await getDb();
  const rows = await db.select<StudySessionWithItemRow[]>(
    `SELECT
       s.*,
       i.title AS item_title,
       i.author AS item_author
     FROM study_sessions s
     LEFT JOIN items i ON i.id = s.item_id
     WHERE s.phase = 'focus'
     ORDER BY s.started_at ASC`,
  );

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

  for (const row of rows) {
    const prev = dailyMap.get(row.local_date) ?? {
      sessions: 0,
      focusSeconds: 0,
    };
    dailyMap.set(row.local_date, {
      sessions: prev.sessions + 1,
      focusSeconds: prev.focusSeconds + Math.max(0, Number(row.duration_seconds) || 0),
    });
  }

  const inRangeRows = rangeStartDate
    ? rows.filter((row) => row.local_date >= rangeStartDate)
    : rows;

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
    const duration = Math.max(0, Number(row.duration_seconds) || 0);
    totalSessions += 1;
    if (row.completed === 1) {
      completedSessions += 1;
    }
    totalFocusSeconds += duration;
    activeDatesInRange.add(row.local_date);

    const hour = Math.min(23, Math.max(0, Number(row.local_hour) || 0));
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
