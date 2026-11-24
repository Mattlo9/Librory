import { useEffect, useSyncExternalStore } from 'react';
import { useUiStore } from '@/store/uiStore';
import type { ResolvedTheme, ThemePreference } from '@/types/domain';

const DARK_MEDIA_QUERY = '(prefers-color-scheme: dark)';

/** Returns the current OS color scheme preference, defaulting to 'dark'. */
export function getSystemTheme(): ResolvedTheme {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return 'dark';
  }
  return window.matchMedia(DARK_MEDIA_QUERY).matches ? 'dark' : 'light';
}

/** Resolves a ThemePreference ('light' | 'dark' | 'system') to a concrete 'light' | 'dark'. */
export function resolveTheme(preference: ThemePreference): ResolvedTheme {
  if (preference === 'light' || preference === 'dark') return preference;
  return preference === 'system' ? getSystemTheme() : 'dark';
}

/** Synchronizes the `.dark` class and `color-scheme` property on `<html>`. */
export function applyThemeToDocument(preference: ThemePreference): ResolvedTheme {
  const resolved = resolveTheme(preference);
  if (typeof document !== 'undefined') {
    const root = document.documentElement;
    root.classList.toggle('dark', resolved === 'dark');
    root.style.colorScheme = resolved;
  }
  return resolved;
}

function subscribeSystemTheme(callback: () => void): () => void {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return () => {};
  }
  const media = window.matchMedia(DARK_MEDIA_QUERY);
  if (typeof media.addEventListener === 'function') {
    media.addEventListener('change', callback);
    return () => media.removeEventListener('change', callback);
  }
  media.addListener(callback);
  return () => media.removeListener(callback);
}

/** Reactively resolves the active theme, updating when preference or OS scheme changes. */
export function useResolvedTheme(): ResolvedTheme {
  const preference = useUiStore((s) => s.theme);
  const systemTheme = useSyncExternalStore(
    subscribeSystemTheme,
    getSystemTheme,
    () => 'dark' as const,
  );
  return preference === 'system' ? systemTheme : preference;
}

/** Keeps the document root theme attributes synchronized with store & OS changes. */
export function useThemeSync(): ResolvedTheme {
  const preference = useUiStore((s) => s.theme);
  const resolved = useResolvedTheme();

  useEffect(() => {
    applyThemeToDocument(preference);
  }, [preference, resolved]);

  return resolved;
}
