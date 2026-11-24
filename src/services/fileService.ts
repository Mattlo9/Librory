import { convertFileSrc, invoke } from '@tauri-apps/api/core';
import { appDataDir, join } from '@tauri-apps/api/path';
import { getCurrentWebview } from '@tauri-apps/api/webview';
import {
  isSafeAssetUrl,
  isSafeHttpUrl,
  isSafeItemId,
  isSafeStoredBookPath,
  isSafeStoredCoverPath,
} from '@/lib/validation';
import { isTauriRuntime } from '@/services/db';
import type { FileFormat, StorageDiagnostics } from '@/types/domain';

export const BOOKS_DIR = 'books';
export const COVERS_DIR = 'covers';
export const DB_FILENAME = 'library.db';

export interface RustImportReport {
  status: 'imported' | 'duplicate';
  itemId: string;
  filePath: string;
  fileFormat: FileFormat;
  fileSize: number;
  fileHash: string;
  originalFilename: string;
}

let appDataDirPromise: Promise<string> | null = null;

function getCachedAppDataDir(): Promise<string> {
  if (!appDataDirPromise) {
    appDataDirPromise = appDataDir().catch((error: unknown) => {
      appDataDirPromise = null;
      throw error;
    });
  }
  return appDataDirPromise;
}

/**
 * Ensures /books and /covers subdirectories exist inside appDataDir via Rust and returns diagnostics.
 */
export async function ensureStorageDirectories(): Promise<StorageDiagnostics> {
  if (!isTauriRuntime()) {
    throw new Error('El sistema de archivos local solo está disponible dentro de Tauri.');
  }

  return invoke<StorageDiagnostics>('ensure_storage_directories');
}

/**
 * Resolves a strictly validated stored relative path (`books/<id>.(pdf|epub)` or `covers/<id>.webp`)
 * to an absolute path inside appDataDir without permitting traversal segments.
 */
export async function getAbsoluteStoragePath(relativePath: string): Promise<string> {
  if (!isSafeStoredBookPath(relativePath) && !isSafeStoredCoverPath(relativePath)) {
    throw new Error('Ruta de almacenamiento local inválida.');
  }
  const root = await getCachedAppDataDir();
  const [dir, filename] = relativePath.split('/');
  if (!dir || !filename) {
    throw new Error('Ruta de almacenamiento local malformada.');
  }
  return join(root, dir, filename);
}

/**
 * Converts a strictly validated stored cover path (`covers/<id>.webp`) into a WebView asset URL.
 */
export async function resolveAssetUrl(
  relativePath: string | null,
  cacheBust?: string,
): Promise<string | null> {
  if (!relativePath || !isSafeStoredCoverPath(relativePath)) {
    return null;
  }

  const absolutePath = await getAbsoluteStoragePath(relativePath);
  const assetUrl = convertFileSrc(absolutePath);
  if (!isSafeAssetUrl(assetUrl)) {
    return null;
  }
  return cacheBust ? `${assetUrl}?v=${encodeURIComponent(cacheBust)}` : assetUrl;
}

/**
 * Opens a native OS file picker inside Rust and registers selected paths as import-approved.
 */
export async function pickImportableFiles(): Promise<string[]> {
  if (!isTauriRuntime()) {
    return [];
  }
  return invoke<string[]>('pick_importable_files');
}

export async function subscribeToFileDrops(handlers: {
  onEnter?: (paths: string[]) => void;
  onLeave?: () => void;
  onDrop: (paths: string[]) => void;
}): Promise<() => void> {
  const unlisten = await getCurrentWebview().onDragDropEvent((event) => {
    const payload = event.payload;
    if (payload.type === 'enter') {
      handlers.onEnter?.(payload.paths);
    } else if (payload.type === 'leave') {
      handlers.onLeave?.();
    } else if (payload.type === 'drop') {
      handlers.onDrop(payload.paths);
    }
  });

  return unlisten;
}

export async function copyExternalBookToLibrary(
  sourcePath: string,
  itemId: string,
  knownHashes: string[],
): Promise<RustImportReport> {
  if (!isSafeItemId(itemId)) {
    throw new Error('Identificador de recurso inválido.');
  }
  return invoke<RustImportReport>('import_book_file', {
    sourcePath,
    itemId,
    knownHashes,
  });
}

export async function readStoredFileBytes(relativePath: string): Promise<Uint8Array> {
  if (!isSafeStoredBookPath(relativePath)) {
    throw new Error('Ruta de libro local inválida.');
  }
  const buffer = await invoke<ArrayBuffer>('read_book_file', { relativePath });
  return new Uint8Array(buffer);
}

export async function writeCoverWebp(
  itemId: string,
  bytes: Uint8Array,
): Promise<string> {
  if (!isSafeItemId(itemId)) {
    throw new Error('Identificador de portada inválido.');
  }
  return invoke<string>('write_cover_webp', {
    itemId,
    bytes: Array.from(bytes),
  });
}

export async function removeStoredFile(relativePath: string | null): Promise<void> {
  if (!relativePath) return;
  if (!isSafeStoredBookPath(relativePath) && !isSafeStoredCoverPath(relativePath)) {
    return;
  }

  try {
    await invoke<void>('remove_stored_file', { relativePath });
  } catch {
    // Ignorar si el archivo ya fue eliminado manualmente del disco.
  }
}

export async function openStoredBook(relativePath: string): Promise<void> {
  if (!isSafeStoredBookPath(relativePath)) {
    throw new Error('La ruta del libro local no es válida para apertura externa.');
  }
  await invoke<void>('open_stored_book', { relativePath });
}

export async function revealStoredBook(relativePath: string): Promise<void> {
  if (!isSafeStoredBookPath(relativePath)) {
    throw new Error('La ruta del libro local no es válida.');
  }
  await invoke<void>('reveal_stored_book', { relativePath });
}

/**
 * Validates and opens an external `http://` or `https://` URL via Rust's opener command.
 */
export async function openExternalUrl(rawUrl: string): Promise<void> {
  if (!isSafeHttpUrl(rawUrl)) {
    return;
  }
  if (isTauriRuntime()) {
    await invoke<void>('open_external_url', { url: rawUrl.trim() });
    return;
  }
  window.open(rawUrl.trim(), '_blank', 'noopener,noreferrer');
}
