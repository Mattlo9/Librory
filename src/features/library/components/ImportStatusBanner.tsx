import { AlertCircle, CheckCircle2, Inbox, Loader2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { ImportBatchProgress, ImportBatchSummary } from '@/types/domain';

interface ImportStatusBannerProps {
  progress: ImportBatchProgress;
  summary: ImportBatchSummary | null;
  showGoToInbox: boolean;
  onGoToInbox: () => void;
  onDismiss: () => void;
}

export function ImportStatusBanner({
  progress,
  summary,
  showGoToInbox,
  onGoToInbox,
  onDismiss,
}: ImportStatusBannerProps) {
  if (progress.active) {
    const pct =
      progress.total > 0
        ? Math.min(100, Math.round((progress.current / progress.total) * 100))
        : 0;

    return (
      <div
        role="status"
        aria-live="polite"
        className="fixed right-5 bottom-5 z-40 w-[min(92vw,360px)] rounded-xl border border-border bg-card p-3.5 shadow-xl"
      >
        <div className="flex items-center gap-2.5">
          <Loader2 className="size-4 shrink-0 animate-spin text-accent-brand" />
          <div className="min-w-0 flex-1">
            <p className="font-sans text-xs font-medium text-foreground">
              Importando {progress.current} de {progress.total}
            </p>
            {progress.currentFilename ? (
              <p className="truncate font-mono text-[11px] text-muted-foreground">
                {progress.currentFilename}
              </p>
            ) : null}
          </div>
          <span className="font-mono text-[11px] tabular-nums text-muted-foreground">
            {pct}%
          </span>
        </div>
        <div className="mt-2.5 h-1 w-full overflow-hidden rounded-full bg-secondary">
          <div
            className="h-full rounded-full bg-accent-brand transition-[width] duration-200"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>
    );
  }

  if (!summary) return null;

  const importedCount = summary.imported.length;
  const duplicateCount = summary.duplicates.length;
  const unsupportedCount = summary.unsupported.length;
  const errorCount = summary.errors.length;
  const hasProblems = errorCount > 0 || unsupportedCount > 0;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed right-5 bottom-5 z-40 w-[min(92vw,360px)] rounded-xl border border-border bg-card p-3.5 shadow-xl"
    >
      <div className="flex items-start gap-2.5">
        {hasProblems && importedCount === 0 ? (
          <AlertCircle className="mt-0.5 size-4 shrink-0 text-destructive" />
        ) : (
          <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-400" />
        )}

        <div className="min-w-0 flex-1 space-y-1">
          <p className="font-sans text-xs font-medium text-foreground">
            {importedCount > 0
              ? importedCount === 1
                ? '1 recurso importado en Inbox'
                : `${importedCount} recursos importados en Inbox`
              : 'Importación completada'}
          </p>

          <div className="space-y-0.5 text-[11px] text-muted-foreground">
            {duplicateCount > 0 ? (
              <p>
                {duplicateCount === 1
                  ? '1 duplicado omitido (ya estaba en tu biblioteca).'
                  : `${duplicateCount} duplicados omitidos.`}
              </p>
            ) : null}
            {unsupportedCount > 0 ? (
              <p>
                {unsupportedCount === 1
                  ? '1 archivo omitido (solo se admiten PDF y EPUB).'
                  : `${unsupportedCount} archivos omitidos (solo PDF y EPUB).`}
              </p>
            ) : null}
            {errorCount > 0 ? (
              <p className="text-destructive">
                {errorCount === 1
                  ? `Error en ${summary.errors[0]?.filename ?? 'archivo'}: ${summary.errors[0]?.reason ?? ''}`
                  : `${errorCount} archivos con errores al importar.`}
              </p>
            ) : null}
          </div>

          {importedCount > 0 && showGoToInbox ? (
            <div className="pt-1.5">
              <Button
                type="button"
                variant="outline"
                size="xs"
                onClick={() => {
                  onGoToInbox();
                  onDismiss();
                }}
              >
                <Inbox className="size-3" />
                Ver en Inbox
              </Button>
            </div>
          ) : null}
        </div>

        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          aria-label="Cerrar aviso de importación"
          onClick={onDismiss}
          className="text-muted-foreground hover:text-foreground"
        >
          <X className="size-3.5" />
        </Button>
      </div>
    </div>
  );
}
