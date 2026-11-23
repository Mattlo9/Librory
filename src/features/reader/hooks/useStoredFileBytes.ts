import { useEffect, useState } from 'react';
import { readStoredFileBytes } from '@/services/fileService';

interface StoredFileBytesState {
  bytes: Uint8Array | null;
  loading: boolean;
  error: string | null;
}

const INITIAL_STATE: StoredFileBytesState = {
  bytes: null,
  loading: false,
  error: null,
};

/**
 * Loads raw document bytes from local AppData storage via the services layer.
 */
export function useStoredFileBytes(
  filePath: string | null,
): StoredFileBytesState {
  const [state, setState] = useState<StoredFileBytesState>(() =>
    filePath ? { bytes: null, loading: true, error: null } : INITIAL_STATE,
  );

  useEffect(() => {
    if (!filePath) {
      setState(INITIAL_STATE);
      return;
    }

    let cancelled = false;
    setState({ bytes: null, loading: true, error: null });

    void readStoredFileBytes(filePath)
      .then((bytes) => {
        if (!cancelled) {
          setState({ bytes, loading: false, error: null });
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setState({
            bytes: null,
            loading: false,
            error:
              err instanceof Error
                ? err.message
                : 'No se pudo leer el archivo local.',
          });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [filePath]);

  return state;
}
