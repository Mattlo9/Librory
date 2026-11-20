import {
  BookOpen,
  Clock,
  FolderPlus,
  FolderTree,
  Hash,
  Highlighter,
  Inbox,
  LayoutGrid,
  Library,
  Sparkles,
  Tag,
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
  useSearchItemsFts,
  useSeedSampleLibrary,
} from '@/features/library/hooks/useLibraryData';
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
  sample: <Sparkles className="size-4" />,
} as const;

export function CommandPalette({
  shelves,
  tags,
  hasSample,
  onCreateShelf,
  onCreateTag,
}: CommandPaletteProps) {
  const open = useUiStore((s) => s.commandPaletteOpen);
  const setOpen = useUiStore((s) => s.setCommandPaletteOpen);
  const navigate = useUiStore((s) => s.navigate);
  const viewMode = useUiStore((s) => s.viewMode);
  const setViewMode = useUiStore((s) => s.setViewMode);
  const setSelectedItemId = useUiStore((s) => s.setSelectedItemId);

  const [query, setQuery] = useState('');
  const deferredQuery = useDeferredValue(query);

  const searchQuery = useSearchItemsFts(deferredQuery, open);
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
    clearSampleAsync,
    hasSample,
    navigate,
    onCreateShelf,
    onCreateTag,
    seedSampleAsync,
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
  const hasAnyResults =
    ftsResults.length > 0 ||
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
            Busca libros por texto completo FTS5, estanterías, etiquetas o acciones.
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
                placeholder="Buscar títulos, autores, notas (FTS5), estanterías o comandos..."
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
            {!hasAnyResults && !searchQuery.isFetching ? (
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
