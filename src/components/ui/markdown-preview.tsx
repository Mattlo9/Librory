import { memo, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface MarkdownPreviewProps {
  content: string;
  className?: string;
  variant?: 'compact' | 'document';
  onWikilinkClick?: (target: string) => void;
  existingNoteTitles?: ReadonlySet<string>;
  onToggleChecklist?: (lineIndex: number, checked: boolean) => void;
}

const INLINE_TOKEN_REGEX =
  /(\[\[[^\]\n]+\]\]|`[^`\n]+`|\*\*[^*\n]+?\*\*|~~[^~\n]+?~~|\*[^*\n]+?\*|\[[^\]\n]+\]\([^\s)]+\)|#[A-Za-zÀ-ÿ][A-Za-zÀ-ÿ0-9/_-]{0,40})/g;

function isSafeHttpUrl(rawUrl: string): boolean {
  try {
    const parsed = new URL(rawUrl);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

interface InlineOptions {
  variant: 'compact' | 'document';
  onWikilinkClick?: (target: string) => void;
  existingNoteTitles?: ReadonlySet<string>;
}

function renderInline(
  text: string,
  options: InlineOptions,
  depth = 0,
): ReactNode[] {
  if (!text || depth > 4) {
    return [text];
  }

  const nodes: ReactNode[] = [];
  let lastIndex = 0;
  let keyCounter = 0;

  for (const match of text.matchAll(INLINE_TOKEN_REGEX)) {
    const index = match.index ?? 0;
    const token = match[0];

    if (index > lastIndex) {
      nodes.push(text.slice(lastIndex, index));
    }

    const key = `md-${depth}-${keyCounter++}`;

    if (token.startsWith('[[') && token.endsWith(']]') && token.length > 4) {
      const inner = token.slice(2, -2);
      const pipeIdx = inner.indexOf('|');
      const target = (pipeIdx >= 0 ? inner.slice(0, pipeIdx) : inner).trim();
      const label = (pipeIdx >= 0 ? inner.slice(pipeIdx + 1) : inner).trim();
      const exists = options.existingNoteTitles
        ? options.existingNoteTitles.has(target.toLowerCase())
        : false;

      if (target && options.onWikilinkClick) {
        nodes.push(
          <button
            key={key}
            type="button"
            onClick={() => options.onWikilinkClick?.(target)}
            title={
              exists
                ? `Abrir nota "${target}"`
                : `Crear nota "${target}"`
            }
            className={cn(
              'inline cursor-pointer rounded px-0.5 font-medium underline underline-offset-2 transition-colors',
              exists
                ? 'text-accent-brand decoration-accent-brand/50 hover:bg-accent-brand/10 hover:decoration-accent-brand'
                : 'text-accent-brand/75 decoration-dashed decoration-accent-brand/40 hover:bg-accent-brand/10 hover:text-accent-brand',
            )}
          >
            {label || target}
          </button>,
        );
      } else {
        nodes.push(
          <span
            key={key}
            className="rounded bg-accent-brand/10 px-1 py-0.5 font-medium text-accent-brand"
          >
            {label || target}
          </span>,
        );
      }
    } else if (token.startsWith('`') && token.endsWith('`') && token.length >= 2) {
      nodes.push(
        <code
          key={key}
          className={cn(
            'rounded bg-secondary px-1 py-0.5 font-mono text-foreground',
            options.variant === 'document' ? 'text-[12.5px]' : 'text-[11px]',
          )}
        >
          {token.slice(1, -1)}
        </code>,
      );
    } else if (
      token.startsWith('**') &&
      token.endsWith('**') &&
      token.length >= 4
    ) {
      nodes.push(
        <strong key={key} className="font-semibold text-foreground">
          {renderInline(token.slice(2, -2), options, depth + 1)}
        </strong>,
      );
    } else if (
      token.startsWith('~~') &&
      token.endsWith('~~') &&
      token.length >= 4
    ) {
      nodes.push(
        <del key={key} className="text-muted-foreground line-through">
          {renderInline(token.slice(2, -2), options, depth + 1)}
        </del>,
      );
    } else if (
      token.startsWith('*') &&
      token.endsWith('*') &&
      token.length >= 2
    ) {
      nodes.push(
        <em key={key} className="font-serif italic text-foreground/90">
          {renderInline(token.slice(1, -1), options, depth + 1)}
        </em>,
      );
    } else if (token.startsWith('[')) {
      const sepIdx = token.indexOf('](');
      if (sepIdx > 1 && token.endsWith(')')) {
        const label = token.slice(1, sepIdx);
        const url = token.slice(sepIdx + 2, -1);
        if (isSafeHttpUrl(url)) {
          nodes.push(
            <a
              key={key}
              href={url}
              target="_blank"
              rel="noreferrer noopener"
              className="text-accent-brand underline underline-offset-2 hover:text-accent-brand/80"
            >
              {renderInline(label, options, depth + 1)}
            </a>,
          );
        } else {
          nodes.push(token);
        }
      } else {
        nodes.push(token);
      }
    } else if (token.startsWith('#')) {
      const prevChar = index > 0 ? (text[index - 1] ?? '') : '';
      if (index === 0 || /\s/.test(prevChar)) {
        nodes.push(
          <span
            key={key}
            className="rounded-md bg-accent-brand/10 px-1.5 py-0.5 font-mono text-[11px] font-medium text-accent-brand"
          >
            {token}
          </span>,
        );
      } else {
        nodes.push(token);
      }
    } else {
      nodes.push(token);
    }

    lastIndex = index + token.length;
  }

  if (lastIndex < text.length) {
    nodes.push(text.slice(lastIndex));
  }

  return nodes;
}

const CHECKLIST_REGEX = /^[-*]\s+\[([ xX])\]\s*(.*)$/;
const HR_REGEX = /^(-{3,}|\*{3,}|_{3,})$/;

function isBlockStarter(candidate: string): boolean {
  return (
    !candidate ||
    candidate.startsWith('```') ||
    candidate.startsWith('# ') ||
    candidate.startsWith('## ') ||
    candidate.startsWith('### ') ||
    candidate.startsWith('#### ') ||
    candidate.startsWith('>') ||
    HR_REGEX.test(candidate) ||
    /^[-*]\s+/.test(candidate) ||
    /^\d+\.\s+/.test(candidate)
  );
}

