import { getDb } from '@/services/db';
import type {
  CreateTagInput,
  Tag,
  TagWithCount,
  UpdateTagInput,
} from '@/types/domain';

export async function listTagsWithCounts(): Promise<TagWithCount[]> {
  const db = await getDb();
  return db.select<TagWithCount[]>(
    `SELECT
       t.*,
       COUNT(it.item_id) AS item_count
     FROM tags t
     LEFT JOIN item_tags it ON it.tag_id = t.id
     GROUP BY t.id
     ORDER BY t.name COLLATE NOCASE ASC`,
  );
}

export async function createTag(input: CreateTagInput): Promise<Tag> {
  const name = input.name.trim();
  if (!name) {
    throw new Error('El nombre de la etiqueta no puede estar vacío.');
  }

  const db = await getDb();
  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  await db.execute(
    'INSERT INTO tags (id, name, color, created_at) VALUES ($1, $2, $3, $4)',
    [id, name, input.color ?? null, now],
  );

  const rows = await db.select<Tag[]>('SELECT * FROM tags WHERE id = $1 LIMIT 1', [id]);
  const created = rows[0];
  if (!created) {
    throw new Error(`No se pudo recuperar la etiqueta creada (${id}).`);
  }
  return created;
}

export async function updateTag(
  id: string,
  patch: UpdateTagInput,
): Promise<Tag | null> {
  const db = await getDb();
  const assignments: string[] = [];
  const params: unknown[] = [];

  if (patch.name !== undefined) {
    const trimmed = patch.name.trim();
    if (!trimmed) {
      throw new Error('El nombre de la etiqueta no puede estar vacío.');
    }
    params.push(trimmed);
    assignments.push(`name = $${params.length}`);
  }

  if (patch.color !== undefined) {
    params.push(patch.color);
    assignments.push(`color = $${params.length}`);
  }

  if (assignments.length === 0) {
    const rows = await db.select<Tag[]>('SELECT * FROM tags WHERE id = $1 LIMIT 1', [id]);
    return rows[0] ?? null;
  }

  params.push(id);
  await db.execute(
    `UPDATE tags SET ${assignments.join(', ')} WHERE id = $${params.length}`,
    params,
  );

  const rows = await db.select<Tag[]>('SELECT * FROM tags WHERE id = $1 LIMIT 1', [id]);
  return rows[0] ?? null;
}

export async function deleteTag(id: string): Promise<void> {
  const db = await getDb();
  await db.execute('DELETE FROM tags WHERE id = $1', [id]);
}

export async function assignTagToItem(itemId: string, tagId: string): Promise<void> {
  const db = await getDb();
  await db.execute(
    'INSERT OR IGNORE INTO item_tags (item_id, tag_id) VALUES ($1, $2)',
    [itemId, tagId],
  );
}

export async function removeTagFromItem(itemId: string, tagId: string): Promise<void> {
  const db = await getDb();
  await db.execute(
    'DELETE FROM item_tags WHERE item_id = $1 AND tag_id = $2',
    [itemId, tagId],
  );
}
