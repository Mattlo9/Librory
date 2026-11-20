import { memo } from 'react';
import { CoverImage } from '@/components/ui/CoverImage';
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
  const shelfBoxHeight = Math.round(coverWidth * 1.46);

  return (
    <button
      type="button"
      onClick={() => onSelect(item.id)}
      className="group flex w-full flex-col text-left focus-visible:outline-none"
    >
      {/* Extiende la línea inferior hasta el punto medio del gap para formar una estantería continua */}
      <div
        className="-mx-3 flex items-end justify-center border-b border-shelf-rule px-3 pb-0 transition-colors group-hover:border-accent/45"
        style={{ height: shelfBoxHeight }}
      >
        <div className="w-full transition-transform duration-150 group-hover:-translate-y-0.5 group-focus-visible:-translate-y-0.5">
          <CoverImage
            id={item.id}
            title={item.title}
            author={item.author}
            type={item.type}
            fileFormat={item.file_format}
            assetUrl={assetUrl}
            width={coverWidth}
          />
        </div>
      </div>

      <div className="pt-2">
        <p className="line-clamp-2 font-mono text-[11.5px] leading-snug text-text-primary transition-colors group-hover:text-accent group-focus-visible:text-accent">
          {item.title}
        </p>
        {item.author ? (
          <p className="mt-0.5 truncate text-[11px] italic text-text-secondary">
            {item.author}
          </p>
        ) : null}
      </div>
    </button>
  );
});
