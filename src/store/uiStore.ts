import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type {
  ItemType,
  NavigationSection,
  SortOption,
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
  sidebarOpen: boolean;
  expandedShelfIds: Record<string, boolean>;
  tagsExpanded: boolean;
  commandPaletteOpen: boolean;
  selectedItemId: string | null;
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
  setSidebarOpen: (open: boolean) => void;
  toggleShelfExpanded: (id: string) => void;
  setShelfExpanded: (id: string, open: boolean) => void;
  toggleTagsExpanded: () => void;
  setCommandPaletteOpen: (open: boolean) => void;
  setSelectedItemId: (id: string | null) => void;
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
      sidebarOpen: true,
      expandedShelfIds: {},
      tagsExpanded: true,
      commandPaletteOpen: false,
      selectedItemId: null,
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
        });
      },

      setActiveTypeFilter: (activeTypeFilter) => set({ activeTypeFilter }),

      setCoverSize: (coverSize) =>
        set({ coverSize: Math.min(240, Math.max(110, coverSize)) }),

      setViewMode: (viewMode) => set({ viewMode }),

      setSortBy: (sortBy) => set({ sortBy }),

      setGroupByShelf: (groupByShelf) => set({ groupByShelf }),

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

      openReader: (itemId, page) =>
        set({
          readerTarget: { itemId, page },
          selectedItemId: null,
          commandPaletteOpen: false,
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
        sidebarOpen: state.sidebarOpen,
        expandedShelfIds: state.expandedShelfIds,
        tagsExpanded: state.tagsExpanded,
      }),
    },
  ),
);
