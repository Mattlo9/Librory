import { useState, type FormEvent } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/Dialog';
import {
  useCreateShelf,
  useUpdateShelf,
} from '@/features/shelves/hooks/useShelvesAndTags';
import { collectDescendantShelfIds, getShelfBreadcrumb } from '@/lib/shelfTree';
import { SHELF_CATEGORY_LABELS } from '@/lib/text';
import {
  SHELF_CATEGORIES,
  type ShelfCategory,
  type ShelfWithCount,
} from '@/types/domain';

interface ShelfDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  shelves: ShelfWithCount[];
  editingShelf?: ShelfWithCount | null;
  initialParentId?: string | null;
}

function ShelfDialogForm({
  onOpenChange,
  shelves,
  editingShelf,
  initialParentId,
}: Omit<ShelfDialogProps, 'open'>) {
  const createShelf = useCreateShelf();
  const updateShelf = useUpdateShelf();

  const [name, setName] = useState(editingShelf?.name ?? '');
  const [category, setCategory] = useState<ShelfCategory>(
    editingShelf?.category ?? 'custom',
  );
  const [parentId, setParentId] = useState<string>(
    editingShelf ? (editingShelf.parent_id ?? '') : (initialParentId ?? ''),
  );
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const isEditing = Boolean(editingShelf);
  const isPending = createShelf.isPending || updateShelf.isPending;

  const blockedIds = editingShelf
    ? new Set(collectDescendantShelfIds(shelves, editingShelf.id))
    : new Set<string>();

  const shelfById = new Map(shelves.map((shelf) => [shelf.id, shelf]));
  const availableParents = shelves.filter((shelf) => !blockedIds.has(shelf.id));

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      setErrorMsg('Escribe un nombre para la estantería.');
      return;
    }

    setErrorMsg(null);
    try {
      if (editingShelf) {
        await updateShelf.mutateAsync({
          id: editingShelf.id,
          patch: {
            name: trimmed,
            category,
            parent_id: parentId || null,
          },
        });
      } else {
        await createShelf.mutateAsync({
          name: trimmed,
          category,
          parent_id: parentId || null,
        });
      }
      onOpenChange(false);
    } catch (error) {
      setErrorMsg(error instanceof Error ? error.message : String(error));
    }
  }

  return (
    <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
      <div className="space-y-1.5">
        <label
          htmlFor="shelf-name"
          className="block font-mono text-[11px] text-text-secondary"
        >
          Nombre
        </label>
        <input
          id="shelf-name"
          type="text"
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Ej. Dialogic Studio, Filosofía, Sistemas..."
          className="w-full rounded border border-border-strong bg-bg-base px-3 py-2 text-xs text-text-primary placeholder:text-text-muted focus:border-accent/70 focus:outline-none"
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <label
            htmlFor="shelf-category"
            className="block font-mono text-[11px] text-text-secondary"
          >
            Categoría
          </label>
          <select
            id="shelf-category"
            value={category}
            onChange={(e) => setCategory(e.target.value as ShelfCategory)}
            className="w-full rounded border border-border-strong bg-bg-base px-2.5 py-2 text-xs text-text-primary focus:border-accent/70 focus:outline-none"
          >
            {SHELF_CATEGORIES.map((cat) => (
              <option key={cat} value={cat}>
                {SHELF_CATEGORY_LABELS[cat]}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-1.5">
          <label
            htmlFor="shelf-parent"
            className="block font-mono text-[11px] text-text-secondary"
          >
            Estantería padre
          </label>
          <select
            id="shelf-parent"
            value={parentId}
            onChange={(e) => setParentId(e.target.value)}
            className="w-full rounded border border-border-strong bg-bg-base px-2.5 py-2 text-xs text-text-primary focus:border-accent/70 focus:outline-none"
          >
            <option value="">Ninguna (raíz)</option>
            {availableParents.map((shelf) => (
              <option key={shelf.id} value={shelf.id}>
                {getShelfBreadcrumb(shelf.id, shelfById).join(' › ')}
              </option>
            ))}
          </select>
        </div>
      </div>

      {errorMsg ? (
        <p className="font-mono text-[11px] text-status-error">{errorMsg}</p>
      ) : null}

      <DialogFooter>
        <button
          type="button"
          onClick={() => onOpenChange(false)}
          className="rounded border border-border-subtle bg-bg-base px-3 py-1.5 font-mono text-xs text-text-secondary transition-colors hover:border-border-strong hover:text-text-primary"
        >
          Cancelar
        </button>
        <button
          type="submit"
          disabled={isPending}
          className="rounded border border-accent/50 bg-accent/15 px-3.5 py-1.5 font-mono text-xs text-accent transition-colors hover:bg-accent/25 disabled:opacity-50"
        >
          {isPending
            ? 'Guardando...'
            : isEditing
              ? 'Guardar cambios'
              : 'Crear estantería'}
        </button>
      </DialogFooter>
    </form>
  );
}

export function ShelfDialog({
  open,
  onOpenChange,
  shelves,
  editingShelf = null,
  initialParentId = null,
}: ShelfDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[min(92vw,460px)]">
        <DialogHeader>
          <DialogTitle>
            {editingShelf ? 'Editar estantería' : 'Nueva estantería'}
          </DialogTitle>
          <DialogDescription>
            Organiza tus recursos en jerarquías sin duplicar archivos físicos.
          </DialogDescription>
        </DialogHeader>
        {open ? (
          <ShelfDialogForm
            key={`${editingShelf?.id ?? 'new'}:${initialParentId ?? 'root'}`}
            onOpenChange={onOpenChange}
            shelves={shelves}
            editingShelf={editingShelf}
            initialParentId={initialParentId}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
