import {
  Check,
  CircleDot,
  FolderInput,
  ImageDown,
  Trash2,
  X,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  useBulkAssignItemsToShelf,
  useBulkDeleteItems,
  useBulkRemoveItemsFromShelf,
  useBulkUpdateItemsStatus,
  useRegenerateItemCover,
} from '@/features/library/hooks/useLibraryData';
import { getShelfBreadcrumb } from '@/lib/shelfTree';
import { ITEM_STATUS_LABELS } from '@/lib/text';
import { isSafeStoredBookPath } from '@/lib/validation';
import {
  ITEM_STATUSES,
  type LibraryItemWithRelations,
  type ShelfWithCount,
} from '@/types/domain';

interface BulkActionBarProps {
  selectedItems: LibraryItemWithRelations[];
  totalVisibleCount: number;
  shelves: ShelfWithCount[];
  onSelectAll: () => void;
  onClear: () => void;
  onDeletedIds: (ids: string[]) => void;
}

export function BulkActionBar({
  selectedItems,
  totalVisibleCount,
  shelves,
  onSelectAll,
  onClear,
  onDeletedIds,
}: BulkActionBarProps) {
  const bulkUpdateStatus = useBulkUpdateItemsStatus();
  const bulkAssignShelf = useBulkAssignItemsToShelf();
  const bulkRemoveShelf = useBulkRemoveItemsFromShelf();
  const bulkDelete = useBulkDeleteItems();
  const regenerateCover = useRegenerateItemCover();

  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [regenProgress, setRegenProgress] = useState<{
    current: number;
    total: number;
  } | null>(null);

  const selectedIds = useMemo(
    () => selectedItems.map((item) => item.id),
    [selectedItems],
  );
  const regeneratableItems = useMemo(
    () => selectedItems.filter((item) => isSafeStoredBookPath(item.file_path)),
    [selectedItems],
  );

  const shelfOptions = useMemo(() => {
    const shelfById = new Map(shelves.map((shelf) => [shelf.id, shelf]));
    return shelves.map((shelf) => {
      const allInShelf =
        selectedItems.length > 0 &&
        selectedItems.every((item) => item.shelf_ids.includes(shelf.id));
      return {
        shelf,
        label: getShelfBreadcrumb(shelf.id, shelfById).join(' / '),
        allInShelf,
      };
    });
  }, [selectedItems, shelves]);

  const isBusy =
    bulkUpdateStatus.isPending ||
    bulkAssignShelf.isPending ||
    bulkRemoveShelf.isPending ||
    bulkDelete.isPending ||
    regenProgress !== null;

  async function handleBulkRegenerateCovers() {
    if (regeneratableItems.length === 0 || regenProgress !== null) return;
    const total = regeneratableItems.length;
    setRegenProgress({ current: 0, total });
    try {
      for (let i = 0; i < total; i += 1) {
        const entry = regeneratableItems[i];
        if (!entry) continue;
        setRegenProgress({ current: i + 1, total });
        try {
          await regenerateCover.mutateAsync(entry);
        } catch (err) {
          console.error('Error regenerando portada:', entry.title, err);
        }
      }
    } finally {
      setRegenProgress(null);
    }
  }

  if (selectedItems.length === 0) {
    return null;
  }

  return (
    <>
      <div
        role="region"
        aria-label="Acciones en lote"
        className="fixed bottom-5 left-1/2 z-40 flex max-w-[92vw] -translate-x-1/2 flex-wrap items-center gap-2 rounded-xl border border-border bg-popover/95 px-3.5 py-2 shadow-2xl backdrop-blur-md"
      >
        <Badge
          variant="secondary"
          className="h-6 rounded-md px-2 font-mono text-[11px] font-medium tabular-nums"
        >
          {selectedItems.length}{' '}
          {selectedItems.length === 1 ? 'seleccionado' : 'seleccionados'}
        </Badge>

        {selectedItems.length < totalVisibleCount ? (
          <Button
            type="button"
            variant="ghost"
            size="xs"
            disabled={isBusy}
            onClick={onSelectAll}
            className="text-muted-foreground hover:text-foreground"
          >
            Todos ({totalVisibleCount})
          </Button>
        ) : null}

        <span aria-hidden="true" className="h-4 w-px bg-border" />

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="outline"
              size="xs"
              disabled={isBusy}
              className="gap-1.5"
            >
              <CircleDot className="size-3.5" />
              <span>Cambiar estado</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="center" side="top" className="w-44">
            <DropdownMenuLabel className="text-[11px] font-medium text-muted-foreground">
              Aplicar estado
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            {ITEM_STATUSES.map((status) => (
              <DropdownMenuItem
                key={status}
                className="text-xs"
                onSelect={() =>
                  void bulkUpdateStatus.mutateAsync({
                    ids: selectedIds,
                    status,
                  })
                }
              >
                {ITEM_STATUS_LABELS[status]}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="outline"
              size="xs"
              disabled={isBusy}
              className="gap-1.5"
            >
              <FolderInput className="size-3.5" />
              <span>Estantería</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="center"
            side="top"
            className="max-h-72 w-60 overflow-y-auto"
          >
            <DropdownMenuLabel className="text-[11px] font-medium text-muted-foreground">
              Mover o quitar de estantería
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            {shelfOptions.length === 0 ? (
              <p className="px-2 py-2 text-xs text-muted-foreground">
                No hay estanterías creadas aún.
              </p>
            ) : (
              shelfOptions.map(({ shelf, label, allInShelf }) => (
                <DropdownMenuItem
                  key={shelf.id}
                  className="justify-between gap-2 text-xs"
                  onSelect={() => {
                    if (allInShelf) {
                      void bulkRemoveShelf.mutateAsync({
                        itemIds: selectedIds,
                        shelfId: shelf.id,
                      });
                    } else {
                      void bulkAssignShelf.mutateAsync({
                        itemIds: selectedIds,
                        shelfId: shelf.id,
                      });
                    }
                  }}
                >
                  <span className="truncate">{label}</span>
                  {allInShelf ? (
                    <Check className="size-3.5 shrink-0 text-accent-brand" />
                  ) : null}
                </DropdownMenuItem>
              ))
            )}
          </DropdownMenuContent>
        </DropdownMenu>

        {regeneratableItems.length > 0 ? (
          <Button
            type="button"
            variant="outline"
            size="xs"
            disabled={isBusy}
            title="Regenerar portadas seleccionadas en mayor nitidez (640px WebP)"
            onClick={() => void handleBulkRegenerateCovers()}
            className="gap-1.5"
          >
            <ImageDown className="size-3.5" />
            <span>
              {regenProgress
                ? `Optimizando ${regenProgress.current}/${regenProgress.total}...`
                : 'Optimizar portadas'}
            </span>
          </Button>
        ) : null}

        <Button
          type="button"
          variant="destructive"
          size="xs"
          disabled={isBusy}
          onClick={() => setConfirmDeleteOpen(true)}
          className="gap-1.5"
        >
          <Trash2 className="size-3.5" />
          <span>Eliminar</span>
        </Button>

        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          aria-label="Cancelar selección"
          title="Cancelar selección (Esc)"
          disabled={isBusy}
          onClick={onClear}
          className="text-muted-foreground hover:text-foreground"
        >
          <X className="size-3.5" />
        </Button>
      </div>

      <ConfirmDialog
        open={confirmDeleteOpen}
        onOpenChange={(open) => {
          if (!open && !bulkDelete.isPending) {
            setConfirmDeleteOpen(false);
          }
        }}
        title={`Eliminar ${selectedItems.length} ${
          selectedItems.length === 1 ? 'recurso' : 'recursos'
        }`}
        description={`Se eliminarán ${selectedItems.length} ${
          selectedItems.length === 1
            ? 'recurso seleccionado'
            : 'recursos seleccionados'
        } de la biblioteca local y del índice de búsqueda.`}
        isPending={bulkDelete.isPending}
        onConfirm={async () => {
          await bulkDelete.mutateAsync(selectedIds);
          onDeletedIds(selectedIds);
          setConfirmDeleteOpen(false);
          onClear();
        }}
      />
    </>
  );
}
