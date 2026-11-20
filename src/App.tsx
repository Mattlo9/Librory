import { useQuery } from '@tanstack/react-query';
import { FolderPlus, Library, Sparkles, Terminal } from 'lucide-react';
import { useMemo, useState } from 'react';
import { EmptyState } from '@/components/ui/EmptyState';
import { HighlightsView } from '@/features/highlights/components/HighlightsView';
import { BookListView } from '@/features/library/components/BookListView';
import { BookShelfGrid } from '@/features/library/components/BookShelfGrid';
import { CommandPalette } from '@/features/library/components/CommandPalette';
import { ItemInspectorModal } from '@/features/library/components/ItemInspectorModal';
import { LibraryHeader } from '@/features/library/components/LibraryHeader';
import { TypeFilterBar } from '@/features/library/components/TypeFilterBar';
import {
  useHasSampleItems,
  useLibraryItems,
  useNavigationCounts,
  useSeedSampleLibrary,
  useTypeCounts,
} from '@/features/library/hooks/useLibraryData';
import { getSectionHeading } from '@/features/library/lib/libraryGrouping';
import { ShelfDialog } from '@/features/shelves/components/ShelfDialog';
import { Sidebar } from '@/features/shelves/components/Sidebar';
import { TagDialog } from '@/features/shelves/components/TagDialog';
import { useShelves, useTags } from '@/features/shelves/hooks/useShelvesAndTags';
import { isTauriRuntime } from '@/services/db';
import { ensureStorageDirectories } from '@/services/fileService';
import { useUiStore } from '@/store/uiStore';
import type { ItemType, ShelfWithCount, TagWithCount } from '@/types/domain';

const EMPTY_NAV_COUNTS = {
  inbox: 0,
  all: 0,
  recent: 0,
  highlights: 0,
};

const EMPTY_TYPE_COUNTS: Record<ItemType | 'all', number> = {
  all: 0,
  book: 0,
  summary: 0,
  article: 0,
  paper: 0,
  course: 0,
  unsorted: 0,
};

