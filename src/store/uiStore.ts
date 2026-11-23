import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type {
  ItemType,
  NavigationSection,
  SortOption,
  ThemePreference,
  ViewMode,
} from '@/types/domain';

export function isSameNavigationSection(
  a: NavigationSection,
  b: NavigationSection,
): boolean {
  if (typeof a === 'string' && typeof b === 'string') {
    return a === b;
  }
  if (typeof a === 'object' && typeof b === 'object') {
    if (a.kind !== b.kind) return false;
    return a.kind === 'shelf' && b.kind === 'shelf'
      ? a.shelfId === b.shelfId
      : a.kind === 'tag' && b.kind === 'tag'
        ? a.tagId === b.tagId
        : false;
  }
  return false;
}

export function getNavigationSectionKey(section: NavigationSection): string {
  if (typeof section === 'string') return section;
  return section.kind === 'shelf' ? `shelf:${section.shelfId}` : `tag:${section.tagId}`;
}

const MAX_HISTORY_ENTRIES = 50;

interface UiState {
  activeSection: NavigationSection;
  history: NavigationSection[];
  historyIndex: number;
  activeTypeFilter: ItemType | 'all';
  coverSize: number;
  viewMode: ViewMode;
  sortBy: SortOption;
  groupByShelf: boolean;
  theme: ThemePreference;
  sidebarOpen: boolean;
  expandedShelfIds: Record<string, boolean>;
  tagsExpanded: boolean;
  commandPaletteOpen: boolean;
  selectedItemId: string | null;
  selectionMode: boolean;
  selectedItemIds: string[];
  lastSelectedItemId: string | null;
  readerTarget: { itemId: string; page?: number } | null;
  navigate: (section: NavigationSection) => void;
  setActiveSection: (section: NavigationSection) => void;
  goBack: () => void;
  goForward: () => void;
  setActiveTypeFilter: (type: ItemType | 'all') => void;
  setCoverSize: (size: number) => void;
  setViewMode: (mode: ViewMode) => void;
  setSortBy: (sort: SortOption) => void;
  setGroupByShelf: (grouped: boolean) => void;
  setTheme: (theme: ThemePreference) => void;
  setSidebarOpen: (open: boolean) => void;
  toggleShelfExpanded: (id: string) => void;
  setShelfExpanded: (id: string, open: boolean) => void;
  toggleTagsExpanded: () => void;
  setCommandPaletteOpen: (open: boolean) => void;
  setSelectedItemId: (id: string | null) => void;
  setSelectionMode: (active: boolean) => void;
  toggleItemSelection: (id: string) => void;
  selectItemRange: (orderedIds: string[], targetId: string) => void;
  selectAllItems: (ids: string[]) => void;
  clearSelection: () => void;
  openReader: (itemId: string, page?: number) => void;
  closeReader: () => void;
}

