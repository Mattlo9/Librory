import {
  ArrowLeft,
  BookOpen,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Highlighter,
  List,
  MessageSquarePlus,
  Minus,
  NotebookPen,
  Plus,
  Type,
  X,
} from 'lucide-react';
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { EmptyState } from '@/components/ui/empty-state';
import { ScrollArea } from '@/components/ui/scroll-area';
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
} from '@/lib/highlights';
import { isSafeHttpUrl, isSafeStoredBookPath } from '@/lib/validation';
import { cn } from '@/lib/utils';
import { parseEpubBook, type ParsedEpubBook } from '@/services/epubReaderService';
import { openExternalUrl } from '@/services/fileService';
import { useUiStore } from '@/store/uiStore';
import {
  HIGHLIGHT_COLORS,
  type HighlightColor,
  type SaveReadingProgressInput,
} from '@/types/domain';

interface EpubReaderViewProps {
  itemId: string;
  initialPage?: number;
  onClose: () => void;
}

type EpubFontFamily = 'serif' | 'sans';
type EpubMaxWidth = 'narrow' | 'medium' | 'wide';
type EpubSurface = 'auto' | 'paper' | 'sepia' | 'dark';

interface EpubReaderPrefs {
  fontSize: number;
  fontFamily: EpubFontFamily;
  maxWidth: EpubMaxWidth;
  surface: EpubSurface;
}

const PREFS_STORAGE_KEY = 'librory-epub-prefs-v1';
const SCROLL_STORAGE_KEY = 'librory-epub-scroll-v1';

const DEFAULT_PREFS: EpubReaderPrefs = {
  fontSize: 18,
  fontFamily: 'serif',
  maxWidth: 'medium',
  surface: 'auto',
};

const WIDTH_CLASS: Record<EpubMaxWidth, string> = {
  narrow: 'max-w-[600px]',
  medium: 'max-w-[720px]',
  wide: 'max-w-[860px]',
};

const SURFACE_CLASS: Record<EpubSurface, string> = {
  auto: 'bg-background text-foreground',
  paper: 'bg-[#fdfdfb] text-[#18181b]',
  sepia: 'bg-[#f4ecd8] text-[#3b2e1e]',
  dark: 'bg-[#121216] text-[#ececf0]',
};

const SURFACE_LABELS: Record<EpubSurface, string> = {
  auto: 'Automático (tema)',
  paper: 'Papel claro',
  sepia: 'Sepia cálido',
  dark: 'Nocturno',
};

function loadPrefs(): EpubReaderPrefs {
  try {
    const raw = window.localStorage.getItem(PREFS_STORAGE_KEY);
    if (!raw) return DEFAULT_PREFS;
    const parsed = JSON.parse(raw) as Partial<EpubReaderPrefs>;
    if (!parsed || typeof parsed !== 'object') return DEFAULT_PREFS;
    return {
      fontSize:
        typeof parsed.fontSize === 'number' && Number.isFinite(parsed.fontSize)
          ? Math.min(24, Math.max(14, Math.round(parsed.fontSize)))
          : DEFAULT_PREFS.fontSize,
      fontFamily:
        parsed.fontFamily === 'sans' || parsed.fontFamily === 'serif'
          ? parsed.fontFamily
          : DEFAULT_PREFS.fontFamily,
      maxWidth:
        parsed.maxWidth === 'narrow' ||
        parsed.maxWidth === 'medium' ||
        parsed.maxWidth === 'wide'
          ? parsed.maxWidth
          : DEFAULT_PREFS.maxWidth,
      surface:
        parsed.surface === 'auto' ||
        parsed.surface === 'paper' ||
        parsed.surface === 'sepia' ||
        parsed.surface === 'dark'
          ? parsed.surface
          : DEFAULT_PREFS.surface,
    };
  } catch {
    return DEFAULT_PREFS;
  }
}

