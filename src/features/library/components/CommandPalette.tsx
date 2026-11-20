import { Command } from 'cmdk';
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
  Search,
  Sparkles,
  Tag,
} from 'lucide-react';
import { useDeferredValue, useEffect, useMemo, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/Dialog';
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
  const seedSample = useSeedSampleLibrary();
  const clearSample = useClearSampleLibrary();

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() === 'k' && (event.ctrlKey || event.metaKey)) {
        event.preventDefault();
        setOpen(!useUiStore.getState().commandPaletteOpen);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [setOpen]);

  const normalizedQuery = normalizeForSearch(deferredQuery);
  const shelfById = useMemo(
    () => new Map(shelves.map((shelf) => [shelf.id, shelf])),
    [shelves],
  );

  const matchingShelves = useMemo(() => {
    if (!normalizedQuery) return shelves.slice(0, 6);
    return shelves.filter((shelf) => {
      const fullPath = getShelfBreadcrumb(shelf.id, shelfById).join(' ');
      return normalizeForSearch(fullPath).includes(normalizedQuery);
    });
  }, [normalizedQuery, shelfById, shelves]);

  const matchingTags = useMemo(() => {
    if (!normalizedQuery) return tags.slice(0, 6);
    return tags.filter((tag) =>
      normalizeForSearch(tag.name).includes(normalizedQuery),
    );
  }, [normalizedQuery, tags]);

  const quickActions = useMemo(() => {
    const actions = [
      {
        id: 'nav-inbox',
        label: 'Ir a Inbox',
        keywords: 'inbox bandeja entrada',
        icon: <Inbox className="h-3.5 w-3.5 text-text-muted" />,
        run: () => navigate('inbox'),
      },
      {
        id: 'nav-all',
        label: 'Ir a All Books',
        keywords: 'all books biblioteca todo',
        icon: <Library className="h-3.5 w-3.5 text-text-muted" />,
        run: () => navigate('all'),
      },
      {
        id: 'nav-recent',
        label: 'Ir a Recent',
        keywords: 'recent recientes leidos',
        icon: <Clock className="h-3.5 w-3.5 text-text-muted" />,
        run: () => navigate('recent'),
      },
      {
        id: 'nav-highlights',
        label: 'Ir a Highlights',
        keywords: 'highlights subrayados citas notas',
        icon: <Highlighter className="h-3.5 w-3.5 text-text-muted" />,
        run: () => navigate('highlights'),
      },
      {
        id: 'new-shelf',
        label: 'Crear nueva estantería',
        keywords: 'nueva estanteria shelf carpeta proyecto',
        icon: <FolderPlus className="h-3.5 w-3.5 text-text-muted" />,
        run: onCreateShelf,
      },
      {
        id: 'new-tag',
        label: 'Crear nueva etiqueta',
        keywords: 'nueva etiqueta tag',
        icon: <Tag className="h-3.5 w-3.5 text-text-muted" />,
        run: onCreateTag,
      },
      {
        id: 'toggle-view',
        label:
          viewMode === 'grid'
            ? 'Cambiar a vista de lista'
            : 'Cambiar a vista de cuadrícula',
        keywords: 'vista grid lista cuadricula',
        icon: <LayoutGrid className="h-3.5 w-3.5 text-text-muted" />,
        run: () => setViewMode(viewMode === 'grid' ? 'list' : 'grid'),
      },
      hasSample
        ? {
            id: 'clear-sample',
            label: 'Limpiar colección de ejemplo',
            keywords: 'limpiar ejemplo sample demo borrar',
            icon: <Sparkles className="h-3.5 w-3.5 text-text-muted" />,
            run: () => {
              void clearSample.mutateAsync();
            },
          }
        : {
            id: 'seed-sample',
            label: 'Cargar colección de ejemplo',
            keywords: 'cargar ejemplo sample demo libros',
            icon: <Sparkles className="h-3.5 w-3.5 text-text-muted" />,
            run: () => {
              void seedSample.mutateAsync();
            },
          },
    ];

    if (!normalizedQuery) return actions;
    return actions.filter((action) =>
      normalizeForSearch(`${action.label} ${action.keywords}`).includes(
        normalizedQuery,
      ),
    );
  }, [
    clearSample,
    hasSample,
    navigate,
    normalizedQuery,
    onCreateShelf,
    onCreateTag,
    seedSample,
    setViewMode,
    viewMode,
  ]);

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
        hideCloseButton
        className="w-[min(94vw,600px)] overflow-hidden p-0"
      >
        <DialogTitle className="sr-only">Paleta de comandos</DialogTitle>
        <DialogDescription className="sr-only">
          Busca libros por texto completo FTS5, estanterías, etiquetas o acciones.
        </DialogDescription>

        <Command shouldFilter={false} className="flex flex-col bg-bg-elevated">
          <div className="flex items-center gap-2.5 border-b border-border-subtle px-3.5 py-2.5">
            <Search className="h-4 w-4 shrink-0 text-text-muted" />
            <Command.Input
              autoFocus
              value={query}
              onValueChange={setQuery}
              placeholder="Buscar títulos, autores, notas (FTS5), estanterías o comandos..."
              className="w-full bg-transparent font-mono text-xs text-text-primary placeholder:text-text-muted focus:outline-none"
            />
            <kbd className="shrink-0 rounded border border-border-subtle bg-bg-base px-1.5 py-0.5 font-mono text-[10px] text-text-muted">
              ESC
            </kbd>
          </div>

          <Command.List className="scrollbar-subtle max-h-[380px] overflow-y-auto p-1.5">
            {!hasAnyResults && !searchQuery.isFetching ? (
              <Command.Empty className="py-8 text-center font-mono text-xs text-text-muted">
                Sin coincidencias para &ldquo;{query}&rdquo;.
              </Command.Empty>
            ) : null}

            {deferredQuery.trim().length > 0 ? (
              <Command.Group heading="Biblioteca (FTS5)">
                {searchQuery.isFetching && ftsResults.length === 0 ? (
                  <div className="px-3 py-2 font-mono text-[11px] text-text-muted">
                    Buscando en índice FTS5...
                  </div>
                ) : null}
                {ftsResults.map(({ item }) => (
                  <Command.Item
                    key={item.id}
                    value={`item:${item.id}`}
                    onSelect={() =>
                      runAndClose(() => setSelectedItemId(item.id))
                    }
                    className="flex cursor-pointer items-center justify-between gap-3 rounded px-3 py-2 text-xs text-text-secondary"
                  >
                    <div className="flex min-w-0 items-center gap-2.5">
                      <BookOpen className="h-3.5 w-3.5 shrink-0 text-accent" />
                      <div className="min-w-0">
                        <p className="truncate font-mono text-text-primary">
                          {item.title}
                        </p>
                        {item.author ? (
                          <p className="truncate text-[11px] italic text-text-secondary">
                            {item.author}
                          </p>
                        ) : null}
                      </div>
                    </div>
                    <span className="shrink-0 rounded border border-border-subtle bg-bg-base px-1.5 py-0.5 font-mono text-[10px] text-text-muted">
                      {ITEM_TYPE_SINGULAR[item.type]}
                    </span>
                  </Command.Item>
                ))}
              </Command.Group>
            ) : null}

            {matchingShelves.length > 0 ? (
              <Command.Group heading="Estanterías">
                {matchingShelves.map((shelf) => (
                  <Command.Item
                    key={shelf.id}
                    value={`shelf:${shelf.id}`}
                    onSelect={() =>
                      runAndClose(() =>
                        navigate({ kind: 'shelf', shelfId: shelf.id }),
                      )
                    }
                    className="flex cursor-pointer items-center justify-between gap-2 rounded px-3 py-1.5 font-mono text-xs text-text-secondary"
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      <FolderTree className="h-3.5 w-3.5 shrink-0 text-text-muted" />
                      <span className="truncate">
                        {getShelfBreadcrumb(shelf.id, shelfById).join(' › ')}
                      </span>
                    </span>
                    <span className="text-[11px] tabular-nums text-text-muted">
                      {shelf.item_count}
                    </span>
                  </Command.Item>
                ))}
              </Command.Group>
            ) : null}

            {matchingTags.length > 0 ? (
              <Command.Group heading="Etiquetas">
                {matchingTags.map((tag) => (
                  <Command.Item
                    key={tag.id}
                    value={`tag:${tag.id}`}
                    onSelect={() =>
                      runAndClose(() => navigate({ kind: 'tag', tagId: tag.id }))
                    }
                    className="flex cursor-pointer items-center justify-between gap-2 rounded px-3 py-1.5 font-mono text-xs text-text-secondary"
                  >
                    <span className="flex items-center gap-2">
                      <Hash className="h-3.5 w-3.5 text-text-muted" />
                      <span>{tag.name}</span>
                    </span>
                    <span className="text-[11px] tabular-nums text-text-muted">
                      {tag.item_count}
                    </span>
                  </Command.Item>
                ))}
              </Command.Group>
            ) : null}

            {quickActions.length > 0 ? (
              <Command.Group heading="Acciones">
                {quickActions.map((action) => (
                  <Command.Item
                    key={action.id}
                    value={action.id}
                    onSelect={() => runAndClose(action.run)}
                    className="flex cursor-pointer items-center gap-2 rounded px-3 py-1.5 font-mono text-xs text-text-secondary"
                  >
                    {action.icon}
                    <span>{action.label}</span>
                  </Command.Item>
                ))}
              </Command.Group>
            ) : null}
          </Command.List>
        </Command>
      </DialogContent>
    </Dialog>
  );
}
