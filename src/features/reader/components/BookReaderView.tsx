import { ArrowLeft, BookOpen } from 'lucide-react';
import { lazy, Suspense, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { useItemDetail } from '@/features/library/hooks/useLibraryData';
import { usePomodoroStore } from '@/store/pomodoroStore';

const LazyPdfReaderView = lazy(() =>
  import('@/features/reader/components/PdfReaderView').then((m) => ({
    default: m.PdfReaderView,
  })),
);

const LazyEpubReaderView = lazy(() =>
  import('@/features/reader/components/EpubReaderView').then((m) => ({
    default: m.EpubReaderView,
  })),
);

interface BookReaderViewProps {
  itemId: string;
  initialPage?: number;
  onClose: () => void;
}

const READER_FALLBACK = (
  <div className="flex h-screen w-screen flex-col bg-background">
    <div className="flex h-12 items-center justify-between border-b border-border bg-sidebar px-4">
      <Skeleton className="h-6 w-36" />
      <Skeleton className="h-6 w-48" />
      <Skeleton className="h-6 w-28" />
    </div>
    <div className="flex flex-1 items-center justify-center p-8">
      <Skeleton className="h-[78vh] w-[540px] max-w-full rounded-md" />
    </div>
  </div>
);

/**
 * Dispatches to the integrated PDF or EPUB reader based on the item's format.
 */
export function BookReaderView({
  itemId,
  initialPage,
  onClose,
}: BookReaderViewProps) {
  const detailQuery = useItemDetail(itemId);
  const item = detailQuery.data ?? null;

  useEffect(() => {
    if (item) {
      usePomodoroStore
        .getState()
        .setReaderBook({ id: item.id, title: item.title });
    } else {
      usePomodoroStore.getState().setReaderBook(null);
    }
  }, [item]);

  useEffect(() => {
    return () => {
      usePomodoroStore.getState().setReaderBook(null);
    };
  }, []);

  if (detailQuery.isLoading) {
    return READER_FALLBACK;
  }

  if (!item) {
    return (
      <div className="flex h-screen w-screen flex-col bg-background">
        <header className="flex h-12 items-center border-b border-border bg-sidebar px-4">
          <Button type="button" variant="ghost" size="sm" onClick={onClose}>
            <ArrowLeft className="size-4" />
            Volver a la biblioteca
          </Button>
        </header>
        <div className="flex flex-1 items-center justify-center p-6">
          <EmptyState
            icon={<BookOpen className="size-5" />}
            title="No se encontró el recurso"
            description="Es posible que el elemento haya sido eliminado de tu biblioteca."
            actions={
              <Button type="button" size="sm" onClick={onClose}>
                <ArrowLeft className="size-4" />
                Volver a la biblioteca
              </Button>
            }
          />
        </div>
      </div>
    );
  }

  return (
    <Suspense fallback={READER_FALLBACK}>
      {item.file_format === 'epub' ? (
        <LazyEpubReaderView
          key={item.id}
          itemId={item.id}
          initialPage={initialPage}
          onClose={onClose}
        />
      ) : (
        <LazyPdfReaderView
          key={item.id}
          itemId={item.id}
          initialPage={initialPage}
          onClose={onClose}
        />
      )}
    </Suspense>
  );
}
