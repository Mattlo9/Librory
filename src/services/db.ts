import Database from '@tauri-apps/plugin-sql';
import type { DatabaseHealthReport } from '@/types/domain';

export const DB_CONNECTION_STRING = 'sqlite:library.db';

const EXPECTED_TABLES = [
  'items',
  'shelves',
  'item_shelves',
  'tags',
  'item_tags',
  'highlights',
  'items_fts',
  'highlights_fts',
] as const;

let dbPromise: Promise<Database> | null = null;

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
 * Loads the singleton SQLite connection and applies required session/DB PRAGMAs.
 */
export async function getDb(): Promise<Database> {
  if (!isTauriRuntime()) {
    throw new Error('SQLite solo está disponible dentro del entorno de escritorio Tauri.');
  }

  if (!dbPromise) {
    dbPromise = (async () => {
      const db = await Database.load(DB_CONNECTION_STRING);
      await db.execute('PRAGMA foreign_keys = ON');
      await db.execute('PRAGMA recursive_triggers = ON');
      await db.execute('PRAGMA journal_mode = WAL');
      return db;
    })().catch((error: unknown) => {
      dbPromise = null;
      throw error;
    });
  }

  return dbPromise;
}

/**
 * Inspects schema tables, PRAGMAs, sqlx migrations, and FTS5 sync count.
 */
export async function checkDatabaseHealth(): Promise<DatabaseHealthReport> {
  const db = await getDb();

  const [tableRows, fkRows, rtRows, journalRows, migrationRows, itemsRows, ftsRows] =
    await Promise.all([
      db.select<Array<{ name: string }>>(
        "SELECT name FROM sqlite_master WHERE type IN ('table', 'view') AND name NOT LIKE 'sqlite_%' ORDER BY name",
      ),
      db.select<Array<{ foreign_keys: number }>>('PRAGMA foreign_keys'),
      db.select<Array<{ recursive_triggers: number }>>('PRAGMA recursive_triggers'),
      db.select<Array<{ journal_mode: string }>>('PRAGMA journal_mode'),
      db
        .select<Array<{ version: number }>>(
          'SELECT version FROM _sqlx_migrations WHERE success = 1 ORDER BY version',
        )
        .catch(() => [] as Array<{ version: number }>),
      db.select<Array<{ count: number }>>('SELECT COUNT(*) AS count FROM items'),
      db.select<Array<{ count: number }>>('SELECT COUNT(*) AS count FROM items_fts'),
    ]);

  const tables = tableRows.map((row) => row.name);
  const tableSet = new Set(tables);
  const missingTables = EXPECTED_TABLES.filter((name) => !tableSet.has(name));

  return {
    connected: true,
    journalMode: journalRows[0]?.journal_mode ?? 'unknown',
    foreignKeysEnabled: fkRows[0]?.foreign_keys === 1,
    recursiveTriggersEnabled: rtRows[0]?.recursive_triggers === 1,
    tables,
    missingTables,
    appliedMigrations: migrationRows.map((row) => row.version),
    itemsCount: itemsRows[0]?.count ?? 0,
    ftsIndexedCount: ftsRows[0]?.count ?? 0,
  };
}
