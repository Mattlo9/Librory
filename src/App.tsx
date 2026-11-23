import { FolderPlus, Library, Sparkles, Terminal, Upload } from 'lucide-react';
import { lazy, Suspense, useCallback, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { EmptyState } from '@/components/ui/empty-state';
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar';
import { Skeleton } from '@/components/ui/skeleton';
import type { BookItemActions } from '@/features/library/components/BookItemMenu';
import { BookShelfGrid } from '@/features/library/components/BookShelfGrid';
import { BulkActionBar } from '@/features/library/components/BulkActionBar';
import { ImportDropOverlay } from '@/features/library/components/ImportDropOverlay';
import { ImportStatusBanner } from '@/features/library/components/ImportStatusBanner';
import { LibraryHeader } from '@/features/library/components/LibraryHeader';
import { TypeFilterBar } from '@/features/library/components/TypeFilterBar';
import { useGlobalShortcuts } from '@/features/library/hooks/useGlobalShortcuts';
import { useImportBooks } from '@/features/library/hooks/useImportBooks';
import {
  useDeleteItem,
  useEnsureStorageDirectories,
  useHasSampleItems,
  useIsTauriRuntime,
  useLibraryItems,
  useNavigationCounts,
  useOpenBookExternally,
  useSeedSampleLibrary,
  useStatusCounts,
  useTypeCounts,
  useUpdateItem,
} from '@/features/library/hooks/useLibraryData';
import { getSectionHeading } from '@/features/library/lib/libraryGrouping';
import { Sidebar } from '@/features/shelves/components/Sidebar';
import { useShelves, useTags } from '@/features/shelves/hooks/useShelvesAndTags';
import { useThemeSync } from '@/hooks/useTheme';
import { useUiStore } from '@/store/uiStore';
import type {
  ItemStatus,
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
const LazyPdfReaderView = lazy(() =>
  import('@/features/reader/components/PdfReaderView').then((m) => ({
    default: m.PdfReaderView,
  })),
);

function preloadCommandPalette(): void {
  void loadCommandPalette();
}

const READER_LOADING_SKELETON = (
  <div className="flex h-screen w-screen flex-col bg-background">
    <div className="flex h-12 items-center justify-between border-b border-border bg-sidebar px-4">
      <Skeleton className="h-6 w-36" />
      <Skeleton className="h-6 w-48" />
      <Skeleton className="h-6 w-28" />
    </div>
    <div className="flex flex-1 items-center justify-center p-8">
      <Skeleton className="h-[78vh] w-[540px] rounded-md" />
    </div>
  </div>
);

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

const EMPTY_STATUS_COUNTS: Record<ItemStatus | 'all', number> = {
  all: 0,
  inbox: 0,
  to_read: 0,
  reading: 0,
  reference: 0,
  finished: 0,
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
  useThemeSync();
  const tauriActive = useIsTauriRuntime();

  const activeSection = useUiStore((s) => s.activeSection);
  const navigate = useUiStore((s) => s.navigate);
  const activeTypeFilter = useUiStore((s) => s.activeTypeFilter);
  const setActiveTypeFilter = useUiStore((s) => s.setActiveTypeFilter);
  const activeStatusFilter = useUiStore((s) => s.activeStatusFilter);
  const setActiveStatusFilter = useUiStore((s) => s.setActiveStatusFilter);
  const viewMode = useUiStore((s) => s.viewMode);
  const sortBy = useUiStore((s) => s.sortBy);
  const groupByShelf = useUiStore((s) => s.groupByShelf);
  const sidebarOpen = useUiStore((s) => s.sidebarOpen);
  const setSidebarOpen = useUiStore((s) => s.setSidebarOpen);
  const commandPaletteOpen = useUiStore((s) => s.commandPaletteOpen);
  const selectedItemId = useUiStore((s) => s.selectedItemId);
  const setSelectedItemId = useUiStore((s) => s.setSelectedItemId);
  const selectionMode = useUiStore((s) => s.selectionMode);
  const selectedItemIds = useUiStore((s) => s.selectedItemIds);
  const toggleItemSelection = useUiStore((s) => s.toggleItemSelection);
  const selectItemRange = useUiStore((s) => s.selectItemRange);
  const selectAllItems = useUiStore((s) => s.selectAllItems);
  const clearSelection = useUiStore((s) => s.clearSelection);
  const readerTarget = useUiStore((s) => s.readerTarget);
  const openReader = useUiStore((s) => s.openReader);
  const closeReader = useUiStore((s) => s.closeReader);

  const [shelfDialogState, setShelfDialogState] = useState<{
    open: boolean;
    editingShelf: ShelfWithCount | null;
    parentId: string | null;
  }>({ open: false, editingShelf: null, parentId: null });

  const [tagDialogState, setTagDialogState] = useState<{
    open: boolean;
    editingTag: TagWithCount | null;
  }>({ open: false, editingTag: null });
  const [itemPendingDelete, setItemPendingDelete] =
    useState<LibraryItemWithRelations | null>(null);

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

  const {
    isDraggingFiles,
    draggedCount,
    isImporting,
    progress: importProgress,
    summary: importSummary,
    importFromDialog,
    dismissSummary,
  } = useImportBooks(tauriActive);

  const shelvesQuery = useShelves();
  const tagsQuery = useTags();
  const navCountsQuery = useNavigationCounts();
  const hasSampleQuery = useHasSampleItems();
  const seedSample = useSeedSampleLibrary();
  const updateItem = useUpdateItem();
  const deleteItem = useDeleteItem();
  const openBookExternally = useOpenBookExternally();

  const updateItemMutate = updateItem.mutate;
  const openBookExternallyMutateAsync = openBookExternally.mutateAsync;

  const shelves = shelvesQuery.data ?? EMPTY_SHELVES;
  const tags = tagsQuery.data ?? EMPTY_TAGS;
  const navCounts = navCountsQuery.data ?? EMPTY_NAV_COUNTS;

  const typeCountsQuery = useTypeCounts(
    activeSection,
    shelves,
    activeStatusFilter,
  );
  const statusCountsQuery = useStatusCounts(
    activeSection,
    shelves,
    activeTypeFilter,
  );
  const itemsQuery = useLibraryItems(
    activeSection,
    shelves,
    activeTypeFilter,
    activeStatusFilter,
    sortBy,
  );

  const typeCounts = typeCountsQuery.data ?? EMPTY_TYPE_COUNTS;
  const statusCounts = statusCountsQuery.data ?? EMPTY_STATUS_COUNTS;
  const items = itemsQuery.data ?? EMPTY_ITEMS;

  const orderedItemIds = useMemo(
    () => items.map((item) => item.id),
    [items],
  );
  const selectedIdsSet = useMemo(
    () => new Set(selectedItemIds),
    [selectedItemIds],
  );
  const selectedItems = useMemo(
    () => items.filter((item) => selectedIdsSet.has(item.id)),
    [items, selectedIdsSet],
  );
  const selectionActive = selectionMode || selectedItems.length > 0;

  const handleSelectAllVisible = useCallback(() => {
    selectAllItems(orderedItemIds);
  }, [orderedItemIds, selectAllItems]);

  useGlobalShortcuts(tauriActive, importFromDialog, handleSelectAllVisible);
  useEnsureStorageDirectories();

  const bookActions = useMemo<BookItemActions>(
    () => ({
      onSelect: setSelectedItemId,
      onOpenReader: openReader,
      onOpenExternally: (item) => {
        void openBookExternallyMutateAsync(item);
      },
      onChangeStatus: (item, status) => {
        updateItemMutate({ id: item.id, patch: { status } });
      },
      onRequestDelete: (item) => {
        setItemPendingDelete(item);
      },
      onToggleSelect: (id, shiftKey) => {
        if (shiftKey) {
          selectItemRange(orderedItemIds, id);
        } else {
          toggleItemSelection(id);
        }
      },
    }),
    [
      openBookExternallyMutateAsync,
      openReader,
      orderedItemIds,
      selectItemRange,
      setSelectedItemId,
      toggleItemSelection,
      updateItemMutate,
    ],
  );

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
  const hasActiveFilters =
    activeTypeFilter !== 'all' ||
    (activeSection !== 'inbox' && activeStatusFilter !== 'all');
  const showEmptyLibraryActions = navCounts.all === 0 && !hasActiveFilters;

  return (
    <>
      {readerTarget ? (
        <div className="h-screen w-screen overflow-hidden bg-background">
          <Suspense fallback={READER_LOADING_SKELETON}>
            <LazyPdfReaderView
              key={readerTarget.itemId}
              itemId={readerTarget.itemId}
              initialPage={readerTarget.page}
              onClose={closeReader}
            />
          </Suspense>
        </div>
      ) : (
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
              isImporting={isImporting}
              onImportFiles={importFromDialog}
              onPreloadCommandPalette={preloadCommandPalette}
            />

            {!isHighlightsView ? (
              <TypeFilterBar
                activeType={activeTypeFilter}
                counts={typeCounts}
                activeStatus={activeStatusFilter}
                statusCounts={statusCounts}
                showStatusFilter={activeSection !== 'inbox'}
                onSelectType={setActiveTypeFilter}
                onSelectStatus={setActiveStatusFilter}
              />
            ) : null}

            <div className="scrollbar-subtle flex-1 overflow-y-auto">
              {isHighlightsView ? (
                <Suspense fallback={LIBRARY_LOADING_SKELETON}>
                  <LazyHighlightsView
                    onOpenItem={setSelectedItemId}
                    onOpenInReader={openReader}
                  />
                </Suspense>
              ) : itemsQuery.isLoading ? (
                LIBRARY_LOADING_SKELETON
              ) : items.length === 0 ? (
                <div className="px-6 py-16">
                  {showEmptyLibraryActions ? (
                    <EmptyState
                      icon={<Library className="size-5" />}
                      title="Tu biblioteca local está vacía"
                      description="Arrastra archivos PDF o EPUB a esta ventana o usa el selector nativo para guardarlos en tu biblioteca local con metadatos y miniatura."
                      actions={
                        <>
                          <Button
                            type="button"
                            size="sm"
                            disabled={isImporting}
                            onClick={() => void importFromDialog()}
                          >
                            <Upload className="size-4" />
                            Importar PDF / EPUB
                          </Button>
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
                            variant="ghost"
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
                        hasActiveFilters
                          ? 'Prueba limpiando los filtros de tipo y estado para ver todos los elementos de esta sección.'
                          : 'Aún no hay elementos asignados a esta estantería o etiqueta.'
                      }
                      actions={
                        hasActiveFilters ? (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setActiveTypeFilter('all');
                              setActiveStatusFilter('all');
                            }}
                          >
                            Limpiar filtros
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
                  bookActions={bookActions}
                  selectedIdsSet={selectedIdsSet}
                  selectionActive={selectionActive}
                  onSelectShelf={handleSelectShelf}
                />
              ) : (
                <Suspense fallback={LIBRARY_LOADING_SKELETON}>
                  <LazyBookListView
                    items={items}
                    shelves={shelves}
                    tags={tags}
                    bookActions={bookActions}
                    selectedIdsSet={selectedIdsSet}
                    selectionActive={selectionActive}
                  />
                </Suspense>
              )}
            </div>
          </SidebarInset>

          <ImportDropOverlay visible={isDraggingFiles} fileCount={draggedCount} />
          <ImportStatusBanner
            progress={importProgress}
            summary={importSummary}
            showGoToInbox={activeSection !== 'inbox'}
            onGoToInbox={() => navigate('inbox')}
            onDismiss={dismissSummary}
          />
          {!isHighlightsView ? (
            <BulkActionBar
              selectedItems={selectedItems}
              totalVisibleCount={items.length}
              shelves={shelves}
              onSelectAll={handleSelectAllVisible}
              onClear={clearSelection}
              onDeletedIds={(ids) => {
                if (selectedItemId && ids.includes(selectedItemId)) {
                  setSelectedItemId(null);
                }
              }}
            />
          ) : null}
        </SidebarProvider>
      )}

      {hasMountedInspector ? (
        <Suspense fallback={null}>
          <LazyItemInspectorModal
            itemId={selectedItemId}
            shelves={shelves}
            tags={tags}
            onClose={handleCloseInspector}
            onOpenReader={openReader}
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
            onImportFiles={importFromDialog}
          />
        </Suspense>
      ) : null}

      <ConfirmDialog
        open={Boolean(itemPendingDelete)}
        onOpenChange={(open) => {
          if (!open && !deleteItem.isPending) {
            setItemPendingDelete(null);
          }
        }}
        title="Eliminar recurso"
        description={
          itemPendingDelete
            ? `Se eliminará "${itemPendingDelete.title}" de la biblioteca local y del índice de búsqueda.`
            : ''
        }
        isPending={deleteItem.isPending}
        onConfirm={async () => {
          if (!itemPendingDelete) return;
          const deletedId = itemPendingDelete.id;
          await deleteItem.mutateAsync(deletedId);
          setItemPendingDelete(null);
          if (selectedItemId === deletedId) {
            setSelectedItemId(null);
          }
        }}
      />
    </>
  );
}
