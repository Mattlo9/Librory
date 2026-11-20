import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useRef, useState } from 'react';
import { libraryKeys } from '@/features/library/hooks/useLibraryData';
import {
  pickImportableFiles,
  subscribeToFileDrops,
} from '@/services/fileService';
import { importLocalFiles } from '@/services/importService';
import type { ImportBatchProgress, ImportBatchSummary } from '@/types/domain';

const IDLE_PROGRESS: ImportBatchProgress = {
  active: false,
  current: 0,
  total: 0,
  currentFilename: '',
};

export function useImportBooks(enabled: boolean) {
  const queryClient = useQueryClient();
  const isRunningRef = useRef(false);

  const [isDraggingFiles, setIsDraggingFiles] = useState(false);
  const [draggedCount, setDraggedCount] = useState(0);
  const [progress, setProgress] = useState<ImportBatchProgress>(IDLE_PROGRESS);
  const [summary, setSummary] = useState<ImportBatchSummary | null>(null);

  const importPaths = useCallback(
    async (paths: string[]) => {
      if (!enabled || paths.length === 0 || isRunningRef.current) {
        return;
      }

      isRunningRef.current = true;
      setSummary(null);
      setProgress({
        active: true,
        current: 0,
        total: paths.length,
        currentFilename: '',
      });

      try {
        const result = await importLocalFiles(paths, (nextProgress) => {
          setProgress(nextProgress);
        });
        setSummary(result);

        if (result.imported.length > 0) {
          void queryClient.invalidateQueries({ queryKey: libraryKeys.all });
        }
      } finally {
        isRunningRef.current = false;
        setProgress(IDLE_PROGRESS);
      }
    },
    [enabled, queryClient],
  );

  const importFromDialog = useCallback(async () => {
    if (!enabled || isRunningRef.current) {
      return;
    }

    const selectedPaths = await pickImportableFiles();
    if (selectedPaths.length > 0) {
      await importPaths(selectedPaths);
    }
  }, [enabled, importPaths]);

  const dismissSummary = useCallback(() => {
    setSummary(null);
  }, []);

  useEffect(() => {
    if (!enabled) return;

    let disposed = false;
    let unlisten: (() => void) | null = null;

    void subscribeToFileDrops({
      onEnter: (paths) => {
        setIsDraggingFiles(true);
        setDraggedCount(paths.length);
      },
      onLeave: () => {
        setIsDraggingFiles(false);
        setDraggedCount(0);
      },
      onDrop: (paths) => {
        setIsDraggingFiles(false);
        setDraggedCount(0);
        void importPaths(paths);
      },
    }).then((cleanup) => {
      if (disposed) {
        cleanup();
      } else {
        unlisten = cleanup;
      }
    });

    return () => {
      disposed = true;
      unlisten?.();
    };
  }, [enabled, importPaths]);

  return {
    isDraggingFiles,
    draggedCount,
    isImporting: progress.active,
    progress,
    summary,
    importPaths,
    importFromDialog,
    dismissSummary,
  };
}
