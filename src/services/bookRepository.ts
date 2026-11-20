import { sanitizeFtsQuery } from '@/lib/text';
import { getDb } from '@/services/db';
import type {
  CreateItemInput,
  FtsSearchResult,
  ItemFilter,
  ItemStatus,
  ItemType,
  LibraryItem,
  LibraryItemWithRelations,
  SaveReadingProgressInput,
  SortOption,
  UpdateItemInput,
} from '@/types/domain';

function resolveOrderClause(sortBy?: SortOption, recentOnly?: boolean): string {
  if (recentOnly) {
    return 'ORDER BY i.last_opened_at DESC';
  }
  switch (sortBy) {
    case 'title_asc':
      return 'ORDER BY i.title COLLATE NOCASE ASC';
    case 'author_asc':
      return 'ORDER BY CASE WHEN i.author = \'\' THEN 1 ELSE 0 END, i.author COLLATE NOCASE ASC, i.title COLLATE NOCASE ASC';
    case 'created_desc':
    default:
      return 'ORDER BY i.created_at DESC';
  }
}

function buildFilterParts(filter: ItemFilter): {
  emptyResult: boolean;
  joinsSql: string;
  whereSql: string;
  params: unknown[];
} {
  const joins: string[] = [];
  const clauses: string[] = [];
  const params: unknown[] = [];

  if (filter.shelfIds !== undefined) {
    if (filter.shelfIds.length === 0) {
      return { emptyResult: true, joinsSql: '', whereSql: '', params: [] };
    }
    joins.push('INNER JOIN item_shelves ishf ON ishf.item_id = i.id');
    const placeholders = filter.shelfIds.map((shelfId) => {
      params.push(shelfId);
      return `$${params.length}`;
    });
    clauses.push(`ishf.shelf_id IN (${placeholders.join(', ')})`);
  } else if (filter.shelfId) {
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

  return {
    emptyResult: false,
    joinsSql: joins.join('\n    '),
    whereSql: clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '',
    params,
  };
}

export async function listItems(filter: ItemFilter = {}): Promise<LibraryItem[]> {
  const { emptyResult, joinsSql, whereSql, params } = buildFilterParts(filter);
  if (emptyResult) {
    return [];
  }

  const db = await getDb();
  const orderSql = resolveOrderClause(filter.sortBy, filter.recentOnly);

  let limitSql = '';
  if (typeof filter.limit === 'number' && filter.limit > 0) {
    params.push(filter.limit);
    limitSql = `LIMIT $${params.length}`;
  }

  const sql = `
    SELECT DISTINCT i.*
    FROM items i
    ${joinsSql}
    ${whereSql}
    ${orderSql}
    ${limitSql}
  `;

  return db.select<LibraryItem[]>(sql, params);
}

const SQLITE_IN_CHUNK_SIZE = 500;

export async function listItemsWithRelations(
  filter: ItemFilter = {},
): Promise<LibraryItemWithRelations[]> {
  const items = await listItems(filter);
  if (items.length === 0) {
    return [];
  }

  const db = await getDb();
  const itemIds = items.map((item) => item.id);

  const shelvesByItem = new Map<string, string[]>();
  const tagsByItem = new Map<string, string[]>();

  const chunkPromises: Array<
    Promise<
      [
        Array<{ item_id: string; shelf_id: string }>,
        Array<{ item_id: string; tag_id: string }>,
      ]
    >
  > = [];

  for (let i = 0; i < itemIds.length; i += SQLITE_IN_CHUNK_SIZE) {
    const chunk = itemIds.slice(i, i + SQLITE_IN_CHUNK_SIZE);
    const placeholders = chunk.map((_, idx) => `$${idx + 1}`).join(', ');
    chunkPromises.push(
      Promise.all([
        db.select<Array<{ item_id: string; shelf_id: string }>>(
          `SELECT item_id, shelf_id FROM item_shelves WHERE item_id IN (${placeholders})`,
          chunk,
        ),
        db.select<Array<{ item_id: string; tag_id: string }>>(
          `SELECT item_id, tag_id FROM item_tags WHERE item_id IN (${placeholders})`,
          chunk,
        ),
      ]),
    );
  }

  const chunkResults = await Promise.all(chunkPromises);

  for (const [shelfLinks, tagLinks] of chunkResults) {
    for (const link of shelfLinks) {
      let list = shelvesByItem.get(link.item_id);
      if (!list) {
        list = [];
        shelvesByItem.set(link.item_id, list);
      }
      list.push(link.shelf_id);
    }

    for (const link of tagLinks) {
      let list = tagsByItem.get(link.item_id);
      if (!list) {
        list = [];
        tagsByItem.set(link.item_id, list);
      }
      list.push(link.tag_id);
    }
  }

  return items.map((item) => ({
    ...item,
    shelf_ids: shelvesByItem.get(item.id) ?? [],
    tag_ids: tagsByItem.get(item.id) ?? [],
  }));
}

export async function getItemById(id: string): Promise<LibraryItem | null> {
  const db = await getDb();
  const rows = await db.select<LibraryItem[]>(
    'SELECT * FROM items WHERE id = $1 LIMIT 1',
    [id],
  );
  return rows[0] ?? null;
}

export async function getItemWithRelationsById(
  id: string,
): Promise<LibraryItemWithRelations | null> {
  const db = await getDb();
  const [item, shelfLinks, tagLinks] = await Promise.all([
    getItemById(id),
    db.select<Array<{ shelf_id: string }>>(
      'SELECT shelf_id FROM item_shelves WHERE item_id = $1',
      [id],
    ),
    db.select<Array<{ tag_id: string }>>(
      'SELECT tag_id FROM item_tags WHERE item_id = $1',
      [id],
    ),
  ]);

  if (!item) return null;

  return {
    ...item,
    shelf_ids: shelfLinks.map((row) => row.shelf_id),
    tag_ids: tagLinks.map((row) => row.tag_id),
  };
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

export async function saveReadingProgress(
  input: SaveReadingProgressInput,
): Promise<LibraryItem | null> {
  const existing = await getItemById(input.itemId);
  if (!existing) {
    return null;
  }

  const resolvedPageCount =
    input.pageCount && input.pageCount > 0 ? input.pageCount : existing.page_count;

  const flooredPage = Math.max(1, Math.floor(input.currentPage));
  const clampedPage =
    resolvedPageCount > 0 ? Math.min(resolvedPageCount, flooredPage) : flooredPage;

  let nextStatus: ItemStatus = existing.status;
  if (input.markFinished === true) {
    nextStatus = 'finished';
  } else if (input.markFinished === false && existing.status === 'finished') {
    nextStatus = 'reading';
  } else if (
    input.markFinished === undefined &&
    (existing.status === 'inbox' || existing.status === 'to_read')
  ) {
    nextStatus = 'reading';
  }

  return updateItem(input.itemId, {
    current_page: clampedPage,
    page_count:
      resolvedPageCount !== existing.page_count ? resolvedPageCount : undefined,
    status: nextStatus,
    last_opened_at: new Date().toISOString(),
  });
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

export async function getItemCountsByType(
  filter: Omit<ItemFilter, 'type' | 'sortBy' | 'limit'> = {},
): Promise<Record<ItemType | 'all', number>> {
  const counts: Record<ItemType | 'all', number> = {
    all: 0,
    book: 0,
    summary: 0,
    article: 0,
    paper: 0,
    course: 0,
    unsorted: 0,
  };

  const { emptyResult, joinsSql, whereSql, params } = buildFilterParts(filter);
  if (emptyResult) {
    return counts;
  }

  const db = await getDb();
  const rows = await db.select<Array<{ type: ItemType; count: number }>>(
    `SELECT i.type, COUNT(DISTINCT i.id) AS count
     FROM items i
     ${joinsSql}
     ${whereSql}
     GROUP BY i.type`,
    params,
  );

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

export async function hasSampleItems(): Promise<boolean> {
  const db = await getDb();
  const rows = await db.select<Array<{ count: number }>>(
    "SELECT COUNT(*) AS count FROM items WHERE file_path LIKE 'sample/%'",
  );
  return (rows[0]?.count ?? 0) > 0;
}

export async function listAllFileHashes(): Promise<string[]> {
  const db = await getDb();
  const rows = await db.select<Array<{ file_hash: string }>>(
    'SELECT file_hash FROM items WHERE file_hash IS NOT NULL',
  );
  return rows.map((row) => row.file_hash);
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
