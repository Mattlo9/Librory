import { Highlighter, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import {
  useDeleteHighlight,
  useHighlightsList,
} from '@/features/library/hooks/useLibraryData';
import { cn } from '@/lib/utils';
import type { HighlightColor, HighlightWithItem } from '@/types/domain';

interface HighlightsViewProps {
  onOpenItem: (itemId: string) => void;
}

const HIGHLIGHT_ACCENT: Record<HighlightColor, string> = {
  amber: 'border-l-amber-400/75',
  sage: 'border-l-emerald-400/70',
  clay: 'border-l-rose-400/70',
  slate: 'border-l-accent-brand',
};

const HIGHLIGHTS_LOADING_SKELETON = (
  <div
    role="status"
    aria-label="Cargando subrayados"
    className="mx-auto max-w-3xl space-y-4 px-6 py-8"
  >
    <Skeleton className="h-36 w-full rounded-xl" />
    <Skeleton className="h-32 w-full rounded-xl" />
  </div>
);

export function HighlightsView({ onOpenItem }: HighlightsViewProps) {
  const highlightsQuery = useHighlightsList(true);
  const deleteHighlight = useDeleteHighlight();
  const [highlightToDelete, setHighlightToDelete] =
    useState<HighlightWithItem | null>(null);

  if (highlightsQuery.isLoading) {
    return HIGHLIGHTS_LOADING_SKELETON;
  }

  const highlights = highlightsQuery.data ?? [];

  if (highlights.length === 0) {
    return (
      <div className="px-6 py-16">
        <EmptyState
          icon={<Highlighter className="size-5" />}
          title="Sin subrayados guardados"
          description="El lector integrado para subrayar PDFs y escribir notas en Markdown se incorporará en la Fase 4."
        />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4 px-6 py-8">
      {highlights.map((entry) => (
        <article
          key={entry.id}
          className={cn(
            'rounded-xl border border-border border-l-2 bg-card p-5 transition-colors [content-visibility:auto] [contain-intrinsic-size:auto_180px] hover:border-border/80',
            HIGHLIGHT_ACCENT[entry.color],
          )}
        >
          <blockquote className="font-serif text-[17px] leading-relaxed text-foreground">
            &ldquo;{entry.quote_text}&rdquo;
          </blockquote>

          {entry.note_markdown ? (
            <p className="mt-3 border-t border-border/60 pt-3 text-xs leading-relaxed text-muted-foreground">
              {entry.note_markdown}
            </p>
          ) : null}

          <footer className="mt-4 flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={() => onOpenItem(entry.item_id)}
              className="truncate rounded-sm text-xs font-medium text-muted-foreground outline-none transition-colors hover:text-accent-brand focus-visible:text-accent-brand focus-visible:ring-2 focus-visible:ring-ring"
            >
              <span>{entry.item_title}</span>
              {entry.item_author ? (
                <span className="font-serif italic"> — {entry.item_author}</span>
              ) : null}
              {entry.page_number ? (
                <span className="ml-2 font-mono text-[11px] text-muted-foreground/80">
                  pág. {entry.page_number}
                </span>
              ) : null}
            </button>

            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              aria-label="Eliminar subrayado"
              onClick={() => setHighlightToDelete(entry)}
              className="text-muted-foreground hover:bg-destructive/15 hover:text-destructive"
            >
              <Trash2 className="size-3.5" />
            </Button>
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
