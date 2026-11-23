import { CheckCircle2, Coffee, Play, Timer, X } from 'lucide-react';
import { useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { usePomodoroStore } from '@/store/pomodoroStore';

/**
 * Floating completion notice banner visible across both the library shell and PDF/EPUB readers.
 */
export function PomodoroNoticeBanner() {
  const notice = usePomodoroStore((s) => s.notice);
  const status = usePomodoroStore((s) => s.status);
  const start = usePomodoroStore((s) => s.start);
  const dismissNotice = usePomodoroStore((s) => s.dismissNotice);

  useEffect(() => {
    if (!notice) return;
    const timeoutMs = notice.kind === 'saved_partial' ? 6000 : 18000;
    const timerId = window.setTimeout(() => {
      dismissNotice();
    }, timeoutMs);
    return () => window.clearTimeout(timerId);
  }, [notice, dismissNotice]);

  if (!notice) return null;

  const isPhaseTransition =
    notice.kind === 'focus_complete' || notice.kind === 'break_complete';
  const showStartNext = isPhaseTransition && status === 'idle';
  const nextLabel =
    notice.nextPhase === 'focus' ? 'Iniciar enfoque' : 'Iniciar descanso';

  const Icon =
    notice.kind === 'saved_partial'
      ? CheckCircle2
      : notice.kind === 'focus_complete'
        ? Coffee
        : Timer;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed right-5 bottom-5 z-50 w-80 max-w-[calc(100vw-2.5rem)] rounded-xl border border-border bg-popover/95 p-3.5 text-popover-foreground shadow-lg backdrop-blur-md animate-in fade-in-0 slide-in-from-bottom-2"
    >
      <div className="flex items-start gap-2.5">
        <div
          className={cn(
            'mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg border',
            notice.kind === 'focus_complete'
              ? 'border-emerald-500/30 bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
              : notice.kind === 'break_complete'
                ? 'border-accent-brand/30 bg-accent-brand/15 text-accent-brand'
                : 'border-emerald-500/30 bg-emerald-500/15 text-emerald-600 dark:text-emerald-400',
          )}
        >
          <Icon className="size-3.5" />
        </div>

        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex items-start justify-between gap-2">
            <p className="text-xs font-semibold leading-tight text-foreground">
              {notice.title}
            </p>
            <button
              type="button"
              onClick={dismissNotice}
              aria-label="Cerrar aviso"
              className="rounded p-0.5 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
            >
              <X className="size-3.5" />
            </button>
          </div>

          <p className="text-[11.5px] leading-snug text-muted-foreground">
            {notice.subtitle}
          </p>

          {showStartNext ? (
            <div className="pt-1">
              <Button
                type="button"
                size="xs"
                onClick={() => start()}
                className="h-7 gap-1.5 px-2.5 text-[11px]"
              >
                <Play className="size-3 fill-current" />
                <span>{nextLabel}</span>
              </Button>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
