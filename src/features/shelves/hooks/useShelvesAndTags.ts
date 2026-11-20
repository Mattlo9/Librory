import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { libraryKeys } from '@/features/library/hooks/useLibraryData';
import { isTauriRuntime } from '@/services/db';
import {
  assignItemToShelf,
  createShelf,
  deleteShelf,
  listShelvesWithCounts,
  removeItemFromShelf,
  updateShelf,
} from '@/services/shelfRepository';
import {
  assignTagToItem,
  createTag,
  deleteTag,
  listTagsWithCounts,
  removeTagFromItem,
  updateTag,
} from '@/services/tagRepository';
import type {
  CreateShelfInput,
  CreateTagInput,
  UpdateShelfInput,
  UpdateTagInput,
} from '@/types/domain';

export function useShelves() {
  const tauriActive = isTauriRuntime();
  return useQuery({
    queryKey: libraryKeys.shelves,
    queryFn: listShelvesWithCounts,
    enabled: tauriActive,
  });
}

export function useTags() {
  const tauriActive = isTauriRuntime();
  return useQuery({
    queryKey: libraryKeys.tags,
    queryFn: listTagsWithCounts,
    enabled: tauriActive,
  });
}

export function useCreateShelf() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateShelfInput) => createShelf(input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: libraryKeys.shelves });
    },
  });
}

export function useUpdateShelf() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: UpdateShelfInput }) =>
      updateShelf(id, patch),
    onSuccess: () => {
      void Promise.all([
        queryClient.invalidateQueries({ queryKey: libraryKeys.shelves }),
        queryClient.invalidateQueries({ queryKey: libraryKeys.itemsRoot }),
        queryClient.invalidateQueries({ queryKey: libraryKeys.typeCountsRoot }),
      ]);
    },
  });
}

export function useDeleteShelf() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteShelf(id),
    onSuccess: () => {
      void Promise.all([
        queryClient.invalidateQueries({ queryKey: libraryKeys.shelves }),
        queryClient.invalidateQueries({ queryKey: libraryKeys.itemsRoot }),
        queryClient.invalidateQueries({ queryKey: libraryKeys.typeCountsRoot }),
        queryClient.invalidateQueries({ queryKey: libraryKeys.itemDetailRoot }),
      ]);
    },
  });
}

export function useToggleItemShelf() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      itemId,
      shelfId,
      assigned,
    }: {
      itemId: string;
      shelfId: string;
      assigned: boolean;
    }) =>
      assigned
        ? removeItemFromShelf(itemId, shelfId)
        : assignItemToShelf(itemId, shelfId),
    onSuccess: (_data, variables) => {
      void Promise.all([
        queryClient.invalidateQueries({ queryKey: libraryKeys.shelves }),
        queryClient.invalidateQueries({ queryKey: libraryKeys.itemsRoot }),
        queryClient.invalidateQueries({ queryKey: libraryKeys.typeCountsRoot }),
        queryClient.invalidateQueries({
          queryKey: libraryKeys.itemDetail(variables.itemId),
        }),
      ]);
    },
  });
}

export function useCreateTag() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateTagInput) => createTag(input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: libraryKeys.tags });
    },
  });
}

export function useUpdateTag() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: UpdateTagInput }) =>
      updateTag(id, patch),
    onSuccess: () => {
      void Promise.all([
        queryClient.invalidateQueries({ queryKey: libraryKeys.tags }),
        queryClient.invalidateQueries({ queryKey: libraryKeys.itemsRoot }),
      ]);
    },
  });
}

export function useDeleteTag() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteTag(id),
    onSuccess: () => {
      void Promise.all([
        queryClient.invalidateQueries({ queryKey: libraryKeys.tags }),
        queryClient.invalidateQueries({ queryKey: libraryKeys.itemsRoot }),
        queryClient.invalidateQueries({ queryKey: libraryKeys.typeCountsRoot }),
        queryClient.invalidateQueries({ queryKey: libraryKeys.itemDetailRoot }),
      ]);
    },
  });
}

export function useToggleItemTag() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      itemId,
      tagId,
      assigned,
    }: {
      itemId: string;
      tagId: string;
      assigned: boolean;
    }) =>
      assigned
        ? removeTagFromItem(itemId, tagId)
        : assignTagToItem(itemId, tagId),
    onSuccess: (_data, variables) => {
      void Promise.all([
        queryClient.invalidateQueries({ queryKey: libraryKeys.tags }),
        queryClient.invalidateQueries({ queryKey: libraryKeys.itemsRoot }),
        queryClient.invalidateQueries({ queryKey: libraryKeys.typeCountsRoot }),
        queryClient.invalidateQueries({
          queryKey: libraryKeys.itemDetail(variables.itemId),
        }),
      ]);
    },
  });
}
