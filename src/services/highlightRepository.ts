import { sanitizeFtsQuery } from '@/lib/text';
import { invokeDb } from '@/services/db';
import type {
  CreateHighlightInput,
  Highlight,
  HighlightWithItem,
  UpdateHighlightInput,
} from '@/types/domain';

export async function getHighlightById(id: string): Promise<Highlight | null> {
  return invokeDb<Highlight | null>('db_get_highlight_by_id', { id });
}

export async function listHighlightsWithItems(): Promise<HighlightWithItem[]> {
  return invokeDb<HighlightWithItem[]>('db_list_highlights_with_items');
}

export async function listHighlightsByItem(itemId: string): Promise<Highlight[]> {
  return invokeDb<Highlight[]>('db_list_highlights_by_item', { itemId });
}

export async function createHighlight(
  input: CreateHighlightInput,
): Promise<Highlight> {
  if (!input.quote_text.trim()) {
    throw new Error('La cita del subrayado no puede estar vacía.');
  }
  return invokeDb<Highlight>('db_create_highlight', { input });
}

export async function updateHighlight(
  id: string,
  patch: UpdateHighlightInput,
): Promise<Highlight | null> {
  return invokeDb<Highlight | null>('db_update_highlight', { id, patch });
}

export async function searchHighlightsFts(
  query: string,
  limit = 50,
): Promise<HighlightWithItem[]> {
  if (!sanitizeFtsQuery(query)) {
    return [];
  }
  const safeLimit = Number.isFinite(limit) && limit > 0 ? Math.min(200, Math.floor(limit)) : 50;
  return invokeDb<HighlightWithItem[]>('db_search_highlights_fts', {
    query,
    limit: safeLimit,
  });
}

export async function deleteHighlight(id: string): Promise<void> {
  await invokeDb<void>('db_delete_highlight', { id });
}
