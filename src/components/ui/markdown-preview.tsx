import { memo, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface MarkdownPreviewProps {
  content: string;
  className?: string;
}

const INLINE_TOKEN_REGEX =
  /(`[^`\n]+`|\*\*[^*\n]+?\*\*|\*[^*\n]+?\*|\[[^\]\n]+\]\([^\s)]+\))/g;

function isSafeHttpUrl(rawUrl: string): boolean {
  try {
    const parsed = new URL(rawUrl);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

function renderInline(text: string, depth = 0): ReactNode[] {
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

    if (token.startsWith('`') && token.endsWith('`') && token.length >= 2) {
      nodes.push(
        <code
          key={key}
          className="rounded bg-secondary px-1 py-0.5 font-mono text-[11px] text-foreground"
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
          {renderInline(token.slice(2, -2), depth + 1)}
        </strong>,
      );
    } else if (
      token.startsWith('*') &&
      token.endsWith('*') &&
      token.length >= 2
    ) {
      nodes.push(
        <em key={key} className="font-serif italic text-foreground/90">
          {renderInline(token.slice(1, -1), depth + 1)}
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
              {renderInline(label, depth + 1)}
            </a>,
          );
        } else {
          nodes.push(token);
        }
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

/**
 * Pure React Markdown renderer with zero HTML injection for highlight notes.
 */
export const MarkdownPreview = memo(function MarkdownPreview({
  content,
  className,
}: MarkdownPreviewProps) {
  const trimmed = content.trim();
  if (!trimmed) {
    return null;
  }

  const lines = trimmed.split(/\r?\n/);
  const blocks: ReactNode[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i] ?? '';
    const trimmedLine = line.trim();

    if (!trimmedLine) {
      i += 1;
      continue;
    }

    if (trimmedLine.startsWith('### ')) {
      blocks.push(
        <h5
          key={`h3-${i}`}
          className="text-xs font-semibold tracking-tight text-foreground"
        >
          {renderInline(trimmedLine.slice(4))}
        </h5>,
      );
      i += 1;
      continue;
    }

    if (trimmedLine.startsWith('## ')) {
      blocks.push(
        <h4
          key={`h2-${i}`}
          className="text-[13px] font-semibold tracking-tight text-foreground"
        >
          {renderInline(trimmedLine.slice(3))}
        </h4>,
      );
      i += 1;
      continue;
    }

    if (trimmedLine.startsWith('# ')) {
      blocks.push(
        <h3
          key={`h1-${i}`}
          className="text-sm font-semibold tracking-tight text-foreground"
        >
          {renderInline(trimmedLine.slice(2))}
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
          className="border-l-2 border-border pl-2.5 font-serif text-[13px] italic text-foreground/85"
        >
          {quoteLines.map((qLine, idx) => (
            <p key={idx}>{renderInline(qLine)}</p>
          ))}
        </blockquote>,
      );
      continue;
    }

    if (/^[-*]\s+/.test(trimmedLine)) {
      const items: string[] = [];
      const start = i;
      while (i < lines.length && /^[-*]\s+/.test((lines[i] ?? '').trim())) {
        items.push((lines[i] ?? '').trim().replace(/^[-*]\s+/, ''));
        i += 1;
      }
      blocks.push(
        <ul key={`ul-${start}`} className="list-disc space-y-1 pl-4">
          {items.map((itemText, idx) => (
            <li key={idx}>{renderInline(itemText)}</li>
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
        <ol key={`ol-${start}`} className="list-decimal space-y-1 pl-4">
          {items.map((itemText, idx) => (
            <li key={idx}>{renderInline(itemText)}</li>
          ))}
        </ol>,
      );
      continue;
    }

    const paragraphLines: string[] = [];
    const start = i;
    while (i < lines.length) {
      const candidate = (lines[i] ?? '').trim();
      if (
        !candidate ||
        candidate.startsWith('# ') ||
        candidate.startsWith('## ') ||
        candidate.startsWith('### ') ||
        candidate.startsWith('>') ||
        /^[-*]\s+/.test(candidate) ||
        /^\d+\.\s+/.test(candidate)
      ) {
        break;
      }
      paragraphLines.push(candidate);
      i += 1;
    }

    blocks.push(
      <p key={`p-${start}`} className="leading-relaxed">
        {renderInline(paragraphLines.join(' '))}
      </p>,
    );
  }

  return (
    <div
      className={cn(
        'space-y-2 text-xs leading-relaxed text-muted-foreground',
        className,
      )}
    >
      {blocks}
    </div>
  );
});
