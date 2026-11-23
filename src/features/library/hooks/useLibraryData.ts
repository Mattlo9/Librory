import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo } from 'react';
import {
  createItem,
  getItemCountsByStatus,
  getItemCountsByType,
  getItemWithRelationsById,
  getNavigationCounts,
  hasSampleItems,
  listItemsWithRelations,
  saveReadingProgress,
  searchItemsFts,
  updateItem,
} from '@/services/bookRepository';
import { isTauriRuntime } from '@/services/db';
import { ensureStorageDirectories } from '@/services/fileService';
import {
  createHighlight,
  deleteHighlight,
  listHighlightsByItem,
  listHighlightsWithItems,
  searchHighlightsFts,
  updateHighlight,
} from '@/services/highlightRepository';
import {
  clearItemCover,
  deleteItemAndFiles,
  openBookExternally,
  regenerateItemCover,
  revealBookInExplorer,
} from '@/services/importService';
import { collectDescendantShelfIds } from '@/lib/shelfTree';
import { getNavigationSectionKey } from '@/store/uiStore';
import type {
  CreateHighlightInput,
  CreateItemInput,
  ItemFilter,
  ItemStatus,
  ItemType,
  NavigationSection,
  SaveReadingProgressInput,
  ShelfWithCount,
  SortOption,
  UpdateHighlightInput,
  UpdateItemInput,
} from '@/types/domain';

export const libraryKeys = {
  all: ['library'] as const,
  storageDirs: ['app', 'storage-dirs'] as const,
  navCounts: ['library', 'nav-counts'] as const,
  typeCountsRoot: ['library', 'type-counts'] as const,
  typeCounts: (sectionKey: string, statusFilter: string) =>
    ['library', 'type-counts', sectionKey, statusFilter] as const,
  statusCountsRoot: ['library', 'status-counts'] as const,
  statusCounts: (sectionKey: string, typeFilter: string) =>
    ['library', 'status-counts', sectionKey, typeFilter] as const,
  itemsRoot: ['library', 'items'] as const,
  items: (
    sectionKey: string,
    typeFilter: string,
    statusFilter: string,
    sortBy: string,
  ) => ['library', 'items', sectionKey, typeFilter, statusFilter, sortBy] as const,
  itemDetailRoot: ['library', 'item'] as const,
  itemDetail: (id: string) => ['library', 'item', id] as const,
  searchFtsRoot: ['library', 'search-fts'] as const,
  searchFts: (query: string) => ['library', 'search-fts', query] as const,
  shelves: ['library', 'shelves'] as const,
  tags: ['library', 'tags'] as const,
  highlights: ['library', 'highlights'] as const,
  itemHighlightsRoot: ['library', 'item-highlights'] as const,
  itemHighlights: (itemId: string) =>
    ['library', 'item-highlights', itemId] as const,
  searchHighlightsFtsRoot: ['library', 'search-highlights-fts'] as const,
  searchHighlightsFts: (query: string) =>
    ['library', 'search-highlights-fts', query] as const,
  hasSample: ['library', 'has-sample'] as const,
};

export function useIsTauriRuntime(): boolean {
  return isTauriRuntime();
}

export function useEnsureStorageDirectories() {
  const tauriActive = isTauriRuntime();
  return useQuery({
    queryKey: libraryKeys.storageDirs,
    queryFn: ensureStorageDirectories,
    enabled: tauriActive,
    staleTime: Number.POSITIVE_INFINITY,
  });
}

