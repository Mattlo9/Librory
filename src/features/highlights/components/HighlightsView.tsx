import {
  BookOpen,
  Check,
  Copy,
  FileText,
  Highlighter,
  Pencil,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import {
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { EmptyState } from '@/components/ui/empty-state';
import { Input } from '@/components/ui/input';
import { MarkdownPreview } from '@/components/ui/markdown-preview';
import { Skeleton } from '@/components/ui/skeleton';
import { HighlightEditorForm } from '@/features/highlights/components/HighlightEditorForm';
import {
  useDeleteHighlight,
  useHighlightsList,
  useSearchHighlightsFts,
  useUpdateHighlight,
} from '@/features/library/hooks/useLibraryData';
import {
  formatHighlightAsMarkdown,
  HIGHLIGHT_BORDER_CLASS,
  HIGHLIGHT_COLOR_LABELS,
  HIGHLIGHT_DOT_CLASS,
  HIGHLIGHT_SOFT_BG_CLASS,
  isItemReadableLocally,
} from '@/lib/highlights';
import { cn } from '@/lib/utils';
import {
  HIGHLIGHT_COLORS,
  type HighlightColor,
  type HighlightWithItem,
} from '@/types/domain';

interface HighlightsViewProps {
  onOpenItem: (itemId: string) => void;
  onOpenInReader: (itemId: string, page?: number) => void;
}

const HIGHLIGHTS_LOADING_SKELETON = (
  <div
    role="status"
    aria-label="Cargando subrayados"
    className="mx-auto max-w-4xl space-y-4 px-6 py-8"
  >
    <Skeleton className="h-10 w-full rounded-lg" />
    <Skeleton className="h-36 w-full rounded-xl" />
    <Skeleton className="h-32 w-full rounded-xl" />
  </div>
);

export function HighlightsView({
  onOpenItem,
  onOpenInReader,
}: HighlightsViewProps) {
  const [searchText, setSearchText] = useState('');
  const deferredQuery = useDeferredValue(searchText);
  const trimmedQuery = deferredQuery.trim();
  const isFtsActive = trimmedQuery.length > 0;

  const allHighlightsQuery = useHighlightsList(true);
  const ftsHighlightsQuery = useSearchHighlightsFts(trimmedQuery, isFtsActive);
  const updateHighlight = useUpdateHighlight();
  const deleteHighlight = useDeleteHighlight();

  const [colorFilter, setColorFilter] = useState<HighlightColor | 'all'>('all');
  const [itemFilter, setItemFilter] = useState<string>('all');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [highlightToDelete, setHighlightToDelete] =
    useState<HighlightWithItem | null>(null);

  const copyTimerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (copyTimerRef.current !== null) {
        window.clearTimeout(copyTimerRef.current);
      }
    };
  }, []);

  const allHighlights = allHighlightsQuery.data ?? [];

  const resourceOptions = useMemo(() => {
    const byId = new Map<string, { id: string; title: string }>();
    for (const h of allHighlights) {
      if (!byId.has(h.item_id)) {
        byId.set(h.item_id, { id: h.item_id, title: h.item_title });
      }
    }
    return Array.from(byId.values()).sort((a, b) =>
      a.title.localeCompare(b.title, 'es', { sensitivity: 'base' }),
    );
  }, [allHighlights]);

  const activeSourceList = isFtsActive
    ? (ftsHighlightsQuery.data ?? [])
    : allHighlights;

  const filteredHighlights = useMemo(() => {
    return activeSourceList.filter((entry) => {
      if (colorFilter !== 'all' && entry.color !== colorFilter) {
        return false;
      }
      if (itemFilter !== 'all' && entry.item_id !== itemFilter) {
        return false;
      }
      return true;
    });
  }, [activeSourceList, colorFilter, itemFilter]);

  const hasActiveFilters =
    searchText.trim().length > 0 ||
    colorFilter !== 'all' ||
    itemFilter !== 'all';

  function resetFilters() {
    setSearchText('');
    setColorFilter('all');
    setItemFilter('all');
  }

  async function handleCopyMarkdown(entry: HighlightWithItem) {
    const markdown = formatHighlightAsMarkdown({
      quote: entry.quote_text,
      note: entry.note_markdown,
      title: entry.item_title,
      author: entry.item_author,
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
      }, 1600);
    } catch {
      // Silenciar si el portapapeles no está disponible.
    }
  }

  if (allHighlightsQuery.isLoading) {
    return HIGHLIGHTS_LOADING_SKELETON;
  }

  if (allHighlights.length === 0) {
    return (
      <div className="px-6 py-16">
        <EmptyState
          icon={<Highlighter className="size-5" />}
          title="Sin subrayados guardados"
          description="Abre cualquier documento PDF de tu biblioteca en el visor integrado y selecciona un fragmento para guardar citas, subrayados de color y notas en Markdown."
        />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6 px-6 py-7">
      <section
        aria-label="Filtros y búsqueda de subrayados"
        className="space-y-3 rounded-xl border border-border bg-card/80 p-4"
      >
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="search"
              maxLength={256}
              aria-label="Buscar subrayados y notas con FTS5"
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              placeholder="Buscar citas o notas Markdown (FTS5)..."
              className="h-9 pr-8 pl-8.5 text-xs"
            />
            {searchText ? (
              <button
                type="button"
                aria-label="Limpiar búsqueda"
                onClick={() => setSearchText('')}
                className="absolute top-1/2 right-2.5 -translate-y-1/2 rounded-sm p-0.5 text-muted-foreground transition-colors hover:text-foreground"
              >
                <X className="size-3.5" />
              </button>
            ) : null}
          </div>

          <select
            aria-label="Filtrar por recurso"
            value={itemFilter}
            onChange={(e) => setItemFilter(e.target.value)}
            className="h-9 max-w-full rounded-md border border-input bg-background px-2.5 text-xs text-foreground outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40 sm:w-56"
          >
            <option value="all">
              Todos los recursos ({resourceOptions.length})
            </option>
            {resourceOptions.map((res) => (
              <option key={res.id} value={res.id}>
                {res.title}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2">
          <div
            role="group"
            aria-label="Filtrar por color"
            className="flex flex-wrap items-center gap-1.5"
          >
            <button
              type="button"
              aria-pressed={colorFilter === 'all'}
              onClick={() => setColorFilter('all')}
              className={cn(
                'rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors',
                colorFilter === 'all'
                  ? 'border-foreground/40 bg-secondary text-foreground'
                  : 'border-border bg-transparent text-muted-foreground hover:text-foreground',
              )}
            >
              Todos
            </button>

            {HIGHLIGHT_COLORS.map((color) => {
              const active = colorFilter === color;
              return (
                <button
                  key={color}
                  type="button"
                  aria-pressed={active}
                  onClick={() =>
                    setColorFilter((prev) => (prev === color ? 'all' : color))
                  }
                  className={cn(
                    'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors',
                    active
                      ? HIGHLIGHT_SOFT_BG_CLASS[color]
                      : 'border-border bg-transparent text-muted-foreground hover:text-foreground',
                  )}
                >
                  <span
                    aria-hidden="true"
                    className={cn('size-2 rounded-full', HIGHLIGHT_DOT_CLASS[color])}
                  />
                  <span>{HIGHLIGHT_COLOR_LABELS[color]}</span>
                </button>
              );
            })}
          </div>

          <div className="flex items-center gap-2">
            {isFtsActive && ftsHighlightsQuery.isFetching ? (
              <span className="font-mono text-[11px] text-muted-foreground">
                Buscando...
              </span>
            ) : null}
            <Badge
              variant="secondary"
              className="h-5 rounded-md px-2 font-mono text-[11px] font-normal tabular-nums text-muted-foreground"
            >
              {filteredHighlights.length}{' '}
              {filteredHighlights.length === 1 ? 'resultado' : 'resultados'}
            </Badge>
          </div>
        </div>
      </section>

      {filteredHighlights.length === 0 ? (
        <div className="py-10">
          <EmptyState
            icon={<Highlighter className="size-5" />}
            title="No hay subrayados que coincidan"
            description="Prueba con otros términos en el buscador FTS5 o limpia los filtros de color y recurso."
            actions={
              hasActiveFilters ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={resetFilters}
                >
                  Limpiar filtros
                </Button>
              ) : undefined
            }
          />
        </div>
      ) : (
        <div className="space-y-4">
          {filteredHighlights.map((entry) => {
            if (editingId === entry.id) {
              return (
                <HighlightEditorForm
                  key={`edit-${entry.id}`}
                  initialQuote={entry.quote_text}
                  initialNote={entry.note_markdown}
                  initialColor={entry.color}
                  initialPageNumber={entry.page_number}
                  submitLabel="Guardar cambios"
                  isPending={updateHighlight.isPending}
                  onSubmit={async (values) => {
                    await updateHighlight.mutateAsync({
                      id: entry.id,
                      itemId: entry.item_id,
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

            const canOpenLocally = isItemReadableLocally(
              entry.item_file_path,
              entry.item_file_format,
            );
            const unitLabel =
              entry.item_file_format === 'epub' ? 'cap.' : 'pág.';

            return (
              <article
                key={entry.id}
                className={cn(
                  'rounded-xl border border-border border-l-2 bg-card p-5 transition-colors [content-visibility:auto] [contain-intrinsic-size:auto_190px] hover:border-border/80',
                  HIGHLIGHT_BORDER_CLASS[entry.color],
                )}
              >
                <blockquote className="font-serif text-[17px] leading-relaxed text-foreground">
                  &ldquo;{entry.quote_text}&rdquo;
                </blockquote>

                {entry.note_markdown ? (
                  <div className="mt-3 border-t border-border/60 pt-3">
                    <MarkdownPreview content={entry.note_markdown} />
                  </div>
                ) : null}

                <footer className="mt-4 flex items-center justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        canOpenLocally
                          ? onOpenInReader(
                              entry.item_id,
                              entry.page_number ?? undefined,
                            )
                          : onOpenItem(entry.item_id)
                      }
                      title={
                        canOpenLocally
                          ? `Abrir en el lector ${entry.item_file_format.toUpperCase()}`
                          : 'Abrir ficha del recurso'
                      }
                      className="inline-flex min-w-0 items-center gap-1.5 truncate rounded-sm text-xs font-medium text-muted-foreground outline-none transition-colors hover:text-accent-brand focus-visible:text-accent-brand focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      {canOpenLocally ? (
                        <BookOpen className="size-3.5 shrink-0 text-accent-brand" />
                      ) : null}
                      <span className="truncate">{entry.item_title}</span>
                      {entry.item_author ? (
                        <span className="hidden truncate font-serif italic sm:inline">
                          — {entry.item_author}
                        </span>
                      ) : null}
                      {entry.page_number ? (
                        <span className="ml-1 shrink-0 font-mono text-[11px] text-muted-foreground/80">
                          {unitLabel} {entry.page_number}
                        </span>
                      ) : null}
                    </button>

                    {canOpenLocally ? (
                      <button
                        type="button"
                        onClick={() => onOpenItem(entry.item_id)}
                        className="inline-flex shrink-0 items-center gap-1 rounded-md border border-border/70 px-1.5 py-0.5 text-[10.5px] text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                      >
                        <FileText className="size-2.5" />
                        <span>Ficha</span>
                      </button>
                    ) : null}
                  </div>

                  <div className="flex shrink-0 items-center gap-1">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-xs"
                      aria-label="Copiar subrayado como Markdown"
                      title="Copiar como Markdown"
                      onClick={() => void handleCopyMarkdown(entry)}
                      className="text-muted-foreground hover:text-foreground"
                    >
                      {copiedId === entry.id ? (
                        <Check className="size-3.5 text-emerald-600 dark:text-emerald-400" />
                      ) : (
                        <Copy className="size-3.5" />
                      )}
                    </Button>

                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-xs"
                      aria-label="Editar subrayado"
                      title="Editar cita o nota"
                      onClick={() => setEditingId(entry.id)}
                      className="text-muted-foreground hover:text-foreground"
                    >
                      <Pencil className="size-3.5" />
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
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>
                </footer>
              </article>
            );
          })}
        </div>
      )}

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
    </div>
  );
}
