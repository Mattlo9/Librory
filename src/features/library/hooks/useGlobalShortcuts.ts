import { useEffect } from 'react';
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
 * - Alt+1..4: jump to Inbox, All Books, Recent, Highlights
 */
export function useGlobalShortcuts(enabled: boolean): void {
  useEffect(() => {
    if (!enabled) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() === 'k' && (event.ctrlKey || event.metaKey)) {
        event.preventDefault();
        const { commandPaletteOpen, setCommandPaletteOpen } = useUiStore.getState();
        setCommandPaletteOpen(!commandPaletteOpen);
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
