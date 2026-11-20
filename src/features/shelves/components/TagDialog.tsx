import { useState, type FormEvent } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/Dialog';
import { useCreateTag, useUpdateTag } from '@/features/shelves/hooks/useShelvesAndTags';
import { cn } from '@/lib/cn';
import type { TagWithCount } from '@/types/domain';

interface TagDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editingTag?: TagWithCount | null;
}

const TAG_SWATCHES = [
  '#d4a373',
  '#7d9b76',
  '#6d8aa6',
  '#b57468',
  '#9b8bb4',
  '#9a9186',
] as const;

function TagDialogForm({
  onOpenChange,
  editingTag,
}: Omit<TagDialogProps, 'open'>) {
  const createTag = useCreateTag();
  const updateTag = useUpdateTag();

  const [name, setName] = useState(editingTag?.name ?? '');
  const [color, setColor] = useState<string | null>(editingTag?.color ?? '#d4a373');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const isEditing = Boolean(editingTag);
  const isPending = createTag.isPending || updateTag.isPending;

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      setErrorMsg('Escribe un nombre para la etiqueta.');
      return;
    }

    setErrorMsg(null);
    try {
      if (editingTag) {
        await updateTag.mutateAsync({
          id: editingTag.id,
          patch: { name: trimmed, color },
        });
      } else {
        await createTag.mutateAsync({ name: trimmed, color });
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
          htmlFor="tag-name"
          className="block font-mono text-[11px] text-text-secondary"
        >
          Nombre
        </label>
        <input
          id="tag-name"
          type="text"
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Ej. local-first, arquitectura, ensayos..."
          className="w-full rounded border border-border-strong bg-bg-base px-3 py-2 text-xs text-text-primary placeholder:text-text-muted focus:border-accent/70 focus:outline-none"
        />
      </div>

      <div className="space-y-1.5">
        <span className="block font-mono text-[11px] text-text-secondary">
          Marcador visual
        </span>
        <div className="flex items-center gap-2">
          {TAG_SWATCHES.map((swatch) => (
            <button
              key={swatch}
              type="button"
              aria-label={`Color ${swatch}`}
              onClick={() => setColor(swatch)}
              className={cn(
                'h-5 w-5 rounded-full border transition-transform',
                color === swatch
                  ? 'scale-110 border-text-primary'
                  : 'border-transparent opacity-75 hover:opacity-100',
              )}
              style={{ backgroundColor: swatch }}
            />
          ))}
          <button
            type="button"
            onClick={() => setColor(null)}
            className={cn(
              'ml-1 rounded border px-2 py-0.5 font-mono text-[10px]',
              color === null
                ? 'border-accent/60 text-accent'
                : 'border-border-subtle text-text-muted hover:text-text-secondary',
            )}
          >
            Neutro
          </button>
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
              : 'Crear etiqueta'}
        </button>
      </DialogFooter>
    </form>
  );
}

export function TagDialog({
  open,
  onOpenChange,
  editingTag = null,
}: TagDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[min(92vw,420px)]">
        <DialogHeader>
          <DialogTitle>
            {editingTag ? 'Editar etiqueta' : 'Nueva etiqueta'}
          </DialogTitle>
          <DialogDescription>
            Las etiquetas cruzan estanterías para clasificar temas y lecturas.
          </DialogDescription>
        </DialogHeader>
        {open ? (
          <TagDialogForm
            key={editingTag?.id ?? 'new-tag'}
            onOpenChange={onOpenChange}
            editingTag={editingTag}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
