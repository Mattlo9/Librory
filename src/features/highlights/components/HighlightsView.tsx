import { Highlighter, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { EmptyState } from '@/components/ui/EmptyState';
import {
  useDeleteHighlight,
  useHighlightsList,
} from '@/features/library/hooks/useLibraryData';
import { cn } from '@/lib/cn';
import type { HighlightColor, HighlightWithItem } from '@/types/domain';

interface HighlightsViewProps {
  onOpenItem: (itemId: string) => void;
}

const HIGHLIGHT_BORDER: Record<HighlightColor, string> = {
  amber: 'border-l-[#d4a373]',
  sage: 'border-l-[#7d9b76]',
  clay: 'border-l-[#b57468]',
  slate: 'border-l-[#6d8aa6]',
};

export function HighlightsView({ onOpenItem }: HighlightsViewProps) {
  const highlightsQuery = useHighlightsList(true);
  const deleteHighlight = useDeleteHighlight();
  const [highlightToDelete, setHighlightToDelete] =
    useState<HighlightWithItem | null>(null);

  if (highlightsQuery.isLoading) {
    return (
      <div className="px-6 py-10 font-mono text-xs text-text-muted">
        Cargando subrayados...
      </div>
    );
  }

  const highlights = highlightsQuery.data ?? [];

  if (highlights.length === 0) {
    return (
      <div className="px-6 py-16">
        <EmptyState
          icon={<Highlighter className="h-5 w-5" />}
          title="Sin subrayados guardados"
          description="El lector integrado para subrayar PDFs y escribir notas en Markdown se incorporará en la Fase 4."
        />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl space-y-4 px-6 py-6">
      {highlights.map((entry) => (
        <article
          key={entry.id}
          className={cn(
            'rounded-md border border-border-subtle border-l-2 bg-bg-elevated/75 p-4',
            HIGHLIGHT_BORDER[entry.color],
          )}
        >
          <blockquote className="font-mono text-[13px] leading-relaxed text-text-primary">
            &ldquo;{entry.quote_text}&rdquo;
          </blockquote>

          {entry.note_markdown ? (
            <p className="mt-2.5 border-t border-border-subtle/70 pt-2.5 text-xs leading-relaxed text-text-secondary">
              {entry.note_markdown}
            </p>
          ) : null}

          <footer className="mt-3 flex items-center justify-between gap-3 text-[11px]">
            <button
              type="button"
              onClick={() => onOpenItem(entry.item_id)}
              className="truncate font-mono text-text-secondary transition-colors hover:text-accent"
            >
              {entry.item_title}
              {entry.item_author ? ` — ${entry.item_author}` : ''}
              {entry.page_number ? ` · pág. ${entry.page_number}` : ''}
            </button>

            <button
              type="button"
              aria-label="Eliminar subrayado"
              onClick={() => setHighlightToDelete(entry)}
              className="rounded p-1 text-text-muted transition-colors hover:bg-bg-base hover:text-status-error"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </footer>
        </article>
      ))}

      <ConfirmDialog
        open={Boolean(highlightToDelete)}
        onOpenChange={(open) => {
          if (!open) setHighlightToDelete(null);
        }}
        title="Eliminar subrayado"
        description="Esta cita y su nota asociada se eliminarán permanentemente."
        isPending={deleteHighlight.isPending}
        onConfirm={async () => {
          if (!highlightToDelete) return;
          await deleteHighlight.mutateAsync(highlightToDelete.id);
          setHighlightToDelete(null);
        }}
      />
    </div>
  );
}
