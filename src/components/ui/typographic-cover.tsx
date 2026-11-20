import { memo } from 'react';
import { cn } from '@/lib/utils';
import type { FileFormat, ItemType } from '@/types/domain';

interface TypographicCoverProps {
  id: string;
  title: string;
  author: string;
  type: ItemType;
  fileFormat: FileFormat;
  width: number;
  className?: string;
}

const BOOK_PALETTES = [
  { bg: '#18202c', ink: '#f4f4f5', muted: '#9aa7b8', rule: '#818cf8' },
  { bg: '#162620', ink: '#f2f5f3', muted: '#9ab3a8', rule: '#6ee7b7' },
  { bg: '#261a27', ink: '#f6f2f6', muted: '#bda7bf', rule: '#c084fc' },
  { bg: '#201e1c', ink: '#f4f2ee', muted: '#b3aba0', rule: '#d4a373' },
  { bg: '#1b1f33', ink: '#f2f4f9', muted: '#a5b0d6', rule: '#818cf8' },
  { bg: '#242429', ink: '#f4f4f5', muted: '#a1a1aa', rule: '#94a3b8' },
] as const;

const COURSE_PALETTES = [
  { bg: '#131d24', grid: 'rgba(129, 140, 248, 0.16)', card: '#f4f4f5', ink: '#09090b', accent: '#818cf8' },
  { bg: '#16211d', grid: 'rgba(110, 231, 183, 0.14)', card: '#f4f4f5', ink: '#09090b', accent: '#6ee7b7' },
  { bg: '#1e1926', grid: 'rgba(192, 132, 252, 0.15)', card: '#f4f4f5', ink: '#09090b', accent: '#c084fc' },
  { bg: '#201c19', grid: 'rgba(212, 163, 115, 0.16)', card: '#f4f4f5', ink: '#09090b', accent: '#d4a373' },
] as const;

