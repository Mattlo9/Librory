import { memo, useState } from 'react';
import { TypographicCover } from '@/components/ui/typographic-cover';
import { cn } from '@/lib/utils';
import type { FileFormat, ItemType } from '@/types/domain';

interface CoverImageProps {
  id: string;
  title: string;
  author: string;
  type: ItemType;
  fileFormat: FileFormat;
  assetUrl: string | null;
  compact?: boolean;
  className?: string;
}

const TYPE_ASPECT_CLASS: Record<ItemType, string> = {
  book: 'aspect-[2/3]',
  summary: 'aspect-[3/4]',
  article: 'aspect-[3/4]',
  paper: 'aspect-[3/4]',
  course: 'aspect-[4/5]',
  unsorted: 'aspect-[3/4]',
};

/**
 * Pure cover presenter: uses local asset:// URL when available, otherwise TypographicCover.
 * Marked as a CSS inline-size container so TypographicCover scales smoothly via cqw without JS re-renders.
 */
export const CoverImage = memo(function CoverImage({
  id,
  title,
  author,
  type,
  fileFormat,
  assetUrl,
  compact = false,
  className,
}: CoverImageProps) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const showImage = Boolean(assetUrl && failedUrl !== assetUrl);

  return (
    <div
      className={cn(
        '@container relative w-full overflow-hidden rounded-md shadow-[0_14px_30px_-12px_rgba(0,0,0,0.8)] ring-1 ring-white/[0.08]',
        TYPE_ASPECT_CLASS[type],
        className,
      )}
    >
      {showImage && assetUrl ? (
        <img
          src={assetUrl}
          alt={title}
          loading="lazy"
          decoding="async"
          onError={() => setFailedUrl(assetUrl)}
          className="h-full w-full object-cover"
        />
      ) : (
        <TypographicCover
          id={id}
          title={title}
          author={author}
          type={type}
          fileFormat={fileFormat}
          compact={compact}
        />
      )}
    </div>
  );
});
