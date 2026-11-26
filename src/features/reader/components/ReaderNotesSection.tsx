import {
  BookmarkPlus,
  Eye,
  NotebookPen,
  Pencil,
  Plus,
  Trash2,
} from 'lucide-react';
import {
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { MarkdownPreview } from '@/components/ui/markdown-preview';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import {
  useCreateNote,
  useDeleteNote,
  useNotesList,
  useUpdateNote,
} from '@/features/notes/hooks/useNotes';
import { cn } from '@/lib/utils';
import type { NoteWithItem, UpdateNoteInput } from '@/types/domain';

export interface ReaderNoteQuoteInsert {
  id: number;
  quote: string;
  pageNumber: number;
}

interface ReaderNotesSectionProps {
  itemId: string;
  itemTitle: string;
  currentPage: number;
  unitLabel?: string;
  pendingQuoteInsert: ReaderNoteQuoteInsert | null;
  onConsumeQuoteInsert: () => void;
}

interface ReaderNoteDraft {
  id: string;
  title: string;
  content: string;
}

type EditorMode = 'edit' | 'preview';
type SaveStatus = 'saved' | 'pending' | 'saving';

function appendSnippet(existing: string, snippet: string): string {
  if (!existing.trim()) {
    return snippet;
  }
  const prefix = existing.endsWith('\n\n')
    ? ''
    : existing.endsWith('\n')
      ? '\n'
      : '\n\n';
  return `${existing}${prefix}${snippet}`;
}

/**
 * Integrated Markdown notes editor scoped to the active book in the PDF/EPUB reader.
 * Syncs via TanStack Query and SQLite with the main Notes workspace.
 */
export function ReaderNotesSection({
  itemId,
  itemTitle,
  currentPage,
  unitLabel = 'pág.',
  pendingQuoteInsert,
  onConsumeQuoteInsert,
}: ReaderNotesSectionProps) {
  const notesQuery = useNotesList(true);
  const createNoteMutation = useCreateNote();
  const updateNoteMutation = useUpdateNote();
  const deleteNoteMutation = useDeleteNote();

  const bookNotes = useMemo(
    () => (notesQuery.data ?? []).filter((n) => n.item_id === itemId),
    [notesQuery.data, itemId],
  );

  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null);
  const [draft, setDraft] = useState<ReaderNoteDraft | null>(null);
  const [editorMode, setEditorMode] = useState<EditorMode>('edit');
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('saved');
  const [notePendingDelete, setNotePendingDelete] =
    useState<NoteWithItem | null>(null);

  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const dirtyRef = useRef<{ id: string; patch: UpdateNoteInput } | null>(null);
  const autosaveTimerRef = useRef<number | null>(null);
  const updateMutateAsyncRef = useRef(updateNoteMutation.mutateAsync);
  const lastConsumedInsertIdRef = useRef<number | null>(null);

  useEffect(() => {
    updateMutateAsyncRef.current = updateNoteMutation.mutateAsync;
  }, [updateNoteMutation.mutateAsync]);

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
      console.error('Error guardando nota en el lector:', error);
      setSaveStatus('pending');
    }
  }, []);

  useEffect(() => {
    return () => {
      if (autosaveTimerRef.current !== null) {
        window.clearTimeout(autosaveTimerRef.current);
        autosaveTimerRef.current = null;
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

  // Auto-select first note for the current book when selection is missing or deleted.
  useEffect(() => {
    if (bookNotes.length === 0) {
      if (selectedNoteId !== null) setSelectedNoteId(null);
      return;
    }
    if (selectedNoteId && bookNotes.some((n) => n.id === selectedNoteId)) {
      return;
    }
    setSelectedNoteId(bookNotes[0]!.id);
  }, [bookNotes, selectedNoteId]);

  const selectedNote = useMemo(
    () => bookNotes.find((n) => n.id === selectedNoteId) ?? null,
    [bookNotes, selectedNoteId],
  );

  // Sync draft only when switching notes so active typing is preserved.
  useEffect(() => {
    if (!selectedNote) {
      setDraft(null);
      return;
    }
    setDraft((prev) => {
      if (prev && prev.id === selectedNote.id) {
        return prev;
      }
      setSaveStatus('saved');
      return {
        id: selectedNote.id,
        title: selectedNote.title,
        content: selectedNote.content,
      };
    });
  }, [selectedNote]);

  const deferredPreviewContent = useDeferredValue(draft?.content ?? '');

  const scheduleDraftPatch = useCallback(
    (patch: Partial<Omit<ReaderNoteDraft, 'id'>>) => {
      setDraft((prev) => {
        if (!prev) return prev;
        const next: ReaderNoteDraft = { ...prev, ...patch };
        const noteId = prev.id;
        const repoPatch: UpdateNoteInput = {
          ...(patch.title !== undefined ? { title: patch.title } : {}),
          ...(patch.content !== undefined ? { content: patch.content } : {}),
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

  const selectNote = useCallback(
    (nextId: string) => {
      if (nextId === selectedNoteId) return;
      void flushPendingSave();
      setSelectedNoteId(nextId);
    },
    [selectedNoteId, flushPendingSave],
  );

  const handleCreateBookNote = useCallback(
    async (initialContent = '') => {
      await flushPendingSave();
      const defaultTitle =
        bookNotes.length === 0
          ? `Notas — ${itemTitle}`
          : `Nota ${bookNotes.length + 1} — ${itemTitle}`;

      const created = await createNoteMutation.mutateAsync({
        title: defaultTitle,
        content: initialContent,
        item_id: itemId,
      });

      setSelectedNoteId(created.id);
      setEditorMode('edit');
      window.setTimeout(() => {
        textareaRef.current?.focus();
      }, 30);
    },
    [
      flushPendingSave,
      bookNotes.length,
      itemTitle,
      createNoteMutation,
      itemId,
    ],
  );

  // Consume quotes sent from the reader's floating text selection toolbar.
  useEffect(() => {
    if (!pendingQuoteInsert || notesQuery.isLoading) return;
    if (lastConsumedInsertIdRef.current === pendingQuoteInsert.id) return;

    lastConsumedInsertIdRef.current = pendingQuoteInsert.id;
    const quoteLines = pendingQuoteInsert.quote
      .trim()
      .split(/\r?\n/)
      .map((line) => `> ${line}`);
    quoteLines.push(`>\n> — *${unitLabel} ${pendingQuoteInsert.pageNumber}*`);
    const snippet = `${quoteLines.join('\n')}\n\n`;

    onConsumeQuoteInsert();

    if (draft) {
      const nextContent = appendSnippet(draft.content, snippet);
      scheduleDraftPatch({ content: nextContent });
      setEditorMode('edit');
      window.requestAnimationFrame(() => {
        const el = textareaRef.current;
        if (!el) return;
        el.focus();
        el.setSelectionRange(nextContent.length, nextContent.length);
      });
      return;
    }

    if (bookNotes.length > 0) {
      const target = bookNotes[0]!;
      const nextContent = appendSnippet(target.content, snippet);
      setSelectedNoteId(target.id);
      setDraft({
        id: target.id,
        title: target.title,
        content: nextContent,
      });
      setEditorMode('edit');
      setSaveStatus('saving');
      void updateMutateAsyncRef
        .current({ id: target.id, patch: { content: nextContent } })
        .then(() => {
          setSaveStatus((prev) => (prev === 'saving' ? 'saved' : prev));
        })
        .catch(() => {
          setSaveStatus('pending');
        });
      window.setTimeout(() => {
        const el = textareaRef.current;
        if (!el) return;
        el.focus();
        el.setSelectionRange(nextContent.length, nextContent.length);
      }, 40);
      return;
    }

    void handleCreateBookNote(snippet);
  }, [
    pendingQuoteInsert,
    notesQuery.isLoading,
    unitLabel,
    onConsumeQuoteInsert,
    draft,
    bookNotes,
    scheduleDraftPatch,
    handleCreateBookNote,
  ]);

  const insertPageReference = useCallback(() => {
    if (!draft) return;
    const marker = `**${unitLabel} ${currentPage}:** `;
    const textarea = textareaRef.current;

    if (editorMode !== 'edit' || !textarea) {
      const nextContent = appendSnippet(draft.content, marker);
      scheduleDraftPatch({ content: nextContent });
      setEditorMode('edit');
      window.setTimeout(() => {
        const el = textareaRef.current;
        if (!el) return;
        el.focus();
        el.setSelectionRange(nextContent.length, nextContent.length);
      }, 30);
      return;
    }

    const start = textarea.selectionStart ?? draft.content.length;
    const end = textarea.selectionEnd ?? draft.content.length;
    const needsLeadingNewline =
      start > 0 && draft.content[start - 1] !== '\n' ? '\n' : '';
    const insertion = `${needsLeadingNewline}${marker}`;
    const nextContent =
      draft.content.slice(0, start) + insertion + draft.content.slice(end);
    const cursorPos = start + insertion.length;

    scheduleDraftPatch({ content: nextContent });
    window.requestAnimationFrame(() => {
      const el = textareaRef.current;
      if (!el) return;
      el.focus();
      el.setSelectionRange(cursorPos, cursorPos);
    });
  }, [draft, editorMode, unitLabel, currentPage, scheduleDraftPatch]);

  const insertIndentation = useCallback(() => {
    if (!draft) return;
    const textarea = textareaRef.current;
    if (!textarea) return;
    const start = textarea.selectionStart ?? draft.content.length;
    const end = textarea.selectionEnd ?? draft.content.length;
    const nextContent =
      draft.content.slice(0, start) + '  ' + draft.content.slice(end);
    scheduleDraftPatch({ content: nextContent });
    window.requestAnimationFrame(() => {
      const el = textareaRef.current;
      if (!el) return;
      el.focus();
      el.setSelectionRange(start + 2, start + 2);
    });
  }, [draft, scheduleDraftPatch]);

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

  if (notesQuery.isLoading) {
    return (
      <div className="space-y-3 p-4">
        <Skeleton className="h-8 w-full rounded-md" />
        <Skeleton className="h-7 w-2/3 rounded-md" />
        <Skeleton className="h-48 w-full rounded-lg" />
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Note selector & create/delete bar */}
      <div className="flex items-center justify-between gap-1.5 border-b border-border/70 px-3.5 py-2">
        {bookNotes.length > 0 ? (
          <select
            aria-label="Seleccionar nota del libro"
            value={selectedNoteId ?? ''}
            onChange={(e) => selectNote(e.target.value)}
            className="h-7 min-w-0 flex-1 truncate rounded-md border border-input bg-background px-2 text-xs text-foreground outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40"
          >
            {bookNotes.map((note) => (
              <option key={note.id} value={note.id}>
                {draft && draft.id === note.id
                  ? draft.title || 'Nota sin título'
                  : note.title}
              </option>
            ))}
          </select>
        ) : (
          <span className="truncate text-xs text-muted-foreground">
            Sin notas vinculadas
          </span>
        )}

        <div className="flex shrink-0 items-center gap-1">
          <Button
            type="button"
            variant="outline"
            size="xs"
            disabled={createNoteMutation.isPending}
            onClick={() => void handleCreateBookNote()}
          >
            <Plus className="size-3" />
            Nueva
          </Button>

          {selectedNote ? (
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              aria-label="Eliminar nota actual"
              title="Eliminar nota actual"
              onClick={() => setNotePendingDelete(selectedNote)}
              className="text-muted-foreground hover:bg-destructive/15 hover:text-destructive"
            >
              <Trash2 className="size-3.5" />
            </Button>
          ) : null}
        </div>
      </div>

      {!selectedNote || !draft ? (
        <div className="flex flex-1 items-center justify-center p-4">
          <div className="w-full rounded-xl border border-dashed border-border bg-background/40 px-4 py-8 text-center">
            <NotebookPen className="mx-auto size-5 text-accent-brand" />
            <p className="mt-2.5 text-xs font-medium text-foreground">
              Escribe notas sobre este libro
            </p>
            <p className="mt-1.5 text-[11px] leading-relaxed text-muted-foreground">
              Tus apuntes en Markdown se guardan automáticamente y se
              sincronizan con la sección principal de Notas.
            </p>
            <Button
              type="button"
              size="xs"
              disabled={createNoteMutation.isPending}
              onClick={() => void handleCreateBookNote()}
              className="mt-4 gap-1"
            >
              <Plus className="size-3" />
              Crear nota para este libro
            </Button>
          </div>
        </div>
      ) : (
        <>
          {/* Title input */}
          <div className="border-b border-border/60 px-3.5 py-2">
            <input
              type="text"
              value={draft.title}
              onChange={(e) => scheduleDraftPatch({ title: e.target.value })}
              placeholder="Título de la nota..."
              aria-label="Título de la nota"
              className="w-full bg-transparent text-sm font-semibold tracking-tight text-foreground placeholder:text-muted-foreground/50 outline-none"
            />
          </div>

          {/* Mode toggle + insert current page/chapter + save status */}
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/50 bg-secondary/20 px-3.5 py-1.5">
            <div className="flex items-center gap-1.5">
              <div
                role="tablist"
                aria-label="Modo del editor de notas"
                className="inline-flex items-center gap-0.5 rounded-md border border-border/60 bg-background/70 p-0.5"
              >
                <button
                  type="button"
                  role="tab"
                  aria-selected={editorMode === 'edit'}
                  onClick={() => setEditorMode('edit')}
                  className={cn(
                    'inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-medium transition-colors',
                    editorMode === 'edit'
                      ? 'bg-secondary text-foreground'
                      : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  <Pencil className="size-2.5" />
                  <span>Editar</span>
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={editorMode === 'preview'}
                  onClick={() => setEditorMode('preview')}
                  className={cn(
                    'inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-medium transition-colors',
                    editorMode === 'preview'
                      ? 'bg-secondary text-foreground'
                      : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  <Eye className="size-2.5" />
                  <span>Vista previa</span>
                </button>
              </div>

              <Button
                type="button"
                variant="outline"
                size="xs"
                title={`Insertar referencia (${unitLabel} ${currentPage})`}
                onClick={insertPageReference}
                className="h-6 gap-1 px-1.5 font-mono text-[10.5px]"
              >
                <BookmarkPlus className="size-3 text-accent-brand" />
                <span>
                  + {unitLabel === 'cap.' ? 'Cap.' : 'Pág.'} {currentPage}
                </span>
              </Button>
            </div>

            <span className="font-mono text-[10.5px] text-muted-foreground">
              {saveStatus === 'saving'
                ? 'Guardando...'
                : saveStatus === 'pending'
                  ? 'Sin guardar'
                  : 'Guardado'}
            </span>
          </div>

          {/* Markdown editor or preview */}
          <div className="min-h-0 flex-1 overflow-hidden">
            {editorMode === 'edit' ? (
              <textarea
                ref={textareaRef}
                value={draft.content}
                onChange={(e) =>
                  scheduleDraftPatch({ content: e.target.value })
                }
                onKeyDown={(e) => {
                  if (e.key === 'Tab') {
                    e.preventDefault();
                    insertIndentation();
                  }
                }}
                placeholder="Escribe tus apuntes en Markdown... Puedes usar **negrita**, > citas, - [ ] checklists o [[wikilinks]]."
                aria-label="Contenido Markdown de la nota"
                className="scrollbar-subtle h-full w-full resize-none bg-transparent px-3.5 py-3 font-mono text-xs leading-relaxed text-foreground placeholder:text-muted-foreground/50 outline-none"
              />
            ) : (
              <ScrollArea className="h-full">
                <div className="px-4 py-3">
                  {deferredPreviewContent.trim() ? (
                    <MarkdownPreview
                      content={deferredPreviewContent}
                      variant="document"
                      onToggleChecklist={handleToggleChecklist}
                    />
                  ) : (
                    <p className="text-xs italic text-muted-foreground">
                      Esta nota aún no tiene contenido. Cambia a &ldquo;Editar&rdquo;
                      para empezar a escribir.
                    </p>
                  )}
                </div>
              </ScrollArea>
            )}
          </div>
        </>
      )}

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
            if (autosaveTimerRef.current !== null) {
              window.clearTimeout(autosaveTimerRef.current);
              autosaveTimerRef.current = null;
            }
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
