import { useMutation, useQuery } from '@tanstack/react-query';
import { BookOpen, CheckCircle2, Database, FolderGit2, Search, Terminal } from 'lucide-react';
import { StatusCard } from '@/components/ui/StatusCard';
import { runFtsSmokeTest } from '@/services/bookRepository';
import { checkDatabaseHealth, isTauriRuntime } from '@/services/db';
import { ensureStorageDirectories } from '@/services/fileService';
import { useUiStore } from '@/store/uiStore';

function PathRow({ label, value, ready }: { label: string; value: string; ready?: boolean }) {
  return (
    <div className="flex flex-col gap-1 rounded border border-border-subtle bg-bg-base/70 px-3 py-2">
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-[11px] uppercase tracking-wider text-text-muted">
          {label}
        </span>
        {ready !== undefined ? (
          <span
            className={
              ready
                ? 'font-mono text-[11px] text-status-ok'
                : 'font-mono text-[11px] text-status-error'
            }
          >
            {ready ? 'LISTO' : 'PENDIENTE'}
          </span>
        ) : null}
      </div>
      <code className="break-all font-mono text-[11px] text-text-primary">{value}</code>
    </div>
  );
}

export function App() {
  const tauriActive = isTauriRuntime();
  const coverSize = useUiStore((state) => state.coverSize);

  const storageQuery = useQuery({
    queryKey: ['phase1', 'storage'],
    queryFn: ensureStorageDirectories,
    enabled: tauriActive,
  });

  const dbHealthQuery = useQuery({
    queryKey: ['phase1', 'db-health'],
    queryFn: checkDatabaseHealth,
    enabled: tauriActive,
  });

  const ftsSmokeMutation = useMutation({
    mutationFn: runFtsSmokeTest,
  });

  const storageOk = Boolean(storageQuery.data?.booksReady && storageQuery.data?.coversReady);
  const dbOk = Boolean(
    dbHealthQuery.data?.connected && dbHealthQuery.data.missingTables.length === 0,
  );

  return (
    <div className="min-h-screen bg-bg-base text-text-primary">
      <div className="mx-auto flex max-w-5xl flex-col gap-6 px-6 py-8">
        <header className="flex flex-wrap items-center justify-between gap-4 border-b border-border-subtle pb-5">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-md border border-border-strong bg-bg-elevated text-accent">
              <BookOpen className="h-4 w-4" />
            </div>
            <div>
              <h1 className="font-mono text-lg font-medium tracking-tight text-text-primary">
                Librory
              </h1>
              <p className="text-xs text-text-secondary">
                Fase 1 — Scaffolding Tauri v2, almacenamiento local y SQLite FTS5
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 font-mono text-[11px] text-text-muted">
            <span>Entorno: {tauriActive ? 'Tauri Desktop' : 'Navegador Web'}</span>
            <span>·</span>
            <span>Portada base: {coverSize}px</span>
          </div>
        </header>

        {!tauriActive ? (
          <StatusCard
            title="Ejecución fuera de Tauri"
            subtitle="Esta vista requiere el runtime nativo para acceder a SQLite y %APPDATA%."
            badge="SOLO PREVIEW WEB"
            tone="warn"
            icon={<Terminal className="h-4 w-4" />}
          >
            <p>
              Para verificar la base de datos y la creación de carpetas locales, inicia la
              aplicación con <code className="font-mono text-accent">bun run tauri dev</code>.
            </p>
          </StatusCard>
        ) : null}

        <div className="grid gap-5 md:grid-cols-2">
          <StatusCard
            title="Almacenamiento Local"
            subtitle="Directorios gestionados en %APPDATA%\\com.librory.app"
            badge={storageQuery.isLoading ? 'COMPROBANDO' : storageOk ? 'ACTIVO' : 'ERROR'}
            tone={storageQuery.isLoading ? 'neutral' : storageOk ? 'ok' : 'error'}
            icon={<FolderGit2 className="h-4 w-4" />}
          >
            {storageQuery.error ? (
              <p className="text-status-error">{String(storageQuery.error)}</p>
            ) : storageQuery.data ? (
              <div className="space-y-2">
                <PathRow label="AppData Root" value={storageQuery.data.appDataPath} />
                <PathRow
                  label="Libros (/books)"
                  value={storageQuery.data.booksPath}
                  ready={storageQuery.data.booksReady}
                />
                <PathRow
                  label="Portadas (/covers)"
                  value={storageQuery.data.coversPath}
                  ready={storageQuery.data.coversReady}
                />
                <PathRow label="Base de datos" value={storageQuery.data.dbExpectedPath} />
              </div>
            ) : (
              <p>Esperando runtime de Tauri...</p>
            )}
          </StatusCard>

          <StatusCard
            title="Motor SQLite + FTS5"
            subtitle="Migración v1, integridad referencial y búsqueda de texto completo"
            badge={dbHealthQuery.isLoading ? 'COMPROBANDO' : dbOk ? 'SALUDABLE' : 'REVISAR'}
            tone={dbHealthQuery.isLoading ? 'neutral' : dbOk ? 'ok' : 'error'}
            icon={<Database className="h-4 w-4" />}
          >
            {dbHealthQuery.error ? (
              <p className="text-status-error">{String(dbHealthQuery.error)}</p>
            ) : dbHealthQuery.data ? (
              <div className="space-y-3">
                <dl className="grid grid-cols-2 gap-2 font-mono text-[11px]">
                  <div className="rounded border border-border-subtle bg-bg-base/70 px-3 py-2">
                    <dt className="text-text-muted">Journal Mode</dt>
                    <dd className="mt-0.5 uppercase text-text-primary">
                      {dbHealthQuery.data.journalMode}
                    </dd>
                  </div>
                  <div className="rounded border border-border-subtle bg-bg-base/70 px-3 py-2">
                    <dt className="text-text-muted">Foreign Keys</dt>
                    <dd className="mt-0.5 text-text-primary">
                      {dbHealthQuery.data.foreignKeysEnabled ? 'ON' : 'OFF'}
                    </dd>
                  </div>
                  <div className="rounded border border-border-subtle bg-bg-base/70 px-3 py-2">
                    <dt className="text-text-muted">Migraciones</dt>
                    <dd className="mt-0.5 text-text-primary">
                      {dbHealthQuery.data.appliedMigrations.length > 0
                        ? dbHealthQuery.data.appliedMigrations.map((v) => `v${v}`).join(', ')
                        : 'Ninguna'}
                    </dd>
                  </div>
                  <div className="rounded border border-border-subtle bg-bg-base/70 px-3 py-2">
                    <dt className="text-text-muted">Items / FTS5</dt>
                    <dd className="mt-0.5 text-text-primary">
                      {dbHealthQuery.data.itemsCount} / {dbHealthQuery.data.ftsIndexedCount}
                    </dd>
                  </div>
                </dl>

                <div className="rounded border border-border-subtle bg-bg-base/70 px-3 py-2">
                  <div className="mb-1.5 font-mono text-[11px] uppercase tracking-wider text-text-muted">
                    Tablas detectadas ({dbHealthQuery.data.tables.length})
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {dbHealthQuery.data.tables.map((table) => (
                      <span
                        key={table}
                        className="rounded border border-border-subtle bg-bg-elevated px-2 py-0.5 font-mono text-[11px] text-text-primary"
                      >
                        {table}
                      </span>
                    ))}
                  </div>
                </div>

                {dbHealthQuery.data.missingTables.length > 0 ? (
                  <p className="text-status-error">
                    Faltan tablas: {dbHealthQuery.data.missingTables.join(', ')}
                  </p>
                ) : null}
              </div>
            ) : (
              <p>Esperando conexión SQLite...</p>
            )}
          </StatusCard>
        </div>

        <StatusCard
          title="Verificación de FTS5 sin diacríticos"
          subtitle="Inserta un registro temporal, consulta 'filosofia' vía MATCH y limpia la fila."
          badge={
            ftsSmokeMutation.data
              ? ftsSmokeMutation.data.ok
                ? 'PASÓ'
                : 'FALLÓ'
              : 'DISPONIBLE'
          }
          tone={
            ftsSmokeMutation.data
              ? ftsSmokeMutation.data.ok
                ? 'ok'
                : 'error'
              : 'neutral'
          }
          icon={<Search className="h-4 w-4" />}
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <button
              type="button"
              disabled={!tauriActive || ftsSmokeMutation.isPending}
              onClick={() => ftsSmokeMutation.mutate()}
              className="inline-flex items-center gap-2 rounded border border-border-strong bg-bg-base px-3 py-1.5 font-mono text-xs text-text-primary transition hover:border-accent/60 hover:text-accent disabled:cursor-not-allowed disabled:opacity-45"
            >
              <CheckCircle2 className="h-3.5 w-3.5" />
              {ftsSmokeMutation.isPending ? 'Ejecutando prueba...' : 'Ejecutar prueba FTS5'}
            </button>
            {ftsSmokeMutation.data ? (
              <span className="font-mono text-xs text-status-ok">
                Match encontrado: &ldquo;{ftsSmokeMutation.data.matchedTitle}&rdquo;
              </span>
            ) : null}
            {ftsSmokeMutation.error ? (
              <span className="font-mono text-xs text-status-error">
                {String(ftsSmokeMutation.error)}
              </span>
            ) : null}
          </div>
        </StatusCard>
      </div>
    </div>
  );
}
