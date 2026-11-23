import { Star } from 'lucide-react';
import { memo } from 'react';
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
import { cn } from '@/lib/utils';
import type { LibraryItemWithRelations } from '@/types/domain';

interface BookCardProps {
  item: LibraryItemWithRelations;
  actions: BookItemActions;
}

const COVER_BOX_STYLE = {
  height: 'calc(var(--cover-w, 158px) * 1.44)',
} as const;

export const BookCard = memo(function BookCard({ item, actions }: BookCardProps) {
  const assetUrl = useAssetUrl(item.cover_path, item.updated_at);
  const canReadLocally = isPdfReadableLocally(item.file_path, item.file_format);
  const isFavorite = item.is_favorite === 1;
  const readingPercent =
    item.page_count > 0 && item.current_page > 0
      ? Math.min(100, Math.round((item.current_page / item.page_count) * 100))
      : 0;

  const handleOpenDetails = () => actions.onSelect(item.id);
  const handleDoubleClick =
    canReadLocally && actions.onOpenReader
      ? () => actions.onOpenReader?.(item.id)
      : undefined;
  const hoverHint = canReadLocally
    ? 'Clic para ver ficha · Doble clic para leer PDF'
    : undefined;

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div className="group relative flex w-full flex-col text-left">
          <div
            className="flex w-full items-end justify-center pb-2"
            style={COVER_BOX_STYLE}
          >
            <div className="relative w-full transition-transform duration-200 ease-out group-hover:-translate-y-1 group-focus-within:-translate-y-1">
              <button
                type="button"
                aria-label={item.title}
                onClick={handleOpenDetails}
                onDoubleClick={handleDoubleClick}
                title={hoverHint}
                className="block w-full rounded-md text-left outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              >
                <CoverImage
                  id={item.id}
                  title={item.title}
                  author={item.author}
                  type={item.type}
                  fileFormat={item.file_format}
                  assetUrl={assetUrl}
                  className="transition-shadow duration-200 group-hover:ring-accent-brand/45 group-focus-within:ring-accent-brand/60"
                />
                {readingPercent > 0 ? (
                  <div
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-x-0 bottom-0 h-[3px] overflow-hidden rounded-b-md bg-black/55"
                  >
                    <div
                      className="h-full bg-accent-brand"
                      style={{ width: `${readingPercent}%` }}
                    />
                  </div>
                ) : null}
              </button>

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
                  'absolute top-2 left-2 z-10 flex size-7 items-center justify-center rounded-md border border-border/80 bg-popover/90 shadow-sm backdrop-blur-sm outline-none transition-opacity hover:bg-accent focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-ring',
                  isFavorite
                    ? 'text-amber-500 opacity-100 dark:text-amber-400'
                    : 'text-foreground opacity-0 group-hover:opacity-100 group-focus-within:opacity-100',
                )}
              >
                <Star className={cn('size-3.5', isFavorite && 'fill-current')} />
              </button>

              <BookDropdownMenu
                item={item}
                actions={actions}
                triggerClassName="absolute top-2 right-2 z-10 flex size-7 items-center justify-center rounded-md border border-border/80 bg-popover/90 text-foreground shadow-sm backdrop-blur-sm opacity-0 outline-none transition-opacity hover:bg-accent focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-ring group-hover:opacity-100 group-focus-within:opacity-100 data-[state=open]:opacity-100"
              />
            </div>
          </div>

          <div
            onClick={handleOpenDetails}
            onDoubleClick={handleDoubleClick}
            title={hoverHint}
            className="cursor-pointer space-y-0.5 pt-1"
          >
            <p className="line-clamp-2 font-sans text-[13px] font-medium leading-snug tracking-tight text-foreground transition-colors group-hover:text-accent-brand group-focus-within:text-accent-brand">
              {item.title}
            </p>
            {item.author ? (
              <p className="truncate font-serif text-[12px] italic text-muted-foreground">
                {item.author}
              </p>
            ) : null}
          </div>
        </div>
      </ContextMenuTrigger>
      <BookContextMenuContent item={item} actions={actions} />
    </ContextMenu>
  );
});
