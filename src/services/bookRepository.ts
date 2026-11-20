import { getDb } from '@/services/db';
import type {
  CreateItemInput,
  FtsSearchResult,
  ItemFilter,
  ItemStatus,
  ItemType,
  LibraryItem,
  UpdateItemInput,
} from '@/types/domain';

function sanitizeFtsQuery(rawQuery: string): string {
  const tokens = rawQuery
    .trim()
    .split(/\s+/)
    .map((token) => token.replace(/["*^():]/g, '').trim())
    .filter((token) => token.length > 0);

  return tokens.map((token) => `"${token}"*`).join(' ');
}

export async function listItems(filter: ItemFilter = {}): Promise<LibraryItem[]> {
  const db = await getDb();
  const joins: string[] = [];
  const clauses: string[] = [];
  const params: unknown[] = [];

  if (filter.shelfId) {
    joins.push('INNER JOIN item_shelves ishf ON ishf.item_id = i.id');
    params.push(filter.shelfId);
    clauses.push(`ishf.shelf_id = $${params.length}`);
  }

  if (filter.tagId) {
    joins.push('INNER JOIN item_tags itag ON itag.item_id = i.id');
    params.push(filter.tagId);
    clauses.push(`itag.tag_id = $${params.length}`);
  }

  if (filter.status) {
    params.push(filter.status);
    clauses.push(`i.status = $${params.length}`);
  }

  if (filter.type) {
    params.push(filter.type);
    clauses.push(`i.type = $${params.length}`);
  }

  if (filter.recentOnly) {
    clauses.push('i.last_opened_at IS NOT NULL');
  }

  const whereSql = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';
  const orderSql = filter.recentOnly
    ? 'ORDER BY i.last_opened_at DESC'
    : 'ORDER BY i.created_at DESC';

  let limitSql = '';
  if (typeof filter.limit === 'number' && filter.limit > 0) {
    params.push(filter.limit);
    limitSql = `LIMIT $${params.length}`;
  }

  const sql = `
    SELECT i.*
    FROM items i
    ${joins.join('\n    ')}
    ${whereSql}
    ${orderSql}
    ${limitSql}
  `;

  return db.select<LibraryItem[]>(sql, params);
}

export async function getItemById(id: string): Promise<LibraryItem | null> {
  const db = await getDb();
  const rows = await db.select<LibraryItem[]>(
    'SELECT * FROM items WHERE id = $1 LIMIT 1',
    [id],
  );
  return rows[0] ?? null;
}

export async function createItem(input: CreateItemInput): Promise<LibraryItem> {
  const db = await getDb();
  const id = input.id ?? crypto.randomUUID();
  const now = new Date().toISOString();

  await db.execute(
    `INSERT INTO items (
      id, title, author, type, status, file_path, cover_path,
      file_format, file_hash, file_size, page_count, current_page,
      notes, created_at, updated_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)`,
    [
      id,
      input.title,
      input.author ?? '',
      input.type ?? 'unsorted',
      input.status ?? 'inbox',
      input.file_path,
      input.cover_path ?? null,
      input.file_format,
      input.file_hash ?? null,
      input.file_size ?? 0,
      input.page_count ?? 0,
      input.current_page ?? 0,
      input.notes ?? '',
      now,
      now,
    ],
  );

  const created = await getItemById(id);
  if (!created) {
    throw new Error(`No se pudo recuperar el item recién creado (${id}).`);
  }
  return created;
}

export async function updateItem(
  id: string,
  patch: UpdateItemInput,
): Promise<LibraryItem | null> {
  const db = await getDb();
  const assignments: string[] = [];
  const params: unknown[] = [];

  const updatableFields: Array<keyof UpdateItemInput> = [
    'title',
    'author',
    'type',
    'status',
    'cover_path',
    'page_count',
    'current_page',
    'notes',
    'last_opened_at',
  ];

  for (const field of updatableFields) {
    const value = patch[field];
    if (value !== undefined) {
      params.push(value);
      assignments.push(`${field} = $${params.length}`);
    }
  }

  if (assignments.length === 0) {
    return getItemById(id);
  }

  params.push(new Date().toISOString());
  assignments.push(`updated_at = $${params.length}`);
  params.push(id);

  await db.execute(
    `UPDATE items SET ${assignments.join(', ')} WHERE id = $${params.length}`,
    params,
  );

  return getItemById(id);
}

export async function deleteItem(id: string): Promise<void> {
  const db = await getDb();
  await db.execute('DELETE FROM items WHERE id = $1', [id]);
}

export async function searchItemsFts(
  query: string,
  limit = 40,
): Promise<FtsSearchResult[]> {
  const matchExpr = sanitizeFtsQuery(query);
  if (!matchExpr) {
    return [];
  }

  const db = await getDb();
  const rows = await db.select<Array<LibraryItem & { fts_rank: number }>>(
    `SELECT i.*, bm25(items_fts) AS fts_rank
     FROM items_fts
     INNER JOIN items i ON i.id = items_fts.item_id
     WHERE items_fts MATCH $1
     ORDER BY fts_rank ASC
     LIMIT $2`,
    [matchExpr, limit],
  );

  return rows.map(({ fts_rank, ...item }) => ({
    item,
    rank: fts_rank,
  }));
}

export async function getItemCountsByType(): Promise<Record<ItemType | 'all', number>> {
  const db = await getDb();
  const rows = await db.select<Array<{ type: ItemType; count: number }>>(
    'SELECT type, COUNT(*) AS count FROM items GROUP BY type',
  );

  const counts: Record<ItemType | 'all', number> = {
    all: 0,
    book: 0,
    summary: 0,
    article: 0,
    paper: 0,
    course: 0,
    unsorted: 0,
  };

  for (const row of rows) {
    counts[row.type] = row.count;
    counts.all += row.count;
  }

  return counts;
}

export async function getNavigationCounts(): Promise<{
  inbox: number;
  all: number;
  recent: number;
  highlights: number;
}> {
  const db = await getDb();
  const [statusRows, recentRows, highlightsRows] = await Promise.all([
    db.select<Array<{ status: ItemStatus; count: number }>>(
      'SELECT status, COUNT(*) AS count FROM items GROUP BY status',
    ),
    db.select<Array<{ count: number }>>(
      'SELECT COUNT(*) AS count FROM items WHERE last_opened_at IS NOT NULL',
    ),
    db.select<Array<{ count: number }>>(
      'SELECT COUNT(*) AS count FROM highlights',
    ),
  ]);

  let inbox = 0;
  let all = 0;
  for (const row of statusRows) {
    if (row.status === 'inbox') {
      inbox = row.count;
    }
    all += row.count;
  }

  return {
    inbox,
    all,
    recent: recentRows[0]?.count ?? 0,
    highlights: highlightsRows[0]?.count ?? 0,
  };
}

/**
 * Phase 1 smoke test: verifies FTS5 triggers and accent-insensitive unicode61 tokenization.
 */
export async function runFtsSmokeTest(): Promise<{
  ok: boolean;
  matchedTitle: string | null;
}> {
  const tempId = `smoke-${crypto.randomUUID()}`;

  try {
    await createItem({
      id: tempId,
      title: 'Filosofía Local-First',
      author: 'Prueba de Sistema',
      type: 'paper',
      status: 'inbox',
      file_path: `books/${tempId}.pdf`,
      file_format: 'pdf',
      notes: 'Verificación de índice FTS5 sin diacríticos.',
    });

    const matches = await searchItemsFts('filosofia');
    const matched = matches.find((entry) => entry.item.id === tempId);

    return {
      ok: Boolean(matched),
      matchedTitle: matched?.item.title ?? null,
    };
  } finally {
    await deleteItem(tempId);
  }
}
