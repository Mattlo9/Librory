import { invokeDb } from '@/services/db';
import type {
  CreateTagInput,
  Tag,
  TagWithCount,
  UpdateTagInput,
} from '@/types/domain';

export async function listTagsWithCounts(): Promise<TagWithCount[]> {
  return invokeDb<TagWithCount[]>('db_list_tags_with_counts');
}

export async function createTag(input: CreateTagInput): Promise<Tag> {
  if (!input.name.trim()) {
    throw new Error('El nombre de la etiqueta no puede estar vacío.');
  }
  return invokeDb<Tag>('db_create_tag', { input });
}

export async function updateTag(
  id: string,
  patch: UpdateTagInput,
): Promise<Tag | null> {
  return invokeDb<Tag | null>('db_update_tag', { id, patch });
}

export async function deleteTag(id: string): Promise<void> {
  await invokeDb<void>('db_delete_tag', { id });
}

export async function assignTagToItem(itemId: string, tagId: string): Promise<void> {
  await invokeDb<void>('db_assign_tag_to_item', { itemId, tagId });
}

export async function removeTagFromItem(itemId: string, tagId: string): Promise<void> {
  await invokeDb<void>('db_remove_tag_from_item', { itemId, tagId });
}
