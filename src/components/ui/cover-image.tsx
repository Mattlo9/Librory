import { memo, useState, type CSSProperties, type ReactNode } from 'react';
import { TypographicCover } from '@/components/ui/typographic-cover';
import { isSafeAssetUrl } from '@/lib/validation';
import { cn } from '@/lib/utils';
import type { CoverFitMode, FileFormat, ItemType } from '@/types/domain';

interface CoverImageProps {
  id: string;
  title: string;
  author: string;
  type: ItemType;
  fileFormat: FileFormat;
  assetUrl: string | null;
  compact?: boolean;
  fit?: CoverFitMode;
  maxHeight?: string;
  slotRatio?: number;
  className?: string;
  children?: ReactNode;
}

const TYPE_ASPECT_CLASS: Record<ItemType, string> = {
  book: 'aspect-[2/3]',
  summary: 'aspect-[3/4]',
  article: 'aspect-[3/4]',
  paper: 'aspect-[3/4]',
  course: 'aspect-[4/5]',
  unsorted: 'aspect-[3/4]',
};

const MIN_COVER_RATIO = 0.55;
const MAX_COVER_RATIO = 1.65;
const DEFAULT_SLOT_RATIO = 2 / 3;
const MAX_RATIO_CACHE = 2000;

const aspectRatioCache = new Map<string, number>();

export function clampCoverAspectRatio(
  naturalWidth: number,
  naturalHeight: number,
): number | null {
  if (
    !Number.isFinite(naturalWidth) ||
    !Number.isFinite(naturalHeight) ||
    naturalWidth <= 0 ||
    naturalHeight <= 0
  ) {
    return null;
  }
  return Math.min(
    MAX_COVER_RATIO,
    Math.max(MIN_COVER_RATIO, naturalWidth / naturalHeight),
  );
}

/**
 * Pure cover presenter: uses local asset:// URL when available, otherwise TypographicCover.
 * In 'contain' mode, adapts the cover frame to the image's real aspect ratio so covers display
 * completely without cropping or letterbox margins.
 */
export const CoverImage = memo(function CoverImage({
  id,
  title,
  author,
  type,
  fileFormat,
  assetUrl,
  compact = false,
  fit = 'contain',
  maxHeight,
  slotRatio = DEFAULT_SLOT_RATIO,
  className,
  children,
}: CoverImageProps) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const [loadedRatio, setLoadedRatio] = useState<{
    url: string;
    ratio: number;
  } | null>(null);

  const safeAssetUrl = isSafeAssetUrl(assetUrl) ? assetUrl : null;
  const showImage = Boolean(safeAssetUrl && failedUrl !== safeAssetUrl);

  const cachedRatio = safeAssetUrl ? aspectRatioCache.get(safeAssetUrl) : undefined;
  const naturalRatio =
    (loadedRatio?.url === safeAssetUrl ? loadedRatio.ratio : undefined) ??
    cachedRatio;

  let frameClassName = 'w-full';
  let frameStyle: CSSProperties | undefined;

  if (showImage) {
    if (fit === 'contain') {
      const ratio = naturalRatio ?? slotRatio;
      const isTallForSlot = Boolean(maxHeight) && ratio < slotRatio - 0.01;
      if (isTallForSlot && maxHeight) {
        frameClassName = 'mx-auto w-auto max-w-full';
        frameStyle = {
          aspectRatio: String(ratio),
          height: maxHeight,
        };
      } else {
        frameClassName = 'w-full';
        frameStyle = {
          aspectRatio: String(ratio),
        };
      }
    } else {
      frameClassName = 'w-full aspect-[2/3]';
    }
  } else {
    frameClassName =
      fit === 'cover' ? 'w-full aspect-[2/3]' : cn('w-full', TYPE_ASPECT_CLASS[type]);
  }

  return (
    <div
      style={frameStyle}
      className={cn(
        '@container relative overflow-hidden rounded-md bg-secondary/40 shadow-[0_10px_24px_-12px_rgba(0,0,0,0.22)] ring-1 ring-black/[0.08] dark:shadow-[0_14px_30px_-12px_rgba(0,0,0,0.8)] dark:ring-white/[0.08]',
        frameClassName,
        className,
      )}
    >
      {showImage && safeAssetUrl ? (
        <img
          src={safeAssetUrl}
          alt={title}
          loading="lazy"
          decoding="async"
          draggable={false}
          onLoad={(event) => {
            const ratio = clampCoverAspectRatio(
              event.currentTarget.naturalWidth,
              event.currentTarget.naturalHeight,
            );
            if (ratio === null) return;
            if (aspectRatioCache.size >= MAX_RATIO_CACHE) {
              aspectRatioCache.clear();
            }
            aspectRatioCache.set(safeAssetUrl, ratio);
            setLoadedRatio((prev) =>
              prev &&
              prev.url === safeAssetUrl &&
              Math.abs(prev.ratio - ratio) < 0.005
                ? prev
                : { url: safeAssetUrl, ratio },
            );
          }}
          onError={() => setFailedUrl(safeAssetUrl)}
          className={cn(
            'block h-full w-full select-none object-cover',
            fit === 'cover' && 'object-top',
          )}
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
      {children}
    </div>
  );
});
