import { Check, Star } from 'lucide-react';
import { memo, useMemo, type MouseEvent } from 'react';
import { Badge } from '@/components/ui/badge';
import {
  ContextMenu,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
import { CoverImage } from '@/components/ui/cover-image';
import {
  BookContextMenuContent,
  BookDropdownMenu,
  type BookItemActions,
} from '@/features/library/components/BookItemMenu';
import { useAssetUrl } from '@/features/library/hooks/useAssetUrl';
import { isPdfReadableLocally } from '@/lib/highlights';
import { ITEM_STATUS_LABELS, ITEM_TYPE_SINGULAR } from '@/lib/text';
import { cn } from '@/lib/utils';
import type {
  LibraryItemWithRelations,
  ShelfWithCount,
  TagWithCount,
} from '@/types/domain';

interface BookListViewProps {
  items: LibraryItemWithRelations[];
  shelves: ShelfWithCount[];
  tags: TagWithCount[];
  bookActions: BookItemActions;
  selectedIdsSet: ReadonlySet<string>;
  selectionActive: boolean;
}

interface BookListRowProps {
  item: LibraryItemWithRelations;
  shelfNameById: Map<string, string>;
  tagNameById: Map<string, string>;
  actions: BookItemActions;
  selected: boolean;
  selectionActive: boolean;
}

function takeResolvedNames(
  ids: string[],
  nameMap: Map<string, string>,
  limit: number,
): string[] {
  const result: string[] = [];
  for (const id of ids) {
    const name = nameMap.get(id);
    if (name) {
      result.push(name);
      if (result.length >= limit) break;
    }
  }
  return result;
}

const BookListRow = memo(function BookListRow({
  item,
  shelfNameById,
  tagNameById,
  actions,
  selected,
  selectionActive,
}: BookListRowProps) {
  const assetUrl = useAssetUrl(item.cover_path, item.updated_at);
  const shelfNames = takeResolvedNames(item.shelf_ids, shelfNameById, 2);
  const tagNames = takeResolvedNames(item.tag_ids, tagNameById, 2);
  const canReadLocally = isPdfReadableLocally(item.file_path, item.file_format);
  const isFavorite = item.is_favorite === 1;
  const readingPercent =
    item.page_count > 0 && item.current_page > 0
      ? Math.min(100, Math.round((item.current_page / item.page_count) * 100))
      : 0;

  const handleRowClick = (event: MouseEvent) => {
    if (
      (selectionActive || event.ctrlKey || event.metaKey || event.shiftKey) &&
      actions.onToggleSelect
    ) {
      event.preventDefault();
      actions.onToggleSelect(item.id, event.shiftKey);
      return;
    }
    actions.onSelect(item.id);
  };

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div
          className={cn(
            'group grid w-full grid-cols-[24px_40px_minmax(0,2fr)_minmax(0,1.3fr)_120px_100px_110px_64px] items-center gap-4 rounded-lg px-3 py-2.5 text-left transition-colors [content-visibility:auto] [contain-intrinsic-size:64px]',
            selected
              ? 'bg-accent-brand/10 ring-1 ring-inset ring-accent-brand/40 hover:bg-accent-brand/15'
              : 'hover:bg-secondary/70 focus-within:bg-secondary/70',
          )}
        >
          <div className="flex justify-center">
            {actions.onToggleSelect ? (
              <button
                type="button"
                role="checkbox"
                aria-checked={selected}
                aria-label={
                  selected
                    ? `Deseleccionar ${item.title}`
                    : `Seleccionar ${item.title}`
                }
                onClick={(e) => {
                  e.stopPropagation();
                  actions.onToggleSelect?.(item.id, e.shiftKey);
                }}
                className={cn(
                  'flex size-5 items-center justify-center rounded border outline-none transition-all focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-ring',
                  selected
                    ? 'border-accent-brand bg-accent-brand text-white opacity-100'
                    : selectionActive
                      ? 'border-border bg-background text-transparent opacity-100 hover:border-accent-brand/70'
                      : 'border-border bg-background text-transparent opacity-0 hover:border-accent-brand/70 group-hover:opacity-100 group-focus-within:opacity-100',
                )}
              >
                <Check className="size-3 stroke-[2.5]" />
              </button>
            ) : null}
          </div>
          <button
            type="button"
            onClick={handleRowClick}
            onDoubleClick={
              !selectionActive && canReadLocally && actions.onOpenReader
                ? () => actions.onOpenReader?.(item.id)
                : undefined
            }
            title={
              selectionActive
                ? 'Clic para seleccionar · Shift+Clic para rango'
                : canReadLocally
                  ? 'Clic para ver ficha · Doble clic para leer PDF'
                  : undefined
            }
            className="col-span-6 grid grid-cols-subgrid items-center gap-4 rounded-md text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <div className="w-10 shrink-0">
              <CoverImage
                id={item.id}
                title={item.title}
                author={item.author}
                type={item.type}
                fileFormat={item.file_format}
                assetUrl={assetUrl}
                compact
              />
            </div>

            <div className="min-w-0">
              <p className="truncate font-sans text-[13px] font-medium tracking-tight text-foreground transition-colors group-hover:text-accent-brand group-focus-within:text-accent-brand">
                {item.title}
              </p>
              <p className="mt-0.5 truncate font-serif text-[12px] italic text-muted-foreground">
                {item.author || 'Sin autor'}
              </p>
            </div>

            <div className="flex min-w-0 flex-wrap gap-1">
              {shelfNames.map((name) => (
                <Badge
                  key={name}
                  variant="secondary"
                  className="max-w-[130px] truncate rounded-md px-1.5 py-0.5 text-[10.5px] font-normal text-secondary-foreground/90"
                >
                  {name}
                </Badge>
              ))}
              {tagNames.map((name) => (
                <Badge
                  key={name}
                  variant="outline"
                  className="max-w-[100px] truncate rounded-md px-1.5 py-0.5 font-mono text-[10px] font-normal text-muted-foreground"
                >
                  #{name}
                </Badge>
              ))}
            </div>

            <span className="truncate text-xs text-muted-foreground">
              {ITEM_TYPE_SINGULAR[item.type]}
            </span>

            <span className="truncate text-xs text-muted-foreground">
              {ITEM_STATUS_LABELS[item.status]}
            </span>

            <span className="text-right font-mono text-[11px] uppercase tabular-nums text-muted-foreground">
              {item.file_format}
              {readingPercent > 0
                ? ` · ${item.current_page}/${item.page_count}`
                : item.page_count > 0
                  ? ` · ${item.page_count}p`
                  : ''}
            </span>
          </button>

          <div className="flex items-center justify-end gap-1">
            <button
              type="button"
              aria-label={
                isFavorite
                  ? `Quitar ${item.title} de favoritos`
                  : `Añadir ${item.title} a favoritos`
              }
              aria-pressed={isFavorite}
              title={isFavorite ? 'Quitar de favoritos' : 'Añadir a favoritos'}
              onClick={(e) => {
                e.stopPropagation();
                actions.onToggleFavorite(item);
              }}
              className={cn(
                'flex size-7 items-center justify-center rounded-md outline-none transition-opacity hover:bg-accent focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-ring',
                isFavorite
                  ? 'text-amber-500 opacity-100 dark:text-amber-400'
                  : 'text-muted-foreground opacity-0 hover:text-foreground group-hover:opacity-100 group-focus-within:opacity-100',
              )}
            >
              <Star className={cn('size-3.5', isFavorite && 'fill-current')} />
            </button>

            <BookDropdownMenu
              item={item}
              actions={actions}
              triggerClassName="flex size-7 items-center justify-center rounded-md text-muted-foreground opacity-0 outline-none transition-opacity hover:bg-accent hover:text-foreground focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-ring group-hover:opacity-100 group-focus-within:opacity-100 data-[state=open]:opacity-100"
            />
          </div>
        </div>
      </ContextMenuTrigger>
      <BookContextMenuContent item={item} actions={actions} />
    </ContextMenu>
  );
});

export function BookListView({
  items,
  shelves,
  tags,
  bookActions,
  selectedIdsSet,
  selectionActive,
}: BookListViewProps) {
  const shelfNameById = useMemo(
    () => new Map(shelves.map((shelf) => [shelf.id, shelf.name])),
    [shelves],
  );
  const tagNameById = useMemo(
    () => new Map(tags.map((tag) => [tag.id, tag.name])),
    [tags],
  );

  return (
    <div className="px-6 py-4">
      <div className="mb-1 grid grid-cols-[24px_40px_minmax(0,2fr)_minmax(0,1.3fr)_120px_100px_110px_64px] gap-4 border-b border-border px-3 pb-2 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
        <span />
        <span />
        <span>Título y autor</span>
        <span>Estanterías y etiquetas</span>
        <span>Tipo</span>
        <span>Estado</span>
        <span className="text-right">Formato</span>
        <span />
      </div>

      <div className="divide-y divide-border/50">
        {items.map((item) => (
          <BookListRow
            key={item.id}
            item={item}
            shelfNameById={shelfNameById}
            tagNameById={tagNameById}
            actions={bookActions}
            selected={selectedIdsSet.has(item.id)}
            selectionActive={selectionActive}
          />
        ))}
      </div>
    </div>
  );
}
