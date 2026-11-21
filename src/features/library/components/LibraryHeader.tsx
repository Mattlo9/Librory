import {
  ArrowUpDown,
  BookMarked,
  ChevronLeft,
  ChevronRight,
  LayoutGrid,
  List,
  Search,
  Upload,
} from 'lucide-react';
import { memo } from 'react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Kbd, KbdGroup } from '@/components/ui/kbd';
import { Separator } from '@/components/ui/separator';
import { SidebarTrigger } from '@/components/ui/sidebar';
import { Slider } from '@/components/ui/slider';
import { ThemeMenu } from '@/components/ui/theme-menu';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { SORT_OPTION_LABELS } from '@/lib/text';
import { cn } from '@/lib/utils';
import { useUiStore } from '@/store/uiStore';
import type { SortOption, ViewMode } from '@/types/domain';

interface LibraryHeaderProps {
  segments: string[];
  showViewControls: boolean;
  isImporting?: boolean;
  onImportFiles?: () => void;
  onPreloadCommandPalette?: () => void;
}

const SORT_OPTIONS: SortOption[] = ['created_desc', 'title_asc', 'author_asc'];

export const LibraryHeader = memo(function LibraryHeader({
  segments,
  showViewControls,
  isImporting = false,
  onImportFiles,
  onPreloadCommandPalette,
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
  const sliderDisabled = viewMode !== 'grid';

  return (
    <header className="flex h-14 shrink-0 items-center justify-between gap-4 border-b border-border bg-background/90 px-5 backdrop-blur-sm">
      <div className="flex min-w-0 items-center gap-2">
        <SidebarTrigger className="size-8 text-muted-foreground hover:text-foreground" />
        <Separator orientation="vertical" className="h-4" />

        <div className="flex items-center gap-0.5">
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label="Atrás"
            disabled={!canGoBack}
            onClick={goBack}
            className="size-7 text-muted-foreground"
          >
            <ChevronLeft className="size-4" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label="Adelante"
            disabled={!canGoForward}
            onClick={goForward}
            className="size-7 text-muted-foreground"
          >
            <ChevronRight className="size-4" />
          </Button>
        </div>

        <h1 className="ml-1 flex min-w-0 items-center gap-1.5 font-sans text-[15px] font-semibold tracking-[-0.02em] text-foreground">
          {segments.map((segment, index) => (
            <span
              key={`${segment}-${index}`}
              className="flex min-w-0 items-center gap-1.5"
            >
              {index > 0 ? (
                <span aria-hidden="true" className="text-muted-foreground/60">
                  /
                </span>
              ) : null}
              <span
                className={cn(
                  'truncate',
                  index < segments.length - 1 && 'font-normal text-muted-foreground',
                )}
              >
                {segment}
              </span>
            </span>
          ))}
        </h1>
      </div>

      <div className="flex shrink-0 items-center gap-2.5">
        {showViewControls ? (
          <>
            <Tooltip>
              <TooltipTrigger asChild>
                <div
                  className={cn(
                    'hidden items-center gap-2 rounded-md border border-border/70 bg-secondary/40 px-2.5 py-1 sm:flex',
                    sliderDisabled && 'opacity-40',
                  )}
                >
                  <BookMarked className="size-3 text-muted-foreground" />
                  <Slider
                    aria-label="Tamaño de portadas"
                    disabled={sliderDisabled}
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
                    className="w-24 [&_[data-slot=slider-range]]:bg-accent-brand [&_[data-slot=slider-thumb]]:size-3 [&_[data-slot=slider-thumb]]:border-accent-brand"
                  />
                  <span
                    aria-hidden="true"
                    className="w-8 text-right font-mono text-[10.5px] tabular-nums text-muted-foreground"
                  >
                    {coverSize}
                  </span>
                </div>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                {sliderDisabled
                  ? 'Disponible en vista cuadrícula'
                  : `Tamaño de portadas (${coverSize}px)`}
              </TooltipContent>
            </Tooltip>

            <ToggleGroup
              type="single"
              variant="outline"
              size="sm"
              spacing={0}
              value={viewMode}
              onValueChange={(value) => {
                if (value) setViewMode(value as ViewMode);
              }}
              aria-label="Modo de vista"
            >
              <ToggleGroupItem
                value="grid"
                aria-label="Vista cuadrícula"
                className="px-2.5"
              >
                <LayoutGrid className="size-3.5" />
              </ToggleGroupItem>
              <ToggleGroupItem
                value="list"
                aria-label="Vista lista"
                className="px-2.5"
              >
                <List className="size-3.5" />
              </ToggleGroupItem>
            </ToggleGroup>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  size="icon-sm"
                  aria-label="Ordenar y agrupar"
                >
                  <ArrowUpDown className="size-3.5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel className="text-[11px] font-medium text-muted-foreground">
                  Visualización
                </DropdownMenuLabel>
                <DropdownMenuCheckboxItem
                  checked={groupByShelf}
                  onCheckedChange={(checked) => setGroupByShelf(checked === true)}
                  className="text-xs"
                >
                  Agrupar por estanterías
                </DropdownMenuCheckboxItem>
                <DropdownMenuSeparator />
                <DropdownMenuLabel className="text-[11px] font-medium text-muted-foreground">
                  Ordenar por
                </DropdownMenuLabel>
                <DropdownMenuRadioGroup
                  value={sortBy}
                  onValueChange={(value) => setSortBy(value as SortOption)}
                >
                  {SORT_OPTIONS.map((option) => (
                    <DropdownMenuRadioItem
                      key={option}
                      value={option}
                      className="text-xs"
                    >
                      {SORT_OPTION_LABELS[option]}
                    </DropdownMenuRadioItem>
                  ))}
                </DropdownMenuRadioGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        ) : null}

        <ThemeMenu />

        {onImportFiles ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={isImporting}
                aria-keyshortcuts="Control+I Meta+I"
                onClick={onImportFiles}
                className="h-8 gap-1.5 px-2.5 text-xs"
              >
                <Upload className="size-3.5" />
                <span className="hidden sm:inline">Importar</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              Importar PDF o EPUB (Ctrl+I)
            </TooltipContent>
          </Tooltip>
        ) : null}

        <Button
          type="button"
          variant="outline"
          size="sm"
          aria-keyshortcuts="Control+K Meta+K"
          onMouseEnter={onPreloadCommandPalette}
          onFocus={onPreloadCommandPalette}
          onClick={() => setCommandPaletteOpen(true)}
          className="h-8 gap-2 px-2.5 text-xs text-muted-foreground hover:text-foreground"
        >
          <Search className="size-3.5" />
          <span className="hidden md:inline">Buscar</span>
          <KbdGroup aria-hidden="true">
            <Kbd className="h-4 min-w-4 border border-border bg-secondary px-1 font-mono text-[10px]">
              Ctrl
            </Kbd>
            <Kbd className="h-4 min-w-4 border border-border bg-secondary px-1 font-mono text-[10px]">
              K
            </Kbd>
          </KbdGroup>
        </Button>
      </div>
    </header>
  );
});
