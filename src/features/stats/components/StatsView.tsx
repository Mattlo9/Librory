import {
  BarChart3,
  BookCheck,
  BookOpen,
  FolderTree,
  Highlighter,
  Layers,
  Upload,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { CoverImage } from '@/components/ui/cover-image';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { useAssetUrl } from '@/features/library/hooks/useAssetUrl';
import { ActivityChartCard } from '@/features/stats/components/ActivityChartCard';
import { StudyEvolutionCard } from '@/features/stats/components/StudyEvolutionCard';
import { StudyOverviewCard } from '@/features/stats/components/StudyOverviewCard';
import { useReadingStats } from '@/features/stats/hooks/useReadingStats';
import { isItemReadableLocally } from '@/lib/highlights';
import { ITEM_STATUS_LABELS, ITEM_TYPE_LABELS } from '@/lib/text';
import { cn } from '@/lib/utils';
import type {
  ItemStatus,
  LibraryItem,
  NavigationSection,
} from '@/types/domain';

interface StatsViewProps {
  onOpenItem: (itemId: string) => void;
  onOpenReader: (itemId: string) => void;
  onSelectShelf: (shelfId: string) => void;
  onNavigateSection: (section: NavigationSection) => void;
  onImportFiles: () => void;
}

const STATUS_BAR_CLASS: Record<ItemStatus, string> = {
  inbox: 'bg-amber-400',
  to_read: 'bg-zinc-400',
  reading: 'bg-accent-brand',
  reference: 'bg-sky-400',
  finished: 'bg-emerald-500',
};

const STATS_LOADING_SKELETON = (
  <div
    role="status"
    aria-label="Cargando estadísticas"
    className="mx-auto max-w-6xl space-y-6 px-6 py-6"
  >
    <Skeleton className="h-72 rounded-xl" />
    <Skeleton className="h-80 rounded-xl" />
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {Array.from({ length: 4 }, (_, idx) => (
        <Skeleton key={idx} className="h-28 rounded-xl" />
      ))}
    </div>
    <Skeleton className="h-44 rounded-xl" />
    <div className="grid gap-5 lg:grid-cols-2">
      <Skeleton className="h-64 rounded-xl" />
      <Skeleton className="h-64 rounded-xl" />
    </div>
  </div>
);

function InProgressCard({
  item,
  onOpenItem,
  onOpenReader,
}: {
  item: LibraryItem;
  onOpenItem: (id: string) => void;
  onOpenReader: (id: string) => void;
}) {
  const assetUrl = useAssetUrl(item.cover_path, item.updated_at);
  const canReadLocally = isItemReadableLocally(item.file_path, item.file_format);
  const isEpub = item.file_format === 'epub';
  const pct =
    item.page_count > 0
      ? Math.min(100, Math.round((item.current_page / item.page_count) * 100))
      : 0;

  return (
    <button
      type="button"
      onClick={() =>
        canReadLocally ? onOpenReader(item.id) : onOpenItem(item.id)
      }
      title={
        canReadLocally
          ? `Continuar lectura en el lector ${item.file_format.toUpperCase()}`
          : 'Ver ficha'
      }
      className="group flex items-center gap-3.5 rounded-xl border border-border bg-card p-3 text-left outline-none transition-colors hover:border-accent-brand/45 hover:bg-secondary/40 focus-visible:ring-2 focus-visible:ring-ring"
    >
      <div className="w-11 shrink-0">
        <CoverImage
          id={item.id}
          title={item.title}
          author={item.author}
          type={item.type}
          fileFormat={item.file_format}
          assetUrl={assetUrl}
          compact
        />
      </div>
      <div className="min-w-0 flex-1 space-y-1.5">
        <div>
          <p className="truncate font-sans text-xs font-medium text-foreground transition-colors group-hover:text-accent-brand">
            {item.title}
          </p>
          <p className="truncate font-serif text-[11px] italic text-muted-foreground">
            {item.author || 'Sin autor'}
          </p>
        </div>

        <div className="space-y-1">
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-secondary">
            <div
              className="h-full rounded-full bg-accent-brand transition-[width]"
              style={{ width: `${pct}%` }}
            />
          </div>
          <div className="flex items-center justify-between font-mono text-[10.5px] tabular-nums text-muted-foreground">
            <span>
              {item.page_count > 0
                ? `${item.current_page} / ${item.page_count} ${isEpub ? 'caps.' : 'págs.'}`
                : item.current_page > 0
                  ? `${isEpub ? 'cap.' : 'pág.'} ${item.current_page}`
                  : 'Sin páginas registradas'}
            </span>
            {item.page_count > 0 ? <span>{pct}%</span> : null}
          </div>
        </div>
      </div>
    </button>
  );
}

function RecentlyFinishedRow({
  item,
  onOpenItem,
}: {
  item: LibraryItem;
  onOpenItem: (id: string) => void;
}) {
  const assetUrl = useAssetUrl(item.cover_path, item.updated_at);

  return (
    <button
      type="button"
      onClick={() => onOpenItem(item.id)}
      className="group flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left outline-none transition-colors hover:bg-secondary/60 focus-visible:ring-2 focus-visible:ring-ring"
    >
      <div className="w-8 shrink-0">
        <CoverImage
          id={item.id}
          title={item.title}
          author={item.author}
          type={item.type}
          fileFormat={item.file_format}
          assetUrl={assetUrl}
          compact
        />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-medium text-foreground transition-colors group-hover:text-accent-brand">
          {item.title}
        </p>
        <p className="truncate font-serif text-[11px] italic text-muted-foreground">
          {item.author || 'Sin autor'}
        </p>
      </div>
      <Badge
        variant="secondary"
        className="shrink-0 rounded-md font-mono text-[10px] font-normal tabular-nums text-muted-foreground"
      >
        {item.page_count > 0 ? `${item.page_count} págs.` : item.file_format.toUpperCase()}
      </Badge>
    </button>
  );
}

export function StatsView({
  onOpenItem,
  onOpenReader,
  onSelectShelf,
  onNavigateSection,
  onImportFiles,
}: StatsViewProps) {
  const statsQuery = useReadingStats(true);

  if (statsQuery.isLoading) {
    return STATS_LOADING_SKELETON;
  }

  const stats = statsQuery.data;
  if (!stats || stats.totals.totalItems === 0) {
    return (
      <div className="mx-auto max-w-6xl space-y-6 px-6 py-6">
        <StudyOverviewCard onOpenItem={onOpenItem} />
        <StudyEvolutionCard onOpenItem={onOpenItem} />
        <ActivityChartCard />
        <div className="py-8">
          <EmptyState
            icon={<BarChart3 className="size-5" />}
            title="Aún no hay datos de lectura"
            description="Importa libros o documentos a tu biblioteca para seguir tus libros terminados, páginas leídas y ritmo mensual."
            actions={
              <Button type="button" size="sm" onClick={onImportFiles}>
                <Upload className="size-4" />
                Importar PDF / EPUB
              </Button>
            }
          />
        </div>
      </div>
    );
  }

  const { totals } = stats;
  const pagesPercent =
    totals.totalLibraryPages > 0
      ? Math.min(
          100,
          Math.round((totals.totalPagesRead / totals.totalLibraryPages) * 100),
        )
      : 0;

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-6 py-6">
      {/* 0. Resumen de estudio Pomodoro y mapa de calor */}
      <StudyOverviewCard onOpenItem={onOpenItem} />

      {/* 0b. Tiempo acumulado y evolución temporal del Pomodoro */}
      <StudyEvolutionCard onOpenItem={onOpenItem} />

      {/* 1. Tarjetas KPI */}
      <section
        aria-label="Resumen de lectura"
        className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"
      >
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>Libros terminados</span>
            <BookCheck className="size-4 text-emerald-600 dark:text-emerald-400" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="font-mono text-2xl font-semibold tabular-nums text-foreground">
              {totals.finishedCount}
            </span>
            <span className="font-mono text-xs tabular-nums text-muted-foreground">
              / {totals.totalItems}
            </span>
          </div>
          <div className="mt-3 space-y-1">
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-secondary">
              <div
                className="h-full rounded-full bg-emerald-500"
                style={{ width: `${totals.completionRate}%` }}
              />
            </div>
            <p className="font-mono text-[11px] tabular-nums text-muted-foreground">
              {totals.completionRate}% de la biblioteca completado
            </p>
          </div>
        </div>

        <div className="rounded-xl border border-border bg-card p-4">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>Páginas leídas</span>
            <BookOpen className="size-4 text-accent-brand" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="font-mono text-2xl font-semibold tabular-nums text-foreground">
              {totals.totalPagesRead.toLocaleString('es')}
            </span>
            {totals.totalLibraryPages > 0 ? (
              <span className="font-mono text-xs tabular-nums text-muted-foreground">
                / {totals.totalLibraryPages.toLocaleString('es')}
              </span>
            ) : null}
          </div>
          <div className="mt-3 space-y-1">
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-secondary">
              <div
                className="h-full rounded-full bg-accent-brand"
                style={{ width: `${pagesPercent}%` }}
              />
            </div>
            <p className="font-mono text-[11px] tabular-nums text-muted-foreground">
              {totals.totalLibraryPages > 0
                ? `${pagesPercent}% del total registrado`
                : 'Suma páginas leyendo PDFs'}
            </p>
          </div>
        </div>

        <div className="rounded-xl border border-border bg-card p-4">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>En lectura</span>
            <Layers className="size-4 text-accent-brand" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="font-mono text-2xl font-semibold tabular-nums text-foreground">
              {totals.readingCount}
            </span>
            <span className="font-mono text-xs tabular-nums text-muted-foreground">
              activos
            </span>
          </div>
          <div className="mt-3 space-y-1">
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-secondary">
              <div
                className="h-full rounded-full bg-accent-brand/80"
                style={{ width: `${totals.averageActiveProgress}%` }}
              />
            </div>
            <p className="font-mono text-[11px] tabular-nums text-muted-foreground">
              {totals.averageActiveProgress}% progreso medio · {totals.toReadCount} por leer
            </p>
          </div>
        </div>

        <div className="rounded-xl border border-border bg-card p-4">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>Subrayados y notas</span>
            <Highlighter className="size-4 text-amber-600 dark:text-amber-400" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="font-mono text-2xl font-semibold tabular-nums text-foreground">
              {totals.totalHighlights}
            </span>
            <span className="font-mono text-xs tabular-nums text-muted-foreground">
              citas
            </span>
          </div>
          <div className="mt-3 flex items-center justify-between">
            <span className="font-mono text-[11px] text-muted-foreground">
              {totals.inboxCount} en Inbox
            </span>
            <button
              type="button"
              onClick={() => onNavigateSection('highlights')}
              className="text-xs font-medium text-accent-brand hover:underline"
            >
              Ver subrayados
            </button>
          </div>
        </div>
      </section>

      {/* 2. Lecturas en progreso */}
      {stats.inProgressItems.length > 0 ? (
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold tracking-tight text-foreground">
              Lecturas en progreso
            </h2>
            <span className="font-mono text-[11px] text-muted-foreground">
              {stats.inProgressItems.length} recientes
            </span>
          </div>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {stats.inProgressItems.map((item) => (
              <InProgressCard
                key={item.id}
                item={item}
                onOpenItem={onOpenItem}
                onOpenReader={onOpenReader}
              />
            ))}
          </div>
        </section>
      ) : null}

      {/* 3. Distribución por estado y tipo */}
      <section className="grid gap-5 lg:grid-cols-2">
        <div className="rounded-xl border border-border bg-card p-5">
          <h2 className="text-sm font-semibold tracking-tight text-foreground">
            Distribución por estado
          </h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Proporción de recursos según su etapa de lectura.
          </p>

          <div className="mt-4 space-y-3">
            {stats.byStatus.map(({ status, count }) => {
              const pct =
                totals.totalItems > 0
                  ? Math.round((count / totals.totalItems) * 100)
                  : 0;
              return (
                <div key={status} className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="flex items-center gap-2 text-foreground">
                      <span
                        aria-hidden="true"
                        className={cn(
                          'size-2 rounded-full',
                          STATUS_BAR_CLASS[status],
                        )}
                      />
                      <span>{ITEM_STATUS_LABELS[status]}</span>
                    </span>
                    <span className="font-mono text-[11px] tabular-nums text-muted-foreground">
                      {count} ({pct}%)
                    </span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-secondary">
                    <div
                      className={cn(
                        'h-full rounded-full transition-[width]',
                        STATUS_BAR_CLASS[status],
                      )}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="rounded-xl border border-border bg-card p-5">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <h2 className="text-sm font-semibold tracking-tight text-foreground">
                Tipos y formatos
              </h2>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Composición de tu biblioteca local.
              </p>
            </div>
            <div className="flex items-center gap-1.5">
              <Badge
                variant="secondary"
                className="rounded-md font-mono text-[10.5px] font-normal tabular-nums"
              >
                PDF: {totals.pdfCount}
              </Badge>
              <Badge
                variant="secondary"
                className="rounded-md font-mono text-[10.5px] font-normal tabular-nums"
              >
                EPUB: {totals.epubCount}
              </Badge>
            </div>
          </div>

          <div className="mt-4 space-y-3">
            {stats.byType.map(({ type, count }) => {
              const pct =
                totals.totalItems > 0
                  ? Math.round((count / totals.totalItems) * 100)
                  : 0;
              return (
                <div key={type} className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-foreground">
                      {ITEM_TYPE_LABELS[type]}
                    </span>
                    <span className="font-mono text-[11px] tabular-nums text-muted-foreground">
                      {count} ({pct}%)
                    </span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-secondary">
                    <div
                      className="h-full rounded-full bg-accent-brand/80 transition-[width]"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* 4. Actividad apilada por rango */}
      <ActivityChartCard />

      {/* 5. Estanterías y terminados recientes */}
      <section className="grid gap-5 lg:grid-cols-2">
        <div className="rounded-xl border border-border bg-card p-5">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold tracking-tight text-foreground">
              Progreso por estantería
            </h2>
            <FolderTree className="size-4 text-muted-foreground" />
          </div>

          {stats.topShelves.length === 0 ? (
            <p className="py-8 text-center text-xs text-muted-foreground">
              Aún no hay recursos asignados a estanterías.
            </p>
          ) : (
            <div className="mt-4 space-y-3">
              {stats.topShelves.map((shelf) => {
                const pct =
                  shelf.totalCount > 0
                    ? Math.round((shelf.finishedCount / shelf.totalCount) * 100)
                    : 0;
                return (
                  <button
                    key={shelf.id}
                    type="button"
                    onClick={() => onSelectShelf(shelf.id)}
                    className="block w-full space-y-1.5 rounded-lg p-1.5 text-left outline-none transition-colors hover:bg-secondary/50 focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <div className="flex items-center justify-between text-xs">
                      <span className="truncate font-medium text-foreground">
                        {shelf.name}
                      </span>
                      <span className="shrink-0 font-mono text-[11px] tabular-nums text-muted-foreground">
                        {shelf.finishedCount}/{shelf.totalCount} ({pct}%)
                      </span>
                    </div>
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-secondary">
                      <div
                        className="h-full rounded-full bg-emerald-500 transition-[width]"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className="rounded-xl border border-border bg-card p-5">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold tracking-tight text-foreground">
              Terminados recientemente
            </h2>
            <BookCheck className="size-4 text-emerald-600 dark:text-emerald-400" />
          </div>

          {stats.recentlyFinished.length === 0 ? (
            <p className="py-8 text-center text-xs text-muted-foreground">
              Aún no has marcado libros como terminados.
            </p>
          ) : (
            <div className="mt-3 divide-y divide-border/50">
              {stats.recentlyFinished.map((item) => (
                <RecentlyFinishedRow
                  key={item.id}
                  item={item}
                  onOpenItem={onOpenItem}
                />
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
