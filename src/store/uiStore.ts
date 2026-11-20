import { create } from 'zustand';
import type { ItemType, NavigationSection, ViewMode } from '@/types/domain';

interface UiState {
  activeSection: NavigationSection;
  activeTypeFilter: ItemType | 'all';
  coverSize: number;
  viewMode: ViewMode;
  commandPaletteOpen: boolean;
  setActiveSection: (section: NavigationSection) => void;
  setActiveTypeFilter: (type: ItemType | 'all') => void;
  setCoverSize: (size: number) => void;
  setViewMode: (mode: ViewMode) => void;
  setCommandPaletteOpen: (open: boolean) => void;
}

export const useUiStore = create<UiState>((set) => ({
  activeSection: 'all',
  activeTypeFilter: 'all',
  coverSize: 168,
  viewMode: 'grid',
  commandPaletteOpen: false,
  setActiveSection: (activeSection) => set({ activeSection }),
  setActiveTypeFilter: (activeTypeFilter) => set({ activeTypeFilter }),
  setCoverSize: (coverSize) =>
    set({ coverSize: Math.min(280, Math.max(110, coverSize)) }),
  setViewMode: (viewMode) => set({ viewMode }),
  setCommandPaletteOpen: (commandPaletteOpen) => set({ commandPaletteOpen }),
}));
