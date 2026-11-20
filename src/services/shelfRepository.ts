import { getDb } from '@/services/db';
import { collectDescendantShelfIds } from '@/lib/shelfTree';
import type {
  CreateShelfInput,
  Shelf,
  ShelfWithCount,
  UpdateShelfInput,
} from '@/types/domain';

export async function listShelvesWithCounts(): Promise<ShelfWithCount[]> {
  const db = await getDb();
  const [shelves, links] = await Promise.all([
    db.select<Shelf[]>(
      'SELECT * FROM shelves ORDER BY sort_order ASC, name COLLATE NOCASE ASC',
    ),
    db.select<Array<{ item_id: string; shelf_id: string }>>(
      'SELECT item_id, shelf_id FROM item_shelves',
    ),
  ]);

  const directItemsByShelf = new Map<string, Set<string>>();
  for (const link of links) {
    let set = directItemsByShelf.get(link.shelf_id);
    if (!set) {
      set = new Set<string>();
      directItemsByShelf.set(link.shelf_id, set);
    }
    set.add(link.item_id);
  }

  const childrenByParent = new Map<string, string[]>();
  for (const shelf of shelves) {
    if (!shelf.parent_id) continue;
    const list = childrenByParent.get(shelf.parent_id) ?? [];
    list.push(shelf.id);
    childrenByParent.set(shelf.parent_id, list);
  }

  const subtreeCache = new Map<string, Set<string>>();

  function collectSubtreeItemIds(shelfId: string, visiting: Set<string>): Set<string> {
    const cached = subtreeCache.get(shelfId);
    if (cached) return cached;

    const aggregated = new Set<string>(directItemsByShelf.get(shelfId));
    if (visiting.has(shelfId)) return aggregated;

    visiting.add(shelfId);
    const childIds = childrenByParent.get(shelfId) ?? [];
    for (const childId of childIds) {
      for (const itemId of collectSubtreeItemIds(childId, visiting)) {
        aggregated.add(itemId);
      }
    }
    visiting.delete(shelfId);

    subtreeCache.set(shelfId, aggregated);
    return aggregated;
  }

  return shelves.map((shelf) => {
    const directCount = directItemsByShelf.get(shelf.id)?.size ?? 0;
    const totalCount = collectSubtreeItemIds(shelf.id, new Set<string>()).size;
    return {
      ...shelf,
      direct_item_count: directCount,
      item_count: totalCount,
    };
  });
}

export async function createShelf(input: CreateShelfInput): Promise<Shelf> {
  const trimmedName = input.name.trim();
  if (!trimmedName) {
    throw new Error('El nombre de la estantería no puede estar vacío.');
  }

  const db = await getDb();
  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  await db.execute(
    `INSERT INTO shelves (id, name, parent_id, category, sort_order, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [
      id,
      trimmedName,
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
  if (patch.parent_id === id) {
    throw new Error('Una estantería no puede ser su propio padre.');
  }

  const db = await getDb();

  if (patch.parent_id) {
    const allShelves = await db.select<Shelf[]>('SELECT * FROM shelves');
    const descendants = new Set(collectDescendantShelfIds(allShelves, id));
    if (descendants.has(patch.parent_id)) {
      throw new Error('No se puede mover una estantería dentro de sus propias sub-estanterías.');
    }
  }

  const assignments: string[] = [];
  const params: unknown[] = [];

  if (patch.name !== undefined) {
    const trimmedName = patch.name.trim();
    if (!trimmedName) {
      throw new Error('El nombre de la estantería no puede estar vacío.');
    }
    params.push(trimmedName);
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
