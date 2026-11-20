import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  createItem,
  deleteItem,
  getItemCountsByType,
  getItemWithRelationsById,
  getNavigationCounts,
  listItemsWithRelations,
  searchItemsFts,
  updateItem,
} from '@/services/bookRepository';
import { isTauriRuntime } from '@/services/db';
import {
  deleteHighlight,
  listHighlightsWithItems,
} from '@/services/highlightRepository';
import {
  clearSampleLibrary,
  hasSampleItems,
  seedSampleLibrary,
} from '@/services/seedService';
import { collectDescendantShelfIds } from '@/lib/shelfTree';
import { getNavigationSectionKey } from '@/store/uiStore';
import type {
  CreateItemInput,
  ItemFilter,
  ItemType,
  NavigationSection,
  ShelfWithCount,
  SortOption,
  UpdateItemInput,
} from '@/types/domain';

export const libraryKeys = {
  all: ['library'] as const,
  navCounts: ['library', 'nav-counts'] as const,
  typeCounts: (sectionKey: string) =>
    ['library', 'type-counts', sectionKey] as const,
  items: (sectionKey: string, typeFilter: string, sortBy: string) =>
    ['library', 'items', sectionKey, typeFilter, sortBy] as const,
  itemDetail: (id: string) => ['library', 'item', id] as const,
  searchFts: (query: string) => ['library', 'search-fts', query] as const,
  shelves: ['library', 'shelves'] as const,
  tags: ['library', 'tags'] as const,
  highlights: ['library', 'highlights'] as const,
  hasSample: ['library', 'has-sample'] as const,
};

export function buildSectionFilter(
  section: NavigationSection,
  shelves: ShelfWithCount[],
  typeFilter: ItemType | 'all',
  sortBy: SortOption,
): ItemFilter {
  const base: ItemFilter = { sortBy };

  if (typeFilter !== 'all') {
    base.type = typeFilter;
  }

  if (section === 'inbox') {
    base.status = 'inbox';
  } else if (section === 'recent') {
    base.recentOnly = true;
  } else if (typeof section === 'object' && section.kind === 'shelf') {
    const descendantIds = collectDescendantShelfIds(shelves, section.shelfId);
    base.shelfIds = descendantIds.length > 0 ? descendantIds : [section.shelfId];
  } else if (typeof section === 'object' && section.kind === 'tag') {
    base.tagId = section.tagId;
  }

  return base;
}

export function useNavigationCounts() {
  const tauriActive = isTauriRuntime();
  return useQuery({
    queryKey: libraryKeys.navCounts,
    queryFn: getNavigationCounts,
    enabled: tauriActive,
  });
}

export function useTypeCounts(
  section: NavigationSection,
  shelves: ShelfWithCount[],
) {
  const tauriActive = isTauriRuntime();
  const sectionKey = getNavigationSectionKey(section);
  const { type: _ignoredType, sortBy: _ignoredSort, ...baseFilter } =
    buildSectionFilter(section, shelves, 'all', 'created_desc');

  return useQuery({
    queryKey: [...libraryKeys.typeCounts(sectionKey), baseFilter.shelfIds ?? []],
    queryFn: () => getItemCountsByType(baseFilter),
    enabled: tauriActive && section !== 'highlights',
  });
}

export function useLibraryItems(
  section: NavigationSection,
  shelves: ShelfWithCount[],
  typeFilter: ItemType | 'all',
  sortBy: SortOption,
) {
  const tauriActive = isTauriRuntime();
  const sectionKey = getNavigationSectionKey(section);
  const filter = buildSectionFilter(section, shelves, typeFilter, sortBy);

  return useQuery({
    queryKey: [
      ...libraryKeys.items(sectionKey, typeFilter, sortBy),
      filter.shelfIds ?? [],
    ],
    queryFn: () => listItemsWithRelations(filter),
    enabled: tauriActive && section !== 'highlights',
  });
}

export function useItemDetail(id: string | null) {
  const tauriActive = isTauriRuntime();
  return useQuery({
    queryKey: libraryKeys.itemDetail(id ?? ''),
    queryFn: () => (id ? getItemWithRelationsById(id) : Promise.resolve(null)),
    enabled: Boolean(tauriActive && id),
  });
}

export function useSearchItemsFts(query: string, enabled: boolean) {
  const tauriActive = isTauriRuntime();
  const trimmed = query.trim();

  return useQuery({
    queryKey: libraryKeys.searchFts(trimmed),
    queryFn: () => searchItemsFts(trimmed, 25),
    enabled: tauriActive && enabled && trimmed.length > 0,
  });
}

export function useHighlightsList(enabled: boolean) {
  const tauriActive = isTauriRuntime();
  return useQuery({
    queryKey: libraryKeys.highlights,
    queryFn: listHighlightsWithItems,
    enabled: tauriActive && enabled,
  });
}

export function useHasSampleItems() {
  const tauriActive = isTauriRuntime();
  return useQuery({
    queryKey: libraryKeys.hasSample,
    queryFn: hasSampleItems,
    enabled: tauriActive,
  });
}

export function useCreateItem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateItemInput) => createItem(input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: libraryKeys.all });
    },
  });
}

export function useUpdateItem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: UpdateItemInput }) =>
      updateItem(id, patch),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: libraryKeys.all });
    },
  });
}

export function useDeleteItem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteItem(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: libraryKeys.all });
    },
  });
}

export function useDeleteHighlight() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteHighlight(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: libraryKeys.all });
    },
  });
}

export function useSeedSampleLibrary() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: seedSampleLibrary,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: libraryKeys.all });
    },
  });
}

export function useClearSampleLibrary() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: clearSampleLibrary,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: libraryKeys.all });
    },
  });
}
