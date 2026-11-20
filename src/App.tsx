import { FolderPlus, Library, Sparkles, Terminal } from 'lucide-react';
import { lazy, Suspense, useCallback, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar';
import { Skeleton } from '@/components/ui/skeleton';
import { BookShelfGrid } from '@/features/library/components/BookShelfGrid';
import { LibraryHeader } from '@/features/library/components/LibraryHeader';
import { TypeFilterBar } from '@/features/library/components/TypeFilterBar';
import { useGlobalShortcuts } from '@/features/library/hooks/useGlobalShortcuts';
import {
  useEnsureStorageDirectories,
  useHasSampleItems,
  useIsTauriRuntime,
  useLibraryItems,
  useNavigationCounts,
  useSeedSampleLibrary,
  useTypeCounts,
} from '@/features/library/hooks/useLibraryData';
import { getSectionHeading } from '@/features/library/lib/libraryGrouping';
import { Sidebar } from '@/features/shelves/components/Sidebar';
import { useShelves, useTags } from '@/features/shelves/hooks/useShelvesAndTags';
import { useUiStore } from '@/store/uiStore';
import type {
  ItemType,
  LibraryItemWithRelations,
  ShelfWithCount,
  TagWithCount,
} from '@/types/domain';

const loadCommandPalette = () =>
  import('@/features/library/components/CommandPalette').then((m) => ({
    default: m.CommandPalette,
  }));

const LazyCommandPalette = lazy(loadCommandPalette);
const LazyItemInspectorModal = lazy(() =>
  import('@/features/library/components/ItemInspectorModal').then((m) => ({
    default: m.ItemInspectorModal,
  })),
);
const LazyHighlightsView = lazy(() =>
  import('@/features/highlights/components/HighlightsView').then((m) => ({
    default: m.HighlightsView,
  })),
);
const LazyBookListView = lazy(() =>
  import('@/features/library/components/BookListView').then((m) => ({
    default: m.BookListView,
  })),
);
const LazyShelfDialog = lazy(() =>
  import('@/features/shelves/components/ShelfDialog').then((m) => ({
    default: m.ShelfDialog,
  })),
);
const LazyTagDialog = lazy(() =>
  import('@/features/shelves/components/TagDialog').then((m) => ({
    default: m.TagDialog,
  })),
);

function preloadCommandPalette(): void {
  void loadCommandPalette();
}

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

const EMPTY_SHELVES: ShelfWithCount[] = [];
const EMPTY_TAGS: TagWithCount[] = [];
const EMPTY_ITEMS: LibraryItemWithRelations[] = [];

const LIBRARY_LOADING_SKELETON = (
  <div
    role="status"
    aria-label="Cargando biblioteca"
    className="grid grid-cols-[repeat(auto-fill,minmax(158px,158px))] gap-x-6 gap-y-8 px-6 py-6"
  >
    {Array.from({ length: 8 }, (_, idx) => (
      <div key={idx} className="space-y-2.5">
        <Skeleton className="aspect-[2/3] w-full rounded-md" />
        <Skeleton className="h-3.5 w-4/5" />
        <Skeleton className="h-3 w-3/5" />
      </div>
    ))}
  </div>
);

export function App() {
  const tauriActive = useIsTauriRuntime();

  const activeSection = useUiStore((s) => s.activeSection);
  const navigate = useUiStore((s) => s.navigate);
  const activeTypeFilter = useUiStore((s) => s.activeTypeFilter);
  const setActiveTypeFilter = useUiStore((s) => s.setActiveTypeFilter);
  const viewMode = useUiStore((s) => s.viewMode);
  const sortBy = useUiStore((s) => s.sortBy);
  const groupByShelf = useUiStore((s) => s.groupByShelf);
  const sidebarOpen = useUiStore((s) => s.sidebarOpen);
  const setSidebarOpen = useUiStore((s) => s.setSidebarOpen);
  const commandPaletteOpen = useUiStore((s) => s.commandPaletteOpen);
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

  // Latch mount state on first activation so overlays split out of initial load
  // while keeping smooth close transitions after first open.
  const [hasMountedPalette, setHasMountedPalette] = useState(false);
  const [hasMountedInspector, setHasMountedInspector] = useState(false);
  const [hasMountedShelfDialog, setHasMountedShelfDialog] = useState(false);
  const [hasMountedTagDialog, setHasMountedTagDialog] = useState(false);

  if (commandPaletteOpen && !hasMountedPalette) {
    setHasMountedPalette(true);
  }
  if (selectedItemId && !hasMountedInspector) {
    setHasMountedInspector(true);
  }
  if (shelfDialogState.open && !hasMountedShelfDialog) {
    setHasMountedShelfDialog(true);
  }
  if (tagDialogState.open && !hasMountedTagDialog) {
    setHasMountedTagDialog(true);
  }

  useGlobalShortcuts(tauriActive);
  useEnsureStorageDirectories();

  const shelvesQuery = useShelves();
  const tagsQuery = useTags();
  const navCountsQuery = useNavigationCounts();
  const hasSampleQuery = useHasSampleItems();
  const seedSample = useSeedSampleLibrary();

  const shelves = shelvesQuery.data ?? EMPTY_SHELVES;
  const tags = tagsQuery.data ?? EMPTY_TAGS;
  const navCounts = navCountsQuery.data ?? EMPTY_NAV_COUNTS;

  const typeCountsQuery = useTypeCounts(activeSection, shelves);
  const itemsQuery = useLibraryItems(
    activeSection,
    shelves,
    activeTypeFilter,
    sortBy,
  );

  const typeCounts = typeCountsQuery.data ?? EMPTY_TYPE_COUNTS;
  const items = itemsQuery.data ?? EMPTY_ITEMS;

  const heading = useMemo(
    () => getSectionHeading(activeSection, shelves, tags),
    [activeSection, shelves, tags],
  );

  const handleCreateShelf = useCallback((parentId: string | null = null) => {
    setShelfDialogState({
      open: true,
      editingShelf: null,
      parentId,
    });
  }, []);

  const handleEditShelf = useCallback((shelf: ShelfWithCount) => {
    setShelfDialogState({
      open: true,
      editingShelf: shelf,
      parentId: shelf.parent_id,
    });
  }, []);

  const handleCreateTag = useCallback(() => {
    setTagDialogState({ open: true, editingTag: null });
  }, []);

  const handleEditTag = useCallback((tag: TagWithCount) => {
    setTagDialogState({ open: true, editingTag: tag });
  }, []);

  const handleSelectShelf = useCallback(
    (shelfId: string) => navigate({ kind: 'shelf', shelfId }),
    [navigate],
  );

  const handleCloseInspector = useCallback(
    () => setSelectedItemId(null),
    [setSelectedItemId],
  );

  const handleShelfDialogOpenChange = useCallback((open: boolean) => {
    setShelfDialogState((prev) => ({ ...prev, open }));
  }, []);

  const handleTagDialogOpenChange = useCallback((open: boolean) => {
    setTagDialogState((prev) => ({ ...prev, open }));
  }, []);

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
    <SidebarProvider
      open={sidebarOpen}
      onOpenChange={setSidebarOpen}
      className="h-screen overflow-hidden"
    >
      <Sidebar
        navCounts={navCounts}
        shelves={shelves}
        tags={tags}
        onCreateShelf={handleCreateShelf}
        onEditShelf={handleEditShelf}
        onCreateTag={handleCreateTag}
        onEditTag={handleEditTag}
        onPreloadCommandPalette={preloadCommandPalette}
      />

      <SidebarInset className="flex h-screen min-w-0 flex-1 flex-col overflow-hidden bg-background">
        <LibraryHeader
          segments={heading.segments}
          showViewControls={!isHighlightsView}
          onPreloadCommandPalette={preloadCommandPalette}
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
            <Suspense fallback={LIBRARY_LOADING_SKELETON}>
              <LazyHighlightsView onOpenItem={setSelectedItemId} />
            </Suspense>
          ) : itemsQuery.isLoading ? (
            LIBRARY_LOADING_SKELETON
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
                        onClick={() => handleCreateShelf(null)}
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
              groupByShelf={groupByShelf}
              onSelectItem={setSelectedItemId}
              onSelectShelf={handleSelectShelf}
            />
          ) : (
            <Suspense fallback={LIBRARY_LOADING_SKELETON}>
              <LazyBookListView
                items={items}
                shelves={shelves}
                tags={tags}
                onSelectItem={setSelectedItemId}
              />
            </Suspense>
          )}
        </div>
      </SidebarInset>

      {hasMountedInspector ? (
        <Suspense fallback={null}>
          <LazyItemInspectorModal
            itemId={selectedItemId}
            shelves={shelves}
            tags={tags}
            onClose={handleCloseInspector}
          />
        </Suspense>
      ) : null}

      {hasMountedShelfDialog ? (
        <Suspense fallback={null}>
          <LazyShelfDialog
            open={shelfDialogState.open}
            onOpenChange={handleShelfDialogOpenChange}
            shelves={shelves}
            editingShelf={shelfDialogState.editingShelf}
            initialParentId={shelfDialogState.parentId}
          />
        </Suspense>
      ) : null}

      {hasMountedTagDialog ? (
        <Suspense fallback={null}>
          <LazyTagDialog
            open={tagDialogState.open}
            onOpenChange={handleTagDialogOpenChange}
            editingTag={tagDialogState.editingTag}
          />
        </Suspense>
      ) : null}

      {hasMountedPalette ? (
        <Suspense fallback={null}>
          <LazyCommandPalette
            shelves={shelves}
            tags={tags}
            hasSample={Boolean(hasSampleQuery.data)}
            onCreateShelf={handleCreateShelf}
            onCreateTag={handleCreateTag}
          />
        </Suspense>
      ) : null}
    </SidebarProvider>
  );
}
