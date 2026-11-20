import { getDb } from '@/services/db';
import type { HighlightWithItem } from '@/types/domain';

export async function listHighlightsWithItems(): Promise<HighlightWithItem[]> {
  const db = await getDb();
  return db.select<HighlightWithItem[]>(
    `SELECT
       h.*,
       i.title AS item_title,
       i.author AS item_author,
       i.type AS item_type
     FROM highlights h
     INNER JOIN items i ON i.id = h.item_id
     ORDER BY h.created_at DESC`,
  );
}

export async function deleteHighlight(id: string): Promise<void> {
  const db = await getDb();
  await db.execute('DELETE FROM highlights WHERE id = $1', [id]);
}
