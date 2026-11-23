import {
  collectDescendantShelfIds,
  getShelfBreadcrumb,
} from '@/lib/shelfTree';
import type {
  LibraryItemWithRelations,
  NavigationSection,
  ShelfWithCount,
  TagWithCount,
} from '@/types/domain';

export interface ShelfGroup {
  key: string;
  shelfId: string | null;
  segments: string[];
  items: LibraryItemWithRelations[];
}

export function getSectionHeading(
  section: NavigationSection,
  shelves: ShelfWithCount[],
  tags: TagWithCount[],
): { title: string; segments: string[] } {
  if (section === 'inbox') {
    return { title: 'Inbox', segments: ['Inbox'] };
  }
  if (section === 'all') {
    return { title: 'All Books', segments: ['All Books'] };
  }
  if (section === 'favorites') {
    return { title: 'Favoritos', segments: ['Favoritos'] };
  }
  if (section === 'recent') {
    return { title: 'Recent', segments: ['Recent'] };
  }
  if (section === 'highlights') {
    return { title: 'Highlights', segments: ['Highlights'] };
  }
  if (section === 'stats') {
    return { title: 'Estadísticas', segments: ['Estadísticas'] };
  }

  if (section.kind === 'shelf') {
    const shelfById = new Map(shelves.map((shelf) => [shelf.id, shelf]));
    const segments = getShelfBreadcrumb(section.shelfId, shelfById);
    const label = segments[segments.length - 1] ?? 'Estantería';
    return {
      title: label,
      segments: segments.length > 0 ? segments : ['Estantería'],
    };
  }

  const tag = tags.find((entry) => entry.id === section.tagId);
  const tagName = tag ? `#${tag.name}` : 'Etiqueta';
  return { title: tagName, segments: [tagName] };
}

/**
 * Determines whether the current view should render shelf groups (like Trove's All Books).
 */
export function shouldGroupByShelf(
  section: NavigationSection,
  groupByShelfPref: boolean,
  shelves: ShelfWithCount[],
): boolean {
  if (!groupByShelfPref) return false;
  if (section === 'all') return shelves.length > 0;

  if (typeof section === 'object' && section.kind === 'shelf') {
    return shelves.some((shelf) => shelf.parent_id === section.shelfId);
  }

  return false;
}

/**
 * Groups items into ordered shelf sections using the shelf hierarchy order.
 */
export function groupItemsByShelf(
  items: LibraryItemWithRelations[],
  shelves: ShelfWithCount[],
  section: NavigationSection,
): ShelfGroup[] {
  const shelfById = new Map(shelves.map((shelf) => [shelf.id, shelf]));

  const allowedShelfIds =
    typeof section === 'object' && section.kind === 'shelf'
      ? new Set(collectDescendantShelfIds(shelves, section.shelfId))
      : null;

  const itemsByShelfId = new Map<string, LibraryItemWithRelations[]>();
  const unassignedItems: LibraryItemWithRelations[] = [];

  for (const item of items) {
    const matchingShelves = allowedShelfIds
      ? item.shelf_ids.filter((id) => allowedShelfIds.has(id))
      : item.shelf_ids.filter((id) => shelfById.has(id));

    if (matchingShelves.length === 0) {
      unassignedItems.push(item);
      continue;
    }

    for (const shelfId of matchingShelves) {
      const bucket = itemsByShelfId.get(shelfId) ?? [];
      bucket.push(item);
      itemsByShelfId.set(shelfId, bucket);
    }
  }

  // Ordenar estanterías en recorrido pre-orden del árbol para respetar sort_order jerárquico
  const childrenByParent = new Map<string | null, ShelfWithCount[]>();
  for (const shelf of shelves) {
    const parentKey = shelf.parent_id && shelfById.has(shelf.parent_id)
      ? shelf.parent_id
      : null;
    const list = childrenByParent.get(parentKey) ?? [];
    list.push(shelf);
    childrenByParent.set(parentKey, list);
  }

  const orderedShelves: ShelfWithCount[] = [];
  const visited = new Set<string>();

  function visit(parentKey: string | null) {
    for (const shelf of childrenByParent.get(parentKey) ?? []) {
      if (visited.has(shelf.id)) continue;
      visited.add(shelf.id);
      orderedShelves.push(shelf);
      visit(shelf.id);
    }
  }
  visit(null);

  const groups: ShelfGroup[] = [];
  for (const shelf of orderedShelves) {
    const groupItems = itemsByShelfId.get(shelf.id);
    if (!groupItems || groupItems.length === 0) continue;

    groups.push({
      key: shelf.id,
      shelfId: shelf.id,
      segments: getShelfBreadcrumb(shelf.id, shelfById),
      items: groupItems,
    });
  }

  if (unassignedItems.length > 0) {
    groups.push({
      key: '__unassigned__',
      shelfId: null,
      segments: ['Sin estantería'],
      items: unassignedItems,
    });
  }

  return groups;
}
