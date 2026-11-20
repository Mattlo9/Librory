import { useQuery } from '@tanstack/react-query';
import { FolderPlus, Library, Sparkles, Terminal } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar';
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
      <div className="flex h-screen items-center justify-center bg-background p-6">
        <EmptyState
          icon={<Terminal className="size-5" />}
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
    <SidebarProvider className="h-screen overflow-hidden">
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

      <SidebarInset className="flex h-screen min-w-0 flex-1 flex-col overflow-hidden bg-background">
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
            <div className="px-6 py-10 text-xs text-muted-foreground">
              Cargando biblioteca...
            </div>
          ) : items.length === 0 ? (
            <div className="px-6 py-16">
              {showEmptyLibraryActions ? (
                <EmptyState
                  icon={<Library className="size-5" />}
                  title="Tu biblioteca local está vacía"
                  description="En la Fase 3 integraremos la importación de archivos PDF/EPUB desde tu equipo. Mientras tanto, puedes crear tu estructura de estanterías o cargar una colección de ejemplo para explorar el nuevo diseño."
                  actions={
                    <>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() =>
                          setShelfDialogState({
                            open: true,
                            editingShelf: null,
                            parentId: null,
                          })
                        }
                      >
                        <FolderPlus className="size-4" />
                        Nueva estantería
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        disabled={seedSample.isPending}
                        onClick={() => seedSample.mutate()}
                      >
                        <Sparkles className="size-4" />
                        {seedSample.isPending
                          ? 'Cargando ejemplo...'
                          : 'Cargar colección de ejemplo'}
                      </Button>
                    </>
                  }
                />
              ) : (
                <EmptyState
                  icon={<Library className="size-5" />}
                  title="No hay recursos en esta vista"
                  description={
                    activeTypeFilter !== 'all'
                      ? 'Prueba cambiando el filtro de tipo a All para ver todos los elementos de esta sección.'
                      : 'Aún no hay elementos asignados a esta estantería o etiqueta.'
                  }
                  actions={
                    activeTypeFilter !== 'all' ? (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setActiveTypeFilter('all')}
                      >
                        Mostrar todos los tipos
                      </Button>
                    ) : (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => navigate('all')}
                      >
                        Volver a All Books
                      </Button>
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
      </SidebarInset>

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
    </SidebarProvider>
  );
}
