import {
  BookOpen,
  Check,
  ExternalLink,
  FolderOpen,
  Hash,
  ImageDown,
  Plus,
  Star,
  Trash2,
  Type,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { CoverImage } from '@/components/ui/cover-image';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { useAssetUrl } from '@/features/library/hooks/useAssetUrl';
import {
  useClearItemCover,
  useDeleteItem,
  useItemDetail,
  useOpenBookExternally,
  useRegenerateItemCover,
  useRevealBookInExplorer,
  useToggleItemFavorite,
  useUpdateItem,
} from '@/features/library/hooks/useLibraryData';
import {
  useCreateTag,
  useToggleItemShelf,
  useToggleItemTag,
} from '@/features/shelves/hooks/useShelvesAndTags';
import { isItemReadableLocally } from '@/lib/highlights';
import { getShelfBreadcrumb } from '@/lib/shelfTree';
import { ITEM_STATUS_LABELS, ITEM_TYPE_SINGULAR } from '@/lib/text';
import { cn } from '@/lib/utils';
import {
  ITEM_STATUSES,
  ITEM_TYPES,
  type ItemStatus,
  type ItemType,
  type LibraryItemWithRelations,
  type ShelfWithCount,
  type TagWithCount,
} from '@/types/domain';

interface ItemInspectorModalProps {
  itemId: string | null;
  shelves: ShelfWithCount[];
  tags: TagWithCount[];
  onClose: () => void;
  onOpenReader: (itemId: string, page?: number) => void;
}

const INSPECTOR_SKELETON = (
  <div role="status" aria-label="Cargando ficha" className="space-y-4 px-5 pb-6">
    <div className="flex gap-4 rounded-xl border border-border bg-secondary/40 p-3.5">
      <Skeleton className="h-28 w-20 shrink-0 rounded-md" />
      <div className="flex-1 space-y-2 py-1">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-5 w-4/5" />
        <Skeleton className="h-3 w-2/3" />
      </div>
    </div>
    <Skeleton className="h-9 w-full" />
    <Skeleton className="h-9 w-full" />
    <Skeleton className="h-24 w-full" />
  </div>
);

function InspectorBody({
  item,
  shelves,
  tags,
  onClose,
  onOpenReader,
}: {
  item: LibraryItemWithRelations;
  shelves: ShelfWithCount[];
  tags: TagWithCount[];
  onClose: () => void;
  onOpenReader: (itemId: string, page?: number) => void;
}) {
  const assetUrl = useAssetUrl(item.cover_path, item.updated_at);
  const updateItem = useUpdateItem();
  const deleteItem = useDeleteItem();
  const toggleFavorite = useToggleItemFavorite();
  const regenerateCover = useRegenerateItemCover();
  const clearCover = useClearItemCover();
  const openBook = useOpenBookExternally();
  const revealBook = useRevealBookInExplorer();
  const toggleShelf = useToggleItemShelf();
  const toggleTag = useToggleItemTag();
  const createTag = useCreateTag();

  const [title, setTitle] = useState(item.title);
  const [author, setAuthor] = useState(item.author);
  const [type, setType] = useState<ItemType>(item.type);
  const [status, setStatus] = useState<ItemStatus>(item.status);
  const [notes, setNotes] = useState(item.notes);
  const [newTagName, setNewTagName] = useState('');
  const [tagError, setTagError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [savedNotice, setSavedNotice] = useState(false);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const savedTimerRef = useRef<number | null>(null);
  const isSample = item.file_path.startsWith('sample/');
  const canReadLocally = isItemReadableLocally(item.file_path, item.file_format);
  const isEpub = item.file_format === 'epub';
  const readingPercent =
    item.page_count > 0 && item.current_page > 0
      ? Math.min(100, Math.round((item.current_page / item.page_count) * 100))
      : 0;

  useEffect(() => {
    return () => {
      if (savedTimerRef.current !== null) {
        window.clearTimeout(savedTimerRef.current);
      }
    };
  }, []);

  const shelfOptions = useMemo(() => {
    const shelfById = new Map(shelves.map((shelf) => [shelf.id, shelf]));
    return shelves.map((shelf) => ({
      shelf,
      label: getShelfBreadcrumb(shelf.id, shelfById).join(' / '),
    }));
  }, [shelves]);

  const assignedShelfIds = useMemo(() => new Set(item.shelf_ids), [item.shelf_ids]);
  const assignedTagIds = useMemo(() => new Set(item.tag_ids), [item.tag_ids]);

  const hasMetadataChanges =
    title.trim() !== item.title ||
    author.trim() !== item.author ||
    type !== item.type ||
    status !== item.status ||
    notes !== item.notes;

  async function handleSaveMetadata(event: FormEvent) {
    event.preventDefault();
    const trimmedTitle = title.trim();
    if (!trimmedTitle) return;

    await updateItem.mutateAsync({
      id: item.id,
      patch: {
        title: trimmedTitle,
        author: author.trim(),
        type,
        status,
        notes,
      },
    });
    setSavedNotice(true);
    if (savedTimerRef.current !== null) {
      window.clearTimeout(savedTimerRef.current);
    }
    savedTimerRef.current = window.setTimeout(() => {
      setSavedNotice(false);
      savedTimerRef.current = null;
    }, 1800);
  }

  async function handleQuickCreateTag() {
    const trimmed = newTagName.trim();
    if (!trimmed) return;
    setTagError(null);
    try {
      const created = await createTag.mutateAsync({ name: trimmed });
      await toggleTag.mutateAsync({
        itemId: item.id,
        tagId: created.id,
        assigned: false,
      });
      setNewTagName('');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setTagError(
        message.toLowerCase().includes('unique')
          ? `Ya existe una etiqueta llamada "${trimmed}".`
          : message,
      );
    }
  }

  return (
    <div className="space-y-6 px-5 pb-6">
      <div className="flex gap-4 rounded-xl border border-border bg-secondary/40 p-3.5">
        <div className="w-20 shrink-0">
          <CoverImage
            id={item.id}
            title={title || item.title}
            author={author}
            type={type}
            fileFormat={item.file_format}
            assetUrl={assetUrl}
          />
        </div>

        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge
              variant="secondary"
              className="rounded-md font-mono text-[10px] uppercase"
            >
              {item.file_format}
            </Badge>
            {item.page_count > 0 ? (
              <Badge
                variant="outline"
                className="rounded-md font-mono text-[10px] tabular-nums text-muted-foreground"
              >
                {item.current_page} / {item.page_count}{' '}
                {isEpub ? 'caps' : 'págs'}
              </Badge>
            ) : null}
          </div>
          <p className="line-clamp-2 font-sans text-sm font-semibold tracking-tight text-foreground">
            {title || item.title}
          </p>
          <p className="break-all font-mono text-[10.5px] text-muted-foreground">
            {item.file_path}
          </p>
          {item.page_count > 0 && item.current_page > 0 ? (
            <div className="flex items-center gap-2 pt-0.5">
              <div className="h-1 flex-1 overflow-hidden rounded-full bg-secondary">
                <div
                  className="h-full rounded-full bg-accent-brand"
                  style={{ width: `${readingPercent}%` }}
                />
              </div>
              <span className="font-mono text-[10px] tabular-nums text-muted-foreground">
                {readingPercent}%
              </span>
            </div>
          ) : null}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant={item.is_favorite === 1 ? 'secondary' : 'outline'}
          size="xs"
          disabled={toggleFavorite.isPending}
          aria-pressed={item.is_favorite === 1}
          onClick={() =>
            toggleFavorite.mutate({
              id: item.id,
              isFavorite: item.is_favorite !== 1,
            })
          }
          className={cn(
            item.is_favorite === 1 &&
              'border-amber-500/40 bg-amber-500/12 text-amber-700 hover:bg-amber-500/20 dark:border-amber-400/40 dark:bg-amber-400/15 dark:text-amber-300',
          )}
        >
          <Star
            className={cn(
              'size-3',
              item.is_favorite === 1 && 'fill-current',
            )}
          />
          {item.is_favorite === 1 ? 'Favorito' : 'Destacar'}
        </Button>
      </div>

      {!isSample ? (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            {canReadLocally ? (
              <Button
                type="button"
                variant="default"
                size="xs"
                onClick={() => onOpenReader(item.id)}
              >
                <BookOpen className="size-3" />
                {item.current_page > 1
                  ? `Continuar (${isEpub ? 'cap.' : 'pág.'} ${item.current_page})`
                  : isEpub
                    ? 'Leer EPUB'
                    : 'Leer PDF'}
              </Button>
            ) : null}

            <Button
              type="button"
              variant="outline"
              size="xs"
              disabled={openBook.isPending}
              onClick={() => {
                setActionError(null);
                void openBook.mutateAsync(item).catch((err: unknown) => {
                  setActionError(err instanceof Error ? err.message : String(err));
                });
              }}
            >
              <ExternalLink className="size-3" />
              Abrir externo
            </Button>

            <Button
              type="button"
              variant="outline"
              size="xs"
              disabled={revealBook.isPending}
              onClick={() => {
                setActionError(null);
                void revealBook.mutateAsync(item).catch((err: unknown) => {
                  setActionError(err instanceof Error ? err.message : String(err));
                });
              }}
            >
              <FolderOpen className="size-3" />
              En carpeta
            </Button>

            {item.cover_path ? (
              <Button
                type="button"
                variant="ghost"
                size="xs"
                disabled={clearCover.isPending}
                onClick={() => {
                  setActionError(null);
                  void clearCover.mutateAsync(item).catch((err: unknown) => {
                    setActionError(err instanceof Error ? err.message : String(err));
                  });
                }}
                className="text-muted-foreground hover:text-foreground"
              >
                <Type className="size-3" />
                Usar tipográfica
              </Button>
            ) : (
              <Button
                type="button"
                variant="ghost"
                size="xs"
                disabled={regenerateCover.isPending}
                onClick={() => {
                  setActionError(null);
                  void regenerateCover.mutateAsync(item).catch((err: unknown) => {
                    setActionError(err instanceof Error ? err.message : String(err));
                  });
                }}
                className="text-muted-foreground hover:text-foreground"
              >
                <ImageDown className="size-3" />
                {regenerateCover.isPending ? 'Extrayendo...' : 'Extraer portada'}
              </Button>
            )}
          </div>

          {actionError ? (
            <p role="alert" className="text-xs text-destructive">
              {actionError}
            </p>
          ) : null}
        </div>
      ) : null}

      <form onSubmit={(e) => void handleSaveMetadata(e)} className="space-y-3.5">
        <div className="space-y-1.5">
          <label
            htmlFor="inspector-title"
            className="block text-xs font-medium text-muted-foreground"
          >
            Título
          </label>
          <Input
            id="inspector-title"
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="h-9 text-sm"
          />
        </div>

        <div className="space-y-1.5">
          <label
            htmlFor="inspector-author"
            className="block text-xs font-medium text-muted-foreground"
          >
            Autor
          </label>
          <Input
            id="inspector-author"
            type="text"
            value={author}
            onChange={(e) => setAuthor(e.target.value)}
            placeholder="Sin autor"
            className="h-9 text-sm"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <label
              htmlFor="inspector-type"
              className="block text-xs font-medium text-muted-foreground"
            >
              Tipo de recurso
            </label>
            <select
              id="inspector-type"
              value={type}
              onChange={(e) => setType(e.target.value as ItemType)}
              className="h-9 w-full rounded-md border border-input bg-background px-2.5 text-sm text-foreground outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40"
            >
              {ITEM_TYPES.map((t) => (
                <option key={t} value={t}>
                  {ITEM_TYPE_SINGULAR[t]}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <label
              htmlFor="inspector-status"
              className="block text-xs font-medium text-muted-foreground"
            >
              Estado
            </label>
            <select
              id="inspector-status"
              value={status}
              onChange={(e) => setStatus(e.target.value as ItemStatus)}
              className="h-9 w-full rounded-md border border-input bg-background px-2.5 text-sm text-foreground outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40"
            >
              {ITEM_STATUSES.map((st) => (
                <option key={st} value={st}>
                  {ITEM_STATUS_LABELS[st]}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="space-y-1.5">
          <label
            htmlFor="inspector-notes"
            className="block text-xs font-medium text-muted-foreground"
          >
            Notas (indexadas en FTS5)
          </label>
          <Textarea
            id="inspector-notes"
            rows={3}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Resumen breve, ideas clave o contexto..."
            className="resize-none text-sm"
          />
        </div>

        <div className="flex items-center justify-between pt-1">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setConfirmDeleteOpen(true)}
            className="text-muted-foreground hover:bg-destructive/15 hover:text-destructive"
          >
            <Trash2 className="size-3.5" />
            Eliminar
          </Button>

          <div className="flex items-center gap-2.5">
            {savedNotice ? (
              <span
                role="status"
                aria-live="polite"
                className="font-mono text-xs text-emerald-600 dark:text-emerald-400"
              >
                Guardado
              </span>
            ) : null}
            <Button
              type="submit"
              size="sm"
              disabled={!hasMetadataChanges || !title.trim() || updateItem.isPending}
            >
              {updateItem.isPending ? 'Guardando...' : 'Guardar metadatos'}
            </Button>
          </div>
        </div>
      </form>

      <Separator />

      <div className="space-y-2.5">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
            Estanterías ({assignedShelfIds.size})
          </h3>
        </div>

        {shelfOptions.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            Crea una estantería en la barra lateral para organizar este recurso.
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
            {shelfOptions.map(({ shelf, label }) => {
              const checked = assignedShelfIds.has(shelf.id);
              return (
                <button
                  key={shelf.id}
                  type="button"
                  aria-pressed={checked}
                  onClick={() =>
                    toggleShelf.mutate({
                      itemId: item.id,
                      shelfId: shelf.id,
                      assigned: checked,
                    })
                  }
                  className={cn(
                    'flex items-center gap-2 rounded-md border px-2.5 py-2 text-left text-xs outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring',
                    checked
                      ? 'border-accent-brand/50 bg-accent-brand/10 text-foreground'
                      : 'border-border bg-secondary/40 text-muted-foreground hover:bg-secondary hover:text-foreground',
                  )}
                >
                  <span
                    aria-hidden="true"
                    className={cn(
                      'flex size-3.5 shrink-0 items-center justify-center rounded-sm border',
                      checked
                        ? 'border-accent-brand bg-accent-brand text-primary-foreground'
                        : 'border-border',
                    )}
                  >
                    {checked ? <Check className="size-2.5" /> : null}
                  </span>
                  <span className="truncate">{label}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      <Separator />

      <div className="space-y-2.5">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
            Etiquetas ({assignedTagIds.size})
          </h3>
          <div className="flex items-center gap-1.5">
            <Input
              type="text"
              aria-label="Nombre de nueva etiqueta"
              aria-invalid={Boolean(tagError)}
              aria-describedby={tagError ? 'inspector-tag-error' : undefined}
              value={newTagName}
              onChange={(e) => {
                setNewTagName(e.target.value);
                if (tagError) setTagError(null);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  void handleQuickCreateTag();
                }
              }}
              placeholder="Nueva etiqueta..."
              className="h-7 w-36 text-xs"
            />
            <Button
              type="button"
              variant="outline"
              size="icon-xs"
              aria-label="Añadir etiqueta"
              disabled={!newTagName.trim() || createTag.isPending}
              onClick={() => void handleQuickCreateTag()}
            >
              <Plus className="size-3.5" />
            </Button>
          </div>
        </div>

        {tagError ? (
          <p id="inspector-tag-error" role="alert" className="text-xs text-destructive">
            {tagError}
          </p>
        ) : null}

        <div className="flex flex-wrap gap-1.5">
          {tags.map((tag) => {
            const active = assignedTagIds.has(tag.id);
            return (
              <button
                key={tag.id}
                type="button"
                aria-pressed={active}
                onClick={() =>
                  toggleTag.mutate({
                    itemId: item.id,
                    tagId: tag.id,
                    assigned: active,
                  })
                }
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring',
                  active
                    ? 'border-accent-brand/55 bg-accent-brand/15 text-foreground'
                    : 'border-border bg-secondary/40 text-muted-foreground hover:bg-secondary hover:text-foreground',
                )}
              >
                <Hash className="size-3 text-muted-foreground" />
                {tag.color ? (
                  <span
                    aria-hidden="true"
                    className="size-1.5 rounded-full"
                    style={{ backgroundColor: tag.color }}
                  />
                ) : null}
                <span>{tag.name}</span>
              </button>
            );
          })}
          {tags.length === 0 ? (
            <span className="text-xs text-muted-foreground">
              Sin etiquetas creadas aún.
            </span>
          ) : null}
        </div>
      </div>

      <ConfirmDialog
        open={confirmDeleteOpen}
        onOpenChange={setConfirmDeleteOpen}
        title="Eliminar recurso"
        description={`Se eliminará "${item.title}" de la biblioteca local y del índice de búsqueda.`}
        isPending={deleteItem.isPending}
        onConfirm={async () => {
          await deleteItem.mutateAsync(item.id);
          setConfirmDeleteOpen(false);
          onClose();
        }}
      />
    </div>
  );
}

/**
 * Right-side slide-over inspector built on ShadcnSpace sheet-02 primitives.
 */
export function ItemInspectorModal({
  itemId,
  shelves,
  tags,
  onClose,
  onOpenReader,
}: ItemInspectorModalProps) {
  const detailQuery = useItemDetail(itemId);

  return (
    <Sheet
      open={Boolean(itemId)}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <SheetContent
        side="right"
        className="w-full gap-0 border-l border-border bg-card p-0 sm:max-w-[460px]"
      >
        <ScrollArea className="h-full">
          <SheetHeader className="px-5 pt-5 pb-4">
            <SheetTitle className="text-base font-semibold tracking-tight">
              Ficha del recurso
            </SheetTitle>
            <SheetDescription className="text-xs">
              Edita metadatos y asigna estanterías o etiquetas sin mover el archivo.
            </SheetDescription>
          </SheetHeader>

          {detailQuery.isLoading ? (
            INSPECTOR_SKELETON
          ) : detailQuery.data ? (
            <InspectorBody
              key={detailQuery.data.id}
              item={detailQuery.data}
              shelves={shelves}
              tags={tags}
              onClose={onClose}
              onOpenReader={onOpenReader}
            />
          ) : (
            <p className="px-5 py-10 text-center text-xs text-muted-foreground">
              No se encontró el recurso seleccionado.
            </p>
          )}
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}
