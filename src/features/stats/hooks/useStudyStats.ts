import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { libraryKeys } from '@/features/library/hooks/useLibraryData';
import { isTauriRuntime } from '@/services/db';
import {
  createStudySession,
  getStudyEvolutionStats,
  getStudyOverviewStats,
  listPomodoroBookOptions,
} from '@/services/studySessionRepository';
import type {
  CreateStudySessionInput,
  StudyEvolutionGranularity,
  StudyStatsRange,
} from '@/types/domain';

export function useStudyOverviewStats(
  range: StudyStatsRange,
  enabled: boolean,
) {
  const tauriActive = isTauriRuntime();
  return useQuery({
    queryKey: libraryKeys.studyStats(range),
    queryFn: () => getStudyOverviewStats(range),
    enabled: tauriActive && enabled,
  });
}

export function useStudyEvolutionStats(
  granularity: StudyEvolutionGranularity,
  enabled: boolean,
) {
  const tauriActive = isTauriRuntime();
  return useQuery({
    queryKey: libraryKeys.studyEvolution(granularity),
    queryFn: () => getStudyEvolutionStats(granularity),
    enabled: tauriActive && enabled,
  });
}

export function usePomodoroBookOptions(enabled: boolean) {
  const tauriActive = isTauriRuntime();
  return useQuery({
    queryKey: libraryKeys.pomodoroBookOptions,
    queryFn: listPomodoroBookOptions,
    enabled: tauriActive && enabled,
    staleTime: 1000 * 15,
  });
}

export function useCreateStudySession() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateStudySessionInput) => createStudySession(input),
    onSuccess: () => {
      void Promise.all([
        queryClient.invalidateQueries({ queryKey: libraryKeys.studyStatsRoot }),
        queryClient.invalidateQueries({ queryKey: libraryKeys.stats }),
      ]);
    },
  });
}