export function App() {
  const tauriActive = isTauriRuntime();

  const activeSection = useUiStore((s) => s.activeSection);
  const navigate = useUiStore((s) => s.navigate);
  const activeTypeFilter = useUiStore((s) => s.activeTypeFilter);
  const setActiveTypeFilter = useUiStore((s) => s.setActiveTypeFilter);
  const coverSize = useUiStore((s) => s.coverSize);
  const viewMode = useUiStore((s) => s.viewMode);
  const sortBy = useUiStore((s) => s.sortBy);
  const groupByShelf = useUiStore((s) => s.groupByShelf);
  const selectedItemId = useUiStore((s) => s.selectedItemId);
  const setSelectedItemId = useUiStore((s) => s.setSelectedItemId);

  const [shelfDialogState, setShelfDialogState] = useState<{
    open: boolean;
    editingShelf: ShelfWithCount | null;
    parentId: string | null;
  }>({ open: false, editingShelf: null, parentId: null });

  const [tagDialogState, setTagDialogState] = useState<{
    open: boolean;
    editingTag: TagWithCount | null;
  }>({ open: false, editingTag: null });

  useQuery({
    queryKey: ['app', 'storage-dirs'],
    queryFn: ensureStorageDirectories,
    enabled: tauriActive,
    staleTime: Number.POSITIVE_INFINITY,
  });

  const shelvesQuery = useShelves();
  const tagsQuery = useTags();
  const navCountsQuery = useNavigationCounts();
  const hasSampleQuery = useHasSampleItems();
  const seedSample = useSeedSampleLibrary();

  const shelves = shelvesQuery.data ?? [];
  const tags = tagsQuery.data ?? [];
  const navCounts = navCountsQuery.data ?? EMPTY_NAV_COUNTS;

  const typeCountsQuery = useTypeCounts(activeSection, shelves);
  const itemsQuery = useLibraryItems(
    activeSection,
    shelves,
    activeTypeFilter,
    sortBy,
  );

  const typeCounts = typeCountsQuery.data ?? EMPTY_TYPE_COUNTS;
  const items = itemsQuery.data ?? [];

  const heading = useMemo(
    () => getSectionHeading(activeSection, shelves, tags),
    [activeSection, shelves, tags],
  );

  if (!tauriActive) {
    return (
      <div className="bg-linen-surface flex h-screen items-center justify-center p-6">
        <EmptyState
          icon={<Terminal className="h-5 w-5" />}
          title="Ejecuta Librory en el runtime de escritorio"
          description="La base de datos SQLite local y el sistema de archivos requieren Tauri v2. Inicia la aplicación con 'bun run tauri dev'."
        />
      </div>
    );
  }

  const isHighlightsView = activeSection === 'highlights';
  const showEmptyLibraryActions =
    navCounts.all === 0 && activeTypeFilter === 'all';

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-bg-base text-text-primary">
      <Sidebar
        navCounts={navCounts}
        shelves={shelves}
        tags={tags}
        onCreateShelf={(parentId = null) =>
          setShelfDialogState({
            open: true,
            editingShelf: null,
            parentId,
          })
        }
        onEditShelf={(shelf) =>
          setShelfDialogState({
            open: true,
            editingShelf: shelf,
            parentId: shelf.parent_id,
          })
        }
        onCreateTag={() =>
          setTagDialogState({ open: true, editingTag: null })
        }
        onEditTag={(tag) =>
          setTagDialogState({ open: true, editingTag: tag })
        }
      />

      <main className="bg-linen-surface flex min-w-0 flex-1 flex-col overflow-hidden">
        <LibraryHeader
          segments={heading.segments}
          showViewControls={!isHighlightsView}
        />

        {!isHighlightsView ? (
          <TypeFilterBar
            activeType={activeTypeFilter}
            counts={typeCounts}
            onSelectType={setActiveTypeFilter}
          />
        ) : null}

        <div className="scrollbar-subtle flex-1 overflow-y-auto">
          {isHighlightsView ? (
            <HighlightsView onOpenItem={setSelectedItemId} />
          ) : itemsQuery.isLoading ? (
            <div className="px-6 py-10 font-mono text-xs text-text-muted">
              Cargando biblioteca...
            </div>
          ) : items.length === 0 ? (
            <div className="px-6 py-16">
              {showEmptyLibraryActions ? (
                <EmptyState
                  icon={<Library className="h-5 w-5" />}
                  title="Tu biblioteca local está vacía"
                  description="En la Fase 3 integraremos la importación de archivos PDF/EPUB desde tu equipo. Mientras tanto, puedes crear tu estructura de estanterías o cargar una colección de ejemplo para explorar la interfaz."
                  actions={
                    <>
                      <button
                        type="button"
                        onClick={() =>
                          setShelfDialogState({
                            open: true,
                            editingShelf: null,
                            parentId: null,
                          })
                        }
                        className="inline-flex items-center gap-1.5 rounded border border-border-strong bg-bg-elevated px-3 py-1.5 font-mono text-xs text-text-primary transition-colors hover:border-accent/60 hover:text-accent"
                      >
                        <FolderPlus className="h-3.5 w-3.5" />
                        Nueva estantería
                      </button>
                      <button
                        type="button"
                        disabled={seedSample.isPending}
                        onClick={() => seedSample.mutate()}
                        className="inline-flex items-center gap-1.5 rounded border border-accent/50 bg-accent/15 px-3 py-1.5 font-mono text-xs text-accent transition-colors hover:bg-accent/25 disabled:opacity-50"
                      >
                        <Sparkles className="h-3.5 w-3.5" />
                        {seedSample.isPending
                          ? 'Cargando ejemplo...'
                          : 'Cargar colección de ejemplo'}
                      </button>
                    </>
                  }
                />
              ) : (
                <EmptyState
                  icon={<Library className="h-5 w-5" />}
                  title="No hay recursos en esta vista"
                  description={
                    activeTypeFilter !== 'all'
                      ? 'Prueba cambiando el filtro de tipo a All para ver todos los elementos de esta sección.'
                      : 'Aún no hay elementos asignados a esta estantería o etiqueta.'
                  }
                  actions={
                    activeTypeFilter !== 'all' ? (
                      <button
                        type="button"
                        onClick={() => setActiveTypeFilter('all')}
                        className="rounded border border-border-strong bg-bg-elevated px-3 py-1.5 font-mono text-xs text-text-primary transition-colors hover:border-accent/60 hover:text-accent"
                      >
                        Mostrar todos los tipos
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => navigate('all')}
                        className="rounded border border-border-strong bg-bg-elevated px-3 py-1.5 font-mono text-xs text-text-primary transition-colors hover:border-accent/60 hover:text-accent"
                      >
                        Volver a All Books
                      </button>
                    )
                  }
                />
              )}
            </div>
          ) : viewMode === 'grid' ? (
            <BookShelfGrid
              items={items}
              shelves={shelves}
              section={activeSection}
              coverSize={coverSize}
              groupByShelf={groupByShelf}
              onSelectItem={setSelectedItemId}
              onSelectShelf={(shelfId) =>
                navigate({ kind: 'shelf', shelfId })
              }
            />
          ) : (
            <BookListView
              items={items}
              shelves={shelves}
              tags={tags}
              onSelectItem={setSelectedItemId}
            />
          )}
        </div>
      </main>

      <ItemInspectorModal
        itemId={selectedItemId}
        shelves={shelves}
        tags={tags}
        onClose={() => setSelectedItemId(null)}
      />

      <ShelfDialog
        open={shelfDialogState.open}
        onOpenChange={(open) =>
          setShelfDialogState((prev) => ({ ...prev, open }))
        }
        shelves={shelves}
        editingShelf={shelfDialogState.editingShelf}
        initialParentId={shelfDialogState.parentId}
      />

      <TagDialog
        open={tagDialogState.open}
        onOpenChange={(open) =>
          setTagDialogState((prev) => ({ ...prev, open }))
        }
        editingTag={tagDialogState.editingTag}
      />

      <CommandPalette
        shelves={shelves}
        tags={tags}
        hasSample={Boolean(hasSampleQuery.data)}
        onCreateShelf={() =>
          setShelfDialogState({
            open: true,
            editingShelf: null,
            parentId: null,
          })
        }
        onCreateTag={() =>
          setTagDialogState({ open: true, editingTag: null })
        }
      />
    </div>
  );
}
