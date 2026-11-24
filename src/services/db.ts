import { invoke } from '@tauri-apps/api/core';
import type { DatabaseHealthReport } from '@/types/domain';

export const DB_CONNECTION_STRING = 'sqlite:library.db';

/**
 * Checks whether the frontend is running inside a Tauri v2 WebView.
 */
export function isTauriRuntime(): boolean {
  return (
    typeof window !== 'undefined' &&
    '__TAURI_INTERNALS__' in window
  );
}

/**
 * Invokes a typed Rust database command after ensuring the Tauri desktop runtime is present.
 */
export async function invokeDb<T>(
  command: string,
  args?: Record<string, unknown>,
): Promise<T> {
  if (!isTauriRuntime()) {
    throw new Error('SQLite solo está disponible dentro del entorno de escritorio Tauri.');
  }
  return invoke<T>(command, args);
}

/**
 * Inspects schema tables, PRAGMAs, migrations, and FTS5 sync count via Rust.
 */
export async function checkDatabaseHealth(): Promise<DatabaseHealthReport> {
  return invokeDb<DatabaseHealthReport>('db_check_health');
}
