import {
  BookOpen,
  CheckSquare,
  Clock,
  FolderPlus,
  FolderTree,
  Hash,
  Highlighter,
  Inbox,
  LayoutGrid,
  Library,
  ListFilter,
  Monitor,
  Moon,
  Sparkles,
  Sun,
  Tag,
  Upload,
  X,
} from 'lucide-react';
import { useDeferredValue, useMemo, useState, type ReactNode } from 'react';
import { Badge } from '@/components/ui/badge';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from '@/components/ui/command';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Kbd } from '@/components/ui/kbd';
import {
  useClearSampleLibrary,
  useSearchHighlightsFts,
  useSearchItemsFts,
  useSeedSampleLibrary,
} from '@/features/library/hooks/useLibraryData';
import { isPdfReadableLocally } from '@/lib/highlights';
import { getShelfBreadcrumb } from '@/lib/shelfTree';
import { ITEM_TYPE_SINGULAR, normalizeForSearch } from '@/lib/text';
import { useUiStore } from '@/store/uiStore';
import type { ShelfWithCount, TagWithCount } from '@/types/domain';

interface CommandPaletteProps {
  shelves: ShelfWithCount[];
  tags: TagWithCount[];
  hasSample: boolean;
  onCreateShelf: () => void;
  onCreateTag: () => void;
  onImportFiles?: () => void;
}

interface QuickActionItem {
  id: string;
  label: string;
  searchable: string;
  shortcut?: string;
  icon: ReactNode;
  run: () => void;
}

const ACTION_ICONS = {
  inbox: <Inbox className="size-4" />,
  all: <Library className="size-4" />,
  recent: <Clock className="size-4" />,
  highlights: <Highlighter className="size-4" />,
  newShelf: <FolderPlus className="size-4" />,
  newTag: <Tag className="size-4" />,
  toggleView: <LayoutGrid className="size-4" />,
  selectionMode: <CheckSquare className="size-4" />,
  themeLight: <Sun className="size-4" />,
  themeDark: <Moon className="size-4" />,
  themeSystem: <Monitor className="size-4" />,
  statusFilter: <ListFilter className="size-4" />,
  clearFilter: <X className="size-4" />,
  sample: <Sparkles className="size-4" />,
  importFiles: <Upload className="size-4" />,
} as const;

