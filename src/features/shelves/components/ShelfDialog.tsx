import { useMemo, useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
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

  const availableParentOptions = useMemo(() => {
    const blockedIds = editingShelf
      ? new Set(collectDescendantShelfIds(shelves, editingShelf.id))
      : new Set<string>();
    const shelfById = new Map(shelves.map((shelf) => [shelf.id, shelf]));

    return shelves
      .filter((shelf) => !blockedIds.has(shelf.id))
      .map((shelf) => ({
        id: shelf.id,
        label: getShelfBreadcrumb(shelf.id, shelfById).join(' / '),
      }));
  }, [shelves, editingShelf]);

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
          className="block text-xs font-medium text-muted-foreground"
        >
          Nombre
        </label>
        <Input
          id="shelf-name"
          type="text"
          autoFocus
          aria-invalid={Boolean(errorMsg)}
          aria-describedby={errorMsg ? 'shelf-form-error' : undefined}
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            if (errorMsg) setErrorMsg(null);
          }}
          placeholder="Ej. Dialogic Studio, Filosofía, Sistemas..."
          className="h-9 text-sm"
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <label
            htmlFor="shelf-category"
            className="block text-xs font-medium text-muted-foreground"
          >
            Categoría
          </label>
          <select
            id="shelf-category"
            value={category}
            onChange={(e) => setCategory(e.target.value as ShelfCategory)}
            className="h-9 w-full rounded-md border border-input bg-background px-2.5 text-sm text-foreground outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40"
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
            className="block text-xs font-medium text-muted-foreground"
          >
            Estantería padre
          </label>
          <select
            id="shelf-parent"
            value={parentId}
            onChange={(e) => setParentId(e.target.value)}
            className="h-9 w-full rounded-md border border-input bg-background px-2.5 text-sm text-foreground outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40"
          >
            <option value="">Ninguna (raíz)</option>
            {availableParentOptions.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {errorMsg ? (
        <p id="shelf-form-error" role="alert" className="text-xs text-destructive">
          {errorMsg}
        </p>
      ) : null}

      <DialogFooter className="pt-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => onOpenChange(false)}
        >
          Cancelar
        </Button>
        <Button type="submit" size="sm" disabled={isPending}>
          {isPending
            ? 'Guardando...'
            : isEditing
              ? 'Guardar cambios'
              : 'Crear estantería'}
        </Button>
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
      <DialogContent className="sm:max-w-[460px]">
        <DialogHeader>
          <DialogTitle className="tracking-tight">
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
