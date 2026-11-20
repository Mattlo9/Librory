import { memo } from 'react';
import { CoverImage } from '@/components/ui/cover-image';
import { useAssetUrl } from '@/features/library/hooks/useAssetUrl';
import type { LibraryItemWithRelations } from '@/types/domain';

interface BookCardProps {
  item: LibraryItemWithRelations;
  coverWidth: number;
  onSelect: (id: string) => void;
}

export const BookCard = memo(function BookCard({
  item,
  coverWidth,
  onSelect,
}: BookCardProps) {
  const assetUrl = useAssetUrl(item.cover_path);
  const coverBoxHeight = Math.round(coverWidth * 1.44);

  return (
    <button
      type="button"
      onClick={() => onSelect(item.id)}
      className="group flex w-full flex-col text-left focus-visible:outline-none"
    >
      <div
        className="flex w-full items-end justify-center pb-2"
        style={{ height: coverBoxHeight }}
      >
        <div className="w-full transition-transform duration-200 ease-out group-hover:-translate-y-1 group-focus-visible:-translate-y-1">
          <CoverImage
            id={item.id}
            title={item.title}
            author={item.author}
            type={item.type}
            fileFormat={item.file_format}
            assetUrl={assetUrl}
            width={coverWidth}
            className="transition-shadow duration-200 group-hover:ring-accent-brand/45 group-focus-visible:ring-accent-brand/60"
          />
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
