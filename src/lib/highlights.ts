import type { FileFormat, HighlightColor } from '@/types/domain';

export const HIGHLIGHT_COLOR_LABELS: Record<HighlightColor, string> = {
  amber: 'Ámbar',
  sage: 'Salvia',
  clay: 'Terracota',
  slate: 'Índigo',
};

export const HIGHLIGHT_BORDER_CLASS: Record<HighlightColor, string> = {
  amber: 'border-l-amber-400/75',
  sage: 'border-l-emerald-400/70',
  clay: 'border-l-rose-400/70',
  slate: 'border-l-accent-brand',
};

export const HIGHLIGHT_DOT_CLASS: Record<HighlightColor, string> = {
  amber: 'bg-amber-400',
  sage: 'bg-emerald-400',
  clay: 'bg-rose-400',
  slate: 'bg-accent-brand',
};

export const HIGHLIGHT_HEX: Record<HighlightColor, string> = {
  amber: '#fbbf24',
  sage: '#34d399',
  clay: '#fb7185',
  slate: '#818cf8',
};

export const HIGHLIGHT_SOFT_BG_CLASS: Record<HighlightColor, string> = {
  amber:
    'border-amber-500/35 bg-amber-500/12 text-amber-700 dark:border-amber-400/35 dark:bg-amber-400/15 dark:text-amber-300',
  sage:
    'border-emerald-500/35 bg-emerald-500/12 text-emerald-700 dark:border-emerald-400/35 dark:bg-emerald-400/15 dark:text-emerald-300',
  clay:
    'border-rose-500/35 bg-rose-500/12 text-rose-700 dark:border-rose-400/35 dark:bg-rose-400/15 dark:text-rose-300',
  slate: 'border-accent-brand/40 bg-accent-brand/15 text-accent-brand',
};

export function isPdfReadableLocally(
  filePath: string,
  fileFormat: FileFormat,
): boolean {
  return fileFormat === 'pdf' && !filePath.startsWith('sample/');
}

export function formatHighlightAsMarkdown(params: {
  quote: string;
  note?: string;
  title?: string;
  author?: string;
  pageNumber?: number | null;
}): string {
  const cleanedQuote = params.quote.trim().replace(/\r?\n+/g, '\n> ');
  const quoteBlock = `> "${cleanedQuote}"`;

  const parts: string[] = [quoteBlock];

  const trimmedNote = params.note?.trim();
  if (trimmedNote) {
    parts.push(trimmedNote);
  }

  const metaParts: string[] = [];
  if (params.title) {
    metaParts.push(`*${params.title}*`);
  }
  if (params.author) {
    metaParts.push(`(${params.author})`);
  }
  const sourceLabel = metaParts.join(' ');
  const pageSuffix =
    typeof params.pageNumber === 'number' && params.pageNumber > 0
      ? `, pág. ${params.pageNumber}`
      : '';

  if (sourceLabel || pageSuffix) {
    parts.push(`— ${sourceLabel}${pageSuffix}`.trim());
  }

  return parts.join('\n\n');
}
