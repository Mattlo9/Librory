import { Check, Eye, PenLine, X } from 'lucide-react';
import { useId, useState, type FormEvent, type KeyboardEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { MarkdownPreview } from '@/components/ui/markdown-preview';
import { Textarea } from '@/components/ui/textarea';
import {
  HIGHLIGHT_COLOR_LABELS,
  HIGHLIGHT_DOT_CLASS,
} from '@/lib/highlights';
import { cn } from '@/lib/utils';
import { HIGHLIGHT_COLORS, type HighlightColor } from '@/types/domain';

export interface HighlightEditorValues {
  quote_text: string;
  note_markdown: string;
  color: HighlightColor;
  page_number: number | null;
}

interface HighlightEditorFormProps {
  initialQuote?: string;
  initialNote?: string;
  initialColor?: HighlightColor;
  initialPageNumber?: number | null;
  maxPage?: number;
  submitLabel?: string;
  isPending?: boolean;
  errorMessage?: string | null;
  onSubmit: (values: HighlightEditorValues) => void | Promise<void>;
  onCancel: () => void;
}

export function HighlightEditorForm({
  initialQuote = '',
  initialNote = '',
  initialColor = 'amber',
  initialPageNumber = null,
  maxPage,
  submitLabel = 'Guardar subrayado',
  isPending = false,
  errorMessage,
  onSubmit,
  onCancel,
}: HighlightEditorFormProps) {
  const quoteId = useId();
  const noteId = useId();
  const pageId = useId();

  const [quoteText, setQuoteText] = useState(initialQuote);
  const [noteMarkdown, setNoteMarkdown] = useState(initialNote);
  const [color, setColor] = useState<HighlightColor>(initialColor);
  const [pageInput, setPageInput] = useState(
    initialPageNumber !== null && initialPageNumber > 0
      ? String(initialPageNumber)
      : '',
  );
  const [noteTab, setNoteTab] = useState<'write' | 'preview'>('write');
  const [localError, setLocalError] = useState<string | null>(null);

  async function submitValues() {
    const trimmedQuote = quoteText.trim();
    if (!trimmedQuote) {
      setLocalError('Escribe o selecciona una cita para guardar el subrayado.');
      return;
    }

    let parsedPage: number | null = null;
    if (pageInput.trim()) {
      const candidate = Number.parseInt(pageInput.trim(), 10);
      if (!Number.isFinite(candidate) || candidate < 1) {
        setLocalError('El número de página debe ser mayor o igual a 1.');
        return;
      }
      parsedPage = maxPage && maxPage > 0 ? Math.min(maxPage, candidate) : candidate;
    }

    setLocalError(null);
    try {
      await onSubmit({
        quote_text: trimmedQuote,
        note_markdown: noteMarkdown.trim(),
        color,
        page_number: parsedPage,
      });
    } catch (error) {
      setLocalError(error instanceof Error ? error.message : String(error));
    }
  }

  function handleFormSubmit(event: FormEvent) {
    event.preventDefault();
    void submitValues();
  }

  function handleShortcutKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      void submitValues();
    }
  }

  const displayedError = localError ?? errorMessage;

  return (
    <form
      onSubmit={handleFormSubmit}
      className="space-y-3 rounded-xl border border-border bg-secondary/45 p-3.5"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div
          role="group"
          aria-label="Color de subrayado"
          className="flex items-center gap-1.5"
        >
          {HIGHLIGHT_COLORS.map((c) => {
            const active = color === c;
            return (
              <button
                key={c}
                type="button"
                aria-label={HIGHLIGHT_COLOR_LABELS[c]}
                aria-pressed={active}
                title={HIGHLIGHT_COLOR_LABELS[c]}
                onClick={() => setColor(c)}
                className={cn(
                  'flex size-6 items-center justify-center rounded-full border transition-all outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  active
                    ? 'border-foreground bg-secondary scale-105'
                    : 'border-border/70 bg-transparent opacity-75 hover:opacity-100',
                )}
              >
                <span
                  aria-hidden="true"
                  className={cn('size-2.5 rounded-full', HIGHLIGHT_DOT_CLASS[c])}
                />
              </button>
            );
          })}
        </div>

        <div className="flex items-center gap-1.5">
          <label
            htmlFor={pageId}
            className="font-mono text-[11px] text-muted-foreground"
          >
            pág.
          </label>
          <Input
            id={pageId}
            type="number"
            min={1}
            max={maxPage && maxPage > 0 ? maxPage : undefined}
            value={pageInput}
            onChange={(e) => setPageInput(e.target.value)}
            placeholder="—"
            className="h-7 w-16 px-2 text-center font-mono text-xs tabular-nums"
          />
        </div>
      </div>

      <div className="space-y-1">
        <label
          htmlFor={quoteId}
          className="block text-[11px] font-medium tracking-wide text-muted-foreground uppercase"
        >
          Cita
        </label>
        <Textarea
          id={quoteId}
          rows={3}
          value={quoteText}
          onChange={(e) => {
            setQuoteText(e.target.value);
            if (localError) setLocalError(null);
          }}
          onKeyDown={handleShortcutKeyDown}
          placeholder="Fragmento citado del documento..."
          className="resize-y font-serif text-[14px] leading-relaxed"
        />
      </div>

      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <label
            htmlFor={noteId}
            className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase"
          >
            Nota en Markdown
          </label>
          <div
            role="tablist"
            aria-label="Modo de edición Markdown"
            className="inline-flex rounded-md border border-border bg-background/70 p-0.5"
          >
            <button
              type="button"
              role="tab"
              aria-selected={noteTab === 'write'}
              onClick={() => setNoteTab('write')}
              className={cn(
                'inline-flex items-center gap-1 rounded-sm px-2 py-0.5 text-[11px] font-medium transition-colors',
                noteTab === 'write'
                  ? 'bg-secondary text-foreground'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              <PenLine className="size-3" />
              Escribir
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={noteTab === 'preview'}
              onClick={() => setNoteTab('preview')}
              className={cn(
                'inline-flex items-center gap-1 rounded-sm px-2 py-0.5 text-[11px] font-medium transition-colors',
                noteTab === 'preview'
                  ? 'bg-secondary text-foreground'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              <Eye className="size-3" />
              Vista previa
            </button>
          </div>
        </div>

        {noteTab === 'write' ? (
          <Textarea
            id={noteId}
            rows={3}
            value={noteMarkdown}
            onChange={(e) => setNoteMarkdown(e.target.value)}
            onKeyDown={handleShortcutKeyDown}
            placeholder="Reflexión, resumen o enlaces con Markdown (**negrita**, *cursiva*, `código`, listas)..."
            className="resize-y font-mono text-xs leading-relaxed"
          />
        ) : (
          <div className="min-h-20 rounded-md border border-border bg-background/60 p-2.5">
            {noteMarkdown.trim() ? (
              <MarkdownPreview content={noteMarkdown} />
            ) : (
              <p className="text-xs italic text-muted-foreground">
                Sin nota escrita para previsualizar.
              </p>
            )}
          </div>
        )}
      </div>

      {displayedError ? (
        <p role="alert" className="text-xs text-destructive">
          {displayedError}
        </p>
      ) : null}

      <div className="flex items-center justify-between gap-2 pt-0.5">
        <span className="font-mono text-[10px] text-muted-foreground">
          Ctrl+Enter para guardar
        </span>
        <div className="flex items-center gap-1.5">
          <Button
            type="button"
            variant="ghost"
            size="xs"
            disabled={isPending}
            onClick={onCancel}
          >
            <X className="size-3" />
            Cancelar
          </Button>
          <Button type="submit" size="xs" disabled={isPending}>
            <Check className="size-3" />
            {isPending ? 'Guardando...' : submitLabel}
          </Button>
        </div>
      </div>
    </form>
  );
}
