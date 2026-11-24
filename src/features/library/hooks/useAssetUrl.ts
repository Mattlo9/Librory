import { useQuery } from '@tanstack/react-query';
import { isSafeStoredCoverPath } from '@/lib/validation';
import { isTauriRuntime } from '@/services/db';
import { resolveAssetUrl } from '@/services/fileService';

/**
 * Resolves a strictly validated stored cover path (`covers/<id>.webp`) via Tauri's convertFileSrc.
 */
export function useAssetUrl(
  relativePath: string | null,
  cacheBust?: string,
): string | null {
  const tauriActive = isTauriRuntime();
  const validCoverPath = isSafeStoredCoverPath(relativePath) ? relativePath : null;
  const { data } = useQuery({
    queryKey: ['asset-url', validCoverPath, cacheBust ?? ''],
    queryFn: () => resolveAssetUrl(validCoverPath, cacheBust),
    enabled: Boolean(tauriActive && validCoverPath),
    staleTime: Number.POSITIVE_INFINITY,
    gcTime: 1000 * 60 * 30,
  });

  return data ?? null;
}
