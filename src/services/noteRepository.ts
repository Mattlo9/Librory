import { sanitizeFtsQuery } from '@/lib/text';
import { getDb } from '@/services/db';
import type {
  CreateNoteInput,
  Note,
  NoteWithItem,
  UpdateNoteInput,
} from '@/types/domain';

interface RawNoteWithItemRow extends Note {
  item_title: string | null;
  item_author: string | null;
}

/**
 * Strips leading `#`, normalizes whitespace, and deduplicates note tags while preserving order.
 */
export function normalizeNoteTags(tags: string[]): string[] {
  const seen = new Set<string>();
  const normalized: string[] = [];

  for (const raw of tags) {
    const cleaned = raw.trim().replace(/^#+/, '').replace(/\s+/g, '-');
    if (!cleaned) continue;
    const key = cleaned.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    normalized.push(cleaned);
  }

  return normalized;
}

function parseTagsJson(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return normalizeNoteTags(
      parsed.filter((entry): entry is string => typeof entry === 'string'),
    );
  } catch {
    return [];
  }
}

function mapRow(row: RawNoteWithItemRow): NoteWithItem {
  return {
    ...row,
    tags: parseTagsJson(row.tags_json),
  };
}

export async function listNotesWithItems(): Promise<NoteWithItem[]> {
  const db = await getDb();
  const rows = await db.select<RawNoteWithItemRow[]>(
    `SELECT
       n.*,
       i.title AS item_title,
       i.author AS item_author
     FROM notes n
     LEFT JOIN items i ON i.id = n.item_id
     ORDER BY n.is_pinned DESC, n.updated_at DESC`,
  );
  return rows.map(mapRow);
}

export async function getNoteById(id: string): Promise<NoteWithItem | null> {
  const db = await getDb();
  const rows = await db.select<RawNoteWithItemRow[]>(
    `SELECT
       n.*,
       i.title AS item_title,
       i.author AS item_author
     FROM notes n
     LEFT JOIN items i ON i.id = n.item_id
     WHERE n.id = $1
     LIMIT 1`,
    [id],
  );
  return rows[0] ? mapRow(rows[0]) : null;
}

export async function searchNotesFts(
  query: string,
  limit = 50,
): Promise<NoteWithItem[]> {
  const matchExpr = sanitizeFtsQuery(query);
  if (!matchExpr) {
    return [];
  }

  const db = await getDb();
  const rows = await db.select<RawNoteWithItemRow[]>(
    `SELECT
       n.*,
       i.title AS item_title,
       i.author AS item_author
     FROM notes_fts
     INNER JOIN notes n ON n.id = notes_fts.note_id
     LEFT JOIN items i ON i.id = n.item_id
     WHERE notes_fts MATCH $1
     ORDER BY n.is_pinned DESC, bm25(notes_fts) ASC, n.updated_at DESC
     LIMIT $2`,
    [matchExpr, limit],
  );

  return rows.map(mapRow);
}

export async function createNote(input: CreateNoteInput): Promise<NoteWithItem> {
  const db = await getDb();
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const title = input.title.trim() || 'Nota sin título';
  const content = input.content ?? '';
  const folder = (input.folder ?? '').trim();
  const tags = normalizeNoteTags(input.tags ?? []);

  await db.execute(
    `INSERT INTO notes (
      id, title, content, folder, tags_json, item_id, is_pinned, created_at, updated_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [
      id,
      title,
      content,
      folder,
      JSON.stringify(tags),
      input.item_id ?? null,
      input.is_pinned ? 1 : 0,
      now,
      now,
    ],
  );

  const created = await getNoteById(id);
  if (!created) {
    throw new Error(`No se pudo recuperar la nota recién creada (${id}).`);
  }
  return created;
}

export async function updateNote(
  id: string,
  patch: UpdateNoteInput,
): Promise<NoteWithItem | null> {
  const sets: string[] = [];
  const params: unknown[] = [];

  if (patch.title !== undefined) {
    sets.push(`title = $${params.length + 1}`);
    params.push(patch.title.trim() || 'Nota sin título');
  }
  if (patch.content !== undefined) {
    sets.push(`content = $${params.length + 1}`);
    params.push(patch.content);
  }
  if (patch.folder !== undefined) {
    sets.push(`folder = $${params.length + 1}`);
    params.push(patch.folder.trim());
  }
  if (patch.tags !== undefined) {
    sets.push(`tags_json = $${params.length + 1}`);
    params.push(JSON.stringify(normalizeNoteTags(patch.tags)));
  }
  if (patch.item_id !== undefined) {
    sets.push(`item_id = $${params.length + 1}`);
    params.push(patch.item_id);
  }
  if (patch.is_pinned !== undefined) {
    sets.push(`is_pinned = $${params.length + 1}`);
    params.push(patch.is_pinned ? 1 : 0);
  }

  if (sets.length === 0) {
    return getNoteById(id);
  }

  sets.push(`updated_at = $${params.length + 1}`);
  params.push(new Date().toISOString());
  params.push(id);

  const db = await getDb();
  await db.execute(
    `UPDATE notes SET ${sets.join(', ')} WHERE id = $${params.length}`,
    params,
  );

  return getNoteById(id);
}

export async function deleteNote(id: string): Promise<void> {
  const db = await getDb();
  await db.execute('DELETE FROM notes WHERE id = $1', [id]);
}
