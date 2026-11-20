import { memo } from 'react';
import { CoverImage } from '@/components/ui/cover-image';
import { useAssetUrl } from '@/features/library/hooks/useAssetUrl';
import { isPdfReadableLocally } from '@/lib/highlights';
import type { LibraryItemWithRelations } from '@/types/domain';

interface BookCardProps {
  item: LibraryItemWithRelations;
  onSelect: (id: string) => void;
  onOpenReader?: (id: string) => void;
}

const COVER_BOX_STYLE = {
  height: 'calc(var(--cover-w, 158px) * 1.44)',
} as const;

export const BookCard = memo(function BookCard({
  item,
  onSelect,
  onOpenReader,
}: BookCardProps) {
  const assetUrl = useAssetUrl(item.cover_path, item.updated_at);
  const canReadLocally = isPdfReadableLocally(item.file_path, item.file_format);
  const readingPercent =
    item.page_count > 0 && item.current_page > 0
      ? Math.min(100, Math.round((item.current_page / item.page_count) * 100))
      : 0;

  return (
    <button
      type="button"
      onClick={() => onSelect(item.id)}
      onDoubleClick={
        canReadLocally && onOpenReader
          ? () => onOpenReader(item.id)
          : undefined
      }
      title={
        canReadLocally
          ? 'Clic para ver ficha · Doble clic para leer PDF'
          : undefined
      }
      className="group flex w-full flex-col rounded-md text-left outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
    >
      <div
        className="flex w-full items-end justify-center pb-2"
        style={COVER_BOX_STYLE}
      >
        <div className="relative w-full transition-transform duration-200 ease-out group-hover:-translate-y-1 group-focus-visible:-translate-y-1">
          <CoverImage
            id={item.id}
            title={item.title}
            author={item.author}
            type={item.type}
            fileFormat={item.file_format}
            assetUrl={assetUrl}
            className="transition-shadow duration-200 group-hover:ring-accent-brand/45 group-focus-visible:ring-accent-brand/60"
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
        </div>
      </div>

      <div className="space-y-0.5 pt-1">
        <p className="line-clamp-2 font-sans text-[13px] font-medium leading-snug tracking-tight text-foreground transition-colors group-hover:text-accent-brand group-focus-visible:text-accent-brand">
          {item.title}
        </p>
        {item.author ? (
          <p className="truncate font-serif text-[12px] italic text-muted-foreground">
            {item.author}
          </p>
        ) : null}
      </div>
    </button>
  );
});
