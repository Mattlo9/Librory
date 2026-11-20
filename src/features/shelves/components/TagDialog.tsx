import { useState, type FormEvent } from 'react';
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
import { useCreateTag, useUpdateTag } from '@/features/shelves/hooks/useShelvesAndTags';
import { cn } from '@/lib/utils';
import type { TagWithCount } from '@/types/domain';

interface TagDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editingTag?: TagWithCount | null;
}

const TAG_SWATCHES = [
  '#818cf8',
  '#6ee7b7',
  '#38bdf8',
  '#f472b6',
  '#fbbf24',
  '#94a3b8',
] as const;

function TagDialogForm({
  onOpenChange,
  editingTag,
}: Omit<TagDialogProps, 'open'>) {
  const createTag = useCreateTag();
  const updateTag = useUpdateTag();

  const [name, setName] = useState(editingTag?.name ?? '');
  const [color, setColor] = useState<string | null>(editingTag?.color ?? '#818cf8');
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
          className="block text-xs font-medium text-muted-foreground"
        >
          Nombre
        </label>
        <Input
          id="tag-name"
          type="text"
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Ej. local-first, arquitectura, ensayos..."
          className="h-9 text-sm"
        />
      </div>

      <div className="space-y-2">
        <span className="block text-xs font-medium text-muted-foreground">
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
                  ? 'scale-110 border-foreground ring-2 ring-ring/40'
                  : 'border-transparent opacity-70 hover:opacity-100',
              )}
              style={{ backgroundColor: swatch }}
            />
          ))}
          <Button
            type="button"
            variant={color === null ? 'secondary' : 'ghost'}
            size="xs"
            onClick={() => setColor(null)}
            className="ml-1"
          >
            Neutro
          </Button>
        </div>
      </div>

      {errorMsg ? (
        <p className="text-xs text-destructive">{errorMsg}</p>
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
              : 'Crear etiqueta'}
        </Button>
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
      <DialogContent className="sm:max-w-[420px]">
        <DialogHeader>
          <DialogTitle className="tracking-tight">
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
