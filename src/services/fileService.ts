import { convertFileSrc, invoke } from '@tauri-apps/api/core';
import { appDataDir, BaseDirectory, join } from '@tauri-apps/api/path';
import { getCurrentWebview } from '@tauri-apps/api/webview';
import { open as openDialog } from '@tauri-apps/plugin-dialog';
import { exists, mkdir, readFile, remove, writeFile } from '@tauri-apps/plugin-fs';
import { openPath, revealItemInDir } from '@tauri-apps/plugin-opener';
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

async function ensureAppDataSubdir(subdir: string): Promise<boolean> {
  const present = await exists(subdir, { baseDir: BaseDirectory.AppData });
  if (present) {
    return true;
  }
  await mkdir(subdir, { baseDir: BaseDirectory.AppData, recursive: true });
  return exists(subdir, { baseDir: BaseDirectory.AppData });
}

/**
 * Ensures /books and /covers subdirectories exist inside appDataDir and returns resolved paths.
 */
export async function ensureStorageDirectories(): Promise<StorageDiagnostics> {
  if (!isTauriRuntime()) {
    throw new Error('El sistema de archivos local solo está disponible dentro de Tauri.');
  }

  const root = await getCachedAppDataDir();
  const [booksReady, coversReady, booksPath, coversPath, dbExpectedPath] =
    await Promise.all([
      ensureAppDataSubdir(BOOKS_DIR),
      ensureAppDataSubdir(COVERS_DIR),
      join(root, BOOKS_DIR),
      join(root, COVERS_DIR),
      join(root, DB_FILENAME),
    ]);

  return {
    appDataPath: root,
    booksPath,
    coversPath,
    dbExpectedPath,
    booksReady,
    coversReady,
  };
}

/**
 * Resolves a stored relative path (e.g. "books/id.pdf") to an absolute OS path inside appDataDir.
 */
export async function getAbsoluteStoragePath(relativePath: string): Promise<string> {
  const root = await getCachedAppDataDir();
  const segments = relativePath.split(/[\\/]+/).filter(Boolean);
  return join(root, ...segments);
}

/**
 * Converts a stored relative asset path (e.g. "covers/id.webp") into a WebView asset URL without Base64.
 */
export async function resolveAssetUrl(
  relativePath: string | null,
  cacheBust?: string,
): Promise<string | null> {
  if (!relativePath) {
    return null;
  }

  const absolutePath = await getAbsoluteStoragePath(relativePath);
  const assetUrl = convertFileSrc(absolutePath);
  return cacheBust ? `${assetUrl}?v=${encodeURIComponent(cacheBust)}` : assetUrl;
}

export async function pickImportableFiles(): Promise<string[]> {
  const selection = await openDialog({
    title: 'Importar libros y documentos',
    multiple: true,
    filters: [
      {
        name: 'Documentos (PDF, EPUB)',
        extensions: ['pdf', 'epub'],
      },
    ],
  });

  if (!selection) {
    return [];
  }

  return Array.isArray(selection) ? selection : [selection];
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
  return invoke<RustImportReport>('import_book_file', {
    sourcePath,
    itemId,
    knownHashes,
  });
}

export async function readStoredFileBytes(relativePath: string): Promise<Uint8Array> {
  return readFile(relativePath, { baseDir: BaseDirectory.AppData });
}

export async function writeCoverWebp(
  itemId: string,
  bytes: Uint8Array,
): Promise<string> {
  await ensureAppDataSubdir(COVERS_DIR);
  const relativePath = `${COVERS_DIR}/${itemId}.webp`;
  await writeFile(relativePath, bytes, { baseDir: BaseDirectory.AppData });
  return relativePath;
}

export async function removeStoredFile(relativePath: string | null): Promise<void> {
  if (!relativePath) return;
  if (
    !relativePath.startsWith(`${BOOKS_DIR}/`) &&
    !relativePath.startsWith(`${COVERS_DIR}/`)
  ) {
    return;
  }

  try {
    await remove(relativePath, { baseDir: BaseDirectory.AppData });
  } catch {
    // Ignorar si el archivo ya fue eliminado manualmente del disco.
  }
}

export async function openStoredBook(relativePath: string): Promise<void> {
  const absolutePath = await getAbsoluteStoragePath(relativePath);
  await openPath(absolutePath);
}

export async function revealStoredBook(relativePath: string): Promise<void> {
  const absolutePath = await getAbsoluteStoragePath(relativePath);
  await revealItemInDir(absolutePath);
}
