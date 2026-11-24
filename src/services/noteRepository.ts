import { sanitizeFtsQuery } from '@/lib/text';
import { sanitizeNoteFolder } from '@/lib/validation';
import { invokeDb } from '@/services/db';
import type {
  CreateNoteInput,
  NoteWithItem,
  UpdateNoteInput,
} from '@/types/domain';

/**
 * Strips leading `#`, normalizes whitespace, and deduplicates note tags while preserving order.
 */
export function normalizeNoteTags(tags: string[]): string[] {
  const seen = new Set<string>();
  const normalized: string[] = [];

  for (const raw of tags.slice(0, 64)) {
    const cleaned = raw
      .replace(/[\u0000-\u001F\u007F]/g, '')
      .trim()
      .replace(/^#+/, '')
      .replace(/\s+/g, '-')
      .slice(0, 64);
    if (!cleaned) continue;
    const key = cleaned.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    normalized.push(cleaned);
  }

  return normalized;
}

export async function listNotesWithItems(): Promise<NoteWithItem[]> {
  return invokeDb<NoteWithItem[]>('db_list_notes_with_items');
}

export async function getNoteById(id: string): Promise<NoteWithItem | null> {
  return invokeDb<NoteWithItem | null>('db_get_note_by_id', { id });
}

export async function searchNotesFts(
  query: string,
  limit = 50,
): Promise<NoteWithItem[]> {
  if (!sanitizeFtsQuery(query)) {
    return [];
  }
  const safeLimit = Number.isFinite(limit) && limit > 0 ? Math.min(200, Math.floor(limit)) : 50;
  return invokeDb<NoteWithItem[]>('db_search_notes_fts', {
    query,
    limit: safeLimit,
  });
}

export async function createNote(input: CreateNoteInput): Promise<NoteWithItem> {
  return invokeDb<NoteWithItem>('db_create_note', {
    input: {
      ...input,
      folder: input.folder !== undefined ? sanitizeNoteFolder(input.folder) : '',
      tags: normalizeNoteTags(input.tags ?? []),
    },
  });
}

export async function updateNote(
  id: string,
  patch: UpdateNoteInput,
): Promise<NoteWithItem | null> {
  return invokeDb<NoteWithItem | null>('db_update_note', {
    id,
    patch: {
      ...patch,
      ...(patch.folder !== undefined ? { folder: sanitizeNoteFolder(patch.folder) } : {}),
      ...(patch.tags !== undefined ? { tags: normalizeNoteTags(patch.tags) } : {}),
    },
  });
}

export async function deleteNote(id: string): Promise<void> {
  await invokeDb<void>('db_delete_note', { id });
}
