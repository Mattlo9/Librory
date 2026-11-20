import { convertFileSrc } from '@tauri-apps/api/core';
import { appDataDir, BaseDirectory, join } from '@tauri-apps/api/path';
import { exists, mkdir } from '@tauri-apps/plugin-fs';
import { isTauriRuntime } from '@/services/db';
import type { StorageDiagnostics } from '@/types/domain';

export const BOOKS_DIR = 'books';
export const COVERS_DIR = 'covers';
export const DB_FILENAME = 'library.db';

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
export async function resolveAssetUrl(relativePath: string | null): Promise<string | null> {
  if (!relativePath) {
    return null;
  }

  const absolutePath = await getAbsoluteStoragePath(relativePath);
  return convertFileSrc(absolutePath);
}
