import {
  Bold,
  BookOpen,
  CheckSquare,
  Code,
  Columns2,
  Copy,
  Download,
  Eye,
  FileDown,
  Folder,
  FolderOutput,
  Hash,
  Heading1,
  Heading2,
  Highlighter,
  Italic,
  Link2,
  List,
  NotebookPen,
  Pencil,
  Pin,
  Plus,
  Quote,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import {
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { EmptyState } from '@/components/ui/empty-state';
import { Input } from '@/components/ui/input';
import { MarkdownPreview } from '@/components/ui/markdown-preview';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Skeleton } from '@/components/ui/skeleton';
import { useItemHighlights } from '@/features/library/hooks/useLibraryData';
import {
  useCreateNote,
  useDeleteNote,
  useNotesList,
  useSearchNotesFts,
  useUpdateNote,
} from '@/features/notes/hooks/useNotes';
import {
  buildObsidianMarkdown,
  exportNotesVaultToFolder,
  exportSingleNoteToFile,
  formatHighlightAsMarkdown,
} from '@/features/notes/lib/obsidianExport';
import { usePomodoroBookOptions } from '@/features/stats/hooks/useStudyStats';
import { cn } from '@/lib/utils';
import { normalizeNoteTags } from '@/services/noteRepository';
import type { NoteWithItem, UpdateNoteInput } from '@/types/domain';

interface NotesViewProps {
  onOpenItem: (itemId: string) => void;
  onOpenReader: (itemId: string) => void;
}

type EditorViewMode = 'edit' | 'split' | 'preview';
type SaveStatus = 'saved' | 'pending' | 'saving';

interface NoteDraft {
  id: string;
  title: string;
  content: string;
  folder: string;
  tags: string[];
  itemId: string | null;
}

const SHORT_DATE_FMT = new Intl.DateTimeFormat('es', {
  day: 'numeric',
  month: 'short',
});

function formatShortDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return SHORT_DATE_FMT.format(date).replace(/\.$/, '');
}

function buildSnippet(content: string): string {
  const clean = content
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/[#>*`~\[\]]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return clean || 'Nota vacía';
}

function extractWikilinkTargets(content: string): string[] {
  const targets: string[] = [];
  const regex = /\[\[([^\]\n]+)\]\]/g;
  for (const match of content.matchAll(regex)) {
    const inner = match[1] ?? '';
    const pipeIdx = inner.indexOf('|');
    const target = (pipeIdx >= 0 ? inner.slice(0, pipeIdx) : inner).trim();
    if (target) {
      targets.push(target.toLowerCase());
    }
  }
  return targets;
}

/**
 * Obsidian-style Markdown notes workspace with FTS5 search, wikilinks, highlight insertion,
 * and single-note / full-vault `.md` export with YAML frontmatter.
 */