function savePrefs(prefs: EpubReaderPrefs): void {
  try {
    window.localStorage.setItem(PREFS_STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    // Ignorar errores de cuota de almacenamiento local.
  }
}

function loadScrollSnapshot(
  itemId: string,
): { chapterIndex: number; ratio: number } | null {
  try {
    const raw = window.localStorage.getItem(SCROLL_STORAGE_KEY);
    if (!raw) return null;
    const map = JSON.parse(raw) as Record<
      string,
      { chapterIndex?: number; ratio?: number }
    >;
    if (!map || typeof map !== 'object' || !Object.hasOwn(map, itemId)) {
      return null;
    }
    const entry = map[itemId];
    if (
      entry &&
      typeof entry.chapterIndex === 'number' &&
      Number.isFinite(entry.chapterIndex) &&
      typeof entry.ratio === 'number' &&
      Number.isFinite(entry.ratio)
    ) {
      return {
        chapterIndex: Math.max(0, Math.floor(entry.chapterIndex)),
        ratio: Math.min(1, Math.max(0, entry.ratio)),
      };
    }
    return null;
  } catch {
    return null;
  }
}

function saveScrollSnapshot(
  itemId: string,
  chapterIndex: number,
  ratio: number,
): void {
  try {
    const raw = window.localStorage.getItem(SCROLL_STORAGE_KEY);
    const map = raw
      ? (JSON.parse(raw) as Record<
          string,
          { chapterIndex: number; ratio: number }
        >)
      : {};
    map[itemId] = {
      chapterIndex,
      ratio: Math.min(1, Math.max(0, Number(ratio.toFixed(4)))),
    };
    window.localStorage.setItem(SCROLL_STORAGE_KEY, JSON.stringify(map));
  } catch {
    // Ignorar errores de almacenamiento local.
  }
}

function clampChapterIndex(index: number, totalChapters: number): number {
  if (totalChapters <= 0) return 0;
  return Math.min(totalChapters - 1, Math.max(0, Math.floor(index)));
}

export function EpubReaderView({
  itemId,
  initialPage,
  onClose,
}: EpubReaderViewProps) {
  const detailQuery = useItemDetail(itemId);
  const highlightsQuery = useItemHighlights(itemId);
  const notesQuery = useNotesList(true);
  const saveReadingProgress = useSaveReadingProgress();
  const createHighlight = useCreateHighlight();
  const openBookExternally = useOpenBookExternally();

  const item = detailQuery.data ?? null;
  const isReadableEpub = Boolean(
    item &&
      item.file_format === 'epub' &&
      isSafeStoredBookPath(item.file_path),
  );

  const bytesState = useStoredFileBytes(
    isReadableEpub && item ? item.file_path : null,
  );
  const highlights = highlightsQuery.data ?? [];
  const bookNotesCount = useMemo(
    () => (notesQuery.data ?? []).filter((n) => n.item_id === itemId).length,
    [notesQuery.data, itemId],
  );

  const [prefs, setPrefs] = useState<EpubReaderPrefs>(loadPrefs);
  const [book, setBook] = useState<ParsedEpubBook | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [chapterIndex, setChapterIndex] = useState<number>(() =>
    Math.max(
      0,
      (initialPage ?? (item && item.current_page > 0 ? item.current_page : 1)) -
        1,
    ),
  );
  const [tocOpen, setTocOpen] = useState(false);
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

  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const proseRef = useRef<HTMLElement | null>(null);
  const pendingAnchorRef = useRef<string | null>(null);
  const pendingInitialScrollRef = useRef<boolean>(true);
  const initialRestoreDoneRef = useRef<boolean>(false);
  const lastInitialPageRef = useRef<number | undefined>(initialPage);
  const saveTimerRef = useRef<number | null>(null);
  const scrollTimerRef = useRef<number | null>(null);
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
    savePrefs(prefs);
  }, [prefs]);

  useEffect(() => {
    return () => {
      if (toastTimerRef.current !== null) {
        window.clearTimeout(toastTimerRef.current);
      }
      if (scrollTimerRef.current !== null) {
        window.clearTimeout(scrollTimerRef.current);
      }
    };
  }, []);

  // Parsear archivo EPUB y liberar blob URLs al desmontar o cambiar libro.
  useEffect(() => {
    if (!bytesState.bytes) {
      setBook(null);
      setParseError(null);
      return;
    }

    let parsed: ParsedEpubBook | null = null;
    try {
      parsed = parseEpubBook(bytesState.bytes);
      setBook(parsed);
      setParseError(null);
    } catch (err) {
      setBook(null);
      setParseError(
        err instanceof Error ? err.message : 'No se pudo abrir el archivo EPUB.',
      );
    }

    return () => {
      parsed?.dispose();
    };
  }, [bytesState.bytes]);

  // Restaurar capítulo inicial una vez que el EPUB y el registro del libro están cargados.
  useEffect(() => {
    if (!book || !item || initialRestoreDoneRef.current) return;

    const targetPage =
      initialPage ?? (item.current_page > 0 ? item.current_page : 1);
    const clampedIndex = clampChapterIndex(targetPage - 1, book.chapters.length);
    setChapterIndex(clampedIndex);
    lastInitialPageRef.current = initialPage;
    initialRestoreDoneRef.current = true;
    pendingInitialScrollRef.current = initialPage === undefined;
  }, [book, item, initialPage]);

  // Permitir saltar a un capítulo si `initialPage` cambia con el lector abierto.
  useEffect(() => {
    if (
      !initialRestoreDoneRef.current ||
      !book ||
      initialPage === undefined ||
      initialPage === lastInitialPageRef.current
    ) {
      return;
    }
    lastInitialPageRef.current = initialPage;
    pendingInitialScrollRef.current = false;
    pendingAnchorRef.current = null;
    setChapterIndex(clampChapterIndex(initialPage - 1, book.chapters.length));
  }, [book, initialPage]);

  const chapterContent = useMemo(
    () => (book ? book.renderChapterHtml(chapterIndex) : null),
    [book, chapterIndex],
  );

  // Restaurar scroll o ancla tras renderizar el capítulo.
  useLayoutEffect(() => {
    const container = scrollContainerRef.current;
    if (!container || !chapterContent) return;

    const anchorId = pendingAnchorRef.current;
    if (anchorId) {
      pendingAnchorRef.current = null;
      pendingInitialScrollRef.current = false;
      const escaped =
        typeof CSS !== 'undefined' && typeof CSS.escape === 'function'
          ? CSS.escape(anchorId)
          : anchorId.replace(/"/g, '\\"');
      const targetEl = proseRef.current?.querySelector(
        `[data-epub-id="${escaped}"]`,
      );
      if (targetEl instanceof HTMLElement) {
        targetEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
        return;
      }
    }

    if (pendingInitialScrollRef.current) {
      pendingInitialScrollRef.current = false;
      const saved = loadScrollSnapshot(itemId);
      if (saved && saved.chapterIndex === chapterIndex && saved.ratio > 0) {
        const maxScroll = Math.max(
          0,
          container.scrollHeight - container.clientHeight,
        );
        container.scrollTop = Math.round(maxScroll * saved.ratio);
        return;
      }
    }

    container.scrollTop = 0;
  }, [chapterContent, chapterIndex, itemId]);

  const totalChapters = book?.chapters.length ?? item?.page_count ?? 0;
  const currentChapterNumber = chapterIndex + 1;

  // Guardar progreso de lectura en SQLite con debounce y flush al salir.
  useEffect(() => {
    if (!item || !isReadableEpub || !book || !initialRestoreDoneRef.current) {
      return;
    }
    const pageCount = book.chapters.length;
    if (pageCount <= 0) return;

    const needsImmediateSync =
      item.last_opened_at === null ||
      item.page_count !== pageCount ||
      item.status === 'inbox' ||
      item.status === 'to_read';

    const payload: SaveReadingProgressInput = {
      itemId: item.id,
      currentPage: currentChapterNumber,
      pageCount,
    };

    const persisted = persistedProgressRef.current;
    const alreadySaved =
      persisted !== null &&
      persisted.itemId === item.id &&
      persisted.page === currentChapterNumber &&
      persisted.pageCount === pageCount &&
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
        pageCount: pending.pageCount ?? pageCount,
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
  }, [item, isReadableEpub, book, currentChapterNumber]);

  // Flush final al desmontar.
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

  const navigateToChapter = useCallback(
    (nextIndex: number, anchorId: string | null = null) => {
      if (!book) return;
      const clamped = clampChapterIndex(nextIndex, book.chapters.length);
      pendingAnchorRef.current = anchorId;
      pendingInitialScrollRef.current = false;
      setSelectionPrompt(null);
      window.getSelection()?.removeAllRanges();
      setChapterIndex(clamped);
    },
    [book],
  );

  const handleJumpFromHighlight = useCallback(
    (pageNumber: number) => {
      navigateToChapter(pageNumber - 1);
    },
    [navigateToChapter],
  );

  // Atajos del lector EPUB.
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
          window.getSelection()?.removeAllRanges();
          setSelectionPrompt(null);
          return;
        }
        event.preventDefault();
        handleClose();
        return;
      }

      if (event.ctrlKey || event.metaKey || event.altKey) return;

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
        return;
      }

      if (event.key.toLowerCase() === 't') {
        event.preventDefault();
        setTocOpen((prev) => !prev);
        return;
      }

      const hasSelection =
        Boolean(window.getSelection()?.toString().trim());
      if (hasSelection) return;

      if (event.key === 'ArrowLeft' && chapterIndex > 0) {
        event.preventDefault();
        navigateToChapter(chapterIndex - 1);
      } else if (
        event.key === 'ArrowRight' &&
        totalChapters > 0 &&
        chapterIndex < totalChapters - 1
      ) {
        event.preventDefault();
        navigateToChapter(chapterIndex + 1);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    chapterIndex,
    handleClose,
    navigateToChapter,
    selectionPrompt,
    totalChapters,
  ]);

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

  function handleProseMouseUp() {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed) {
      setSelectionPrompt(null);
      return;
    }

    const proseEl = proseRef.current;
    if (
      !proseEl ||
      !selection.anchorNode ||
      !proseEl.contains(selection.anchorNode)
    ) {
      return;
    }

    const normalized = selection.toString().replace(/\s+/g, ' ').trim();
    setSelectionPrompt(
      normalized.length >= 3
        ? { quote: normalized, pageNumber: currentChapterNumber }
        : null,
    );
  }

  function handleProseClick(event: React.MouseEvent<HTMLElement>) {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const anchor = target.closest('a');
    if (!anchor) return;

    // Unconditionally prevent native WebView navigation for all links inside untrusted EPUB prose.
    event.preventDefault();

    if (anchor.dataset.epubExternal === 'true') {
      const href = anchor.getAttribute('href');
      if (href && isSafeHttpUrl(href)) {
        void openExternalUrl(href).catch(() => {});
      }
      return;
    }

    const targetPath = anchor.dataset.epubPath;
    if (targetPath && book) {
      const targetIndex = book.resolveChapterByPath(targetPath);
      if (targetIndex >= 0) {
        navigateToChapter(targetIndex, anchor.dataset.epubHash ?? null);
      }
    }
  }

  function handleReaderScroll() {
    const container = scrollContainerRef.current;
    if (!container || !book) return;
    const maxScroll = container.scrollHeight - container.clientHeight;
    const ratio = maxScroll > 0 ? container.scrollTop / maxScroll : 0;

    if (scrollTimerRef.current !== null) {
      window.clearTimeout(scrollTimerRef.current);
    }
    scrollTimerRef.current = window.setTimeout(() => {
      saveScrollSnapshot(itemId, chapterIndex, ratio);
      scrollTimerRef.current = null;
    }, 250);
  }

  async function handleQuickHighlight(
    quote: string,
    pageNumber: number,
    color: HighlightColor,
  ) {
    if (!item) return;
    setSelectionPrompt(null);
    window.getSelection()?.removeAllRanges();

    try {
      await createHighlight.mutateAsync({
        item_id: item.id,
        quote_text: quote,
        color,
        page_number: pageNumber,
        location_cfi: `chapter:${pageNumber}`,
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
    window.getSelection()?.removeAllRanges();
    setComposerDraft({
      quote_text: quote,
      color,
      page_number: pageNumber,
    });
    setSidePanelTab('highlights');
  }

  function handleSendSelectionToNote(quote: string, pageNumber: number) {
    setSelectionPrompt(null);
    window.getSelection()?.removeAllRanges();
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
          <Skeleton className="h-[74vh] w-[680px] max-w-full rounded-md" />
        </div>
      </div>
    );
  }

  if (!item || !isReadableEpub) {
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
                : 'Elemento sin archivo EPUB local'
            }
            description={
              !item
                ? 'Es posible que el elemento haya sido eliminado de tu biblioteca.'
                : 'Importa un archivo EPUB real para leerlo en el visor integrado.'
            }
            actions={
              <Button type="button" size="sm" onClick={handleClose}>
                <ArrowLeft className="size-4" />
                Volver a la biblioteca
              </Button>
            }
          />
        </div>
      </div>
    );
  }

  const progressPercent =
    totalChapters > 0
      ? Math.min(100, Math.round((currentChapterNumber / totalChapters) * 100))
      : 0;
  const isFinished = item.status === 'finished';

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-background">
      <header className="flex h-12 shrink-0 items-center justify-between gap-3 border-b border-border bg-sidebar px-3.5">
        <div className="flex min-w-0 items-center gap-2.5">
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

        <div className="flex shrink-0 items-center gap-2">
          {totalChapters > 0 ? (
            <div
              title={`Capítulo ${currentChapterNumber} de ${totalChapters} (${progressPercent}%)`}
              className="hidden items-center gap-2 md:flex"
            >
              <span className="font-mono text-[11px] tabular-nums text-muted-foreground">
                cap. {currentChapterNumber} / {totalChapters}
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
            variant={tocOpen ? 'secondary' : 'outline'}
            size="xs"
            aria-pressed={tocOpen}
            title="Índice de capítulos (T)"
            onClick={() => setTocOpen((prev) => !prev)}
            className="gap-1.5"
          >
            <List className="size-3.5" />
            <span className="hidden sm:inline">Índice</span>
          </Button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="outline"
                size="xs"
                title="Ajustes de tipografía"
                className="gap-1.5"
              >
                <Type className="size-3.5" />
                <span className="hidden lg:inline">Tipografía</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-60">
              <DropdownMenuLabel className="text-[11px] font-medium text-muted-foreground">
                Tamaño de texto
              </DropdownMenuLabel>
              <div
                onClick={(e) => e.stopPropagation()}
                className="flex items-center justify-between px-2 py-1.5"
              >
                <Button
                  type="button"
                  variant="outline"
                  size="icon-xs"
                  aria-label="Reducir tamaño de texto"
                  disabled={prefs.fontSize <= 14}
                  onClick={() =>
                    setPrefs((p) => ({
                      ...p,
                      fontSize: Math.max(14, p.fontSize - 1),
                    }))
                  }
                >
                  <Minus className="size-3" />
                </Button>
                <span className="font-mono text-xs tabular-nums text-foreground">
                  {prefs.fontSize} px
                </span>
                <Button
                  type="button"
                  variant="outline"
                  size="icon-xs"
                  aria-label="Aumentar tamaño de texto"
                  disabled={prefs.fontSize >= 24}
                  onClick={() =>
                    setPrefs((p) => ({
                      ...p,
                      fontSize: Math.min(24, p.fontSize + 1),
                    }))
                  }
                >
                  <Plus className="size-3" />
                </Button>
              </div>

              <DropdownMenuSeparator />
              <DropdownMenuLabel className="text-[11px] font-medium text-muted-foreground">
                Fuente
              </DropdownMenuLabel>
              <DropdownMenuRadioGroup
                value={prefs.fontFamily}
                onValueChange={(value) =>
                  setPrefs((p) => ({
                    ...p,
                    fontFamily: value as EpubFontFamily,
                  }))
                }
              >
                <DropdownMenuRadioItem value="serif" className="text-xs">
                  Editorial (Newsreader)
                </DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="sans" className="text-xs">
                  Moderna (Geist Sans)
                </DropdownMenuRadioItem>
              </DropdownMenuRadioGroup>

              <DropdownMenuSeparator />
              <DropdownMenuLabel className="text-[11px] font-medium text-muted-foreground">
                Ancho de columna
              </DropdownMenuLabel>
              <DropdownMenuRadioGroup
                value={prefs.maxWidth}
                onValueChange={(value) =>
                  setPrefs((p) => ({
                    ...p,
                    maxWidth: value as EpubMaxWidth,
                  }))
                }
              >
                <DropdownMenuRadioItem value="narrow" className="text-xs">
                  Estrecho (600px)
                </DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="medium" className="text-xs">
                  Medio (720px)
                </DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="wide" className="text-xs">
                  Ancho (860px)
                </DropdownMenuRadioItem>
              </DropdownMenuRadioGroup>

              <DropdownMenuSeparator />
              <DropdownMenuLabel className="text-[11px] font-medium text-muted-foreground">
                Fondo de lectura
              </DropdownMenuLabel>
              <DropdownMenuRadioGroup
                value={prefs.surface}
                onValueChange={(value) =>
                  setPrefs((p) => ({
                    ...p,
                    surface: value as EpubSurface,
                  }))
                }
              >
                {(['auto', 'paper', 'sepia', 'dark'] as const).map((mode) => (
                  <DropdownMenuRadioItem
                    key={mode}
                    value={mode}
                    className="text-xs"
                  >
                    {SURFACE_LABELS[mode]}
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>

          <Button
            type="button"
            variant={isFinished ? 'secondary' : 'outline'}
            size="xs"
            disabled={saveReadingProgress.isPending || totalChapters === 0}
            onClick={() =>
              saveReadingProgress.mutate({
                itemId: item.id,
                currentPage: currentChapterNumber,
                pageCount: totalChapters,
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
            aria-label="Abrir EPUB en aplicación externa"
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
        {tocOpen && book ? (
          <aside
            aria-label="Índice de capítulos"
            className="flex h-full w-72 shrink-0 flex-col border-r border-border bg-sidebar"
          >
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <span className="text-xs font-semibold tracking-tight text-foreground">
                Índice ({book.chapters.length} caps.)
              </span>
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                aria-label="Cerrar índice"
                onClick={() => setTocOpen(false)}
              >
                <X className="size-3.5" />
              </Button>
            </div>
            <ScrollArea className="min-h-0 flex-1">
              <ul className="space-y-0.5 p-2">
                {book.toc.map((entry) => {
                  const isActive = entry.chapterIndex === chapterIndex;
                  return (
                    <li key={entry.id}>
                      <button
                        type="button"
                        onClick={() =>
                          navigateToChapter(entry.chapterIndex, entry.anchorId)
                        }
                        style={{
                          paddingLeft: `${10 + Math.min(3, entry.depth) * 14}px`,
                        }}
                        className={cn(
                          'w-full truncate rounded-md py-1.5 pr-2.5 text-left text-xs transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring',
                          isActive
                            ? 'bg-sidebar-accent font-medium text-accent-brand'
                            : 'text-sidebar-foreground hover:bg-sidebar-accent/60 hover:text-foreground',
                        )}
                      >
                        {entry.label}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </ScrollArea>
          </aside>
        ) : null}

        {bytesState.loading ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-4 bg-background p-8">
            <Skeleton className="h-[72vh] w-[680px] max-w-full rounded-md" />
            <p className="font-mono text-xs text-muted-foreground">
              Cargando EPUB local...
            </p>
          </div>
        ) : bytesState.error || parseError ? (
          <div className="flex flex-1 items-center justify-center bg-background p-6">
            <EmptyState
              icon={<BookOpen className="size-5" />}
              title="No se pudo leer el archivo EPUB"
              description={
                bytesState.error ??
                parseError ??
                'Error inesperado al abrir el archivo EPUB.'
              }
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
        ) : book && chapterContent ? (
          <div className="relative flex min-w-0 flex-1 flex-col overflow-hidden">
            <div
              ref={scrollContainerRef}
              onScroll={handleReaderScroll}
              className={cn(
                'scrollbar-subtle min-h-0 flex-1 overflow-y-auto transition-colors duration-200',
                SURFACE_CLASS[prefs.surface],
              )}
            >
              <div
                className={cn(
                  'mx-auto w-full px-6 py-10 sm:px-10',
                  WIDTH_CLASS[prefs.maxWidth],
                )}
              >
                <div className="mb-6 flex items-center justify-between border-b border-current/10 pb-3 text-[11px] opacity-60">
                  <span className="truncate font-medium">
                    {chapterContent.title}
                  </span>
                  <span className="shrink-0 font-mono tabular-nums">
                    Capítulo {currentChapterNumber} de {book.chapters.length}
                  </span>
                </div>

                <article
                  ref={proseRef}
                  onMouseUp={handleProseMouseUp}
                  onClick={handleProseClick}
                  className={cn(
                    'epub-prose [contain:layout_style_paint] selection:bg-accent-brand/25',
                    prefs.fontFamily === 'serif' ? 'font-serif' : 'font-sans',
                  )}
                  style={{ fontSize: `${prefs.fontSize}px` }}
                  // HTML reconstruido con lista blanca estricta en epubReaderService.ts.
                  dangerouslySetInnerHTML={{ __html: chapterContent.html }}
                />

                <footer className="mt-14 flex items-center justify-between border-t border-current/15 pt-6">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={chapterIndex <= 0}
                    onClick={() => navigateToChapter(chapterIndex - 1)}
                    className="gap-1.5"
                  >
                    <ChevronLeft className="size-4" />
                    <span>Capítulo anterior</span>
                  </Button>

                  <span className="font-mono text-xs tabular-nums opacity-65">
                    cap. {currentChapterNumber} / {book.chapters.length}
                  </span>

                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={chapterIndex >= book.chapters.length - 1}
                    onClick={() => navigateToChapter(chapterIndex + 1)}
                    className="gap-1.5"
                  >
                    <span>Siguiente capítulo</span>
                    <ChevronRight className="size-4" />
                  </Button>
                </footer>
              </div>
            </div>

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
                    className="flex size-5 items-center justify-center rounded-full border border-transparent outline-none transition-transform hover:scale-110 hover:border-foreground/50 focus-visible:ring-2 focus-visible:ring-ring"
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
                    window.getSelection()?.removeAllRanges();
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
            currentPage={currentChapterNumber}
            numPages={totalChapters}
            unitLabel="cap."
            highlights={highlights}
            notesCount={bookNotesCount}
            draft={composerDraft}
            onDraftChange={setComposerDraft}
            onJumpToPage={handleJumpFromHighlight}
            pendingQuoteInsert={pendingNoteQuote}
            onConsumeQuoteInsert={() => setPendingNoteQuote(null)}
            onClose={() => setSidePanelTab(null)}
          />
        ) : null}
      </div>
    </div>
  );
}
