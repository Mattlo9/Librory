import { useQuery } from '@tanstack/react-query';
import { libraryKeys } from '@/features/library/hooks/useLibraryData';
import { isTauriRuntime } from '@/services/db';
import { getActivityStats, getReadingStats } from '@/services/statsRepository';
import type { ActivityRange } from '@/types/domain';

export function useReadingStats(enabled: boolean) {
  const tauriActive = isTauriRuntime();
  return useQuery({
    queryKey: libraryKeys.stats,
    queryFn: getReadingStats,
    enabled: tauriActive && enabled,
  });
}

export function useActivityStats(range: ActivityRange, enabled: boolean) {
  const tauriActive = isTauriRuntime();
  return useQuery({
    queryKey: libraryKeys.activityStats(range),
    queryFn: () => getActivityStats(range),
    enabled: tauriActive && enabled,
  });
}
