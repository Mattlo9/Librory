import {
  ArrowUpDown,
  BookMarked,
  Check,
  ChevronLeft,
  ChevronRight,
  LayoutGrid,
  List,
  Search,
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/DropdownMenu';
import { Slider } from '@/components/ui/Slider';
import { cn } from '@/lib/cn';
import { SORT_OPTION_LABELS } from '@/lib/text';
import { useUiStore } from '@/store/uiStore';
import type { SortOption } from '@/types/domain';

interface LibraryHeaderProps {
  segments: string[];
  showViewControls: boolean;
}

const SORT_OPTIONS: SortOption[] = ['created_desc', 'title_asc', 'author_asc'];

export function LibraryHeader({
  segments,
  showViewControls,
}: LibraryHeaderProps) {
  const historyIndex = useUiStore((s) => s.historyIndex);
  const historyLength = useUiStore((s) => s.history.length);
  const goBack = useUiStore((s) => s.goBack);
  const goForward = useUiStore((s) => s.goForward);
  const coverSize = useUiStore((s) => s.coverSize);
  const setCoverSize = useUiStore((s) => s.setCoverSize);
  const viewMode = useUiStore((s) => s.viewMode);
  const setViewMode = useUiStore((s) => s.setViewMode);
  const sortBy = useUiStore((s) => s.sortBy);
  const setSortBy = useUiStore((s) => s.setSortBy);
  const groupByShelf = useUiStore((s) => s.groupByShelf);
  const setGroupByShelf = useUiStore((s) => s.setGroupByShelf);
  const setCommandPaletteOpen = useUiStore((s) => s.setCommandPaletteOpen);

  const canGoBack = historyIndex > 0;
  const canGoForward = historyIndex < historyLength - 1;

  return (
    <header className="px-6 pb-2 pt-3">
      <div className="mb-1.5 flex items-center gap-1">
        <button
          type="button"
          aria-label="Atrás"
          disabled={!canGoBack}
          onClick={goBack}
          className="rounded p-1 text-text-secondary transition-colors hover:bg-bg-hover hover:text-text-primary disabled:pointer-events-none disabled:opacity-30"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <button
          type="button"
          aria-label="Adelante"
          disabled={!canGoForward}
          onClick={goForward}
          className="rounded p-1 text-text-secondary transition-colors hover:bg-bg-hover hover:text-text-primary disabled:pointer-events-none disabled:opacity-30"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="flex min-w-0 flex-wrap items-center gap-2 font-mono text-[21px] font-medium tracking-tight text-text-primary">
          {segments.map((segment, index) => (
            <span key={`${segment}-${index}`} className="flex items-center gap-2">
              {index > 0 ? (
                <ChevronRight className="h-4 w-4 text-text-muted" />
              ) : null}
              <span className="truncate">{segment}</span>
            </span>
          ))}
        </h1>

        <div className="flex items-center gap-3">
          {showViewControls ? (
            <>
              <div
                className={cn(
                  'hidden items-center gap-2 sm:flex',
                  viewMode !== 'grid' && 'pointer-events-none opacity-35',
                )}
                title={`Tamaño de portada: ${coverSize}px`}
              >
                <BookMarked className="h-3 w-3 text-text-muted" />
                <Slider
                  aria-label="Tamaño de portadas"
                  value={[coverSize]}
                  min={110}
                  max={240}
                  step={4}
                  onValueChange={(values) => {
                    const next = values[0];
                    if (typeof next === 'number') {
                      setCoverSize(next);
                    }
                  }}
                />
                <BookMarked className="h-4 w-4 text-text-secondary" />
              </div>

              <div
                role="group"
                aria-label="Modo de vista"
                className="flex items-center rounded border border-border-subtle bg-bg-elevated/70 p-0.5"
              >
                <button
                  type="button"
                  aria-label="Vista cuadrícula"
                  aria-pressed={viewMode === 'grid'}
                  onClick={() => setViewMode('grid')}
                  className={cn(
                    'rounded p-1 transition-colors',
                    viewMode === 'grid'
                      ? 'bg-bg-active text-text-primary'
                      : 'text-text-muted hover:text-text-primary',
                  )}
                >
                  <LayoutGrid className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  aria-label="Vista lista"
                  aria-pressed={viewMode === 'list'}
                  onClick={() => setViewMode('list')}
                  className={cn(
                    'rounded p-1 transition-colors',
                    viewMode === 'list'
                      ? 'bg-bg-active text-text-primary'
                      : 'text-text-muted hover:text-text-primary',
                  )}
                >
                  <List className="h-3.5 w-3.5" />
                </button>
              </div>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    aria-label="Ordenar y agrupar"
                    className="rounded border border-border-subtle bg-bg-elevated/70 p-1.5 text-text-secondary transition-colors hover:border-border-strong hover:text-text-primary"
                  >
                    <ArrowUpDown className="h-3.5 w-3.5" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-52">
                  <DropdownMenuLabel>Visualización</DropdownMenuLabel>
                  <DropdownMenuItem
                    onSelect={() => setGroupByShelf(!groupByShelf)}
                    className="justify-between"
                  >
                    <span>Agrupar por estanterías</span>
                    {groupByShelf ? (
                      <Check className="h-3.5 w-3.5 text-accent" />
                    ) : null}
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuLabel>Ordenar por</DropdownMenuLabel>
                  {SORT_OPTIONS.map((option) => (
                    <DropdownMenuItem
                      key={option}
                      onSelect={() => setSortBy(option)}
                      className="justify-between"
                    >
                      <span>{SORT_OPTION_LABELS[option]}</span>
                      {sortBy === option ? (
                        <Check className="h-3.5 w-3.5 text-accent" />
                      ) : null}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </>
          ) : null}

          <button
            type="button"
            onClick={() => setCommandPaletteOpen(true)}
            className="flex items-center gap-2 rounded border border-border-subtle bg-bg-elevated/80 px-2.5 py-1 font-mono text-[11px] text-text-secondary transition-colors hover:border-border-strong hover:text-text-primary"
          >
            <Search className="h-3.5 w-3.5 text-text-muted" />
            <span className="hidden sm:inline">Buscar</span>
            <kbd className="rounded border border-border-subtle bg-bg-base px-1 py-0.5 text-[10px] text-text-muted">
              Ctrl+K
            </kbd>
          </button>
        </div>
      </div>
    </header>
  );
}
