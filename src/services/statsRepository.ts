import { getDb } from '@/services/db';
import { formatLocalDateKey } from '@/services/studySessionRepository';
import {
  ITEM_STATUSES,
  ITEM_TYPES,
  type ActivityBucket,
  type ActivityRange,
  type ActivityStatsSnapshot,
  type ItemStatus,
  type ItemType,
  type LibraryItem,
  type ReadingStatsSnapshot,
} from '@/types/domain';

interface ShelfProgressRow {
  id: string;
  name: string;
  totalCount: number;
  finishedCount: number;
}

function buildRecentMonthsWindow(monthCount = 6): Array<{
  monthKey: string;
  label: string;
}> {
  const formatter = new Intl.DateTimeFormat('es', { month: 'short' });
  const now = new Date();
  const months: Array<{ monthKey: string; label: string }> = [];

  for (let offset = monthCount - 1; offset >= 0; offset -= 1) {
    const date = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - offset, 1),
    );
    const year = date.getUTCFullYear();
    const month = String(date.getUTCMonth() + 1).padStart(2, '0');
    const rawLabel = formatter.format(date).replace(/\.$/, '');
    const label = rawLabel.charAt(0).toUpperCase() + rawLabel.slice(1);
    months.push({
      monthKey: `${year}-${month}`,
      label,
    });
  }

  return months;
}

function computePagesReadForItem(item: LibraryItem): number {
  if (item.status === 'finished' && item.page_count > 0) {
    return item.page_count;
  }
  if (item.page_count > 0) {
    return Math.min(Math.max(0, item.current_page), item.page_count);
  }
  return Math.max(0, item.current_page);
}

/**
 * Aggregates library reading progress, status/type breakdown, shelf completion, and 6-month activity.
 */
