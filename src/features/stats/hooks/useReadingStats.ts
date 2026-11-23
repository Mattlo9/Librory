import { useQuery } from '@tanstack/react-query';
import { libraryKeys } from '@/features/library/hooks/useLibraryData';
import { isTauriRuntime } from '@/services/db';
import { getReadingStats } from '@/services/statsRepository';

export function useReadingStats(enabled: boolean) {
  const tauriActive = isTauriRuntime();
  return useQuery({
    queryKey: libraryKeys.stats,
    queryFn: getReadingStats,
    enabled: tauriActive && enabled,
  });
}
