import { useQuery } from '@tanstack/react-query';
import { isTauriRuntime } from '@/services/db';
import { resolveAssetUrl } from '@/services/fileService';

/**
 * Resolves a stored relative asset path (e.g. "covers/<id>.webp") via Tauri's convertFileSrc.
 */
export function useAssetUrl(relativePath: string | null): string | null {
  const tauriActive = isTauriRuntime();
  const { data } = useQuery({
    queryKey: ['asset-url', relativePath],
    queryFn: () => resolveAssetUrl(relativePath),
    enabled: Boolean(tauriActive && relativePath),
    staleTime: Number.POSITIVE_INFINITY,
    gcTime: 1000 * 60 * 30,
  });

  return data ?? null;
}
