import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

type StatusTone = 'ok' | 'warn' | 'error' | 'neutral';

interface StatusCardProps {
  title: string;
  subtitle?: string;
  badge?: string;
  tone?: StatusTone;
  icon?: ReactNode;
  children: ReactNode;
  className?: string;
}

const TONE_BADGE_STYLES: Record<StatusTone, string> = {
  ok: 'border-status-ok/30 bg-status-ok/10 text-status-ok',
  warn: 'border-status-warn/30 bg-status-warn/10 text-status-warn',
  error: 'border-status-error/30 bg-status-error/10 text-status-error',
  neutral: 'border-border-subtle bg-bg-hover text-text-secondary',
};

/**
 * Pure presentational status panel for Phase 1 diagnostics.
 */
export function StatusCard({
  title,
  subtitle,
  badge,
  tone = 'neutral',
  icon,
  children,
  className,
}: StatusCardProps) {
  return (
    <section
      className={cn(
        'rounded-lg border border-border-subtle bg-bg-elevated/90 p-5',
        className,
      )}
    >
      <header className="mb-4 flex items-start justify-between gap-3 border-b border-border-subtle pb-3">
        <div className="flex items-start gap-2.5">
          {icon ? (
            <span className="mt-0.5 text-text-secondary">{icon}</span>
          ) : null}
          <div>
            <h2 className="font-mono text-sm font-medium tracking-tight text-text-primary">
              {title}
            </h2>
            {subtitle ? (
              <p className="mt-0.5 text-xs text-text-secondary">{subtitle}</p>
            ) : null}
          </div>
        </div>
        {badge ? (
          <span
            className={cn(
              'shrink-0 rounded border px-2 py-0.5 font-mono text-[11px]',
              TONE_BADGE_STYLES[tone],
            )}
          >
            {badge}
          </span>
        ) : null}
      </header>
      <div className="space-y-2.5 text-xs text-text-secondary">{children}</div>
    </section>
  );
}
