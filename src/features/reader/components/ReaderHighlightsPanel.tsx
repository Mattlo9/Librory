import {
  Check,
  Copy,
  Highlighter,
  Pencil,
  Plus,
  Trash2,
  X,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { MarkdownPreview } from '@/components/ui/markdown-preview';
import { ScrollArea } from '@/components/ui/scroll-area';
import { HighlightEditorForm } from '@/features/highlights/components/HighlightEditorForm';
import {
  useCreateHighlight,
  useDeleteHighlight,
  useUpdateHighlight,
} from '@/features/library/hooks/useLibraryData';
import {
  formatHighlightAsMarkdown,
  HIGHLIGHT_BORDER_CLASS,
} from '@/lib/highlights';
import { cn } from '@/lib/utils';
import type { Highlight, HighlightColor } from '@/types/domain';

export interface ReaderHighlightDraft {
  quote_text: string;
  color: HighlightColor;
  page_number: number;
}

interface ReaderHighlightsPanelProps {
  itemId: string;
  itemTitle: string;
  itemAuthor: string;
  currentPage: number;
  numPages: number;
  highlights: Highlight[];
  draft: ReaderHighlightDraft | null;
  onDraftChange: (draft: ReaderHighlightDraft | null) => void;
  onJumpToPage: (page: number) => void;
  onClose: () => void;
}

export function ReaderHighlightsPanel({
  itemId,
  itemTitle,
  itemAuthor,
  currentPage,
  numPages,
  highlights,
  draft,
  onDraftChange,
  onJumpToPage,
  onClose,
}: ReaderHighlightsPanelProps) {
  const createHighlight = useCreateHighlight();
  const updateHighlight = useUpdateHighlight();
  const deleteHighlight = useDeleteHighlight();

  const [scope, setScope] = useState<'all' | 'page'>('all');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [highlightToDelete, setHighlightToDelete] = useState<Highlight | null>(
    null,
  );
  const copyTimerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (copyTimerRef.current !== null) {
        window.clearTimeout(copyTimerRef.current);
      }
    };
  }, []);

  const currentPageCount = useMemo(
    () => highlights.filter((h) => h.page_number === currentPage).length,
    [highlights, currentPage],
  );

  const visibleHighlights = useMemo(() => {
    if (scope === 'page') {
      return highlights.filter((h) => h.page_number === currentPage);
    }
    return highlights;
  }, [highlights, scope, currentPage]);

  async function handleCopyMarkdown(entry: Highlight) {
    const markdown = formatHighlightAsMarkdown({
      quote: entry.quote_text,
      note: entry.note_markdown,
      title: itemTitle,
      author: itemAuthor,
      pageNumber: entry.page_number,
    });

    try {
      await navigator.clipboard.writeText(markdown);
      setCopiedId(entry.id);
      if (copyTimerRef.current !== null) {
        window.clearTimeout(copyTimerRef.current);
      }
      copyTimerRef.current = window.setTimeout(() => {
        setCopiedId(null);
        copyTimerRef.current = null;
      }, 1500);
    } catch {
      // Silenciar si el portapapeles no está disponible en el entorno actual.
    }
  }

  return (
    <aside
      aria-label="Subrayados y notas del documento"
      className="flex h-full w-[340px] shrink-0 flex-col border-l border-border bg-card lg:w-[376px]"
    >
      <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
        <div className="flex items-center gap-2">
          <Highlighter className="size-4 text-accent-brand" />
          <h2 className="text-sm font-semibold tracking-tight text-foreground">
            Subrayados
          </h2>
          <Badge
            variant="secondary"
            className="h-5 rounded-md px-1.5 font-mono text-[10.5px] font-normal tabular-nums"
          >
            {highlights.length}
          </Badge>
        </div>

        <div className="flex items-center gap-1">
          <Button
            type="button"
            variant="outline"
            size="xs"
            onClick={() => {
              setEditingId(null);
              onDraftChange({
                quote_text: '',
                color: 'amber',
                page_number: currentPage,
              });
            }}
          >
            <Plus className="size-3" />
            Nuevo
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            aria-label="Cerrar panel de subrayados"
            onClick={onClose}
          >
            <X className="size-3.5" />
          </Button>
        </div>
      </div>

      <div className="border-b border-border/70 px-4 py-2">
        <div
          role="tablist"
          aria-label="Filtrar subrayados del documento"
          className="grid grid-cols-2 rounded-lg border border-border bg-background/60 p-0.5"
        >
          <button
            type="button"
            role="tab"
            aria-selected={scope === 'all'}
            onClick={() => setScope('all')}
            className={cn(
              'rounded-md py-1 text-xs font-medium transition-colors',
              scope === 'all'
                ? 'bg-secondary text-foreground'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            Todo el libro ({highlights.length})
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={scope === 'page'}
            onClick={() => setScope('page')}
            className={cn(
              'rounded-md py-1 text-xs font-medium transition-colors',
              scope === 'page'
                ? 'bg-secondary text-foreground'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            Pág. {currentPage} ({currentPageCount})
          </button>
        </div>
      </div>

      <ScrollArea className="min-h-0 flex-1">
        <div className="space-y-3 p-4">
          {draft ? (
            <HighlightEditorForm
              key={`draft-${draft.page_number}-${draft.quote_text.slice(0, 16)}`}
              initialQuote={draft.quote_text}
              initialColor={draft.color}
              initialPageNumber={draft.page_number}
              maxPage={numPages > 0 ? numPages : undefined}
              submitLabel="Crear subrayado"
              isPending={createHighlight.isPending}
              onSubmit={async (values) => {
                await createHighlight.mutateAsync({
                  item_id: itemId,
                  quote_text: values.quote_text,
                  note_markdown: values.note_markdown,
                  color: values.color,
                  page_number: values.page_number,
                });
                onDraftChange(null);
              }}
              onCancel={() => onDraftChange(null)}
            />
          ) : null}

          {visibleHighlights.length === 0 && !draft ? (
            <div className="rounded-xl border border-dashed border-border bg-background/40 px-4 py-8 text-center">
              <p className="text-xs font-medium text-foreground">
                {scope === 'page'
                  ? `Sin subrayados en la página ${currentPage}`
                  : 'Sin subrayados en este documento'}
              </p>
              <p className="mt-1.5 text-[11px] leading-relaxed text-muted-foreground">
                Selecciona cualquier fragmento del texto en el PDF para
                subrayarlo o pulsa &ldquo;Nuevo&rdquo; para anotar manualmente.
              </p>
            </div>
          ) : null}

          {visibleHighlights.map((entry) => {
            if (editingId === entry.id) {
              return (
                <HighlightEditorForm
                  key={`edit-${entry.id}`}
                  initialQuote={entry.quote_text}
                  initialNote={entry.note_markdown}
                  initialColor={entry.color}
                  initialPageNumber={entry.page_number}
                  maxPage={numPages > 0 ? numPages : undefined}
                  submitLabel="Guardar cambios"
                  isPending={updateHighlight.isPending}
                  onSubmit={async (values) => {
                    await updateHighlight.mutateAsync({
                      id: entry.id,
                      itemId,
                      patch: {
                        quote_text: values.quote_text,
                        note_markdown: values.note_markdown,
                        color: values.color,
                        page_number: values.page_number,
                      },
                    });
                    setEditingId(null);
                  }}
                  onCancel={() => setEditingId(null)}
                />
              );
            }

            return (
              <article
                key={entry.id}
                className={cn(
                  'rounded-xl border border-border border-l-2 bg-background/60 p-3.5 transition-colors hover:border-border/90',
                  HIGHLIGHT_BORDER_CLASS[entry.color],
                )}
              >
                <blockquote className="font-serif text-[14.5px] leading-relaxed text-foreground">
                  &ldquo;{entry.quote_text}&rdquo;
                </blockquote>

                {entry.note_markdown ? (
                  <div className="mt-2.5 border-t border-border/60 pt-2.5">
                    <MarkdownPreview content={entry.note_markdown} />
                  </div>
                ) : null}

                <footer className="mt-3 flex items-center justify-between gap-2">
                  {entry.page_number ? (
                    <button
                      type="button"
                      onClick={() => onJumpToPage(entry.page_number!)}
                      className={cn(
                        'rounded-md border px-2 py-0.5 font-mono text-[10.5px] tabular-nums transition-colors',
                        entry.page_number === currentPage
                          ? 'border-accent-brand/50 bg-accent-brand/15 text-accent-brand'
                          : 'border-border bg-secondary/50 text-muted-foreground hover:text-foreground',
                      )}
                    >
                      pág. {entry.page_number}
                    </button>
                  ) : (
                    <span className="font-mono text-[10.5px] text-muted-foreground/70">
                      Nota general
                    </span>
                  )}

                  <div className="flex items-center gap-0.5">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-xs"
                      aria-label="Copiar como Markdown"
                      title="Copiar como Markdown"
                      onClick={() => void handleCopyMarkdown(entry)}
                      className="text-muted-foreground hover:text-foreground"
                    >
                      {copiedId === entry.id ? (
                        <Check className="size-3 text-emerald-600 dark:text-emerald-400" />
                      ) : (
                        <Copy className="size-3" />
                      )}
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-xs"
                      aria-label="Editar subrayado"
                      title="Editar subrayado"
                      onClick={() => {
                        onDraftChange(null);
                        setEditingId(entry.id);
                      }}
                      className="text-muted-foreground hover:text-foreground"
                    >
                      <Pencil className="size-3" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-xs"
                      aria-label="Eliminar subrayado"
                      title="Eliminar subrayado"
                      onClick={() => setHighlightToDelete(entry)}
                      className="text-muted-foreground hover:bg-destructive/15 hover:text-destructive"
                    >
                      <Trash2 className="size-3" />
                    </Button>
                  </div>
                </footer>
              </article>
            );
          })}
        </div>
      </ScrollArea>

      <ConfirmDialog
        open={Boolean(highlightToDelete)}
        onOpenChange={(open) => {
          if (!open) setHighlightToDelete(null);
        }}
        title="Eliminar subrayado"
        description="Esta cita y su nota asociada se eliminarán permanentemente."
        isPending={deleteHighlight.isPending}
        onConfirm={async () => {
          if (!highlightToDelete) return;
          await deleteHighlight.mutateAsync(highlightToDelete.id);
          setHighlightToDelete(null);
        }}
      />
    </aside>
  );
}
