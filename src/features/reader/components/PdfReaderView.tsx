import { PDFViewer, type Viewer, type ViewerConfig } from '@embedpdf/viewer-react';
import {
  ArrowLeft,
  BookOpen,
  CheckCircle2,
  ExternalLink,
  Highlighter,
  MessageSquarePlus,
  NotebookPen,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { ThemeMenu } from '@/components/ui/theme-menu';
import { PomodoroWidget } from '@/features/pomodoro/components/PomodoroWidget';
import {
  useCreateHighlight,
  useItemDetail,
  useItemHighlights,
  useOpenBookExternally,
  useSaveReadingProgress,
} from '@/features/library/hooks/useLibraryData';
import { useNotesList } from '@/features/notes/hooks/useNotes';
import type { ReaderHighlightDraft } from '@/features/reader/components/ReaderHighlightsPanel';
import type { ReaderNoteQuoteInsert } from '@/features/reader/components/ReaderNotesSection';
import {
  ReaderSidePanel,
  type ReaderSidePanelTab,
} from '@/features/reader/components/ReaderSidePanel';
import { useStoredFileBytes } from '@/features/reader/hooks/useStoredFileBytes';
import {
  HIGHLIGHT_COLOR_LABELS,
  HIGHLIGHT_DOT_CLASS,
  HIGHLIGHT_HEX,
  isPdfReadableLocally,
} from '@/lib/highlights';
import { isSafeHttpUrl, isSafeStoredBookPath } from '@/lib/validation';
import { cn } from '@/lib/utils';
import { openExternalUrl } from '@/services/fileService';
import { useUiStore } from '@/store/uiStore';
import {
  HIGHLIGHT_COLORS,
  type HighlightColor,
  type SaveReadingProgressInput,
} from '@/types/domain';

interface PdfReaderViewProps {
  itemId: string;
  initialPage?: number;
  onClose: () => void;
}

const EMBEDPDF_LIGHT_TOKENS = {
  accent: '#4f46e5',
  background: '#ffffff',
  surface: '#f8f8fa',
  'surface-raised': '#ffffff',
  text: '#09090b',
  'text-muted': '#63636e',
  border: '#e4e4e7',
  hover: '#ececf0',
  canvas: '#f1f1f4',
  tooltip: '#18181b',
  'tooltip-text': '#fafafa',
  radius: '0.5rem',
  font: '"Geist Variable", "Inter", system-ui, -apple-system, sans-serif',
} as const;

const EMBEDPDF_DARK_TOKENS = {
  accent: '#818cf8',
  background: '#09090b',
  surface: '#0e0e11',
  'surface-raised': '#121216',
  text: '#f4f4f5',
  'text-muted': '#8e8e98',
  border: '#23232a',
  hover: '#1c1c22',
  canvas: '#070709',
  tooltip: '#18181d',
  'tooltip-text': '#f4f4f5',
  radius: '0.5rem',
  font: '"Geist Variable", "Inter", system-ui, -apple-system, sans-serif',
} as const;

const EMBEDPDF_FEATURES: NonNullable<ViewerConfig['features']> = {
  'documents.open': false,
  'documents.tabs': false,
  attachments: false,
  forms: false,
  signatures: false,
};

const EMBEDPDF_PLUGINS: NonNullable<ViewerConfig['plugins']> = {
  actions: {
    javascript: { enabled: false },
    openSequence: 'off',
    triggers: { document: false, page: false, annotation: false },
  },
};

function clampPage(page: number, numPages: number): number {
  if (numPages <= 0) return 1;
  return Math.min(numPages, Math.max(1, Math.floor(page)));
}

export function PdfReaderView({
  itemId,
  initialPage,
  onClose,
}: PdfReaderViewProps) {
  const detailQuery = useItemDetail(itemId);
  const highlightsQuery = useItemHighlights(itemId);
  const notesQuery = useNotesList(true);
  const saveReadingProgress = useSaveReadingProgress();
  const createHighlight = useCreateHighlight();
  const openBookExternally = useOpenBookExternally();

  const item = detailQuery.data ?? null;
  const isReadablePdf = Boolean(
    item && isPdfReadableLocally(item.file_path, item.file_format),
  );
  const pdfBytesState = useStoredFileBytes(
    isReadablePdf && item ? item.file_path : null,
  );
  const highlights = highlightsQuery.data ?? [];
  const bookNotesCount = useMemo(
    () => (notesQuery.data ?? []).filter((n) => n.item_id === itemId).length,
    [notesQuery.data, itemId],
  );
  const theme = useUiStore((s) => s.theme);
  const embedPdfTheme = useMemo<NonNullable<ViewerConfig['theme']>>(
    () => ({
      preference: theme,
      light: EMBEDPDF_LIGHT_TOKENS,
      dark: EMBEDPDF_DARK_TOKENS,
    }),
    [theme],
  );

  const [viewer, setViewer] = useState<Viewer | null>(null);
  const [numPages, setNumPages] = useState(() => item?.page_count ?? 0);
  const [currentPage, setCurrentPage] = useState(() =>
    item && item.current_page > 0 ? item.current_page : 1,
  );
  const [documentReady, setDocumentReady] = useState(false);
  const [sidePanelTab, setSidePanelTab] =
    useState<ReaderSidePanelTab | null>(null);
  const [composerDraft, setComposerDraft] =
    useState<ReaderHighlightDraft | null>(null);
  const [pendingNoteQuote, setPendingNoteQuote] =
    useState<ReaderNoteQuoteInsert | null>(null);
  const [selectionPrompt, setSelectionPrompt] = useState<{
    quote: string;
    pageNumber: number;
  } | null>(null);
  const [quickToast, setQuickToast] = useState<string | null>(null);

  const initialRestoreDoneRef = useRef(false);
  const lastInitialPageRef = useRef<number | undefined>(initialPage);
  const targetStartPageRef = useRef<number>(
    initialPage ?? (item && item.current_page > 0 ? item.current_page : 1),
  );
  const saveTimerRef = useRef<number | null>(null);
  const toastTimerRef = useRef<number | null>(null);
  const saveMutateRef = useRef(saveReadingProgress.mutate);
  const persistedProgressRef = useRef<{
    itemId: string;
    page: number;
    pageCount: number;
  } | null>(null);
  const pendingProgressRef = useRef<SaveReadingProgressInput | null>(null);

  useEffect(() => {
    saveMutateRef.current = saveReadingProgress.mutate;
  }, [saveReadingProgress.mutate]);

  useEffect(() => {
    if (!initialRestoreDoneRef.current) {
      targetStartPageRef.current =
        initialPage ?? (item && item.current_page > 0 ? item.current_page : 1);
      lastInitialPageRef.current = initialPage;
    }
  }, [initialPage, item]);

  useEffect(() => {
    return () => {
      if (toastTimerRef.current !== null) {
        window.clearTimeout(toastTimerRef.current);
      }
    };
  }, []);

  const handleViewerReady = useCallback((instance: Viewer) => {
    setViewer(instance);
  }, []);

  // Vincula la instancia de EmbedPDF: página inicial, progreso y selección de texto.
  useEffect(() => {
    if (!viewer) return;

    let cancelled = false;
    initialRestoreDoneRef.current = false;
    setDocumentReady(false);
    setSelectionPrompt(null);

    const syncOpenedDocument = () => {
      if (cancelled) return;
      const stage = viewer.tryGet('stage');
      if (!stage) return;

      const total = stage.getPageCount();
      if (total <= 0) return;

      const startPage = clampPage(targetStartPageRef.current, total);
      setNumPages(total);
      setCurrentPage(startPage);

      if (startPage > 1) {
        stage.goToPage(startPage - 1, { behavior: 'instant' });
      }

      initialRestoreDoneRef.current = true;
      setDocumentReady(true);
    };

    const actionsCap = viewer.tryGet('actions');
    const unsubUiAdapter = actionsCap?.setUiAdapter({
      openUri(uri) {
        if (isSafeHttpUrl(uri)) {
          void openExternalUrl(uri).catch(() => {});
        }
      },
      print() {
        // Suppress PDF-action-triggered automatic print dialogs.
      },
      alert() {
        // Suppress PDF AcroJS alert popups.
      },
    });

    const unsubOpen = viewer.documents.onOpened(() => {
      syncOpenedDocument();
    });

    if (viewer.documents.getActive()?.status === 'ready') {
      syncOpenedDocument();
    }

    const unwatchStage = viewer.watch(
      () => {
        const stage = viewer.get('stage');
        return `${stage.getCurrentPageIndex()}:${stage.getPageCount()}`;
      },
      (snapshot) => {
        if (!initialRestoreDoneRef.current) return;
        const [idxStr, countStr] = snapshot.split(':');
        const nextPage = (Number.parseInt(idxStr ?? '0', 10) || 0) + 1;
        const nextCount = Number.parseInt(countStr ?? '0', 10) || 0;
        if (nextCount > 0) {
          setNumPages(nextCount);
          setCurrentPage(clampPage(nextPage, nextCount));
        }
      },
    );

    const unwatchSelection = viewer.watch(
      () => {
        const sel = viewer.get('selection');
        if (sel.isSelecting()) return null;
        const range = sel.getRange();
        if (!range) return null;
        return `${range.start.page.objectNumber}:${range.start.index}-${range.end.page.objectNumber}:${range.end.index}`;
      },
      (rangeKey) => {
        if (!rangeKey) {
          setSelectionPrompt(null);
          return;
        }

        const sel = viewer.tryGet('selection');
        if (!sel) {
          setSelectionPrompt(null);
          return;
        }

        const selectedPages = sel.listSelectedPages();
        const firstRef = selectedPages[0];
        const refPageIndex =
          firstRef !== undefined
            ? viewer.documents.getPageIndex(firstRef)
            : -1;
        const stagePageIndex = viewer.tryGet('stage')?.getCurrentPageIndex() ?? 0;
        const pageNumber =
          (refPageIndex >= 0 ? refPageIndex : stagePageIndex) + 1;

        void sel
          .readText()
          .then((raw) => {
            if (cancelled) return;
            const normalized = raw.replace(/\s+/g, ' ').trim();
            setSelectionPrompt(
              normalized.length >= 2
                ? { quote: normalized, pageNumber }
                : null,
            );
          })
          .catch(() => {
            if (!cancelled) {
              setSelectionPrompt(null);
            }
          });
      },
    );

    return () => {
      cancelled = true;
      unsubUiAdapter?.();
      unsubOpen();
      unwatchStage();
      unwatchSelection();
    };
  }, [viewer]);

  // Permite saltar a una página si `initialPage` cambia con el lector ya abierto.
  useEffect(() => {
    if (
      !documentReady ||
      !viewer ||
      numPages <= 0 ||
      initialPage === undefined ||
      initialPage === lastInitialPageRef.current
    ) {
      return;
    }

    lastInitialPageRef.current = initialPage;
    const target = clampPage(initialPage, numPages);
    viewer.tryGet('stage')?.goToPage(target - 1, { behavior: 'smooth' });
    setCurrentPage(target);
  }, [documentReady, viewer, numPages, initialPage]);

  // Guarda el progreso de lectura en SQLite con debounce y flush al salir.
  useEffect(() => {
    if (!item || !isReadablePdf || !documentReady || numPages <= 0) return;

    const needsImmediateSync =
      item.last_opened_at === null ||
      item.page_count !== numPages ||
      item.status === 'inbox' ||
      item.status === 'to_read';

    const payload: SaveReadingProgressInput = {
      itemId: item.id,
      currentPage,
      pageCount: numPages,
    };

    const persisted = persistedProgressRef.current;
    const alreadySaved =
      persisted !== null &&
      persisted.itemId === item.id &&
      persisted.page === currentPage &&
      persisted.pageCount === numPages &&
      !needsImmediateSync;

    if (alreadySaved) {
      pendingProgressRef.current = null;
      return;
    }

    pendingProgressRef.current = payload;

    if (saveTimerRef.current !== null) {
      window.clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }

    const flushNow = () => {
      const pending = pendingProgressRef.current;
      if (!pending) return;
      saveMutateRef.current(pending);
      persistedProgressRef.current = {
        itemId: pending.itemId,
        page: pending.currentPage,
        pageCount: pending.pageCount ?? numPages,
      };
      pendingProgressRef.current = null;
    };

    if (needsImmediateSync) {
      flushNow();
      return;
    }

    saveTimerRef.current = window.setTimeout(() => {
      saveTimerRef.current = null;
      flushNow();
    }, 500);

    return () => {
      if (saveTimerRef.current !== null) {
        window.clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
      }
    };
  }, [item, isReadablePdf, documentReady, numPages, currentPage]);

  // Flush final al desmontar (p. ej. al navegar desde Ctrl+K o Alt+1..4).
  useEffect(() => {
    return () => {
      if (saveTimerRef.current !== null) {
        window.clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
      }
      const pending = pendingProgressRef.current;
      if (pending) {
        saveMutateRef.current(pending);
        pendingProgressRef.current = null;
      }
    };
  }, []);

  const handleClose = useCallback(() => {
    if (saveTimerRef.current !== null) {
      window.clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    const pending = pendingProgressRef.current;
    if (pending) {
      saveMutateRef.current(pending);
      pendingProgressRef.current = null;
    }
    onClose();
  }, [onClose]);

  const goToPage = useCallback(
    (targetPage: number) => {
      const clamped = clampPage(targetPage, numPages);
      viewer?.tryGet('stage')?.goToPage(clamped - 1, { behavior: 'smooth' });
      setCurrentPage(clamped);
    },
    [viewer, numPages],
  );

  // Atajos seguros del lector (sin interferir con inputs, diálogos ni Ctrl+K).
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (useUiStore.getState().commandPaletteOpen) return;
      if (document.querySelector('[role="dialog"], [role="alertdialog"]')) {
        return;
      }

      const target = event.target;
      if (
        target instanceof HTMLElement &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable)
      ) {
        return;
      }

      if (event.key === 'Escape') {
        if (selectionPrompt) {
          viewer?.tryGet('selection')?.clear();
          setSelectionPrompt(null);
          return;
        }
        event.preventDefault();
        handleClose();
        return;
      }

      if (event.ctrlKey || event.metaKey || event.altKey) {
        return;
      }

      if (event.key.toLowerCase() === 'h') {
        event.preventDefault();
        setSidePanelTab((prev) =>
          prev === 'highlights' ? null : 'highlights',
        );
        return;
      }

      if (event.key.toLowerCase() === 'n') {
        event.preventDefault();
        setSidePanelTab((prev) => (prev === 'notes' ? null : 'notes'));
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleClose, selectionPrompt, viewer]);

  function showToastMessage(message: string) {
    setQuickToast(message);
    if (toastTimerRef.current !== null) {
      window.clearTimeout(toastTimerRef.current);
    }
    toastTimerRef.current = window.setTimeout(() => {
      setQuickToast(null);
      toastTimerRef.current = null;
    }, 2400);
  }

  async function paintEmbedPdfHighlight(color: HighlightColor) {
    const annotation = viewer?.tryGet('annotation');
    if (!annotation) {
      viewer?.tryGet('selection')?.clear();
      return;
    }

    try {
      const result = await annotation.createFromSelection('highlight', {
        clear: true,
      });
      const hexColor = HIGHLIGHT_HEX[color];
      for (const created of result.annotations) {
        await annotation.update(created.ref, { color: hexColor });
      }
    } catch {
      // Si el PDF restringe escritura de anotaciones, se conserva al menos el highlight en SQLite.
      viewer?.tryGet('selection')?.clear();
    }
  }

  async function handleQuickHighlight(
    quote: string,
    pageNumber: number,
    color: HighlightColor,
  ) {
    if (!item) return;
    setSelectionPrompt(null);
    await paintEmbedPdfHighlight(color);

    try {
      await createHighlight.mutateAsync({
        item_id: item.id,
        quote_text: quote,
        color,
        page_number: pageNumber,
      });
      showToastMessage('Subrayado guardado en Highlights');
    } catch (err) {
      showToastMessage(
        err instanceof Error ? err.message : 'No se pudo guardar el subrayado.',
      );
    }
  }

  function handleHighlightWithNote(
    quote: string,
    pageNumber: number,
    color: HighlightColor,
  ) {
    setSelectionPrompt(null);
    void paintEmbedPdfHighlight(color);
    setComposerDraft({
      quote_text: quote,
      color,
      page_number: pageNumber,
    });
    setSidePanelTab('highlights');
  }

  function handleSendSelectionToNote(quote: string, pageNumber: number) {
    viewer?.tryGet('selection')?.clear();
    setSelectionPrompt(null);
    setPendingNoteQuote({
      id: Date.now(),
      quote,
      pageNumber,
    });
    setSidePanelTab('notes');
  }

  if (detailQuery.isLoading) {
    return (
      <div className="flex h-screen w-screen flex-col bg-background">
        <div className="flex h-12 items-center justify-between border-b border-border bg-sidebar px-4">
          <Skeleton className="h-6 w-36" />
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-6 w-28" />
        </div>
        <div className="flex flex-1 items-center justify-center p-8">
          <Skeleton className="h-[78vh] w-[540px] rounded-md" />
        </div>
      </div>
    );
  }

  if (!item || !isReadablePdf) {
    const isRealEpub =
      item &&
      item.file_format === 'epub' &&
      isSafeStoredBookPath(item.file_path);

    return (
      <div className="flex h-screen w-screen flex-col bg-background">
        <header className="flex h-12 items-center border-b border-border bg-sidebar px-4">
          <Button type="button" variant="ghost" size="sm" onClick={handleClose}>
            <ArrowLeft className="size-4" />
            Volver a la biblioteca
          </Button>
        </header>

        <div className="flex flex-1 items-center justify-center p-6">
          <EmptyState
            icon={<BookOpen className="size-5" />}
            title={
              !item
                ? 'No se encontró el recurso'
                : isRealEpub
                  ? 'El visor integrado solo admite PDFs'
                  : 'Elemento de ejemplo sin archivo PDF local'
            }
            description={
              !item
                ? 'Es posible que el elemento haya sido eliminado de tu biblioteca.'
                : isRealEpub
                  ? 'Puedes abrir este libro EPUB directamente con el visor predeterminado de Windows.'
                  : 'Importa un archivo PDF real para leerlo en el visor integrado y crear subrayados.'
            }
            actions={
              <>
                <Button type="button" size="sm" onClick={handleClose}>
                  <ArrowLeft className="size-4" />
                  Volver a la biblioteca
                </Button>
                {isRealEpub ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={openBookExternally.isPending}
                    onClick={() => void openBookExternally.mutateAsync(item)}
                  >
                    <ExternalLink className="size-4" />
                    Abrir con app externa
                  </Button>
                ) : null}
              </>
            }
          />
        </div>
      </div>
    );
  }

  const totalPages = numPages;
  const progressPercent =
    totalPages > 0 ? Math.round((currentPage / totalPages) * 100) : 0;
  const isFinished = item.status === 'finished';

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-background">
      <header className="flex h-11 shrink-0 items-center justify-between gap-3 border-b border-border bg-sidebar px-3">
        <div className="flex min-w-0 flex-1 items-center gap-2.5">
          <Button
            type="button"
            variant="ghost"
            size="xs"
            onClick={handleClose}
            className="shrink-0 text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="size-3.5" />
            <span>Biblioteca</span>
          </Button>

          <span aria-hidden="true" className="h-4 w-px shrink-0 bg-border" />

          <div className="flex min-w-0 items-baseline gap-2">
            <p className="truncate font-sans text-xs font-medium tracking-tight text-foreground">
              {item.title}
            </p>
            {item.author ? (
              <p className="hidden truncate font-serif text-[11px] italic text-muted-foreground md:block">
                — {item.author}
              </p>
            ) : null}
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-3">
          {totalPages > 0 ? (
            <div
              title={`Página ${currentPage} de ${totalPages} (${progressPercent}%)`}
              className="hidden items-center gap-2 sm:flex"
            >
              <span className="font-mono text-[11px] tabular-nums text-muted-foreground">
                pág. {currentPage} / {totalPages}
              </span>
              <div className="h-1.5 w-16 overflow-hidden rounded-full bg-secondary">
                <div
                  className="h-full rounded-full bg-accent-brand transition-[width] duration-200"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
              <span className="w-8 font-mono text-[11px] tabular-nums text-muted-foreground">
                {progressPercent}%
              </span>
            </div>
          ) : null}

          <Button
            type="button"
            variant={isFinished ? 'secondary' : 'outline'}
            size="xs"
            disabled={saveReadingProgress.isPending || totalPages === 0}
            onClick={() =>
              saveReadingProgress.mutate({
                itemId: item.id,
                currentPage,
                pageCount: totalPages,
                markFinished: !isFinished,
              })
            }
            className={cn(
              isFinished
                ? 'border-emerald-500/35 bg-emerald-500/15 text-emerald-700 hover:bg-emerald-500/20 dark:text-emerald-300'
                : '',
            )}
          >
            <CheckCircle2 className="size-3.5" />
            <span className="hidden lg:inline">
              {isFinished ? 'Terminado' : 'Marcar terminado'}
            </span>
          </Button>

          <PomodoroWidget variant="reader" />

          <ThemeMenu variant="ghost" size="icon-xs" />

          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            aria-label="Abrir PDF en aplicación externa"
            title="Abrir en aplicación externa"
            onClick={() => void openBookExternally.mutateAsync(item)}
          >
            <ExternalLink className="size-3.5" />
          </Button>

          <Button
            type="button"
            variant={sidePanelTab === 'notes' ? 'secondary' : 'outline'}
            size="xs"
            aria-pressed={sidePanelTab === 'notes'}
            title="Notas del libro (N)"
            onClick={() =>
              setSidePanelTab((prev) => (prev === 'notes' ? null : 'notes'))
            }
            className="gap-1.5"
          >
            <NotebookPen className="size-3.5 text-accent-brand" />
            <span className="hidden sm:inline">Notas</span>
            <Badge
              variant="secondary"
              className="h-4 rounded px-1 font-mono text-[10px] tabular-nums"
            >
              {bookNotesCount}
            </Badge>
          </Button>

          <Button
            type="button"
            variant={sidePanelTab === 'highlights' ? 'secondary' : 'outline'}
            size="xs"
            aria-pressed={sidePanelTab === 'highlights'}
            title="Subrayados (H)"
            onClick={() =>
              setSidePanelTab((prev) =>
                prev === 'highlights' ? null : 'highlights',
              )
            }
            className="gap-1.5"
          >
            <Highlighter className="size-3.5 text-accent-brand" />
            <span className="hidden sm:inline">Subrayados</span>
            <Badge
              variant="secondary"
              className="h-4 rounded px-1 font-mono text-[10px] tabular-nums"
            >
              {highlights.length}
            </Badge>
          </Button>
        </div>
      </header>

      <div className="relative flex min-h-0 flex-1 overflow-hidden">
        {pdfBytesState.loading ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-4 bg-[#f1f1f4] p-8 dark:bg-[#070709]">
            <Skeleton className="h-[74vh] w-[520px] max-w-full rounded-md" />
            <p className="font-mono text-xs text-muted-foreground">
              Cargando PDF local...
            </p>
          </div>
        ) : pdfBytesState.error ? (
          <div className="flex flex-1 items-center justify-center bg-[#f1f1f4] p-6 dark:bg-[#070709]">
            <EmptyState
              icon={<BookOpen className="size-5" />}
              title="No se pudo leer el archivo PDF"
              description={pdfBytesState.error}
              actions={
                <>
                  <Button type="button" size="sm" onClick={handleClose}>
                    Volver
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => void openBookExternally.mutateAsync(item)}
                  >
                    <ExternalLink className="size-4" />
                    Abrir externo
                  </Button>
                </>
              }
            />
          </div>
        ) : pdfBytesState.bytes ? (
          <div className="relative min-w-0 flex-1 overflow-hidden">
            <PDFViewer
              src={pdfBytesState.bytes}
              locale="es"
              theme={embedPdfTheme}
              features={EMBEDPDF_FEATURES}
              plugins={EMBEDPDF_PLUGINS}
              warnBeforeLeaving={false}
              onReady={handleViewerReady}
              className="block h-full w-full"
              style={{ width: '100%', height: '100%' }}
            />

            {selectionPrompt ? (
              <div
                role="toolbar"
                aria-label="Guardar selección en Highlights"
                className="absolute bottom-5 left-1/2 z-30 flex -translate-x-1/2 items-center gap-1.5 rounded-full border border-border bg-popover/95 px-3 py-1.5 shadow-2xl backdrop-blur-md"
              >
                <span className="max-w-[160px] truncate pr-1 font-serif text-[11.5px] italic text-muted-foreground">
                  &ldquo;{selectionPrompt.quote}&rdquo;
                </span>

                <span className="hidden text-[11px] font-medium text-foreground sm:inline">
                  Guardar:
                </span>

                {HIGHLIGHT_COLORS.map((color) => (
                  <button
                    key={color}
                    type="button"
                    title={`Subrayar en ${HIGHLIGHT_COLOR_LABELS[color]}`}
                    aria-label={`Guardar subrayado en ${HIGHLIGHT_COLOR_LABELS[color]}`}
                    onClick={() =>
                      void handleQuickHighlight(
                        selectionPrompt.quote,
                        selectionPrompt.pageNumber,
                        color,
                      )
                    }
                    className="flex size-5 items-center justify-center rounded-full border border-transparent transition-transform hover:scale-110 hover:border-foreground/50 focus-visible:ring-2 focus-visible:ring-ring outline-none"
                  >
                    <span
                      aria-hidden="true"
                      className={cn(
                        'size-3 rounded-full',
                        HIGHLIGHT_DOT_CLASS[color],
                      )}
                    />
                  </button>
                ))}

                <span aria-hidden="true" className="mx-0.5 h-3.5 w-px bg-border" />

                <button
                  type="button"
                  title="Guardar subrayado con comentario"
                  onClick={() =>
                    handleHighlightWithNote(
                      selectionPrompt.quote,
                      selectionPrompt.pageNumber,
                      'amber',
                    )
                  }
                  className="inline-flex items-center gap-1 rounded-full bg-secondary px-2.5 py-0.5 text-[11px] font-medium text-foreground transition-colors hover:bg-accent-brand hover:text-primary-foreground"
                >
                  <MessageSquarePlus className="size-3" />
                  <span>+ Nota</span>
                </button>

                <button
                  type="button"
                  title="Enviar cita a una nota Markdown del libro"
                  onClick={() =>
                    handleSendSelectionToNote(
                      selectionPrompt.quote,
                      selectionPrompt.pageNumber,
                    )
                  }
                  className="inline-flex items-center gap-1 rounded-full bg-secondary px-2.5 py-0.5 text-[11px] font-medium text-foreground transition-colors hover:bg-accent-brand hover:text-primary-foreground"
                >
                  <NotebookPen className="size-3" />
                  <span>Enviar a nota</span>
                </button>

                <button
                  type="button"
                  aria-label="Descartar selección"
                  onClick={() => {
                    viewer?.tryGet('selection')?.clear();
                    setSelectionPrompt(null);
                  }}
                  className="ml-0.5 rounded-full p-0.5 text-muted-foreground transition-colors hover:text-foreground"
                >
                  <X className="size-3" />
                </button>
              </div>
            ) : null}

            {quickToast ? (
              <div
                role="status"
                aria-live="polite"
                className="absolute bottom-5 left-1/2 z-30 flex -translate-x-1/2 items-center gap-2.5 rounded-full border border-border bg-popover/95 px-4 py-1.5 text-xs text-foreground shadow-xl backdrop-blur-md"
              >
                <Highlighter className="size-3.5 text-accent-brand" />
                <span>{quickToast}</span>
                {!sidePanelTab ? (
                  <button
                    type="button"
                    onClick={() => {
                      setSidePanelTab('highlights');
                      setQuickToast(null);
                    }}
                    className="font-medium text-accent-brand hover:underline"
                  >
                    Ver panel
                  </button>
                ) : null}
              </div>
            ) : null}
          </div>
        ) : null}

        {sidePanelTab ? (
          <ReaderSidePanel
            activeTab={sidePanelTab}
            onTabChange={setSidePanelTab}
            itemId={item.id}
            itemTitle={item.title}
            itemAuthor={item.author}
            currentPage={currentPage}
            numPages={totalPages}
            highlights={highlights}
            notesCount={bookNotesCount}
            draft={composerDraft}
            onDraftChange={setComposerDraft}
            onJumpToPage={goToPage}
            pendingQuoteInsert={pendingNoteQuote}
            onConsumeQuoteInsert={() => setPendingNoteQuote(null)}
            onClose={() => setSidePanelTab(null)}
          />
        ) : null}
      </div>
    </div>
  );
}