/**
 * Pure React Markdown renderer with zero HTML injection for highlight notes and Obsidian-style documents.
 */
export const MarkdownPreview = memo(function MarkdownPreview({
  content,
  className,
  variant = 'compact',
  onWikilinkClick,
  existingNoteTitles,
  onToggleChecklist,
}: MarkdownPreviewProps) {
  if (!content.trim()) {
    return null;
  }

  const inlineOpts: InlineOptions = {
    variant,
    onWikilinkClick,
    existingNoteTitles,
  };

  const lines = content.split(/\r?\n/);
  const blocks: ReactNode[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i] ?? '';
    const trimmedLine = line.trim();

    if (!trimmedLine) {
      i += 1;
      continue;
    }

    if (trimmedLine.startsWith('```')) {
      const lang = trimmedLine.slice(3).trim();
      const start = i;
      i += 1;
      const codeLines: string[] = [];
      while (i < lines.length && !(lines[i] ?? '').trim().startsWith('```')) {
        codeLines.push(lines[i] ?? '');
        i += 1;
      }
      if (i < lines.length && (lines[i] ?? '').trim().startsWith('```')) {
        i += 1;
      }
      blocks.push(
        <div
          key={`code-${start}`}
          className="overflow-hidden rounded-lg border border-border bg-secondary/45"
        >
          {lang ? (
            <div className="border-b border-border/60 px-3 py-1 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
              {lang}
            </div>
          ) : null}
          <pre className="scrollbar-subtle overflow-x-auto p-3 font-mono text-xs leading-relaxed text-foreground">
            <code>{codeLines.join('\n')}</code>
          </pre>
        </div>,
      );
      continue;
    }

    if (HR_REGEX.test(trimmedLine)) {
      blocks.push(<hr key={`hr-${i}`} className="my-3 border-border" />);
      i += 1;
      continue;
    }

    if (trimmedLine.startsWith('#### ')) {
      blocks.push(
        <h6
          key={`h4-${i}`}
          className={cn(
            'font-semibold tracking-tight text-foreground',
            variant === 'document' ? 'pt-2 text-sm' : 'text-xs',
          )}
        >
          {renderInline(trimmedLine.slice(5), inlineOpts)}
        </h6>,
      );
      i += 1;
      continue;
    }

    if (trimmedLine.startsWith('### ')) {
      blocks.push(
        <h5
          key={`h3-${i}`}
          className={cn(
            'font-semibold tracking-tight text-foreground',
            variant === 'document' ? 'pt-2.5 text-[15px]' : 'text-xs',
          )}
        >
          {renderInline(trimmedLine.slice(4), inlineOpts)}
        </h5>,
      );
      i += 1;
      continue;
    }

    if (trimmedLine.startsWith('## ')) {
      blocks.push(
        <h4
          key={`h2-${i}`}
          className={cn(
            'font-semibold tracking-tight text-foreground',
            variant === 'document' ? 'pt-3 text-base' : 'text-[13px]',
          )}
        >
          {renderInline(trimmedLine.slice(3), inlineOpts)}
        </h4>,
      );
      i += 1;
      continue;
    }

    if (trimmedLine.startsWith('# ')) {
      blocks.push(
        <h3
          key={`h1-${i}`}
          className={cn(
            'font-semibold tracking-tight text-foreground',
            variant === 'document'
              ? 'border-b border-border/50 pb-1.5 pt-2 text-lg'
              : 'text-sm',
          )}
        >
          {renderInline(trimmedLine.slice(2), inlineOpts)}
        </h3>,
      );
      i += 1;
      continue;
    }

    if (trimmedLine.startsWith('>')) {
      const quoteLines: string[] = [];
      const start = i;
      while (i < lines.length && (lines[i] ?? '').trim().startsWith('>')) {
        quoteLines.push((lines[i] ?? '').trim().replace(/^>\s?/, ''));
        i += 1;
      }
      blocks.push(
        <blockquote
          key={`quote-${start}`}
          className={cn(
            'border-l-2 border-accent-brand/60 pl-3 font-serif italic text-foreground/85',
            variant === 'document' ? 'text-[15px] leading-relaxed' : 'text-[13px]',
          )}
        >
          {quoteLines.map((qLine, idx) =>
            qLine ? (
              <p key={idx}>{renderInline(qLine, inlineOpts)}</p>
            ) : (
              <div key={idx} className="h-1.5" />
            ),
          )}
        </blockquote>,
      );
      continue;
    }

    if (CHECKLIST_REGEX.test(trimmedLine)) {
      const items: Array<{ lineIndex: number; checked: boolean; text: string }> =
        [];
      const start = i;
      while (i < lines.length) {
        const match = CHECKLIST_REGEX.exec((lines[i] ?? '').trim());
        if (!match) break;
        items.push({
          lineIndex: i,
          checked: (match[1] ?? '').toLowerCase() === 'x',
          text: match[2] ?? '',
        });
        i += 1;
      }
      blocks.push(
        <ul key={`chk-${start}`} className="list-none space-y-1.5 pl-0">
          {items.map((item) => (
            <li key={item.lineIndex} className="flex items-start gap-2">
              <input
                type="checkbox"
                checked={item.checked}
                disabled={!onToggleChecklist}
                onChange={(e) =>
                  onToggleChecklist?.(item.lineIndex, e.target.checked)
                }
                className="mt-1 size-3.5 shrink-0 cursor-pointer accent-accent-brand disabled:cursor-default"
              />
              <span
                className={cn(
                  item.checked && 'text-muted-foreground line-through',
                )}
              >
                {renderInline(item.text, inlineOpts)}
              </span>
            </li>
          ))}
        </ul>,
      );
      continue;
    }

    if (/^[-*]\s+/.test(trimmedLine)) {
      const items: string[] = [];
      const start = i;
      while (i < lines.length) {
        const candidate = (lines[i] ?? '').trim();
        if (!/^[-*]\s+/.test(candidate) || CHECKLIST_REGEX.test(candidate)) {
          break;
        }
        items.push(candidate.replace(/^[-*]\s+/, ''));
        i += 1;
      }
      blocks.push(
        <ul key={`ul-${start}`} className="list-disc space-y-1 pl-5">
          {items.map((itemText, idx) => (
            <li key={idx}>{renderInline(itemText, inlineOpts)}</li>
          ))}
        </ul>,
      );
      continue;
    }

    if (/^\d+\.\s+/.test(trimmedLine)) {
      const items: string[] = [];
      const start = i;
      while (i < lines.length && /^\d+\.\s+/.test((lines[i] ?? '').trim())) {
        items.push((lines[i] ?? '').trim().replace(/^\d+\.\s+/, ''));
        i += 1;
      }
      blocks.push(
        <ol key={`ol-${start}`} className="list-decimal space-y-1 pl-5">
          {items.map((itemText, idx) => (
            <li key={idx}>{renderInline(itemText, inlineOpts)}</li>
          ))}
        </ol>,
      );
      continue;
    }

    const paragraphLines: string[] = [];
    const start = i;
    while (i < lines.length) {
      const candidate = (lines[i] ?? '').trim();
      if (isBlockStarter(candidate)) {
        break;
      }
      paragraphLines.push(candidate);
      i += 1;
    }

    blocks.push(
      <p key={`p-${start}`} className="leading-relaxed">
        {renderInline(paragraphLines.join(' '), inlineOpts)}
      </p>,
    );
  }

  return (
    <div
      className={cn(
        variant === 'document'
          ? 'space-y-3 text-[13.5px] leading-relaxed text-foreground/90'
          : 'space-y-2 text-xs leading-relaxed text-muted-foreground',
        className,
      )}
    >
      {blocks}
    </div>
  );
});
