import { getDb } from '@/services/db';
import type {
  CreateShelfInput,
  Shelf,
  ShelfTreeNode,
  ShelfWithCount,
  UpdateShelfInput,
} from '@/types/domain';

export async function listShelvesWithCounts(): Promise<ShelfWithCount[]> {
  const db = await getDb();
  return db.select<ShelfWithCount[]>(
    `SELECT
       s.*,
       COUNT(ishf.item_id) AS item_count
     FROM shelves s
     LEFT JOIN item_shelves ishf ON ishf.shelf_id = s.id
     GROUP BY s.id
     ORDER BY s.sort_order ASC, s.name COLLATE NOCASE ASC`,
  );
}

/**
 * Pure helper that converts a flat list of shelves into a nested hierarchy tree.
 */
export function buildShelfTree(shelves: ShelfWithCount[]): ShelfTreeNode[] {
  const nodeMap = new Map<string, ShelfTreeNode>();
  const roots: ShelfTreeNode[] = [];

  for (const shelf of shelves) {
    nodeMap.set(shelf.id, { ...shelf, children: [] });
  }

  for (const shelf of shelves) {
    const node = nodeMap.get(shelf.id);
    if (!node) continue;

    if (shelf.parent_id) {
      const parent = nodeMap.get(shelf.parent_id);
      if (parent) {
        parent.children.push(node);
        continue;
      }
    }

    roots.push(node);
  }

  return roots;
}

export async function createShelf(input: CreateShelfInput): Promise<Shelf> {
  const db = await getDb();
  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  await db.execute(
    `INSERT INTO shelves (id, name, parent_id, category, sort_order, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [
      id,
      input.name.trim(),
      input.parent_id ?? null,
      input.category ?? 'custom',
      input.sort_order ?? 0,
      now,
      now,
    ],
  );

  const rows = await db.select<Shelf[]>(
    'SELECT * FROM shelves WHERE id = $1 LIMIT 1',
    [id],
  );
  const created = rows[0];
  if (!created) {
    throw new Error(`No se pudo recuperar la estantería creada (${id}).`);
  }
  return created;
}

export async function updateShelf(
  id: string,
  patch: UpdateShelfInput,
): Promise<Shelf | null> {
  const db = await getDb();
  const assignments: string[] = [];
  const params: unknown[] = [];

  if (patch.name !== undefined) {
    params.push(patch.name.trim());
    assignments.push(`name = $${params.length}`);
  }
  if (patch.parent_id !== undefined) {
    params.push(patch.parent_id);
    assignments.push(`parent_id = $${params.length}`);
  }
  if (patch.category !== undefined) {
    params.push(patch.category);
    assignments.push(`category = $${params.length}`);
  }
  if (patch.sort_order !== undefined) {
    params.push(patch.sort_order);
    assignments.push(`sort_order = $${params.length}`);
  }

  if (assignments.length === 0) {
    const rows = await db.select<Shelf[]>('SELECT * FROM shelves WHERE id = $1 LIMIT 1', [id]);
    return rows[0] ?? null;
  }

  params.push(new Date().toISOString());
  assignments.push(`updated_at = $${params.length}`);
  params.push(id);

  await db.execute(
    `UPDATE shelves SET ${assignments.join(', ')} WHERE id = $${params.length}`,
    params,
  );

  const rows = await db.select<Shelf[]>('SELECT * FROM shelves WHERE id = $1 LIMIT 1', [id]);
  return rows[0] ?? null;
}

export async function deleteShelf(id: string): Promise<void> {
  const db = await getDb();
  await db.execute('DELETE FROM shelves WHERE id = $1', [id]);
}

export async function assignItemToShelf(itemId: string, shelfId: string): Promise<void> {
  const db = await getDb();
  await db.execute(
    'INSERT OR IGNORE INTO item_shelves (item_id, shelf_id) VALUES ($1, $2)',
    [itemId, shelfId],
  );
}

export async function removeItemFromShelf(itemId: string, shelfId: string): Promise<void> {
  const db = await getDb();
  await db.execute(
    'DELETE FROM item_shelves WHERE item_id = $1 AND shelf_id = $2',
    [itemId, shelfId],
  );
}