export function buildSectionFilter(
  section: NavigationSection,
  shelves: ShelfWithCount[],
  typeFilter: ItemType | 'all',
  statusFilter: ItemStatus | 'all',
  sortBy: SortOption,
): ItemFilter {
  const base: ItemFilter = { sortBy };

  if (typeFilter !== 'all') {
    base.type = typeFilter;
  }

  if (section === 'inbox') {
    base.status = 'inbox';
  } else {
    if (statusFilter !== 'all') {
      base.status = statusFilter;
    }
    if (section === 'recent') {
      base.recentOnly = true;
    } else if (typeof section === 'object' && section.kind === 'shelf') {
      const descendantIds = collectDescendantShelfIds(shelves, section.shelfId);
      base.shelfIds = descendantIds.length > 0 ? descendantIds : [section.shelfId];
    } else if (typeof section === 'object' && section.kind === 'tag') {
      base.tagId = section.tagId;
    }
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
  statusFilter: ItemStatus | 'all',
) {
  const tauriActive = isTauriRuntime();
  const sectionKey = getNavigationSectionKey(section);
  const baseFilter = useMemo(() => {
    const { type: _ignoredType, sortBy: _ignoredSort, ...rest } =
      buildSectionFilter(section, shelves, 'all', statusFilter, 'created_desc');
    return rest;
  }, [section, shelves, statusFilter]);

  return useQuery({
    queryKey: [
      ...libraryKeys.typeCounts(sectionKey, statusFilter),
      baseFilter.shelfIds ?? [],
    ],
    queryFn: () => getItemCountsByType(baseFilter),
    enabled: tauriActive && section !== 'highlights',
  });
}

export function useStatusCounts(
  section: NavigationSection,
  shelves: ShelfWithCount[],
  typeFilter: ItemType | 'all',
) {
  const tauriActive = isTauriRuntime();
  const sectionKey = getNavigationSectionKey(section);
  const baseFilter = useMemo(() => {
    const { status: _ignoredStatus, sortBy: _ignoredSort, ...rest } =
      buildSectionFilter(section, shelves, typeFilter, 'all', 'created_desc');
    return rest;
  }, [section, shelves, typeFilter]);

  return useQuery({
    queryKey: [
      ...libraryKeys.statusCounts(sectionKey, typeFilter),
      baseFilter.shelfIds ?? [],
    ],
    queryFn: () => getItemCountsByStatus(baseFilter),
    enabled: tauriActive && section !== 'highlights' && section !== 'inbox',
  });
}

export function useLibraryItems(
  section: NavigationSection,
  shelves: ShelfWithCount[],
  typeFilter: ItemType | 'all',
  statusFilter: ItemStatus | 'all',
  sortBy: SortOption,
) {
  const tauriActive = isTauriRuntime();
  const sectionKey = getNavigationSectionKey(section);
  const filter = useMemo(
    () => buildSectionFilter(section, shelves, typeFilter, statusFilter, sortBy),
    [section, shelves, typeFilter, statusFilter, sortBy],
  );

  return useQuery({
    queryKey: [
      ...libraryKeys.items(sectionKey, typeFilter, statusFilter, sortBy),
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

export function useItemHighlights(itemId: string | null) {
  const tauriActive = isTauriRuntime();
  return useQuery({
    queryKey: libraryKeys.itemHighlights(itemId ?? ''),
    queryFn: () => (itemId ? listHighlightsByItem(itemId) : Promise.resolve([])),
    enabled: Boolean(tauriActive && itemId),
  });
}

export function useSearchHighlightsFts(query: string, enabled: boolean) {
  const tauriActive = isTauriRuntime();
  const trimmed = query.trim();

  return useQuery({
    queryKey: libraryKeys.searchHighlightsFts(trimmed),
    queryFn: () => searchHighlightsFts(trimmed, 50),
    enabled: tauriActive && enabled && trimmed.length > 0,
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
    onSuccess: (_data, variables) => {
      void Promise.all([
        queryClient.invalidateQueries({ queryKey: libraryKeys.itemsRoot }),
        queryClient.invalidateQueries({ queryKey: libraryKeys.typeCountsRoot }),
        queryClient.invalidateQueries({ queryKey: libraryKeys.statusCountsRoot }),
        queryClient.invalidateQueries({ queryKey: libraryKeys.navCounts }),
        queryClient.invalidateQueries({
          queryKey: libraryKeys.itemDetail(variables.id),
        }),
        queryClient.invalidateQueries({ queryKey: libraryKeys.searchFtsRoot }),
        queryClient.invalidateQueries({ queryKey: libraryKeys.highlights }),
      ]);
    },
  });
}

export function useDeleteItem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteItemAndFiles(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: libraryKeys.all });
    },
  });
}

