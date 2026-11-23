import { useEffect, useRef } from 'react';
import { useUiStore } from '@/store/uiStore';
import type { NavigationSection } from '@/types/domain';

const ALT_NAV_SHORTCUTS: Record<string, NavigationSection> = {
  '1': 'inbox',
  '2': 'all',
  '3': 'recent',
  '4': 'highlights',
};

function isEditableElement(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return (
    tag === 'INPUT' ||
    tag === 'TEXTAREA' ||
    tag === 'SELECT' ||
    target.isContentEditable
  );
}

/**
 * Registers global desktop keyboard shortcuts once without subscribing to UI store state.
 * - Ctrl/Cmd+K: toggle command palette
 * - Ctrl/Cmd+I: open native file import picker
 * - Alt+1..4: jump to Inbox, All Books, Recent, Highlights
 */
export function useGlobalShortcuts(
  enabled: boolean,
  onImportFiles?: () => void,
  onSelectAllVisible?: () => void,
): void {
  const importHandlerRef = useRef(onImportFiles);
  const selectAllHandlerRef = useRef(onSelectAllVisible);

  useEffect(() => {
    importHandlerRef.current = onImportFiles;
  }, [onImportFiles]);

  useEffect(() => {
    selectAllHandlerRef.current = onSelectAllVisible;
  }, [onSelectAllVisible]);

  useEffect(() => {
    if (!enabled) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        const state = useUiStore.getState();
        if (
          state.readerTarget === null &&
          state.selectedItemId === null &&
          !state.commandPaletteOpen &&
          (state.selectedItemIds.length > 0 || state.selectionMode)
        ) {
          event.preventDefault();
          state.clearSelection();
        }
        return;
      }

      if (
        event.key.toLowerCase() === 'a' &&
        (event.ctrlKey || event.metaKey) &&
        !event.shiftKey &&
        !event.altKey &&
        !isEditableElement(event.target)
      ) {
        const state = useUiStore.getState();
        if (
          state.readerTarget === null &&
          state.selectedItemId === null &&
          !state.commandPaletteOpen &&
          state.activeSection !== 'highlights' &&
          selectAllHandlerRef.current
        ) {
          event.preventDefault();
          selectAllHandlerRef.current();
        }
        return;
      }

      if (event.key.toLowerCase() === 'k' && (event.ctrlKey || event.metaKey)) {
        event.preventDefault();
        const { commandPaletteOpen, setCommandPaletteOpen } = useUiStore.getState();
        setCommandPaletteOpen(!commandPaletteOpen);
        return;
      }

      if (
        event.key.toLowerCase() === 'i' &&
        (event.ctrlKey || event.metaKey) &&
        !event.shiftKey &&
        !event.altKey
      ) {
        if (useUiStore.getState().readerTarget !== null) {
          return;
        }
        event.preventDefault();
        importHandlerRef.current?.();
        return;
      }

      if (
        event.altKey &&
        !event.ctrlKey &&
        !event.metaKey &&
        !event.shiftKey &&
        !isEditableElement(event.target)
      ) {
        const targetSection = ALT_NAV_SHORTCUTS[event.key];
        if (targetSection) {
          event.preventDefault();
          useUiStore.getState().navigate(targetSection);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [enabled]);
}
