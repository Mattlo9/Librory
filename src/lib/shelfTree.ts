import type { Shelf, ShelfTreeNode, ShelfWithCount } from '@/types/domain';

/**
 * Converts a flat list of shelves into a nested hierarchy tree while safely breaking any
 * self-references or ancestor cycles so no shelves disappear.
 */
export function buildShelfTree(shelves: ShelfWithCount[]): ShelfTreeNode[] {
  const nodeMap = new Map<string, ShelfTreeNode>();
  const shelfById = new Map<string, ShelfWithCount>();
  const roots: ShelfTreeNode[] = [];

  for (const shelf of shelves) {
    if (nodeMap.has(shelf.id)) continue;
    nodeMap.set(shelf.id, { ...shelf, children: [] });
    shelfById.set(shelf.id, shelf);
  }

  const attachedParent = new Map<string, string>();

  const createsCycle = (childId: string, candidateParentId: string): boolean => {
    let cursor: string | undefined = candidateParentId;
    const seen = new Set<string>([childId]);
    while (cursor) {
      if (seen.has(cursor)) return true;
      seen.add(cursor);
      cursor = attachedParent.get(cursor);
    }
    return false;
  };

  for (const shelf of shelfById.values()) {
    const node = nodeMap.get(shelf.id);
    if (!node) continue;

    if (
      shelf.parent_id &&
      shelf.parent_id !== shelf.id &&
      nodeMap.has(shelf.parent_id) &&
      !createsCycle(shelf.id, shelf.parent_id)
    ) {
      const parent = nodeMap.get(shelf.parent_id)!;
      parent.children.push(node);
      attachedParent.set(shelf.id, shelf.parent_id);
      continue;
    }

    roots.push(node);
  }

  return roots;
}

/**
 * Returns rootId plus all descendant shelf IDs (cycle-safe).
 */
export function collectDescendantShelfIds(shelves: Shelf[], rootId: string): string[] {
  const childrenByParent = new Map<string, string[]>();
  for (const shelf of shelves) {
    if (!shelf.parent_id || shelf.parent_id === shelf.id) continue;
    const list = childrenByParent.get(shelf.parent_id) ?? [];
    list.push(shelf.id);
    childrenByParent.set(shelf.parent_id, list);
  }

  const visited = new Set<string>();
  const queue = [rootId];

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current || visited.has(current)) continue;
    visited.add(current);

    for (const childId of childrenByParent.get(current) ?? []) {
      if (!visited.has(childId)) {
        queue.push(childId);
      }
    }
  }

  return Array.from(visited);
}

/**
 * Returns the shelf path from root to target (e.g. ['Projects', 'Dialogic Studio']).
 */
export function getShelfBreadcrumb(shelfId: string, shelfById: Map<string, Shelf>): string[] {
  const segments: string[] = [];
  const visited = new Set<string>();
  let current = shelfById.get(shelfId);

  while (current && !visited.has(current.id)) {
    visited.add(current.id);
    segments.unshift(current.name);
    current = current.parent_id ? shelfById.get(current.parent_id) : undefined;
  }

  return segments;
}