export async function getReadingStats(): Promise<ReadingStatsSnapshot> {
  const db = await getDb();

  const [items, topShelves, highlightRows] = await Promise.all([
    db.select<LibraryItem[]>('SELECT * FROM items'),
    db.select<ShelfProgressRow[]>(
      `SELECT
         s.id AS id,
         s.name AS name,
         COUNT(DISTINCT ishf.item_id) AS totalCount,
         SUM(CASE WHEN i.status = 'finished' THEN 1 ELSE 0 END) AS finishedCount
       FROM shelves s
       INNER JOIN item_shelves ishf ON ishf.shelf_id = s.id
       INNER JOIN items i ON i.id = ishf.item_id
       GROUP BY s.id
       ORDER BY totalCount DESC, s.name COLLATE NOCASE ASC
       LIMIT 6`,
    ),
    db.select<Array<{ created_at: string }>>(
      'SELECT created_at FROM highlights',
    ),
  ]);

  const statusMap = new Map<ItemStatus, number>(
    ITEM_STATUSES.map((status) => [status, 0]),
  );
  const typeMap = new Map<ItemType, number>(
    ITEM_TYPES.map((type) => [type, 0]),
  );

  let totalPagesRead = 0;
  let totalLibraryPages = 0;
  let pdfCount = 0;
  let epubCount = 0;
  let activeProgressSum = 0;
  let activeProgressCount = 0;

  const inProgressPool: LibraryItem[] = [];
  const finishedPool: LibraryItem[] = [];

  const monthWindow = buildRecentMonthsWindow(6);
  const monthlyMap = new Map(
    monthWindow.map((m) => [
      m.monthKey,
      {
        monthKey: m.monthKey,
        label: m.label,
        addedCount: 0,
        finishedCount: 0,
        highlightsCount: 0,
      },
    ]),
  );

  for (const item of items) {
    statusMap.set(item.status, (statusMap.get(item.status) ?? 0) + 1);
    typeMap.set(item.type, (typeMap.get(item.type) ?? 0) + 1);

    if (item.file_format === 'pdf') pdfCount += 1;
    else if (item.file_format === 'epub') epubCount += 1;

    totalPagesRead += computePagesReadForItem(item);
    totalLibraryPages += Math.max(0, item.page_count);

    if (item.status === 'reading' && item.page_count > 0) {
      const pct = Math.min(
        100,
        Math.round((Math.max(0, item.current_page) / item.page_count) * 100),
      );
      activeProgressSum += pct;
      activeProgressCount += 1;
    }

    if (
      item.status === 'reading' ||
      (item.status !== 'finished' && item.current_page > 0)
    ) {
      inProgressPool.push(item);
    }

    if (item.status === 'finished') {
      finishedPool.push(item);
    }

    const createdMonth = item.created_at.slice(0, 7);
    const addedBucket = monthlyMap.get(createdMonth);
    if (addedBucket) {
      addedBucket.addedCount += 1;
    }

    if (item.status === 'finished') {
      const finishedMonth = item.updated_at.slice(0, 7);
      const finishedBucket = monthlyMap.get(finishedMonth);
      if (finishedBucket) {
        finishedBucket.finishedCount += 1;
      }
    }
  }

  for (const h of highlightRows) {
    const monthKey = h.created_at.slice(0, 7);
    const bucket = monthlyMap.get(monthKey);
    if (bucket) {
      bucket.highlightsCount += 1;
    }
  }

  inProgressPool.sort((a, b) => {
    const aTime = a.last_opened_at ?? a.updated_at;
    const bTime = b.last_opened_at ?? b.updated_at;
    return bTime.localeCompare(aTime);
  });

  finishedPool.sort((a, b) => b.updated_at.localeCompare(a.updated_at));

  const totalItems = items.length;
  const finishedCount = statusMap.get('finished') ?? 0;
  const readingCount = statusMap.get('reading') ?? 0;
  const toReadCount = statusMap.get('to_read') ?? 0;
  const inboxCount = statusMap.get('inbox') ?? 0;
  const referenceCount = statusMap.get('reference') ?? 0;

  return {
    totals: {
      totalItems,
      finishedCount,
      readingCount,
      toReadCount,
      inboxCount,
      referenceCount,
      totalPagesRead,
      totalLibraryPages,
      completionRate:
        totalItems > 0 ? Math.round((finishedCount / totalItems) * 100) : 0,
      averageActiveProgress:
        activeProgressCount > 0
          ? Math.round(activeProgressSum / activeProgressCount)
          : 0,
      totalHighlights: highlightRows.length,
      pdfCount,
      epubCount,
    },
    byStatus: ITEM_STATUSES.map((status) => ({
      status,
      count: statusMap.get(status) ?? 0,
    })),
    byType: ITEM_TYPES.map((type) => ({
      type,
      count: typeMap.get(type) ?? 0,
    })),
    inProgressItems: inProgressPool.slice(0, 6),
    recentlyFinished: finishedPool.slice(0, 6),
    topShelves: topShelves.map((row) => ({
      id: row.id,
      name: row.name,
      totalCount: Number(row.totalCount) || 0,
      finishedCount: Number(row.finishedCount) || 0,
    })),
    monthlyActivity: monthWindow.map(
      (m) =>
        monthlyMap.get(m.monthKey) ?? {
          monthKey: m.monthKey,
          label: m.label,
          addedCount: 0,
          finishedCount: 0,
          highlightsCount: 0,
        },
    ),
  };
}

