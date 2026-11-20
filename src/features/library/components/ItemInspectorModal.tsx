import { Check, Hash, Plus, Trash2 } from 'lucide-react';
import { useMemo, useState, type FormEvent } from 'react';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { CoverImage } from '@/components/ui/CoverImage';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/Dialog';
import { useAssetUrl } from '@/features/library/hooks/useAssetUrl';
import {
  useDeleteItem,
  useItemDetail,
  useUpdateItem,
} from '@/features/library/hooks/useLibraryData';
import {
  useCreateTag,
  useToggleItemShelf,
  useToggleItemTag,
} from '@/features/shelves/hooks/useShelvesAndTags';
import { cn } from '@/lib/cn';
import { getShelfBreadcrumb } from '@/lib/shelfTree';
import { ITEM_STATUS_LABELS, ITEM_TYPE_SINGULAR } from '@/lib/text';
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
}

function InspectorBody({
  item,
  shelves,
  tags,
  onClose,
}: {
  item: LibraryItemWithRelations;
  shelves: ShelfWithCount[];
  tags: TagWithCount[];
  onClose: () => void;
}) {
  const assetUrl = useAssetUrl(item.cover_path);
  const updateItem = useUpdateItem();
  const deleteItem = useDeleteItem();
  const toggleShelf = useToggleItemShelf();
  const toggleTag = useToggleItemTag();
  const createTag = useCreateTag();

  const [title, setTitle] = useState(item.title);
  const [author, setAuthor] = useState(item.author);
  const [type, setType] = useState<ItemType>(item.type);
  const [status, setStatus] = useState<ItemStatus>(item.status);
  const [notes, setNotes] = useState(item.notes);
  const [newTagName, setNewTagName] = useState('');
  const [savedNotice, setSavedNotice] = useState(false);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);

  const shelfById = useMemo(
    () => new Map(shelves.map((shelf) => [shelf.id, shelf])),
    [shelves],
  );

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
    setTimeout(() => setSavedNotice(false), 1800);
  }

  async function handleQuickCreateTag() {
    const trimmed = newTagName.trim();
    if (!trimmed) return;
    const created = await createTag.mutateAsync({ name: trimmed });
    await toggleTag.mutateAsync({
      itemId: item.id,
      tagId: created.id,
      assigned: false,
    });
    setNewTagName('');
  }

  return (
    <div className="space-y-5">
      <div className="flex gap-4">
        <div className="w-24 shrink-0">
          <CoverImage
            id={item.id}
            title={title || item.title}
            author={author}
            type={type}
            fileFormat={item.file_format}
            assetUrl={assetUrl}
            width={96}
          />
        </div>

        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex flex-wrap items-center gap-2 font-mono text-[10.5px] uppercase text-text-muted">
            <span className="rounded border border-border-subtle bg-bg-base px-1.5 py-0.5 text-text-secondary">
              {item.file_format}
            </span>
            {item.page_count > 0 ? (
              <span>
                Página {item.current_page} / {item.page_count}
              </span>
            ) : null}
          </div>
          <p className="break-all font-mono text-[11px] text-text-muted">
            {item.file_path}
          </p>
        </div>
      </div>

      <form onSubmit={(e) => void handleSaveMetadata(e)} className="space-y-3">
        <div className="space-y-1">
          <label
            htmlFor="inspector-title"
            className="block font-mono text-[11px] text-text-secondary"
          >
            Título
          </label>
          <input
            id="inspector-title"
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full rounded border border-border-strong bg-bg-base px-3 py-1.5 text-xs text-text-primary focus:border-accent/70 focus:outline-none"
          />
        </div>

        <div className="space-y-1">
          <label
            htmlFor="inspector-author"
            className="block font-mono text-[11px] text-text-secondary"
          >
            Autor
          </label>
          <input
            id="inspector-author"
            type="text"
            value={author}
            onChange={(e) => setAuthor(e.target.value)}
            placeholder="Sin autor"
            className="w-full rounded border border-border-strong bg-bg-base px-3 py-1.5 text-xs text-text-primary placeholder:text-text-muted focus:border-accent/70 focus:outline-none"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <label
              htmlFor="inspector-type"
              className="block font-mono text-[11px] text-text-secondary"
            >
              Tipo de recurso
            </label>
            <select
              id="inspector-type"
              value={type}
              onChange={(e) => setType(e.target.value as ItemType)}
              className="w-full rounded border border-border-strong bg-bg-base px-2.5 py-1.5 text-xs text-text-primary focus:border-accent/70 focus:outline-none"
            >
              {ITEM_TYPES.map((t) => (
                <option key={t} value={t}>
                  {ITEM_TYPE_SINGULAR[t]}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1">
            <label
              htmlFor="inspector-status"
              className="block font-mono text-[11px] text-text-secondary"
            >
              Estado
            </label>
            <select
              id="inspector-status"
              value={status}
              onChange={(e) => setStatus(e.target.value as ItemStatus)}
              className="w-full rounded border border-border-strong bg-bg-base px-2.5 py-1.5 text-xs text-text-primary focus:border-accent/70 focus:outline-none"
            >
              {ITEM_STATUSES.map((st) => (
                <option key={st} value={st}>
                  {ITEM_STATUS_LABELS[st]}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="space-y-1">
          <label
            htmlFor="inspector-notes"
            className="block font-mono text-[11px] text-text-secondary"
          >
            Notas (indexadas en FTS5)
          </label>
          <textarea
            id="inspector-notes"
            rows={3}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Resumen breve, ideas clave o contexto..."
            className="w-full resize-none rounded border border-border-strong bg-bg-base px-3 py-2 text-xs text-text-primary placeholder:text-text-muted focus:border-accent/70 focus:outline-none"
          />
        </div>

        <div className="flex items-center justify-between pt-1">
          <button
            type="button"
            onClick={() => setConfirmDeleteOpen(true)}
            className="inline-flex items-center gap-1.5 rounded border border-border-subtle px-2.5 py-1 font-mono text-[11px] text-text-muted transition-colors hover:border-status-error/50 hover:text-status-error"
          >
            <Trash2 className="h-3 w-3" />
            Eliminar
          </button>

          <div className="flex items-center gap-2">
            {savedNotice ? (
              <span className="font-mono text-[11px] text-status-ok">
                Guardado
              </span>
            ) : null}
            <button
              type="submit"
              disabled={!hasMetadataChanges || !title.trim() || updateItem.isPending}
              className="rounded border border-accent/50 bg-accent/15 px-3 py-1 font-mono text-xs text-accent transition-colors hover:bg-accent/25 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {updateItem.isPending ? 'Guardando...' : 'Guardar metadatos'}
            </button>
          </div>
        </div>
      </form>

      <div className="space-y-2 border-t border-border-subtle pt-4">
        <h3 className="font-mono text-[11px] uppercase tracking-wider text-text-muted">
          Estanterías ({assignedShelfIds.size})
        </h3>
        {shelves.length === 0 ? (
          <p className="text-xs text-text-muted">
            Crea una estantería en la barra lateral para organizar este recurso.
          </p>
        ) : (
          <div className="scrollbar-subtle grid max-h-36 grid-cols-1 gap-1 overflow-y-auto pr-1 sm:grid-cols-2">
            {shelves.map((shelf) => {
              const checked = assignedShelfIds.has(shelf.id);
              const label = getShelfBreadcrumb(shelf.id, shelfById).join(' › ');
              return (
                <button
                  key={shelf.id}
                  type="button"
                  onClick={() =>
                    toggleShelf.mutate({
                      itemId: item.id,
                      shelfId: shelf.id,
                      assigned: checked,
                    })
                  }
                  className={cn(
                    'flex items-center gap-2 rounded border px-2.5 py-1.5 text-left font-mono text-[11px] transition-colors',
                    checked
                      ? 'border-accent/50 bg-accent/10 text-text-primary'
                      : 'border-border-subtle bg-bg-base/60 text-text-secondary hover:border-border-strong hover:text-text-primary',
                  )}
                >
                  <span
                    className={cn(
                      'flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-sm border',
                      checked
                        ? 'border-accent bg-accent text-bg-base'
                        : 'border-border-strong',
                    )}
                  >
                    {checked ? <Check className="h-2.5 w-2.5" /> : null}
                  </span>
                  <span className="truncate">{label}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      <div className="space-y-2 border-t border-border-subtle pt-4">
        <div className="flex items-center justify-between gap-2">
          <h3 className="font-mono text-[11px] uppercase tracking-wider text-text-muted">
            Etiquetas ({assignedTagIds.size})
          </h3>
          <div className="flex items-center gap-1">
            <input
              type="text"
              value={newTagName}
              onChange={(e) => setNewTagName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  void handleQuickCreateTag();
                }
              }}
              placeholder="Nueva etiqueta..."
              className="w-32 rounded border border-border-subtle bg-bg-base px-2 py-0.5 font-mono text-[11px] text-text-primary placeholder:text-text-muted focus:border-accent/60 focus:outline-none"
            />
            <button
              type="button"
              aria-label="Añadir etiqueta"
              disabled={!newTagName.trim() || createTag.isPending}
              onClick={() => void handleQuickCreateTag()}
              className="rounded border border-border-subtle bg-bg-base p-1 text-text-secondary hover:border-border-strong hover:text-text-primary disabled:opacity-40"
            >
              <Plus className="h-3 w-3" />
            </button>
          </div>
        </div>

        <div className="flex flex-wrap gap-1.5">
          {tags.map((tag) => {
            const active = assignedTagIds.has(tag.id);
            return (
              <button
                key={tag.id}
                type="button"
                onClick={() =>
                  toggleTag.mutate({
                    itemId: item.id,
                    tagId: tag.id,
                    assigned: active,
                  })
                }
                className={cn(
                  'inline-flex items-center gap-1 rounded border px-2 py-0.5 font-mono text-[11px] transition-colors',
                  active
                    ? 'border-accent/55 bg-accent/15 text-text-primary'
                    : 'border-border-subtle bg-bg-base/70 text-text-secondary hover:border-border-strong hover:text-text-primary',
                )}
              >
                <Hash className="h-2.5 w-2.5 text-text-muted" />
                {tag.color ? (
                  <span
                    className="h-1.5 w-1.5 rounded-full"
                    style={{ backgroundColor: tag.color }}
                  />
                ) : null}
                <span>{tag.name}</span>
              </button>
            );
          })}
          {tags.length === 0 ? (
            <span className="text-xs text-text-muted">Sin etiquetas creadas aún.</span>
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

export function ItemInspectorModal({
  itemId,
  shelves,
  tags,
  onClose,
}: ItemInspectorModalProps) {
  const detailQuery = useItemDetail(itemId);

  return (
    <Dialog
      open={Boolean(itemId)}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="scrollbar-subtle max-h-[88vh] w-[min(94vw,600px)] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Ficha del recurso</DialogTitle>
          <DialogDescription>
            Edita metadatos y asigna estanterías o etiquetas sin mover el archivo.
          </DialogDescription>
        </DialogHeader>

        {detailQuery.isLoading ? (
          <p className="py-8 text-center font-mono text-xs text-text-muted">
            Cargando ficha...
          </p>
        ) : detailQuery.data ? (
          <InspectorBody
            key={detailQuery.data.id}
            item={detailQuery.data}
            shelves={shelves}
            tags={tags}
            onClose={onClose}
          />
        ) : (
          <p className="py-8 text-center font-mono text-xs text-text-muted">
            No se encontró el recurso seleccionado.
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}