export function NotesView({ onOpenItem, onOpenReader }: NotesViewProps) {
  const notesQuery = useNotesList(true);
  const bookOptionsQuery = usePomodoroBookOptions(true);
  const createNoteMutation = useCreateNote();
  const updateNoteMutation = useUpdateNote();
  const deleteNoteMutation = useDeleteNote();

  const [searchQuery, setSearchQuery] = useState('');
  const deferredSearch = useDeferredValue(searchQuery);
  const isSearching = deferredSearch.trim().length > 0;
  const searchNotesQuery = useSearchNotesFts(deferredSearch, isSearching);

  const [folderFilter, setFolderFilter] = useState<string>('all');
  const [bookFilterId, setBookFilterId] = useState<string>('all');
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<EditorViewMode>('split');
  const [draft, setDraft] = useState<NoteDraft | null>(null);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('saved');
  const [tagInput, setTagInput] = useState('');
  const [highlightsPopoverOpen, setHighlightsPopoverOpen] = useState(false);
  const [notePendingDelete, setNotePendingDelete] =
    useState<NoteWithItem | null>(null);
  const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null);

  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const dirtyRef = useRef<{ id: string; patch: UpdateNoteInput } | null>(null);
  const autosaveTimerRef = useRef<number | null>(null);
  const feedbackTimerRef = useRef<number | null>(null);
  const updateMutateAsyncRef = useRef(updateNoteMutation.mutateAsync);

  useEffect(() => {
    updateMutateAsyncRef.current = updateNoteMutation.mutateAsync;
  }, [updateNoteMutation.mutateAsync]);

  const showFeedback = useCallback((message: string) => {
    setFeedbackMessage(message);
    if (feedbackTimerRef.current !== null) {
      window.clearTimeout(feedbackTimerRef.current);
    }
    feedbackTimerRef.current = window.setTimeout(() => {
      setFeedbackMessage(null);
      feedbackTimerRef.current = null;
    }, 4000);
  }, []);

  const flushPendingSave = useCallback(async () => {
    if (autosaveTimerRef.current !== null) {
      window.clearTimeout(autosaveTimerRef.current);
      autosaveTimerRef.current = null;
    }
    const pending = dirtyRef.current;
    if (!pending) return;

    dirtyRef.current = null;
    setSaveStatus('saving');
    try {
      await updateMutateAsyncRef.current({
        id: pending.id,
        patch: pending.patch,
      });
      setSaveStatus((prev) => (prev === 'saving' ? 'saved' : prev));
    } catch (error) {
      console.error('Error guardando nota:', error);
      setSaveStatus('pending');
    }
  }, []);

  useEffect(() => {
    return () => {
      if (feedbackTimerRef.current !== null) {
        window.clearTimeout(feedbackTimerRef.current);
      }
      if (autosaveTimerRef.current !== null) {
        window.clearTimeout(autosaveTimerRef.current);
      }
      const pending = dirtyRef.current;
      if (pending) {
        dirtyRef.current = null;
        void updateMutateAsyncRef.current({
          id: pending.id,
          patch: pending.patch,
        });
      }
    };
  }, []);

  const allNotes = notesQuery.data ?? [];
  const bookOptions = bookOptionsQuery.data ?? [];

  const uniqueFolders = useMemo(() => {
    const folderSet = new Set<string>();
    for (const note of allNotes) {
      const f = note.folder.trim();
      if (f) folderSet.add(f);
    }
    return Array.from(folderSet).sort((a, b) => a.localeCompare(b, 'es'));
  }, [allNotes]);

  const titleLookup = useMemo(() => {
    const map = new Map<string, NoteWithItem>();
    const titles = new Set<string>();
    for (const note of allNotes) {
      const key = note.title.trim().toLowerCase();
      if (key) {
        titles.add(key);
        if (!map.has(key)) {
          map.set(key, note);
        }
      }
    }
    return { map, titles };
  }, [allNotes]);

  const sourcePool = useMemo(() => {
    if (isSearching) {
      return searchNotesQuery.data ?? [];
    }
    return allNotes;
  }, [isSearching, searchNotesQuery.data, allNotes]);

  const filteredNotes = useMemo(() => {
    return sourcePool.filter((note) => {
      if (folderFilter === '__root__' && note.folder.trim() !== '') {
        return false;
      }
      if (
        folderFilter !== 'all' &&
        folderFilter !== '__root__' &&
        note.folder.trim() !== folderFilter
      ) {
        return false;
      }
      if (bookFilterId === '__none__' && note.item_id !== null) {
        return false;
      }
      if (
        bookFilterId !== 'all' &&
        bookFilterId !== '__none__' &&
        note.item_id !== bookFilterId
      ) {
        return false;
      }
      return true;
    });
  }, [sourcePool, folderFilter, bookFilterId]);

  useEffect(() => {
    if (allNotes.length === 0) {
      if (selectedNoteId !== null) setSelectedNoteId(null);
      return;
    }
    if (selectedNoteId && allNotes.some((n) => n.id === selectedNoteId)) {
      return;
    }
    const first = filteredNotes[0] ?? allNotes[0];
    if (first) {
      setSelectedNoteId(first.id);
    }
  }, [allNotes, filteredNotes, selectedNoteId]);

  const selectedNote = useMemo(
    () => allNotes.find((n) => n.id === selectedNoteId) ?? null,
    [allNotes, selectedNoteId],
  );

  // Sync local draft only when switching to a different note ID so typing isn't clobbered.
  useEffect(() => {
    if (!selectedNote) {
      setDraft(null);
      return;
    }
    setDraft((prev) => {
      if (prev && prev.id === selectedNote.id) {
        return prev;
      }
      setTagInput('');
      setSaveStatus('saved');
      return {
        id: selectedNote.id,
        title: selectedNote.title,
        content: selectedNote.content,
        folder: selectedNote.folder,
        tags: selectedNote.tags,
        itemId: selectedNote.item_id,
      };
    });
  }, [selectedNote]);

  const activeItemId = draft?.itemId ?? selectedNote?.item_id ?? null;
  const linkedHighlightsQuery = useItemHighlights(activeItemId);
  const linkedHighlights = linkedHighlightsQuery.data ?? [];

  const backlinks = useMemo(() => {
    const activeTitle = (draft?.title ?? selectedNote?.title ?? '')
      .trim()
      .toLowerCase();
    if (!activeTitle || !selectedNote) return [];

    return allNotes.filter((other) => {
      if (other.id === selectedNote.id) return false;
      const targets = extractWikilinkTargets(other.content);
      return targets.includes(activeTitle);
    });
  }, [allNotes, draft?.title, selectedNote]);

  const selectNote = useCallback(
    (nextId: string) => {
      if (nextId === selectedNoteId) return;
      void flushPendingSave();
      setSelectedNoteId(nextId);
    },
    [selectedNoteId, flushPendingSave],
  );

  const scheduleDraftPatch = useCallback(
    (patch: Partial<Omit<NoteDraft, 'id'>>) => {
      setDraft((prev) => {
        if (!prev) return prev;
        const next: NoteDraft = { ...prev, ...patch };
        const noteId = prev.id;
        const repoPatch: UpdateNoteInput = {
          ...(patch.title !== undefined ? { title: patch.title } : {}),
          ...(patch.content !== undefined ? { content: patch.content } : {}),
          ...(patch.folder !== undefined ? { folder: patch.folder } : {}),
          ...(patch.tags !== undefined ? { tags: patch.tags } : {}),
          ...(patch.itemId !== undefined ? { item_id: patch.itemId } : {}),
        };

        const existingDirty =
          dirtyRef.current && dirtyRef.current.id === noteId
            ? dirtyRef.current.patch
            : {};
        dirtyRef.current = {
          id: noteId,
          patch: { ...existingDirty, ...repoPatch },
        };
        setSaveStatus('pending');

        if (autosaveTimerRef.current !== null) {
          window.clearTimeout(autosaveTimerRef.current);
        }
        autosaveTimerRef.current = window.setTimeout(() => {
          void flushPendingSave();
        }, 600);

        return next;
      });
    },
    [flushPendingSave],
  );

  const handleCreateNote = useCallback(
    async (prefillTitle?: string) => {
      await flushPendingSave();
      const defaultFolder =
        folderFilter !== 'all' && folderFilter !== '__root__'
          ? folderFilter
          : '';
      const defaultItemId =
        bookFilterId !== 'all' && bookFilterId !== '__none__'
          ? bookFilterId
          : null;

      const created = await createNoteMutation.mutateAsync({
        title: prefillTitle?.trim() || 'Nueva nota',
        content: prefillTitle?.trim() ? `# ${prefillTitle.trim()}\n\n` : '',
        folder: defaultFolder,
        item_id: defaultItemId,
      });

      setSelectedNoteId(created.id);
      if (viewMode === 'preview') {
        setViewMode('split');
      }
      window.setTimeout(() => {
        textareaRef.current?.focus();
      }, 30);
    },
    [
      flushPendingSave,
      folderFilter,
      bookFilterId,
      createNoteMutation,
      viewMode,
    ],
  );

  const handleWikilinkClick = useCallback(
    async (target: string) => {
      const match = titleLookup.map.get(target.trim().toLowerCase());
      if (match) {
        selectNote(match.id);
        return;
      }
      await handleCreateNote(target);
      showFeedback(`Nota creada: [[${target}]]`);
    },
    [titleLookup.map, selectNote, handleCreateNote, showFeedback],
  );

  const handleToggleChecklist = useCallback(
    (lineIndex: number, checked: boolean) => {
      if (!draft) return;
      const lines = draft.content.split(/\r?\n/);
      const targetLine = lines[lineIndex];
      if (targetLine === undefined) return;

      const updatedLine = targetLine.replace(
        /^(\s*[-*]\s+\[)[ xX](\])/,
        `$1${checked ? 'x' : ' '}$2`,
      );
      if (updatedLine === targetLine) return;

      lines[lineIndex] = updatedLine;
      scheduleDraftPatch({ content: lines.join('\n') });
    },
    [draft, scheduleDraftPatch],
  );

  const insertTextAtCursor = useCallback(
    (snippet: string, wrapSelection?: { before: string; after: string }) => {
      if (!draft) return;
      const textarea = textareaRef.current;

      if (!textarea) {
        const prefix =
          draft.content && !draft.content.endsWith('\n') ? '\n\n' : '';
        scheduleDraftPatch({ content: `${draft.content}${prefix}${snippet}` });
        return;
      }

      const start = textarea.selectionStart ?? draft.content.length;
      const end = textarea.selectionEnd ?? draft.content.length;
      const selected = draft.content.slice(start, end);

      let nextContent: string;
      let nextCursorStart: number;
      let nextCursorEnd: number;

      if (wrapSelection) {
        const inner = selected || snippet;
        nextContent =
          draft.content.slice(0, start) +
          wrapSelection.before +
          inner +
          wrapSelection.after +
          draft.content.slice(end);
        nextCursorStart = start + wrapSelection.before.length;
        nextCursorEnd = nextCursorStart + inner.length;
      } else {
        nextContent =
          draft.content.slice(0, start) + snippet + draft.content.slice(end);
        nextCursorStart = start + snippet.length;
        nextCursorEnd = nextCursorStart;
      }

      scheduleDraftPatch({ content: nextContent });

      window.requestAnimationFrame(() => {
        if (!textareaRef.current) return;
        textareaRef.current.focus();
        textareaRef.current.setSelectionRange(nextCursorStart, nextCursorEnd);
      });
    },
    [draft, scheduleDraftPatch],
  );

  const buildMergedNote = useCallback((): NoteWithItem | null => {
    if (!selectedNote || !draft || draft.id !== selectedNote.id) {
      return selectedNote;
    }
    const matchedBook = draft.itemId
      ? bookOptions.find((b) => b.id === draft.itemId)
      : null;

    return {
      ...selectedNote,
      title: draft.title.trim() || 'Nota sin título',
      content: draft.content,
      folder: draft.folder.trim(),
      tags: draft.tags,
      item_id: draft.itemId,
      item_title:
        draft.itemId === selectedNote.item_id
          ? selectedNote.item_title
          : (matchedBook?.title ?? null),
      item_author:
        draft.itemId === selectedNote.item_id
          ? selectedNote.item_author
          : (matchedBook?.author ?? null),
    };
  }, [selectedNote, draft, bookOptions]);

  const handleExportSingle = useCallback(async () => {
    await flushPendingSave();
    const noteToExport = buildMergedNote();
    if (!noteToExport) return;
    try {
      const path = await exportSingleNoteToFile(noteToExport);
      if (path) {
        showFeedback('Nota exportada en formato Markdown.');
      }
    } catch (error) {
      showFeedback(
        error instanceof Error ? error.message : 'No se pudo exportar la nota.',
      );
    }
  }, [flushPendingSave, buildMergedNote, showFeedback]);

  const handleCopyMarkdown = useCallback(async () => {
    const noteToCopy = buildMergedNote();
    if (!noteToCopy) return;
    try {
      await navigator.clipboard.writeText(buildObsidianMarkdown(noteToCopy));
      showFeedback('Markdown con frontmatter copiado al portapapeles.');
    } catch {
      showFeedback('No se pudo copiar al portapapeles.');
    }
  }, [buildMergedNote, showFeedback]);

  const handleExportVault = useCallback(async () => {
    await flushPendingSave();
    const notesSnapshot = notesQuery.data ?? [];
    if (notesSnapshot.length === 0) {
      showFeedback('No hay notas para exportar.');
      return;
    }
    try {
      const report = await exportNotesVaultToFolder(notesSnapshot);
      if (report) {
        showFeedback(
          `Bóveda exportada: ${report.exportedCount} ${report.exportedCount === 1 ? 'nota' : 'notas'} en ${report.rootDir}`,
        );
      }
    } catch (error) {
      showFeedback(
        error instanceof Error
          ? error.message
          : 'No se pudo exportar la bóveda.',
      );
    }
  }, [flushPendingSave, notesQuery.data, showFeedback]);

  const handleAddTag = useCallback(
    (rawValue: string) => {
      if (!draft) return;
      const parts = rawValue
        .split(',')
        .map((p) => p.trim())
        .filter(Boolean);
      if (parts.length === 0) return;

      const merged = normalizeNoteTags([...draft.tags, ...parts]);
      scheduleDraftPatch({ tags: merged });
      setTagInput('');
    },
    [draft, scheduleDraftPatch],
  );

  const handleRemoveTag = useCallback(
    (tagToRemove: string) => {
      if (!draft) return;
      scheduleDraftPatch({
        tags: draft.tags.filter((t) => t !== tagToRemove),
      });
    },
    [draft, scheduleDraftPatch],
  );

  if (notesQuery.isLoading) {
    return (
      <div className="flex h-full min-h-0 flex-1 overflow-hidden">
        <div className="w-72 shrink-0 border-r border-border p-4 space-y-3">
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-8 w-full" />
          {Array.from({ length: 5 }, (_, idx) => (
            <Skeleton key={idx} className="h-16 w-full rounded-lg" />
          ))}
        </div>
        <div className="flex-1 p-6 space-y-4">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-64 w-full rounded-lg" />
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-1 overflow-hidden">
      {/* Left sidebar: search, filters, note list */}
      <aside className="flex w-72 shrink-0 flex-col border-r border-border bg-sidebar/30">
        <div className="space-y-2.5 border-b border-border p-3.5">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold tracking-tight text-foreground">
                Notas
              </span>
              <Badge
                variant="secondary"
                className="h-5 rounded-md px-1.5 font-mono text-[10.5px] font-normal tabular-nums text-muted-foreground"
              >
                {allNotes.length}
              </Badge>
            </div>

            <div className="flex items-center gap-1">
              <Button
                type="button"
                variant="outline"
                size="icon-xs"
                title="Exportar todas las notas como bóveda Obsidian"
                aria-label="Exportar bóveda Obsidian"
                disabled={allNotes.length === 0}
                onClick={() => void handleExportVault()}
              >
                <FolderOutput className="size-3.5" />
              </Button>
              <Button
                type="button"
                size="xs"
                disabled={createNoteMutation.isPending}
                onClick={() => void handleCreateNote()}
                className="gap-1"
              >
                <Plus className="size-3.5" />
                <span>Nueva</span>
              </Button>
            </div>
          </div>

          {/* Search FTS5 */}
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Buscar en notas..."
              aria-label="Buscar en notas"
              className="h-8 pr-7 pl-8 text-xs"
            />
            {searchQuery ? (
              <button
                type="button"
                aria-label="Limpiar búsqueda"
                onClick={() => setSearchQuery('')}
                className="absolute top-1/2 right-2 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:text-foreground"
              >
                <X className="size-3" />
              </button>
            ) : null}
          </div>

          {/* Folder pills */}
          {uniqueFolders.length > 0 ? (
            <div className="scrollbar-subtle flex items-center gap-1 overflow-x-auto pb-0.5">
              <button
                type="button"
                onClick={() => setFolderFilter('all')}
                className={cn(
                  'shrink-0 rounded-md px-2 py-0.5 text-[11px] transition-colors',
                  folderFilter === 'all'
                    ? 'bg-accent-brand/15 font-medium text-accent-brand'
                    : 'text-muted-foreground hover:bg-secondary hover:text-foreground',
                )}
              >
                Todas
              </button>
              <button
                type="button"
                onClick={() => setFolderFilter('__root__')}
                className={cn(
                  'shrink-0 rounded-md px-2 py-0.5 text-[11px] transition-colors',
                  folderFilter === '__root__'
                    ? 'bg-accent-brand/15 font-medium text-accent-brand'
                    : 'text-muted-foreground hover:bg-secondary hover:text-foreground',
                )}
              >
                Raíz
              </button>
              {uniqueFolders.map((folder) => (
                <button
                  key={folder}
                  type="button"
                  onClick={() => setFolderFilter(folder)}
                  className={cn(
                    'shrink-0 rounded-md px-2 py-0.5 text-[11px] transition-colors',
                    folderFilter === folder
                      ? 'bg-accent-brand/15 font-medium text-accent-brand'
                      : 'text-muted-foreground hover:bg-secondary hover:text-foreground',
                  )}
                >
                  {folder}
                </button>
              ))}
            </div>
          ) : null}

          {/* Book filter */}
          <select
            aria-label="Filtrar notas por libro"
            value={bookFilterId}
            onChange={(e) => setBookFilterId(e.target.value)}
            className="h-7 w-full truncate rounded-md border border-input bg-background px-2 text-[11px] text-foreground outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40"
          >
            <option value="all">Todos los libros</option>
            <option value="__none__">Solo notas libres</option>
            {bookOptions.map((book) => (
              <option key={book.id} value={book.id}>
                {book.title}
              </option>
            ))}
          </select>
        </div>

        {/* Notes list */}
        <div className="scrollbar-subtle flex-1 space-y-1 overflow-y-auto p-2">
          {filteredNotes.length === 0 ? (
            <div className="px-3 py-10 text-center text-xs text-muted-foreground">
              {allNotes.length === 0
                ? 'Crea tu primera nota en Markdown.'
                : 'No hay notas que coincidan con el filtro.'}
            </div>
          ) : (
            filteredNotes.map((note) => {
              const isSelected = note.id === selectedNoteId;
              const displayTitle =
                isSelected && draft ? draft.title || 'Nota sin título' : note.title;
              const displayContent =
                isSelected && draft ? draft.content : note.content;
              const displayFolder =
                isSelected && draft ? draft.folder : note.folder;

              return (
                <button
                  key={note.id}
                  type="button"
                  onClick={() => selectNote(note.id)}
                  className={cn(
                    'w-full rounded-lg border px-3 py-2.5 text-left outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring',
                    isSelected
                      ? 'border-accent-brand/40 bg-accent-brand/10'
                      : 'border-transparent hover:bg-secondary/60',
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="truncate text-xs font-semibold text-foreground">
                      {displayTitle}
                    </p>
                    <div className="flex shrink-0 items-center gap-1">
                      {note.is_pinned === 1 ? (
                        <Pin className="size-3 text-accent-brand" />
                      ) : null}
                      <span className="font-mono text-[10px] text-muted-foreground">
                        {formatShortDate(note.updated_at)}
                      </span>
                    </div>
                  </div>

                  <p className="mt-1 line-clamp-1 text-[11px] text-muted-foreground">
                    {buildSnippet(displayContent)}
                  </p>

                  {displayFolder || note.item_title ? (
                    <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                      {displayFolder ? (
                        <span className="inline-flex max-w-[120px] items-center gap-1 truncate rounded bg-secondary px-1.5 py-0.5 text-[10px] text-muted-foreground">
                          <Folder className="size-2.5 shrink-0" />
                          <span className="truncate">{displayFolder}</span>
                        </span>
                      ) : null}
                      {note.item_title ? (
                        <span className="inline-flex max-w-[130px] items-center gap-1 truncate rounded bg-secondary px-1.5 py-0.5 text-[10px] text-muted-foreground">
                          <BookOpen className="size-2.5 shrink-0" />
                          <span className="truncate">{note.item_title}</span>
                        </span>
                      ) : null}
                    </div>
                  ) : null}
                </button>
              );
            })
          )}
        </div>
      </aside>

      {/* Right workspace: editor + preview */}
      <div className="relative flex min-w-0 flex-1 flex-col overflow-hidden bg-background">
        {!selectedNote || !draft ? (
          <div className="flex flex-1 items-center justify-center p-8">
            <EmptyState
              icon={<NotebookPen className="size-5" />}
              title="Tu espacio de notas Markdown"
              description="Redacta apuntes con [[wikilinks]], checklists, etiquetas y citas de tus libros, y expórtalos cuando quieras en formato compatible con Obsidian."
              actions={
                <Button
                  type="button"
                  size="sm"
                  disabled={createNoteMutation.isPending}
                  onClick={() => void handleCreateNote()}
                >
                  <Plus className="size-4" />
                  Crear primera nota
                </Button>
              }
            />
          </div>
        ) : (
          <>
            {/* Top actions bar */}
            <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-2">
              <div className="flex items-center gap-3">
                <div
                  role="tablist"
                  aria-label="Modo del editor"
                  className="inline-flex items-center gap-0.5 rounded-lg border border-border/60 bg-secondary/50 p-0.5"
                >
                  <button
                    type="button"
                    role="tab"
                    aria-selected={viewMode === 'edit'}
                    onClick={() => setViewMode('edit')}
                    className={cn(
                      'inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium transition-colors',
                      viewMode === 'edit'
                        ? 'bg-background text-foreground shadow-xs'
                        : 'text-muted-foreground hover:text-foreground',
                    )}
                  >
                    <Pencil className="size-3" />
                    <span>Editar</span>
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={viewMode === 'split'}
                    onClick={() => setViewMode('split')}
                    className={cn(
                      'inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium transition-colors',
                      viewMode === 'split'
                        ? 'bg-background text-foreground shadow-xs'
                        : 'text-muted-foreground hover:text-foreground',
                    )}
                  >
                    <Columns2 className="size-3" />
                    <span>Dividido</span>
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={viewMode === 'preview'}
                    onClick={() => setViewMode('preview')}
                    className={cn(
                      'inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium transition-colors',
                      viewMode === 'preview'
                        ? 'bg-background text-foreground shadow-xs'
                        : 'text-muted-foreground hover:text-foreground',
                    )}
                  >
                    <Eye className="size-3" />
                    <span>Vista previa</span>
                  </button>
                </div>

                <span className="font-mono text-[11px] text-muted-foreground">
                  {saveStatus === 'saving'
                    ? 'Guardando...'
                    : saveStatus === 'pending'
                      ? 'Sin guardar'
                      : 'Guardado'}
                </span>
              </div>

              <div className="flex items-center gap-1.5">
                <Button
                  type="button"
                  variant={selectedNote.is_pinned === 1 ? 'secondary' : 'ghost'}
                  size="icon-xs"
                  title={
                    selectedNote.is_pinned === 1
                      ? 'Desfijar nota'
                      : 'Fijar nota arriba'
                  }
                  aria-label="Fijar nota"
                  onClick={() =>
                    void updateNoteMutation.mutateAsync({
                      id: selectedNote.id,
                      patch: { is_pinned: selectedNote.is_pinned !== 1 },
                    })
                  }
                >
                  <Pin
                    className={cn(
                      'size-3.5',
                      selectedNote.is_pinned === 1 && 'text-accent-brand',
                    )}
                  />
                </Button>

                {draft.itemId ? (
                  <Popover
                    open={highlightsPopoverOpen}
                    onOpenChange={setHighlightsPopoverOpen}
                  >
                    <PopoverTrigger asChild>
                      <Button
                        type="button"
                        variant="outline"
                        size="xs"
                        className="gap-1.5"
                      >
                        <Highlighter className="size-3.5 text-amber-500" />
                        <span className="hidden sm:inline">
                          Insertar subrayados
                        </span>
                        <Badge
                          variant="secondary"
                          className="h-4 rounded px-1 font-mono text-[10px] tabular-nums"
                        >
                          {linkedHighlights.length}
                        </Badge>
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent align="end" className="w-80 space-y-2.5 p-3">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-semibold text-foreground">
                          Subrayados del libro
                        </span>
                        {linkedHighlights.length > 0 ? (
                          <Button
                            type="button"
                            variant="secondary"
                            size="xs"
                            onClick={() => {
                              const block = linkedHighlights
                                .map(formatHighlightAsMarkdown)
                                .join('\n\n');
                              insertTextAtCursor(`\n${block}\n`);
                              setHighlightsPopoverOpen(false);
                            }}
                          >
                            Insertar todos
                          </Button>
                        ) : null}
                      </div>

                      {linkedHighlights.length === 0 ? (
                        <p className="py-4 text-center text-xs text-muted-foreground">
                          Este libro aún no tiene subrayados guardados.
                        </p>
                      ) : (
                        <div className="scrollbar-subtle max-h-64 space-y-1.5 overflow-y-auto pr-1">
                          {linkedHighlights.map((h) => (
                            <button
                              key={h.id}
                              type="button"
                              onClick={() => {
                                insertTextAtCursor(
                                  `\n${formatHighlightAsMarkdown(h)}\n`,
                                );
                                setHighlightsPopoverOpen(false);
                              }}
                              className="w-full rounded-md border border-border/60 bg-secondary/40 p-2 text-left transition-colors hover:border-accent-brand/50 hover:bg-secondary"
                            >
                              <p className="line-clamp-3 font-serif text-xs italic text-foreground">
                                “{h.quote_text}”
                              </p>
                              {h.page_number ? (
                                <p className="mt-1 font-mono text-[10px] text-muted-foreground">
                                  pág. {h.page_number}
                                </p>
                              ) : null}
                            </button>
                          ))}
                        </div>
                      )}
                    </PopoverContent>
                  </Popover>
                ) : null}

                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      type="button"
                      variant="outline"
                      size="xs"
                      className="gap-1.5"
                    >
                      <Download className="size-3.5" />
                      <span>Exportar</span>
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-56">
                    <DropdownMenuItem
                      className="text-xs"
                      onSelect={() => void handleExportSingle()}
                    >
                      <FileDown className="size-3.5" />
                      <span>Exportar nota (.md)</span>
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      className="text-xs"
                      onSelect={() => void handleCopyMarkdown()}
                    >
                      <Copy className="size-3.5" />
                      <span>Copiar Markdown (Obsidian)</span>
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      className="text-xs"
                      onSelect={() => void handleExportVault()}
                    >
                      <FolderOutput className="size-3.5" />
                      <span>Exportar bóveda completa...</span>
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>

                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  aria-label="Eliminar nota"
                  title="Eliminar nota"
                  onClick={() => setNotePendingDelete(selectedNote)}
                  className="text-muted-foreground hover:text-destructive"
                >
                  <Trash2 className="size-3.5" />
                </Button>
              </div>
            </div>

            {/* Properties header (Obsidian frontmatter fields) */}
            <div className="shrink-0 space-y-2.5 border-b border-border/60 px-6 py-3.5">
              <input
                type="text"
                value={draft.title}
                onChange={(e) => scheduleDraftPatch({ title: e.target.value })}
                placeholder="Título de la nota..."
                aria-label="Título de la nota"
                className="w-full bg-transparent font-sans text-xl font-semibold tracking-tight text-foreground placeholder:text-muted-foreground/50 outline-none"
              />

              <div className="flex flex-wrap items-center gap-2 text-xs">
                {/* Folder */}
                <div className="flex items-center gap-1.5 rounded-md border border-border/70 bg-secondary/40 px-2 py-1">
                  <Folder className="size-3 text-muted-foreground" />
                  <input
                    type="text"
                    list="librory-note-folders"
                    value={draft.folder}
                    onChange={(e) =>
                      scheduleDraftPatch({ folder: e.target.value })
                    }
                    placeholder="Carpeta (ej. Lecturas)"
                    aria-label="Carpeta de la nota"
                    className="w-36 bg-transparent text-xs text-foreground placeholder:text-muted-foreground/70 outline-none"
                  />
                  <datalist id="librory-note-folders">
                    {uniqueFolders.map((f) => (
                      <option key={f} value={f} />
                    ))}
                  </datalist>
                </div>

                {/* Linked book */}
                <div className="flex items-center gap-1 rounded-md border border-border/70 bg-secondary/40 px-2 py-1">
                  <BookOpen className="size-3 text-muted-foreground" />
                  <select
                    aria-label="Libro vinculado a la nota"
                    value={draft.itemId ?? ''}
                    onChange={(e) =>
                      scheduleDraftPatch({
                        itemId: e.target.value || null,
                      })
                    }
                    className="max-w-48 bg-transparent text-xs text-foreground outline-none"
                  >
                    <option value="">Sin libro vinculado</option>
                    {bookOptions.map((book) => (
                      <option key={book.id} value={book.id}>
                        {book.title}
                      </option>
                    ))}
                  </select>
                  {draft.itemId ? (
                    <button
                      type="button"
                      onClick={() => onOpenItem(draft.itemId!)}
                      className="ml-1 rounded px-1 text-[10.5px] font-medium text-accent-brand hover:bg-accent-brand/10"
                      title="Abrir ficha del libro"
                    >
                      Ficha
                    </button>
                  ) : null}
                  {draft.itemId ? (
                    <button
                      type="button"
                      onClick={() => onOpenReader(draft.itemId!)}
                      className="rounded px-1 text-[10.5px] font-medium text-accent-brand hover:bg-accent-brand/10"
                      title="Abrir en lector integrado"
                    >
                      Leer
                    </button>
                  ) : null}
                </div>

                {/* Tags */}
                <div className="flex flex-wrap items-center gap-1.5">
                  {draft.tags.map((tag) => (
                    <span
                      key={tag}
                      className="inline-flex items-center gap-1 rounded-md bg-accent-brand/10 px-2 py-0.5 font-mono text-[11px] text-accent-brand"
                    >
                      <Hash className="size-2.5" />
                      <span>{tag}</span>
                      <button
                        type="button"
                        aria-label={`Quitar etiqueta ${tag}`}
                        onClick={() => handleRemoveTag(tag)}
                        className="rounded-sm hover:text-foreground"
                      >
                        <X className="size-2.5" />
                      </button>
                    </span>
                  ))}
                  <input
                    type="text"
                    value={tagInput}
                    onChange={(e) => setTagInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ',') {
                        e.preventDefault();
                        handleAddTag(tagInput);
                      }
                    }}
                    onBlur={() => {
                      if (tagInput.trim()) handleAddTag(tagInput);
                    }}
                    placeholder="+ etiqueta"
                    aria-label="Añadir etiqueta"
                    className="h-6 w-24 rounded-md border border-dashed border-border/80 bg-transparent px-2 text-[11px] text-foreground placeholder:text-muted-foreground/70 outline-none focus:border-ring"
                  />
                </div>
              </div>
            </div>

            {/* Markdown formatting toolbar */}
            {viewMode !== 'preview' ? (
              <div className="flex shrink-0 flex-wrap items-center gap-1 border-b border-border/50 bg-secondary/20 px-6 py-1.5">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  title="Encabezado 1"
                  onClick={() => insertTextAtCursor('# ')}
                >
                  <Heading1 className="size-3.5" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  title="Encabezado 2"
                  onClick={() => insertTextAtCursor('## ')}
                >
                  <Heading2 className="size-3.5" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  title="Negrita"
                  onClick={() =>
                    insertTextAtCursor('texto', { before: '**', after: '**' })
                  }
                >
                  <Bold className="size-3.5" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  title="Cursiva"
                  onClick={() =>
                    insertTextAtCursor('texto', { before: '*', after: '*' })
                  }
                >
                  <Italic className="size-3.5" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  title="Cita"
                  onClick={() => insertTextAtCursor('> ')}
                >
                  <Quote className="size-3.5" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  title="Lista"
                  onClick={() => insertTextAtCursor('- ')}
                >
                  <List className="size-3.5" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  title="Checklist"
                  onClick={() => insertTextAtCursor('- [ ] ')}
                >
                  <CheckSquare className="size-3.5" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  title="Bloque de código"
                  onClick={() =>
                    insertTextAtCursor('código', {
                      before: '\n```\n',
                      after: '\n```\n',
                    })
                  }
                >
                  <Code className="size-3.5" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="xs"
                  title="Insertar enlace interno [[Wikilink]]"
                  onClick={() =>
                    insertTextAtCursor('Nombre de nota', {
                      before: '[[',
                      after: ']]',
                    })
                  }
                  className="gap-1 px-2 font-mono text-[11px] text-muted-foreground hover:text-foreground"
                >
                  <Link2 className="size-3" />
                  <span>[[Wikilink]]</span>
                </Button>
              </div>
            ) : null}

            {/* Editor & Preview split/single pane */}
            <div className="min-h-0 flex-1 overflow-hidden">
              <div
                className={cn(
                  'h-full',
                  viewMode === 'split' &&
                    'grid grid-cols-1 divide-y divide-border lg:grid-cols-2 lg:divide-x lg:divide-y-0',
                )}
              >
                {viewMode !== 'preview' ? (
                  <textarea
                    ref={textareaRef}
                    value={draft.content}
                    onChange={(e) =>
                      scheduleDraftPatch({ content: e.target.value })
                    }
                    onKeyDown={(e) => {
                      if (e.key === 'Tab') {
                        e.preventDefault();
                        insertTextAtCursor('  ');
                      }
                    }}
                    placeholder="Escribe tus notas en Markdown... Usa [[Nombre de nota]] para enlazar notas o - [ ] para checklists."
                    aria-label="Contenido Markdown de la nota"
                    className="scrollbar-subtle h-full w-full resize-none bg-background px-6 py-5 font-mono text-[13px] leading-relaxed text-foreground placeholder:text-muted-foreground/50 outline-none"
                  />
                ) : null}

                {viewMode !== 'edit' ? (
                  <div className="scrollbar-subtle h-full overflow-y-auto px-6 py-5">
                    <div className="mx-auto max-w-3xl">
                      {draft.content.trim() ? (
                        <MarkdownPreview
                          content={draft.content}
                          variant="document"
                          existingNoteTitles={titleLookup.titles}
                          onWikilinkClick={(target) =>
                            void handleWikilinkClick(target)
                          }
                          onToggleChecklist={handleToggleChecklist}
                        />
                      ) : (
                        <p className="text-xs italic text-muted-foreground">
                          Esta nota aún no tiene contenido. Empieza a escribir en
                          Markdown para ver la vista previa.
                        </p>
                      )}
                    </div>
                  </div>
                ) : null}
              </div>
            </div>

            {/* Incoming backlinks bar */}
            {backlinks.length > 0 ? (
              <div className="flex shrink-0 flex-wrap items-center gap-2 border-t border-border/60 bg-secondary/20 px-6 py-2 text-xs">
                <span className="font-medium text-muted-foreground">
                  Mencionada en:
                </span>
                {backlinks.map((source) => (
                  <button
                    key={source.id}
                    type="button"
                    onClick={() => selectNote(source.id)}
                    className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-2 py-0.5 text-[11px] font-medium text-foreground transition-colors hover:border-accent-brand/50 hover:text-accent-brand"
                  >
                    <Link2 className="size-3 text-accent-brand" />
                    <span>{source.title}</span>
                  </button>
                ))}
              </div>
            ) : null}
          </>
        )}

        {feedbackMessage ? (
          <div
            role="status"
            aria-live="polite"
            className="absolute right-5 bottom-5 z-20 rounded-lg border border-border bg-popover px-3.5 py-2 text-xs text-popover-foreground shadow-md"
          >
            {feedbackMessage}
          </div>
        ) : null}
      </div>

      <ConfirmDialog
        open={Boolean(notePendingDelete)}
        onOpenChange={(open) => {
          if (!open && !deleteNoteMutation.isPending) {
            setNotePendingDelete(null);
          }
        }}
        title="Eliminar nota"
        description={
          notePendingDelete
            ? `Se eliminará permanentemente la nota "${notePendingDelete.title}".`
            : ''
        }
        isPending={deleteNoteMutation.isPending}
        onConfirm={async () => {
          if (!notePendingDelete) return;
          const deleteId = notePendingDelete.id;
          if (dirtyRef.current?.id === deleteId) {
            dirtyRef.current = null;
          }
          if (autosaveTimerRef.current !== null) {
            window.clearTimeout(autosaveTimerRef.current);
            autosaveTimerRef.current = null;
          }
          await deleteNoteMutation.mutateAsync(deleteId);
          setNotePendingDelete(null);
          if (selectedNoteId === deleteId) {
            setSelectedNoteId(null);
          }
        }}
      />
    </div>
  );
}