export const useUiStore = create<UiState>()(
  persist(
    (set, get) => ({
      activeSection: 'all',
      history: ['all'],
      historyIndex: 0,
      activeTypeFilter: 'all',
      coverSize: 158,
      viewMode: 'grid',
      sortBy: 'created_desc',
      groupByShelf: true,
      theme: 'dark',
      sidebarOpen: true,
      expandedShelfIds: {},
      tagsExpanded: true,
      commandPaletteOpen: false,
      selectedItemId: null,
      selectionMode: false,
      selectedItemIds: [],
      lastSelectedItemId: null,
      readerTarget: null,

      navigate: (section) => {
        const { activeSection, history, historyIndex, readerTarget } = get();
        if (isSameNavigationSection(activeSection, section)) {
          if (readerTarget !== null) {
            set({ readerTarget: null });
          }
          return;
        }
        const nextHistory = history.slice(0, historyIndex + 1);
        nextHistory.push(section);
        const boundedHistory =
          nextHistory.length > MAX_HISTORY_ENTRIES
            ? nextHistory.slice(nextHistory.length - MAX_HISTORY_ENTRIES)
            : nextHistory;
        set({
          activeSection: section,
          history: boundedHistory,
          historyIndex: boundedHistory.length - 1,
          readerTarget: null,
          selectionMode: false,
          selectedItemIds: [],
          lastSelectedItemId: null,
        });
      },

      setActiveSection: (section) => get().navigate(section),

      goBack: () => {
        const { history, historyIndex } = get();
        if (historyIndex <= 0) return;
        const target = history[historyIndex - 1];
        if (!target) return;
        set({
          activeSection: target,
          historyIndex: historyIndex - 1,
          readerTarget: null,
          selectionMode: false,
          selectedItemIds: [],
          lastSelectedItemId: null,
        });
      },

      goForward: () => {
        const { history, historyIndex } = get();
        if (historyIndex >= history.length - 1) return;
        const target = history[historyIndex + 1];
        if (!target) return;
        set({
          activeSection: target,
          historyIndex: historyIndex + 1,
          readerTarget: null,
          selectionMode: false,
          selectedItemIds: [],
          lastSelectedItemId: null,
        });
      },

      setActiveTypeFilter: (activeTypeFilter) =>
        set({
          activeTypeFilter,
          selectionMode: false,
          selectedItemIds: [],
          lastSelectedItemId: null,
        }),

      setCoverSize: (coverSize) =>
        set({ coverSize: Math.min(240, Math.max(110, coverSize)) }),

      setViewMode: (viewMode) => set({ viewMode }),

      setSortBy: (sortBy) => set({ sortBy }),

      setGroupByShelf: (groupByShelf) => set({ groupByShelf }),

      setTheme: (theme) => set({ theme }),

      setSidebarOpen: (sidebarOpen) => set({ sidebarOpen }),

      toggleShelfExpanded: (id) =>
        set((state) => ({
          expandedShelfIds: {
            ...state.expandedShelfIds,
            [id]: !(state.expandedShelfIds[id] ?? true),
          },
        })),

      setShelfExpanded: (id, open) =>
        set((state) => ({
          expandedShelfIds: {
            ...state.expandedShelfIds,
            [id]: open,
          },
        })),

      toggleTagsExpanded: () =>
        set((state) => ({ tagsExpanded: !state.tagsExpanded })),

      setCommandPaletteOpen: (commandPaletteOpen) => set({ commandPaletteOpen }),

      setSelectedItemId: (selectedItemId) =>
        set((state) => ({
          selectedItemId,
          readerTarget: selectedItemId ? null : state.readerTarget,
        })),

      setSelectionMode: (active) =>
        set(
          active
            ? { selectionMode: true }
            : {
                selectionMode: false,
                selectedItemIds: [],
                lastSelectedItemId: null,
              },
        ),

      toggleItemSelection: (id) =>
        set((state) => {
          const exists = state.selectedItemIds.includes(id);
          if (exists) {
            return {
              selectedItemIds: state.selectedItemIds.filter((entry) => entry !== id),
              lastSelectedItemId: id,
            };
          }
          return {
            selectionMode: true,
            selectedItemIds: [...state.selectedItemIds, id],
            lastSelectedItemId: id,
          };
        }),

      selectItemRange: (orderedIds, targetId) => {
        const { lastSelectedItemId, selectedItemIds, toggleItemSelection } = get();
        const anchorIdx = lastSelectedItemId
          ? orderedIds.indexOf(lastSelectedItemId)
          : -1;
        const targetIdx = orderedIds.indexOf(targetId);

        if (anchorIdx < 0 || targetIdx < 0) {
          toggleItemSelection(targetId);
          return;
        }

        const start = Math.min(anchorIdx, targetIdx);
        const end = Math.max(anchorIdx, targetIdx);
        const merged = new Set(selectedItemIds);
        for (let i = start; i <= end; i += 1) {
          const entry = orderedIds[i];
          if (entry) merged.add(entry);
        }

        set({
          selectionMode: true,
          selectedItemIds: Array.from(merged),
          lastSelectedItemId: targetId,
        });
      },

      selectAllItems: (ids) => {
        const unique = Array.from(new Set(ids));
        set({
          selectionMode: unique.length > 0,
          selectedItemIds: unique,
          lastSelectedItemId: unique[unique.length - 1] ?? null,
        });
      },

      clearSelection: () =>
        set({
          selectionMode: false,
          selectedItemIds: [],
          lastSelectedItemId: null,
        }),

      openReader: (itemId, page) =>
        set({
          readerTarget: { itemId, page },
          selectedItemId: null,
          commandPaletteOpen: false,
          selectionMode: false,
          selectedItemIds: [],
          lastSelectedItemId: null,
        }),

      closeReader: () => set({ readerTarget: null }),
    }),
    {
      name: 'librory-ui-v1',
      version: 1,
      partialize: (state) => ({
        coverSize: state.coverSize,
        viewMode: state.viewMode,
        sortBy: state.sortBy,
        groupByShelf: state.groupByShelf,
        theme: state.theme,
        sidebarOpen: state.sidebarOpen,
        expandedShelfIds: state.expandedShelfIds,
        tagsExpanded: state.tagsExpanded,
      }),
    },
  ),
);