function hashSeed(input: string): number {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/**
 * Swiss editorial typographic cover rendered deterministically when cover_path is null.
 */
export const TypographicCover = memo(function TypographicCover({
  id,
  title,
  author,
  type,
  fileFormat,
  width,
  className,
}: TypographicCoverProps) {
  const seed = hashSeed(`${id}:${title}`);
  const isMini = width <= 56;
  const titleSize = Math.max(9, Math.round(width * 0.082));
  const authorSize = Math.max(7.5, Math.round(width * 0.058));

  if (type === 'article' || type === 'paper') {
    const lineCount = type === 'paper' ? 4 : 3;
    return (
      <div
        className={cn(
          'relative flex h-full w-full flex-col justify-between overflow-hidden rounded-md bg-[#ebebf0] text-[#111114] ring-1 ring-inset ring-black/10',
          className,
        )}
        style={{ padding: isMini ? 4 : Math.max(10, Math.round(width * 0.09)) }}
      >
        <span
          aria-hidden
          className="pointer-events-none absolute right-0 top-0 border-l-[12px] border-t-[12px] border-l-[#cfcfd8] border-t-background"
        />

        <div className="space-y-2 pr-2">
          {!isMini ? (
            <div className="flex items-center gap-1.5 font-mono text-[8px] uppercase tracking-[0.14em] text-[#5c5c66]">
              <span className="h-1.5 w-1.5 rounded-full bg-[#818cf8]" />
              <span>
                {type === 'paper' ? 'PAPER' : 'ARTICLE'} · {fileFormat}
              </span>
            </div>
          ) : null}
          <p
            className="line-clamp-4 font-serif font-medium leading-[1.15] tracking-tight text-[#111114]"
            style={{ fontSize: isMini ? 6.5 : titleSize }}
          >
            {title}
          </p>
        </div>

        {!isMini ? (
          <div className="space-y-1.5 pt-2">
            {author ? (
              <p
                className="truncate font-sans font-medium text-[#52525b]"
                style={{ fontSize: authorSize }}
              >
                {author}
              </p>
            ) : null}
            <div className="space-y-1 opacity-25">
              {Array.from({ length: lineCount }).map((_, idx) => (
                <div
                  key={idx}
                  className="h-[2px] rounded-full bg-[#27272a]"
                  style={{ width: idx === lineCount - 1 ? '58%' : '100%' }}
                />
              ))}
            </div>
          </div>
        ) : null}
      </div>
    );
  }

  if (type === 'course') {
    const palette = COURSE_PALETTES[seed % COURSE_PALETTES.length] ?? COURSE_PALETTES[0];
    return (
      <div
        className={cn(
          'relative flex h-full w-full flex-col justify-between overflow-hidden rounded-md ring-1 ring-inset ring-white/10',
          className,
        )}
        style={{
          backgroundColor: palette.bg,
          backgroundImage: `radial-gradient(${palette.grid} 1px, transparent 1px)`,
          backgroundSize: '10px 10px',
          padding: isMini ? 4 : Math.max(10, Math.round(width * 0.088)),
        }}
      >
        <div
          aria-hidden
          className="absolute inset-y-0 left-0 w-[4px]"
          style={{ backgroundColor: palette.accent }}
        />

        {!isMini ? (
          <div className="flex items-center justify-between pl-1 font-mono text-[8px] uppercase tracking-[0.12em] text-zinc-400">
            <span>COURSE</span>
            <span>{fileFormat}</span>
          </div>
        ) : null}

        <div
          className="mt-auto rounded-sm p-2.5 shadow-sm"
          style={{ backgroundColor: palette.card, color: palette.ink }}
        >
          <p
            className="line-clamp-3 font-sans font-semibold leading-tight tracking-tight"
            style={{ fontSize: isMini ? 6 : Math.max(8.5, titleSize - 1.5) }}
          >
            {title}
          </p>
          {!isMini && author ? (
            <p
              className="mt-1 truncate font-serif italic text-zinc-600"
              style={{ fontSize: Math.max(7.5, authorSize - 0.5) }}
            >
              {author}
            </p>
          ) : null}
        </div>
      </div>
    );
  }

  if (type === 'summary') {
    return (
      <div
        className={cn(
          'relative flex h-full w-full flex-col justify-between overflow-hidden rounded-md bg-[#16161b] text-foreground ring-1 ring-inset ring-white/10',
          className,
        )}
        style={{ padding: isMini ? 4 : Math.max(10, Math.round(width * 0.09)) }}
      >
        <div className="space-y-2">
          <div className="h-[2px] w-7 rounded-full bg-accent-brand" />
          {!isMini ? (
            <span className="block font-mono text-[8px] uppercase tracking-[0.14em] text-muted-foreground">
              SUMMARY · {fileFormat}
            </span>
          ) : null}
        </div>

        <p
          className="my-auto line-clamp-4 font-serif font-medium leading-[1.16] tracking-tight text-zinc-100"
          style={{ fontSize: isMini ? 6.5 : titleSize }}
        >
          {title}
        </p>

        {!isMini ? (
          <p
            className="truncate border-t border-white/10 pt-1.5 font-sans text-zinc-400"
            style={{ fontSize: authorSize }}
          >
            {author || fileFormat.toUpperCase()}
          </p>
        ) : null}
      </div>
    );
  }

  if (type === 'unsorted') {
    return (
      <div
        className={cn(
          'relative flex h-full w-full flex-col justify-between overflow-hidden rounded-md bg-[#131318] text-foreground ring-1 ring-inset ring-white/10',
          className,
        )}
        style={{ padding: isMini ? 4 : Math.max(10, Math.round(width * 0.09)) }}
      >
        {!isMini ? (
          <span className="w-fit rounded border border-border bg-background/80 px-1.5 py-0.5 font-mono text-[8px] uppercase tracking-wider text-muted-foreground">
            {fileFormat}
          </span>
        ) : null}

        <p
          className="line-clamp-4 font-sans font-medium leading-snug tracking-tight text-zinc-100"
          style={{ fontSize: isMini ? 6 : Math.max(8.5, titleSize - 1) }}
        >
          {title}
        </p>

        {!isMini ? (
          <p
            className="truncate font-serif italic text-zinc-400"
            style={{ fontSize: authorSize }}
          >
            {author || 'Sin autor'}
          </p>
        ) : null}
      </div>
    );
  }

  // Default: 'book' — sobrecubierta editorial moderna
  const palette = BOOK_PALETTES[seed % BOOK_PALETTES.length] ?? BOOK_PALETTES[0];

  return (
    <div
      className={cn(
        'relative flex h-full w-full flex-col justify-between overflow-hidden rounded-md ring-1 ring-inset ring-white/10',
        className,
      )}
      style={{
        backgroundColor: palette.bg,
        color: palette.ink,
        padding: isMini ? 4 : Math.max(11, Math.round(width * 0.095)),
        paddingLeft: isMini ? 7 : Math.max(15, Math.round(width * 0.13)),
      }}
    >
      <span
        aria-hidden
        className="pointer-events-none absolute inset-y-0 left-0 w-[5%] border-r border-white/10 bg-black/30"
      />

      {!isMini ? (
        <div
          aria-hidden
          className="h-[2px] w-6 rounded-full"
          style={{ backgroundColor: palette.rule }}
        />
      ) : null}

      <div className="my-auto py-1">
        <p
          className="line-clamp-4 font-serif font-medium leading-[1.15] tracking-tight"
          style={{ fontSize: isMini ? 6.5 : titleSize }}
        >
          {title}
        </p>
      </div>

      {!isMini ? (
        <div className="space-y-1">
          <div className="h-px w-full bg-white/10" />
          <p
            className="truncate font-sans font-medium"
            style={{ fontSize: authorSize, color: palette.muted }}
          >
            {author || fileFormat.toUpperCase()}
          </p>
        </div>
      ) : null}
    </div>
  );
});
