import { invokeDb } from '@/services/db';
import type {
  CreateShelfInput,
  Shelf,
  ShelfWithCount,
  UpdateShelfInput,
} from '@/types/domain';

export async function listShelvesWithCounts(): Promise<ShelfWithCount[]> {
  return invokeDb<ShelfWithCount[]>('db_list_shelves_with_counts');
}

export async function createShelf(input: CreateShelfInput): Promise<Shelf> {
  if (!input.name.trim()) {
    throw new Error('El nombre de la estantería no puede estar vacío.');
  }
  return invokeDb<Shelf>('db_create_shelf', { input });
}

export async function updateShelf(
  id: string,
  patch: UpdateShelfInput,
): Promise<Shelf | null> {
  if (patch.parent_id === id) {
    throw new Error('Una estantería no puede ser su propio padre.');
  }
  return invokeDb<Shelf | null>('db_update_shelf', { id, patch });
}

export async function deleteShelf(id: string): Promise<void> {
  await invokeDb<void>('db_delete_shelf', { id });
}

export async function assignItemToShelf(itemId: string, shelfId: string): Promise<void> {
  await invokeDb<void>('db_assign_item_to_shelf', { itemId, shelfId });
}

export async function removeItemFromShelf(itemId: string, shelfId: string): Promise<void> {
  await invokeDb<void>('db_remove_item_from_shelf', { itemId, shelfId });
}

export async function bulkAssignItemsToShelf(
  itemIds: string[],
  shelfId: string,
): Promise<void> {
  const uniqueIds = Array.from(new Set(itemIds));
  if (uniqueIds.length === 0) return;
  await invokeDb<void>('db_bulk_assign_items_to_shelf', {
    itemIds: uniqueIds,
    shelfId,
  });
}

export async function bulkRemoveItemsFromShelf(
  itemIds: string[],
  shelfId: string,
): Promise<void> {
  const uniqueIds = Array.from(new Set(itemIds));
  if (uniqueIds.length === 0) return;
  await invokeDb<void>('db_bulk_remove_items_from_shelf', {
    itemIds: uniqueIds,
    shelfId,
  });
}
