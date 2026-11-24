import { sanitizeFtsQuery } from '@/lib/text';
import { isSafeItemFilePath, isSafeStoredCoverPath } from '@/lib/validation';
import { invokeDb } from '@/services/db';
import type {
  CreateItemInput,
  FtsSearchResult,
  ItemFilter,
  ItemStatus,
  ItemType,
  LibraryItem,
  LibraryItemWithRelations,
  SaveReadingProgressInput,
  UpdateItemInput,
} from '@/types/domain';

export async function listItems(filter: ItemFilter = {}): Promise<LibraryItem[]> {
  return invokeDb<LibraryItem[]>('db_list_items', { filter });
}

export async function listItemsWithRelations(
  filter: ItemFilter = {},
): Promise<LibraryItemWithRelations[]> {
  return invokeDb<LibraryItemWithRelations[]>('db_list_items_with_relations', { filter });
}

export async function getItemById(id: string): Promise<LibraryItem | null> {
  return invokeDb<LibraryItem | null>('db_get_item_by_id', { id });
}

export async function getItemWithRelationsById(
  id: string,
): Promise<LibraryItemWithRelations | null> {
  return invokeDb<LibraryItemWithRelations | null>(
    'db_get_item_with_relations_by_id',
    { id },
  );
}

export async function createItem(input: CreateItemInput): Promise<LibraryItem> {
  if (!isSafeItemFilePath(input.file_path)) {
    throw new Error('Ruta de archivo del recurso no permitida.');
  }
  if (input.cover_path && !isSafeStoredCoverPath(input.cover_path)) {
    throw new Error('Ruta de portada no permitida.');
  }
  return invokeDb<LibraryItem>('db_create_item', { input });
}

export async function updateItem(
  id: string,
  patch: UpdateItemInput,
): Promise<LibraryItem | null> {
  if (patch.cover_path && !isSafeStoredCoverPath(patch.cover_path)) {
    throw new Error('Ruta de portada no permitida.');
  }
  return invokeDb<LibraryItem | null>('db_update_item', { id, patch });
}

export async function deleteItem(id: string): Promise<void> {
  await invokeDb<void>('db_delete_item', { id });
}

export async function bulkUpdateItemsStatus(
  ids: string[],
  status: ItemStatus,
): Promise<void> {
  const uniqueIds = Array.from(new Set(ids));
  if (uniqueIds.length === 0) return;
  await invokeDb<void>('db_bulk_update_items_status', {
    ids: uniqueIds,
    status,
  });
}

export async function getItemsFilePathsByIds(
  ids: string[],
): Promise<Array<{ id: string; file_path: string; cover_path: string | null }>> {
  const uniqueIds = Array.from(new Set(ids));
  if (uniqueIds.length === 0) return [];
  return invokeDb<Array<{ id: string; file_path: string; cover_path: string | null }>>(
    'db_get_items_file_paths_by_ids',
    { ids: uniqueIds },
  );
}

export async function bulkDeleteItems(
  ids: string[],
): Promise<Array<{ id: string; file_path: string; cover_path: string | null }>> {
  const uniqueIds = Array.from(new Set(ids));
  if (uniqueIds.length === 0) return [];
  return invokeDb<Array<{ id: string; file_path: string; cover_path: string | null }>>(
    'db_bulk_delete_items',
    { ids: uniqueIds },
  );
}

export async function saveReadingProgress(
  input: SaveReadingProgressInput,
): Promise<LibraryItem | null> {
  if (!Number.isFinite(input.currentPage)) {
    throw new Error('La página actual debe ser un número válido.');
  }
  if (input.pageCount !== undefined && !Number.isFinite(input.pageCount)) {
    throw new Error('El total de páginas debe ser un número válido.');
  }
  return invokeDb<LibraryItem | null>('db_save_reading_progress', { input });
}

export async function searchItemsFts(
  query: string,
  limit = 40,
): Promise<FtsSearchResult[]> {
  if (!sanitizeFtsQuery(query)) {
    return [];
  }
  const safeLimit = Number.isFinite(limit) && limit > 0 ? Math.min(200, Math.floor(limit)) : 40;
  return invokeDb<FtsSearchResult[]>('db_search_items_fts', {
    query,
    limit: safeLimit,
  });
}

export async function getItemCountsByType(
  filter: Omit<ItemFilter, 'type' | 'sortBy' | 'limit'> = {},
): Promise<Record<ItemType | 'all', number>> {
  return invokeDb<Record<ItemType | 'all', number>>(
    'db_get_item_counts_by_type',
    { filter },
  );
}

export async function getItemCountsByStatus(
  filter: Omit<ItemFilter, 'status' | 'sortBy' | 'limit'> = {},
): Promise<Record<ItemStatus | 'all', number>> {
  return invokeDb<Record<ItemStatus | 'all', number>>(
    'db_get_item_counts_by_status',
    { filter },
  );
}

export async function getNavigationCounts(): Promise<{
  inbox: number;
  all: number;
  favorites: number;
  recent: number;
  highlights: number;
  notes: number;
}> {
  return invokeDb('db_get_navigation_counts');
}

export async function hasSampleItems(): Promise<boolean> {
  return invokeDb<boolean>('db_has_sample_items');
}

export async function listAllFileHashes(): Promise<string[]> {
  return invokeDb<string[]>('db_list_all_file_hashes');
}

/**
 * Verifies FTS5 triggers and accent-insensitive unicode61 tokenization in an isolated in-memory DB.
 */
export async function runFtsSmokeTest(): Promise<{
  ok: boolean;
  matchedTitle: string | null;
}> {
  return invokeDb<{ ok: boolean; matchedTitle: string | null }>(
    'db_run_fts_smoke_test',
  );
}
