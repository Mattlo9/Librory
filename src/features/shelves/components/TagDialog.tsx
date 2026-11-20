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
  { value: '#818cf8', name: 'Índigo' },
  { value: '#6ee7b7', name: 'Esmeralda' },
  { value: '#38bdf8', name: 'Cielo' },
  { value: '#f472b6', name: 'Rosa' },
  { value: '#fbbf24', name: 'Ámbar' },
  { value: '#94a3b8', name: 'Pizarra' },
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
          aria-invalid={Boolean(errorMsg)}
          aria-describedby={errorMsg ? 'tag-form-error' : undefined}
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            if (errorMsg) setErrorMsg(null);
          }}
          placeholder="Ej. local-first, arquitectura, ensayos..."
          className="h-9 text-sm"
        />
      </div>

      <div className="space-y-2">
        <span
          id="tag-color-label"
          className="block text-xs font-medium text-muted-foreground"
        >
          Marcador visual
        </span>
        <div
          role="group"
          aria-labelledby="tag-color-label"
          className="flex items-center gap-2"
        >
          {TAG_SWATCHES.map((swatch) => (
            <button
              key={swatch.value}
              type="button"
              aria-label={`Color ${swatch.name}`}
              aria-pressed={color === swatch.value}
              onClick={() => setColor(swatch.value)}
              className={cn(
                'h-5 w-5 rounded-full border outline-none transition-transform focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
                color === swatch.value
                  ? 'scale-110 border-foreground ring-2 ring-ring/40'
                  : 'border-transparent opacity-70 hover:opacity-100',
              )}
              style={{ backgroundColor: swatch.value }}
            />
          ))}
          <Button
            type="button"
            variant={color === null ? 'secondary' : 'ghost'}
            size="xs"
            aria-pressed={color === null}
            onClick={() => setColor(null)}
            className="ml-1"
          >
            Neutro
          </Button>
        </div>
      </div>

      {errorMsg ? (
        <p id="tag-form-error" role="alert" className="text-xs text-destructive">
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