export function useRegenerateItemCover() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (item: Parameters<typeof regenerateItemCover>[0]) =>
      regenerateItemCover(item),
    onSuccess: (_data, item) => {
      void Promise.all([
        queryClient.invalidateQueries({ queryKey: libraryKeys.itemsRoot }),
        queryClient.invalidateQueries({ queryKey: libraryKeys.itemDetail(item.id) }),
      ]);
    },
  });
}

export function useClearItemCover() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (item: Parameters<typeof clearItemCover>[0]) =>
      clearItemCover(item),
    onSuccess: (_data, item) => {
      void Promise.all([
        queryClient.invalidateQueries({ queryKey: libraryKeys.itemsRoot }),
        queryClient.invalidateQueries({ queryKey: libraryKeys.itemDetail(item.id) }),
      ]);
    },
  });
}

export function useOpenBookExternally() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (item: Parameters<typeof openBookExternally>[0]) =>
      openBookExternally(item),
    onSuccess: (_data, item) => {
      void Promise.all([
        queryClient.invalidateQueries({ queryKey: libraryKeys.itemsRoot }),
        queryClient.invalidateQueries({ queryKey: libraryKeys.navCounts }),
        queryClient.invalidateQueries({ queryKey: libraryKeys.itemDetail(item.id) }),
      ]);
    },
  });
}

export function useRevealBookInExplorer() {
  return useMutation({
    mutationFn: (item: Parameters<typeof revealBookInExplorer>[0]) =>
      revealBookInExplorer(item),
  });
}

export function useSaveReadingProgress() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: SaveReadingProgressInput) => saveReadingProgress(input),
    onSuccess: (_data, variables) => {
      void Promise.all([
        queryClient.invalidateQueries({ queryKey: libraryKeys.itemsRoot }),
        queryClient.invalidateQueries({ queryKey: libraryKeys.navCounts }),
        queryClient.invalidateQueries({ queryKey: libraryKeys.typeCountsRoot }),
        queryClient.invalidateQueries({ queryKey: libraryKeys.statusCountsRoot }),
        queryClient.invalidateQueries({
          queryKey: libraryKeys.itemDetail(variables.itemId),
        }),
      ]);
    },
  });
}

export function useCreateHighlight() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateHighlightInput) => createHighlight(input),
    onSuccess: (_data, variables) => {
      void Promise.all([
        queryClient.invalidateQueries({ queryKey: libraryKeys.highlights }),
        queryClient.invalidateQueries({
          queryKey: libraryKeys.itemHighlights(variables.item_id),
        }),
        queryClient.invalidateQueries({
          queryKey: libraryKeys.searchHighlightsFtsRoot,
        }),
        queryClient.invalidateQueries({ queryKey: libraryKeys.navCounts }),
      ]);
    },
  });
}

export function useUpdateHighlight() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      patch,
    }: {
      id: string;
      itemId: string;
      patch: UpdateHighlightInput;
    }) => updateHighlight(id, patch),
    onSuccess: (_data, variables) => {
      void Promise.all([
        queryClient.invalidateQueries({ queryKey: libraryKeys.highlights }),
        queryClient.invalidateQueries({
          queryKey: libraryKeys.itemHighlights(variables.itemId),
        }),
        queryClient.invalidateQueries({
          queryKey: libraryKeys.searchHighlightsFtsRoot,
        }),
      ]);
    },
  });
}

export function useDeleteHighlight() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteHighlight(id),
    onSuccess: () => {
      void Promise.all([
        queryClient.invalidateQueries({ queryKey: libraryKeys.highlights }),
        queryClient.invalidateQueries({ queryKey: libraryKeys.itemHighlightsRoot }),
        queryClient.invalidateQueries({
          queryKey: libraryKeys.searchHighlightsFtsRoot,
        }),
        queryClient.invalidateQueries({ queryKey: libraryKeys.navCounts }),
      ]);
    },
  });
}

export function useSeedSampleLibrary() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { seedSampleLibrary } = await import('@/services/seedService');
      return seedSampleLibrary();
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: libraryKeys.all });
    },
  });
}

export function useClearSampleLibrary() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { clearSampleLibrary } = await import('@/services/seedService');
      return clearSampleLibrary();
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: libraryKeys.all });
    },
  });
}
