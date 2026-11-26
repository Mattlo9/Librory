import { Highlighter, NotebookPen, X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  ReaderHighlightsPanel,
  type ReaderHighlightDraft,
} from '@/features/reader/components/ReaderHighlightsPanel';
import {
  ReaderNotesSection,
  type ReaderNoteQuoteInsert,
} from '@/features/reader/components/ReaderNotesSection';
import { cn } from '@/lib/utils';
import type { Highlight } from '@/types/domain';

export type ReaderSidePanelTab = 'highlights' | 'notes';

interface ReaderSidePanelProps {
  activeTab: ReaderSidePanelTab;
  onTabChange: (tab: ReaderSidePanelTab) => void;
  itemId: string;
  itemTitle: string;
  itemAuthor: string;
  currentPage: number;
  numPages: number;
  unitLabel?: string;
  highlights: Highlight[];
  notesCount: number;
  draft: ReaderHighlightDraft | null;
  onDraftChange: (draft: ReaderHighlightDraft | null) => void;
  onJumpToPage: (page: number) => void;
  pendingQuoteInsert: ReaderNoteQuoteInsert | null;
  onConsumeQuoteInsert: () => void;
  onClose: () => void;
}

/**
 * Tabbed side panel for the PDF/EPUB reader combining book highlights and Markdown notes.
 */
export function ReaderSidePanel({
  activeTab,
  onTabChange,
  itemId,
  itemTitle,
  itemAuthor,
  currentPage,
  numPages,
  unitLabel = 'pág.',
  highlights,
  notesCount,
  draft,
  onDraftChange,
  onJumpToPage,
  pendingQuoteInsert,
  onConsumeQuoteInsert,
  onClose,
}: ReaderSidePanelProps) {
  return (
    <aside
      aria-label="Panel de subrayados y notas"
      className="flex h-full w-[340px] shrink-0 flex-col border-l border-border bg-card lg:w-[392px]"
    >
      <div className="flex items-center justify-between gap-2 border-b border-border px-3.5 py-2.5">
        <div
          role="tablist"
          aria-label="Pestañas del panel del lector"
          className="grid flex-1 grid-cols-2 rounded-lg border border-border/70 bg-secondary/50 p-0.5"
        >
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'highlights'}
            onClick={() => onTabChange('highlights')}
            className={cn(
              'inline-flex items-center justify-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium transition-colors',
              activeTab === 'highlights'
                ? 'bg-background text-foreground shadow-xs'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            <Highlighter className="size-3.5 text-accent-brand" />
            <span>Subrayados</span>
            <Badge
              variant="secondary"
              className="h-4 rounded px-1 font-mono text-[10px] tabular-nums"
            >
              {highlights.length}
            </Badge>
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'notes'}
            onClick={() => onTabChange('notes')}
            className={cn(
              'inline-flex items-center justify-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium transition-colors',
              activeTab === 'notes'
                ? 'bg-background text-foreground shadow-xs'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            <NotebookPen className="size-3.5 text-accent-brand" />
            <span>Notas</span>
            <Badge
              variant="secondary"
              className="h-4 rounded px-1 font-mono text-[10px] tabular-nums"
            >
              {notesCount}
            </Badge>
          </button>
        </div>

        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          aria-label="Cerrar panel lateral"
          onClick={onClose}
        >
          <X className="size-3.5" />
        </Button>
      </div>

      {activeTab === 'highlights' ? (
        <ReaderHighlightsPanel
          embedded
          itemId={itemId}
          itemTitle={itemTitle}
          itemAuthor={itemAuthor}
          currentPage={currentPage}
          numPages={numPages}
          unitLabel={unitLabel}
          highlights={highlights}
          draft={draft}
          onDraftChange={onDraftChange}
          onJumpToPage={onJumpToPage}
          onClose={onClose}
        />
      ) : (
        <ReaderNotesSection
          itemId={itemId}
          itemTitle={itemTitle}
          currentPage={currentPage}
          unitLabel={unitLabel}
          pendingQuoteInsert={pendingQuoteInsert}
          onConsumeQuoteInsert={onConsumeQuoteInsert}
        />
      )}
    </aside>
  );
}
