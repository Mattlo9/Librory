import { sanitizeFtsQuery } from '@/lib/text';
import { getDb } from '@/services/db';
import type {
  CreateHighlightInput,
  Highlight,
  HighlightWithItem,
  UpdateHighlightInput,
} from '@/types/domain';

export async function getHighlightById(id: string): Promise<Highlight | null> {
  const db = await getDb();
  const rows = await db.select<Highlight[]>(
    'SELECT * FROM highlights WHERE id = $1 LIMIT 1',
    [id],
  );
  return rows[0] ?? null;
}

export async function listHighlightsWithItems(): Promise<HighlightWithItem[]> {
  const db = await getDb();
  return db.select<HighlightWithItem[]>(
    `SELECT
       h.*,
       i.title AS item_title,
       i.author AS item_author,
       i.type AS item_type,
       i.file_format AS item_file_format,
       i.file_path AS item_file_path
     FROM highlights h
     INNER JOIN items i ON i.id = h.item_id
     ORDER BY h.created_at DESC`,
  );
}

export async function listHighlightsByItem(itemId: string): Promise<Highlight[]> {
  const db = await getDb();
  return db.select<Highlight[]>(
    `SELECT *
     FROM highlights
     WHERE item_id = $1
     ORDER BY
       CASE WHEN page_number IS NULL THEN 1 ELSE 0 END,
       page_number ASC,
       created_at ASC`,
    [itemId],
  );
}

export async function createHighlight(
  input: CreateHighlightInput,
): Promise<Highlight> {
  const quoteText = input.quote_text.trim();
  if (!quoteText) {
    throw new Error('La cita del subrayado no puede estar vacía.');
  }

  const db = await getDb();
  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  await db.execute(
    `INSERT INTO highlights (
      id, item_id, quote_text, note_markdown, page_number, location_cfi, color,
      created_at, updated_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [
      id,
      input.item_id,
      quoteText,
      input.note_markdown ?? '',
      input.page_number ?? null,
      input.location_cfi ?? null,
      input.color ?? 'amber',
      now,
      now,
    ],
  );

  const created = await getHighlightById(id);
  if (!created) {
    throw new Error(`No se pudo recuperar el subrayado recién creado (${id}).`);
  }
  return created;
}

export async function updateHighlight(
  id: string,
  patch: UpdateHighlightInput,
): Promise<Highlight | null> {
  const db = await getDb();
  const assignments: string[] = [];
  const params: unknown[] = [];

  if (patch.quote_text !== undefined) {
    const trimmed = patch.quote_text.trim();
    if (!trimmed) {
      throw new Error('La cita del subrayado no puede estar vacía.');
    }
    params.push(trimmed);
    assignments.push(`quote_text = $${params.length}`);
  }

  if (patch.note_markdown !== undefined) {
    params.push(patch.note_markdown);
    assignments.push(`note_markdown = $${params.length}`);
  }

  if (patch.page_number !== undefined) {
    params.push(patch.page_number);
    assignments.push(`page_number = $${params.length}`);
  }

  if (patch.location_cfi !== undefined) {
    params.push(patch.location_cfi);
    assignments.push(`location_cfi = $${params.length}`);
  }

  if (patch.color !== undefined) {
    params.push(patch.color);
    assignments.push(`color = $${params.length}`);
  }

  if (assignments.length === 0) {
    return getHighlightById(id);
  }

  params.push(new Date().toISOString());
  assignments.push(`updated_at = $${params.length}`);
  params.push(id);

  await db.execute(
    `UPDATE highlights SET ${assignments.join(', ')} WHERE id = $${params.length}`,
    params,
  );

  return getHighlightById(id);
}

export async function searchHighlightsFts(
  query: string,
  limit = 50,
): Promise<HighlightWithItem[]> {
  const matchExpr = sanitizeFtsQuery(query);
  if (!matchExpr) {
    return [];
  }

  const db = await getDb();
  return db.select<HighlightWithItem[]>(
    `SELECT
       h.*,
       i.title AS item_title,
       i.author AS item_author,
       i.type AS item_type,
       i.file_format AS item_file_format,
       i.file_path AS item_file_path
     FROM highlights_fts
     INNER JOIN highlights h ON h.id = highlights_fts.highlight_id
     INNER JOIN items i ON i.id = h.item_id
     WHERE highlights_fts MATCH $1
     ORDER BY bm25(highlights_fts) ASC, h.created_at DESC
     LIMIT $2`,
    [matchExpr, limit],
  );
}

export async function deleteHighlight(id: string): Promise<void> {
  const db = await getDb();
  await db.execute('DELETE FROM highlights WHERE id = $1', [id]);
}
