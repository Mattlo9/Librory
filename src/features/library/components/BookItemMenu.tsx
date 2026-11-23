import {
  BookOpen,
  CheckSquare,
  CircleDot,
  ExternalLink,
  MoreHorizontal,
  Pencil,
  Star,
  Trash2,
} from 'lucide-react';
import { type ComponentType, type ReactNode } from 'react';
import {
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuRadioGroup,
  ContextMenuRadioItem,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
} from '@/components/ui/context-menu';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { isPdfReadableLocally } from '@/lib/highlights';
import { ITEM_STATUS_LABELS } from '@/lib/text';
import { cn } from '@/lib/utils';
import {
  ITEM_STATUSES,
  type ItemStatus,
  type LibraryItemWithRelations,
} from '@/types/domain';

export interface BookItemActions {
  onSelect: (id: string) => void;
  onOpenReader?: (id: string) => void;
  onOpenExternally: (item: LibraryItemWithRelations) => void;
  onChangeStatus: (item: LibraryItemWithRelations, status: ItemStatus) => void;
  onToggleFavorite: (item: LibraryItemWithRelations) => void;
  onRequestDelete: (item: LibraryItemWithRelations) => void;
  onToggleSelect?: (id: string, shiftKey: boolean) => void;
}

interface MenuPrimitives {
  Item: ComponentType<{
    variant?: 'default' | 'destructive';
    className?: string;
    onSelect?: (event: Event) => void;
    children?: ReactNode;
  }>;
  Separator: ComponentType<{ className?: string }>;
  Sub: ComponentType<{ children?: ReactNode }>;
  SubTrigger: ComponentType<{ className?: string; children?: ReactNode }>;
  SubContent: ComponentType<{ className?: string; children?: ReactNode }>;
  RadioGroup: ComponentType<{
    value?: string;
    onValueChange?: (value: string) => void;
    children?: ReactNode;
  }>;
  RadioItem: ComponentType<{
    value: string;
    className?: string;
    children?: ReactNode;
  }>;
}

const CONTEXT_PRIMITIVES: MenuPrimitives = {
  Item: ContextMenuItem,
  Separator: ContextMenuSeparator,
  Sub: ContextMenuSub,
  SubTrigger: ContextMenuSubTrigger,
  SubContent: ContextMenuSubContent,
  RadioGroup: ContextMenuRadioGroup,
  RadioItem: ContextMenuRadioItem,
};

const DROPDOWN_PRIMITIVES: MenuPrimitives = {
  Item: DropdownMenuItem,
  Separator: DropdownMenuSeparator,
  Sub: DropdownMenuSub,
  SubTrigger: DropdownMenuSubTrigger,
  SubContent: DropdownMenuSubContent,
  RadioGroup: DropdownMenuRadioGroup,
  RadioItem: DropdownMenuRadioItem,
};

function BookMenuBody({
  item,
  actions,
  ui,
}: {
  item: LibraryItemWithRelations;
  actions: BookItemActions;
  ui: MenuPrimitives;
}) {
  const canReadLocally = isPdfReadableLocally(item.file_path, item.file_format);
  const isSample = item.file_path.startsWith('sample/');
  const isFavorite = item.is_favorite === 1;

  return (
    <>
      {canReadLocally && actions.onOpenReader ? (
        <ui.Item
          className="text-xs"
          onSelect={() => actions.onOpenReader?.(item.id)}
        >
          <BookOpen className="size-3.5" />
          <span>Leer en lector integrado</span>
        </ui.Item>
      ) : null}

      {!isSample ? (
        <ui.Item
          className="text-xs"
          onSelect={() => actions.onOpenExternally(item)}
        >
          <ExternalLink className="size-3.5" />
          <span>Abrir en app externa</span>
        </ui.Item>
      ) : null}

      <ui.Item className="text-xs" onSelect={() => actions.onSelect(item.id)}>
        <Pencil className="size-3.5" />
        <span>Ver / editar ficha</span>
      </ui.Item>

      <ui.Item
        className="text-xs"
        onSelect={() => actions.onToggleFavorite(item)}
      >
        <Star
          className={cn(
            'size-3.5',
            isFavorite &&
              'fill-amber-500 text-amber-500 dark:fill-amber-400 dark:text-amber-400',
          )}
        />
        <span>{isFavorite ? 'Quitar de favoritos' : 'Añadir a favoritos'}</span>
      </ui.Item>

      {actions.onToggleSelect ? (
        <ui.Item
          className="text-xs"
          onSelect={() => actions.onToggleSelect?.(item.id, false)}
        >
          <CheckSquare className="size-3.5" />
          <span>Seleccionar</span>
        </ui.Item>
      ) : null}

      <ui.Separator />

      <ui.Sub>
        <ui.SubTrigger className="text-xs">
          <CircleDot className="size-3.5" />
          <span>Cambiar estado</span>
        </ui.SubTrigger>
        <ui.SubContent className="w-44">
          <ui.RadioGroup
            value={item.status}
            onValueChange={(value) => {
              const nextStatus = value as ItemStatus;
              if (nextStatus !== item.status) {
                actions.onChangeStatus(item, nextStatus);
              }
            }}
          >
            {ITEM_STATUSES.map((status) => (
              <ui.RadioItem key={status} value={status} className="text-xs">
                {ITEM_STATUS_LABELS[status]}
              </ui.RadioItem>
            ))}
          </ui.RadioGroup>
        </ui.SubContent>
      </ui.Sub>

      <ui.Separator />

      <ui.Item
        variant="destructive"
        className="text-xs"
        onSelect={() => actions.onRequestDelete(item)}
      >
        <Trash2 className="size-3.5" />
        <span>Eliminar</span>
      </ui.Item>
    </>
  );
}

/** Right-click context menu content for a book item. */
export function BookContextMenuContent({
  item,
  actions,
}: {
  item: LibraryItemWithRelations;
  actions: BookItemActions;
}) {
  return (
    <ContextMenuContent
      className="w-52"
      onClick={(e) => e.stopPropagation()}
    >
      <BookMenuBody item={item} actions={actions} ui={CONTEXT_PRIMITIVES} />
    </ContextMenuContent>
  );
}

/** Hover/focus `...` dropdown button for a book item. */
export function BookDropdownMenu({
  item,
  actions,
  triggerClassName,
}: {
  item: LibraryItemWithRelations;
  actions: BookItemActions;
  triggerClassName: string;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={`Opciones de ${item.title}`}
          title="Opciones"
          onClick={(e) => e.stopPropagation()}
          className={triggerClassName}
        >
          <MoreHorizontal className="size-3.5" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="w-52"
        onClick={(e) => e.stopPropagation()}
      >
        <BookMenuBody item={item} actions={actions} ui={DROPDOWN_PRIMITIVES} />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