function parseIsoToLocalMonthKey(iso: string): string | null {
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return null;
  const year = parsed.getFullYear();
  const month = String(parsed.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

function parseIsoToLocalDateKey(iso: string): string | null {
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return null;
  return formatLocalDateKey(parsed);
}

const MONTH_SHORT_FMT = new Intl.DateTimeFormat('es', { month: 'short' });
const DAY_SHORT_FMT = new Intl.DateTimeFormat('es', {
  day: 'numeric',
  month: 'short',
});
const DAY_FULL_FMT = new Intl.DateTimeFormat('es', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
});
const WEEKDAY_DAY_FMT = new Intl.DateTimeFormat('es', {
  weekday: 'short',
  day: 'numeric',
});

function formatMonthShortCap(date: Date): string {
  const raw = MONTH_SHORT_FMT.format(date).replace(/\.$/, '');
  return raw.charAt(0).toUpperCase() + raw.slice(1);
}

function buildActivityBuckets(range: ActivityRange): ActivityBucket[] {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12, 0, 0, 0);
  const buckets: ActivityBucket[] = [];

  if (range === '6m') {
    for (let offset = 5; offset >= 0; offset -= 1) {
      const date = new Date(today.getFullYear(), today.getMonth() - offset, 1, 12, 0, 0, 0);
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const shortLabel = formatMonthShortCap(date);
      buckets.push({
        key: `${year}-${month}`,
        label: shortLabel,
        fullLabel: `${shortLabel} ${year}`,
        addedCount: 0,
        finishedCount: 0,
        highlightsCount: 0,
        notesCount: 0,
      });
    }
    return buckets;
  }

  const dayCount = range === '7d' ? 7 : 30;
  for (let offset = dayCount - 1; offset >= 0; offset -= 1) {
    const date = new Date(
      today.getFullYear(),
      today.getMonth(),
      today.getDate() - offset,
      12,
      0,
      0,
      0,
    );
    const key = formatLocalDateKey(date);
    const label =
      range === '7d'
        ? WEEKDAY_DAY_FMT.format(date).replace(/\.$/, '')
        : DAY_SHORT_FMT.format(date).replace(/\.$/, '');
    const fullLabel = DAY_FULL_FMT.format(date).replace(/\.$/, '');
    buckets.push({
      key,
      label,
      fullLabel,
      addedCount: 0,
      finishedCount: 0,
      highlightsCount: 0,
      notesCount: 0,
    });
  }

  return buckets;
}

/**
 * Aggregates added items, finished items, highlights, and Markdown notes across 6m, 30d, or 7d.
 */
export async function getActivityStats(
  range: ActivityRange,
): Promise<ActivityStatsSnapshot> {
  const db = await getDb();

  const [itemRows, highlightRows, noteRows] = await Promise.all([
    db.select<Array<{ status: ItemStatus; created_at: string; updated_at: string }>>(
      'SELECT status, created_at, updated_at FROM items',
    ),
    db.select<Array<{ created_at: string }>>(
      'SELECT created_at FROM highlights',
    ),
    db.select<Array<{ created_at: string }>>(
      'SELECT created_at FROM notes',
    ),
  ]);

  const buckets = buildActivityBuckets(range);
  const bucketMap = new Map(buckets.map((bucket) => [bucket.key, bucket]));
  const toKey =
    range === '6m' ? parseIsoToLocalMonthKey : parseIsoToLocalDateKey;

  for (const item of itemRows) {
    const addedKey = toKey(item.created_at);
    if (addedKey) {
      const bucket = bucketMap.get(addedKey);
      if (bucket) bucket.addedCount += 1;
    }
    if (item.status === 'finished') {
      const finishedKey = toKey(item.updated_at);
      if (finishedKey) {
        const bucket = bucketMap.get(finishedKey);
        if (bucket) bucket.finishedCount += 1;
      }
    }
  }

  for (const highlight of highlightRows) {
    const key = toKey(highlight.created_at);
    if (key) {
      const bucket = bucketMap.get(key);
      if (bucket) bucket.highlightsCount += 1;
    }
  }

  for (const note of noteRows) {
    const key = toKey(note.created_at);
    if (key) {
      const bucket = bucketMap.get(key);
      if (bucket) bucket.notesCount += 1;
    }
  }

  let added = 0;
  let finished = 0;
  let highlights = 0;
  let notes = 0;
  for (const bucket of buckets) {
    added += bucket.addedCount;
    finished += bucket.finishedCount;
    highlights += bucket.highlightsCount;
    notes += bucket.notesCount;
  }

  return {
    range,
    buckets,
    totals: {
      added,
      finished,
      highlights,
      notes,
      total: added + finished + highlights + notes,
    },
  };
}
