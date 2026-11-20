import { memo } from 'react';
import { cn } from '@/lib/cn';
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

const ARCHIVAL_CLOTH_PALETTES = [
  { bg: '#2f453b', ink: '#e5dfd3', muted: '#b2beb5' },
  { bg: '#4b2d3c', ink: '#ebe3db', muted: '#c7b2bc' },
  { bg: '#2c3d52', ink: '#e3e8ee', muted: '#a9bacd' },
  { bg: '#62482f', ink: '#f0e7da', muted: '#cbb79f' },
  { bg: '#734131', ink: '#f2e6df', muted: '#d4b3a6' },
  { bg: '#303438', ink: '#e4e5e6', muted: '#a7acb2' },
] as const;

const COURSE_PALETTES = [
  { bg: '#38574c', card: '#e6e1d6', ink: '#1d1a18' },
  { bg: '#31496a', card: '#e8e4db', ink: '#1b1d21' },
  { bg: '#685b7c', card: '#ece7de', ink: '#1e1b22' },
  { bg: '#9b7365', card: '#efeae0', ink: '#241b18' },
  { bg: '#6e7e50', card: '#eae6dc', ink: '#1c2017' },
  { bg: '#b66a45', card: '#f0ebe1', ink: '#251a14' },
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
 * Procedural typographic cover rendered deterministically when an item lacks cover_path.
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
  const titleFontSize = Math.max(8, Math.round(width * 0.068));
  const authorFontSize = Math.max(7, Math.round(width * 0.056));

  if (type === 'article' || type === 'paper') {
    const lineCount = type === 'paper' ? 5 : 4;
    return (
      <div
        className={cn(
          'relative flex h-full w-full flex-col justify-between overflow-hidden rounded-[2px] bg-[#dcd6ca] text-[#1c1917] shadow-[0_6px_16px_rgba(0,0,0,0.45)]',
          className,
        )}
        style={{ padding: isMini ? 4 : Math.max(8, Math.round(width * 0.085)) }}
      >
        {/* Esquina doblada superior derecha */}
        <span
          aria-hidden
          className="pointer-events-none absolute right-0 top-0 border-l-[12px] border-t-[12px] border-l-[#beb7aa] border-t-bg-base"
        />
        <div className="space-y-1.5 pr-2">
          {!isMini ? (
            <span className="block font-mono text-[8px] uppercase tracking-widest text-[#6b645a]">
              {type === 'paper' ? 'PAPER' : 'ARTICLE'} · {fileFormat.toUpperCase()}
            </span>
          ) : null}
          <p
            className="line-clamp-4 font-mono font-semibold leading-tight tracking-tight text-[#1a1715]"
            style={{ fontSize: isMini ? 6 : titleFontSize }}
          >
            {title}
          </p>
        </div>

        {!isMini ? (
          <div className="space-y-1.5 pt-2">
            {author ? (
              <p
                className="truncate font-mono text-[#524c44]"
                style={{ fontSize: authorFontSize }}
              >
                {author}
              </p>
            ) : null}
            <div className="space-y-1 opacity-35">
              {Array.from({ length: lineCount }).map((_, idx) => (
                <div
                  key={idx}
                  className="h-[2px] rounded-full bg-[#4a443d]"
                  style={{ width: idx === lineCount - 1 ? '62%' : '100%' }}
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
          'relative flex h-full w-full flex-col justify-between overflow-hidden rounded-r-[4px] rounded-l-[2px] shadow-[0_8px_18px_rgba(0,0,0,0.45)]',
          className,
        )}
        style={{
          backgroundColor: palette.bg,
          padding: isMini ? 4 : Math.max(8, Math.round(width * 0.085)),
          paddingLeft: isMini ? 8 : Math.max(14, Math.round(width * 0.13)),
        }}
      >
        {/* Anillado izquierdo minimalista */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-y-2 left-1 flex w-2 flex-col justify-between"
        >
          {Array.from({ length: isMini ? 4 : 9 }).map((_, idx) => (
            <span
              key={idx}
              className="h-[3px] w-2 rounded-r-full bg-[#181513]/85"
            />
          ))}
        </div>

        {!isMini ? (
          <div className="grid grid-cols-5 gap-1 opacity-25">
            {Array.from({ length: 10 }).map((_, idx) => (
              <span key={idx} className="aspect-square rounded-[1px] bg-white/75" />
            ))}
          </div>
        ) : null}

        <div
          className="rounded-[2px] p-2 shadow-sm"
          style={{ backgroundColor: palette.card, color: palette.ink }}
        >
          <p
            className="line-clamp-3 font-mono font-semibold leading-tight"
            style={{ fontSize: isMini ? 6 : Math.max(8, titleFontSize - 1) }}
          >
            {title}
          </p>
          {!isMini && author ? (
            <p
              className="mt-1 truncate font-mono opacity-70"
              style={{ fontSize: Math.max(7, authorFontSize - 1) }}
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
          'relative flex h-full w-full flex-col justify-between overflow-hidden rounded-[3px] border border-[#aba496]/35 bg-[#cbc5b8] text-[#1e1b18] shadow-[0_7px_16px_rgba(0,0,0,0.45)]',
          className,
        )}
        style={{ padding: isMini ? 4 : Math.max(9, Math.round(width * 0.09)) }}
      >
        {/* Pestaña superior de carpeta/dossier */}
        <div className="flex items-center justify-between border-b border-[#1e1b18]/15 pb-1.5">
          {!isMini ? (
            <span className="font-mono text-[8px] uppercase tracking-widest text-[#5d564c]">
              SUMMARY
            </span>
          ) : (
            <span />
          )}
          <span className="h-1.5 w-6 rounded-sm bg-[#1e1b18]/20" />
        </div>

        <div className="my-auto py-2">
          <div className="rounded-[2px] border border-[#1e1b18]/15 bg-[#e5e0d4] p-2">
            <p
              className="line-clamp-3 font-mono font-medium leading-tight"
              style={{ fontSize: isMini ? 6 : titleFontSize }}
            >
              {title}
            </p>
          </div>
        </div>

        {!isMini ? (
          <p
            className="truncate font-mono text-[#524c43]"
            style={{ fontSize: authorFontSize }}
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
          'relative flex h-full w-full flex-col justify-between overflow-hidden rounded-[3px] border border-border-strong bg-bg-elevated text-text-primary shadow-[0_7px_18px_rgba(0,0,0,0.45)]',
          className,
        )}
        style={{ padding: isMini ? 4 : Math.max(9, Math.round(width * 0.09)) }}
      >
        {!isMini ? (
          <span className="w-fit rounded border border-border-strong bg-bg-base px-1.5 py-0.5 font-mono text-[8px] uppercase tracking-wider text-text-secondary">
            {fileFormat}
          </span>
        ) : null}
        <p
          className="line-clamp-4 font-mono leading-tight text-text-primary"
          style={{ fontSize: isMini ? 6 : titleFontSize }}
        >
          {title}
        </p>
        {!isMini ? (
          <p
            className="truncate font-mono italic text-text-secondary"
            style={{ fontSize: authorFontSize }}
          >
            {author || 'Sin autor'}
          </p>
        ) : null}
      </div>
    );
  }

  // Default: 'book' — tapa dura entelada minimalista
  const cloth =
    ARCHIVAL_CLOTH_PALETTES[seed % ARCHIVAL_CLOTH_PALETTES.length] ??
    ARCHIVAL_CLOTH_PALETTES[0];

  return (
    <div
      className={cn(
        'relative flex h-full w-full flex-col justify-between overflow-hidden rounded-r-[3px] rounded-l-[1px] shadow-[0_10px_22px_rgba(0,0,0,0.5)]',
        className,
      )}
      style={{
        backgroundColor: cloth.bg,
        color: cloth.ink,
        padding: isMini ? 4 : Math.max(10, Math.round(width * 0.095)),
        paddingLeft: isMini ? 7 : Math.max(14, Math.round(width * 0.13)),
      }}
    >
      {/* Lomo izquierdo sutil */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-y-0 left-0 w-[6%] border-r border-white/10 bg-black/25"
      />

      {!isMini ? (
        <div
          aria-hidden
          className="h-px w-full opacity-25"
          style={{ backgroundColor: cloth.ink }}
        />
      ) : null}

      <div className="my-auto space-y-1.5 text-center">
        <p
          className="line-clamp-4 font-mono font-medium leading-snug tracking-tight"
          style={{ fontSize: isMini ? 6 : titleFontSize }}
        >
          {title}
        </p>
      </div>

      {!isMini ? (
        <div className="space-y-1 text-center">
          <div
            aria-hidden
            className="mx-auto h-px w-8 opacity-30"
            style={{ backgroundColor: cloth.ink }}
          />
          <p
            className="truncate font-mono"
            style={{ fontSize: authorFontSize, color: cloth.muted }}
          >
            {author || fileFormat.toUpperCase()}
          </p>
        </div>
      ) : null}
    </div>
  );
});