export function CommandPalette({
  shelves,
  tags,
  hasSample,
  onCreateShelf,
  onCreateTag,
  onImportFiles,
}: CommandPaletteProps) {
  const open = useUiStore((s) => s.commandPaletteOpen);
  const setOpen = useUiStore((s) => s.setCommandPaletteOpen);
  const activeSection = useUiStore((s) => s.activeSection);
  const navigate = useUiStore((s) => s.navigate);
  const activeStatusFilter = useUiStore((s) => s.activeStatusFilter);
  const setActiveStatusFilter = useUiStore((s) => s.setActiveStatusFilter);
  const viewMode = useUiStore((s) => s.viewMode);
  const setViewMode = useUiStore((s) => s.setViewMode);
  const selectionMode = useUiStore((s) => s.selectionMode);
  const setSelectionMode = useUiStore((s) => s.setSelectionMode);
  const setTheme = useUiStore((s) => s.setTheme);
  const setSelectedItemId = useUiStore((s) => s.setSelectedItemId);
  const openReader = useUiStore((s) => s.openReader);

  const [query, setQuery] = useState('');
  const deferredQuery = useDeferredValue(query);

  const searchQuery = useSearchItemsFts(deferredQuery, open);
  const highlightsSearchQuery = useSearchHighlightsFts(deferredQuery, open);
  const { mutateAsync: seedSampleAsync } = useSeedSampleLibrary();
  const { mutateAsync: clearSampleAsync } = useClearSampleLibrary();

  const normalizedQuery = normalizeForSearch(deferredQuery);

  const indexedShelves = useMemo(() => {
    const shelfById = new Map(shelves.map((shelf) => [shelf.id, shelf]));
    return shelves.map((shelf) => {
      const breadcrumb = getShelfBreadcrumb(shelf.id, shelfById).join(' / ');
      return {
        shelf,
        breadcrumb,
        normalizedBreadcrumb: normalizeForSearch(breadcrumb),
      };
    });
  }, [shelves]);

  const matchingShelves = useMemo(() => {
    if (!normalizedQuery) return indexedShelves.slice(0, 6);
    return indexedShelves.filter((entry) =>
      entry.normalizedBreadcrumb.includes(normalizedQuery),
    );
  }, [indexedShelves, normalizedQuery]);

  const matchingTags = useMemo(() => {
    if (!normalizedQuery) return tags.slice(0, 6);
    return tags.filter((tag) =>
      normalizeForSearch(tag.name).includes(normalizedQuery),
    );
  }, [normalizedQuery, tags]);

  const allQuickActions = useMemo<QuickActionItem[]>(() => {
    const items: Array<{
      id: string;
      label: string;
      keywords: string;
      shortcut?: string;
      icon: ReactNode;
      run: () => void;
    }> = [
      {
        id: 'nav-inbox',
        label: 'Ir a Inbox',
        keywords: 'inbox bandeja entrada',
        shortcut: 'Alt+1',
        icon: ACTION_ICONS.inbox,
        run: () => navigate('inbox'),
      },
      {
        id: 'nav-all',
        label: 'Ir a All Books',
        keywords: 'all books biblioteca todo',
        shortcut: 'Alt+2',
        icon: ACTION_ICONS.all,
        run: () => navigate('all'),
      },
      {
        id: 'nav-recent',
        label: 'Ir a Recent',
        keywords: 'recent recientes leidos',
        shortcut: 'Alt+3',
        icon: ACTION_ICONS.recent,
        run: () => navigate('recent'),
      },
      {
        id: 'nav-highlights',
        label: 'Ir a Highlights',
        keywords: 'highlights subrayados citas notas',
        shortcut: 'Alt+4',
        icon: ACTION_ICONS.highlights,
        run: () => navigate('highlights'),
      },
      ...(onImportFiles
        ? [
            {
              id: 'import-files',
              label: 'Importar archivos (PDF / EPUB)',
              keywords: 'importar agregar subir pdf epub libros archivo',
              shortcut: 'Ctrl+I',
              icon: ACTION_ICONS.importFiles,
              run: onImportFiles,
            },
          ]
        : []),
      {
        id: 'new-shelf',
        label: 'Crear nueva estantería',
        keywords: 'nueva estanteria shelf carpeta proyecto',
        icon: ACTION_ICONS.newShelf,
        run: onCreateShelf,
      },
      {
        id: 'new-tag',
        label: 'Crear nueva etiqueta',
        keywords: 'nueva etiqueta tag',
        icon: ACTION_ICONS.newTag,
        run: onCreateTag,
      },
      {
        id: 'toggle-view',
        label:
          viewMode === 'grid'
            ? 'Cambiar a vista de lista'
            : 'Cambiar a vista de cuadrícula',
        keywords: 'vista grid lista cuadricula',
        icon: ACTION_ICONS.toggleView,
        run: () => setViewMode(viewMode === 'grid' ? 'list' : 'grid'),
      },
      {
        id: 'toggle-selection-mode',
        label: selectionMode
          ? 'Salir de selección múltiple'
          : 'Activar selección múltiple',
        keywords: 'seleccion multiple lote varios checkboxes',
        icon: ACTION_ICONS.selectionMode,
        run: () => setSelectionMode(!selectionMode),
      },
      {
        id: 'theme-light',
        label: 'Tema: Modo claro',
        keywords: 'tema claro light apariencia color',
        icon: ACTION_ICONS.themeLight,
        run: () => setTheme('light'),
      },
      {
        id: 'theme-dark',
        label: 'Tema: Modo oscuro',
        keywords: 'tema oscuro dark apariencia color',
        icon: ACTION_ICONS.themeDark,
        run: () => setTheme('dark'),
      },
      {
        id: 'theme-system',
        label: 'Tema: Seguir sistema',
        keywords: 'tema sistema system auto apariencia color',
        icon: ACTION_ICONS.themeSystem,
        run: () => setTheme('system'),
      },
      {
        id: 'status-filter-reading',
        label: 'Filtrar estado: Leyendo',
        keywords: 'filtrar estado leyendo reading progreso',
        icon: ACTION_ICONS.statusFilter,
        run: () => {
          if (activeSection === 'highlights' || activeSection === 'inbox') {
            navigate('all');
          }
          setActiveStatusFilter('reading');
        },
      },
      {
        id: 'status-filter-to-read',
        label: 'Filtrar estado: Por leer',
        keywords: 'filtrar estado por leer to read pendiente',
        icon: ACTION_ICONS.statusFilter,
        run: () => {
          if (activeSection === 'highlights' || activeSection === 'inbox') {
            navigate('all');
          }
          setActiveStatusFilter('to_read');
        },
      },
      {
        id: 'status-filter-finished',
        label: 'Filtrar estado: Terminado',
        keywords: 'filtrar estado terminado finished completado',
        icon: ACTION_ICONS.statusFilter,
        run: () => {
          if (activeSection === 'highlights' || activeSection === 'inbox') {
            navigate('all');
          }
          setActiveStatusFilter('finished');
        },
      },
      {
        id: 'status-filter-reference',
        label: 'Filtrar estado: Referencia',
        keywords: 'filtrar estado referencia reference consulta',
        icon: ACTION_ICONS.statusFilter,
        run: () => {
          if (activeSection === 'highlights' || activeSection === 'inbox') {
            navigate('all');
          }
          setActiveStatusFilter('reference');
        },
      },
      ...(activeStatusFilter !== 'all'
        ? [
            {
              id: 'status-filter-clear',
              label: 'Limpiar filtro de estado',
              keywords: 'limpiar quitar reset filtro estado todos',
              icon: ACTION_ICONS.clearFilter,
              run: () => setActiveStatusFilter('all'),
            },
          ]
        : []),
      hasSample
        ? {
            id: 'clear-sample',
            label: 'Limpiar colección de ejemplo',
            keywords: 'limpiar ejemplo sample demo borrar',
            icon: ACTION_ICONS.sample,
            run: () => {
              void clearSampleAsync();
            },
          }
        : {
            id: 'seed-sample',
            label: 'Cargar colección de ejemplo',
            keywords: 'cargar ejemplo sample demo libros',
            icon: ACTION_ICONS.sample,
            run: () => {
              void seedSampleAsync();
            },
          },
    ];

    return items.map((item) => ({
      id: item.id,
      label: item.label,
      searchable: normalizeForSearch(`${item.label} ${item.keywords}`),
      shortcut: item.shortcut,
      icon: item.icon,
      run: item.run,
    }));
  }, [
    activeSection,
    activeStatusFilter,
    clearSampleAsync,
    hasSample,
    navigate,
    onCreateShelf,
    onCreateTag,
    onImportFiles,
    seedSampleAsync,
    selectionMode,
    setActiveStatusFilter,
    setSelectionMode,
    setTheme,
    setViewMode,
    viewMode,
  ]);

  const quickActions = useMemo(() => {
    if (!normalizedQuery) return allQuickActions;
    return allQuickActions.filter((action) =>
      action.searchable.includes(normalizedQuery),
    );
  }, [allQuickActions, normalizedQuery]);

  function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen);
    if (!nextOpen) {
      setQuery('');
    }
  }

  function runAndClose(action: () => void) {
    handleOpenChange(false);
    action();
  }

  const ftsResults = searchQuery.data ?? [];
  const highlightsFtsResults = highlightsSearchQuery.data ?? [];
  const hasAnyResults =
    ftsResults.length > 0 ||
    highlightsFtsResults.length > 0 ||
    matchingShelves.length > 0 ||
    matchingTags.length > 0 ||
    quickActions.length > 0;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="overflow-hidden border-border bg-popover p-0 sm:max-w-[600px]"
      >
        <DialogHeader className="sr-only">
          <DialogTitle>Paleta de comandos</DialogTitle>
          <DialogDescription>
            Busca libros y subrayados por texto completo FTS5, estanterías, etiquetas o acciones.
          </DialogDescription>
        </DialogHeader>

        <Command
          shouldFilter={false}
          className="**:data-[slot=command-input-wrapper]:h-12 [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-muted-foreground [&_[cmdk-group]]:px-2 [&_[cmdk-item]]:px-2.5 [&_[cmdk-item]]:py-2"
        >
          <div className="relative flex items-center">
            <div className="w-full">
              <CommandInput
                autoFocus
                value={query}
                onValueChange={setQuery}
                placeholder="Buscar títulos, autores, subrayados (FTS5), estanterías o comandos..."
              />
            </div>
            <Kbd
              aria-hidden="true"
              className="pointer-events-none absolute right-3 border border-border bg-secondary px-1.5 font-mono text-[10px]"
            >
              ESC
            </Kbd>
          </div>

          <CommandList className="scrollbar-subtle max-h-[380px] p-1">
            {!hasAnyResults &&
            !searchQuery.isFetching &&
            !highlightsSearchQuery.isFetching ? (
              <CommandEmpty className="py-8 text-center text-xs text-muted-foreground">
                Sin coincidencias para &ldquo;{query}&rdquo;.
              </CommandEmpty>
            ) : null}

            {deferredQuery.trim().length > 0 ? (
              <CommandGroup heading="Biblioteca (FTS5)">
                {searchQuery.isFetching && ftsResults.length === 0 ? (
                  <div
                    role="status"
                    aria-live="polite"
                    className="px-3 py-2 text-xs text-muted-foreground"
                  >
                    Buscando en índice FTS5...
                  </div>
                ) : null}
                {ftsResults.map(({ item }) => (
                  <CommandItem
                    key={item.id}
                    value={`item:${item.id}`}
                    onSelect={() =>
                      runAndClose(() => setSelectedItemId(item.id))
                    }
                    className="cursor-pointer justify-between gap-3"
                  >
                    <div className="flex min-w-0 items-center gap-2.5">
                      <BookOpen className="size-4 shrink-0 text-accent-brand" />
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-foreground">
                          {item.title}
                        </p>
                        {item.author ? (
                          <p className="truncate font-serif text-xs italic text-muted-foreground">
                            {item.author}
                          </p>
                        ) : null}
                      </div>
                    </div>
                    <Badge
                      variant="secondary"
                      className="shrink-0 rounded-md font-mono text-[10px] font-normal"
                    >
                      {ITEM_TYPE_SINGULAR[item.type]}
                    </Badge>
                  </CommandItem>
                ))}
              </CommandGroup>
            ) : null}

            {deferredQuery.trim().length > 0 && highlightsFtsResults.length > 0 ? (
              <>
                <CommandSeparator />
                <CommandGroup heading="Subrayados (FTS5)">
                  {highlightsFtsResults.slice(0, 8).map((entry) => {
                    const canReadLocally = isPdfReadableLocally(
                      entry.item_file_path,
                      entry.item_file_format,
                    );
                    return (
                      <CommandItem
                        key={entry.id}
                        value={`highlight:${entry.id}`}
                        onSelect={() =>
                          runAndClose(() =>
                            canReadLocally
                              ? openReader(
                                  entry.item_id,
                                  entry.page_number ?? undefined,
                                )
                              : setSelectedItemId(entry.item_id),
                          )
                        }
                        className="cursor-pointer justify-between gap-3"
                      >
                        <div className="flex min-w-0 items-center gap-2.5">
                          <Highlighter className="size-4 shrink-0 text-amber-600 dark:text-amber-400" />
                          <div className="min-w-0">
                            <p className="truncate font-serif text-[13px] text-foreground">
                              &ldquo;{entry.quote_text}&rdquo;
                            </p>
                            <p className="truncate text-[11px] text-muted-foreground">
                              {entry.item_title}
                            </p>
                          </div>
                        </div>
                        {entry.page_number ? (
                          <Badge
                            variant="outline"
                            className="shrink-0 rounded-md font-mono text-[10px] font-normal tabular-nums text-muted-foreground"
                          >
                            pág. {entry.page_number}
                          </Badge>
                        ) : null}
                      </CommandItem>
                    );
                  })}
                </CommandGroup>
              </>
            ) : null}

            {matchingShelves.length > 0 ? (
              <CommandGroup heading="Estanterías">
                {matchingShelves.map(({ shelf, breadcrumb }) => (
                  <CommandItem
                    key={shelf.id}
                    value={`shelf:${shelf.id}`}
                    onSelect={() =>
                      runAndClose(() =>
                        navigate({ kind: 'shelf', shelfId: shelf.id }),
                      )
                    }
                    className="cursor-pointer justify-between"
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      <FolderTree className="size-4 shrink-0" />
                      <span className="truncate">{breadcrumb}</span>
                    </span>
                    <span className="font-mono text-xs tabular-nums text-muted-foreground">
                      {shelf.item_count}
                    </span>
                  </CommandItem>
                ))}
              </CommandGroup>
            ) : null}

            {matchingTags.length > 0 ? (
              <>
                <CommandSeparator />
                <CommandGroup heading="Etiquetas">
                  {matchingTags.map((tag) => (
                    <CommandItem
                      key={tag.id}
                      value={`tag:${tag.id}`}
                      onSelect={() =>
                        runAndClose(() => navigate({ kind: 'tag', tagId: tag.id }))
                      }
                      className="cursor-pointer justify-between"
                    >
                      <span className="flex items-center gap-2">
                        <Hash className="size-4" />
                        <span>{tag.name}</span>
                      </span>
                      <span className="font-mono text-xs tabular-nums text-muted-foreground">
                        {tag.item_count}
                      </span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              </>
            ) : null}

            {quickActions.length > 0 ? (
              <>
                <CommandSeparator />
                <CommandGroup heading="Acciones">
                  {quickActions.map((action) => (
                    <CommandItem
                      key={action.id}
                      value={action.id}
                      onSelect={() => runAndClose(action.run)}
                      className="cursor-pointer"
                    >
                      {action.icon}
                      <span>{action.label}</span>
                      {action.shortcut ? (
                        <CommandShortcut>{action.shortcut}</CommandShortcut>
                      ) : null}
                    </CommandItem>
                  ))}
                </CommandGroup>
              </>
            ) : null}
          </CommandList>
        </Command>
      </DialogContent>
    </Dialog>
  );
}
