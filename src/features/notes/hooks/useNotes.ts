import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { libraryKeys } from '@/features/library/hooks/useLibraryData';
import { isTauriRuntime } from '@/services/db';
import {
  createNote,
  deleteNote,
  listNotesWithItems,
  searchNotesFts,
  updateNote,
} from '@/services/noteRepository';
import type { CreateNoteInput, UpdateNoteInput } from '@/types/domain';

export function useNotesList(enabled = true) {
  const tauriActive = isTauriRuntime();
  return useQuery({
    queryKey: libraryKeys.notes,
    queryFn: listNotesWithItems,
    enabled: tauriActive && enabled,
  });
}

export function useSearchNotesFts(query: string, enabled: boolean) {
  const tauriActive = isTauriRuntime();
  const trimmed = query.trim();

  return useQuery({
    queryKey: libraryKeys.searchNotesFts(trimmed),
    queryFn: () => searchNotesFts(trimmed, 50),
    enabled: tauriActive && enabled && trimmed.length > 0,
  });
}

export function useCreateNote() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateNoteInput) => createNote(input),
    onSuccess: () => {
      void Promise.all([
        queryClient.invalidateQueries({ queryKey: libraryKeys.notes }),
        queryClient.invalidateQueries({ queryKey: libraryKeys.searchNotesFtsRoot }),
        queryClient.invalidateQueries({ queryKey: libraryKeys.navCounts }),
        queryClient.invalidateQueries({ queryKey: libraryKeys.stats }),
        queryClient.invalidateQueries({ queryKey: libraryKeys.activityStatsRoot }),
      ]);
    },
  });
}

export function useUpdateNote() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: UpdateNoteInput }) =>
      updateNote(id, patch),
    onSuccess: () => {
      void Promise.all([
        queryClient.invalidateQueries({ queryKey: libraryKeys.notes }),
        queryClient.invalidateQueries({ queryKey: libraryKeys.searchNotesFtsRoot }),
      ]);
    },
  });
}

export function useDeleteNote() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteNote(id),
    onSuccess: () => {
      void Promise.all([
        queryClient.invalidateQueries({ queryKey: libraryKeys.notes }),
        queryClient.invalidateQueries({ queryKey: libraryKeys.searchNotesFtsRoot }),
        queryClient.invalidateQueries({ queryKey: libraryKeys.navCounts }),
        queryClient.invalidateQueries({ queryKey: libraryKeys.stats }),
        queryClient.invalidateQueries({ queryKey: libraryKeys.activityStatsRoot }),
      ]);
    },
  });
}
