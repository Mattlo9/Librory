import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  description: string;
  actions?: ReactNode;
  className?: string;
}

export function EmptyState({
  icon,
  title,
  description,
  actions,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        'mx-auto flex max-w-md flex-col items-center justify-center rounded-lg border border-border-subtle bg-bg-elevated/55 px-6 py-10 text-center',
        className,
      )}
    >
      {icon ? (
        <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-md border border-border-strong bg-bg-base text-text-secondary">
          {icon}
        </div>
      ) : null}
      <h3 className="font-mono text-sm font-medium text-text-primary">{title}</h3>
      <p className="mt-1.5 text-xs leading-relaxed text-text-secondary">
        {description}
      </p>
      {actions ? (
        <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
          {actions}
        </div>
      ) : null}
    </div>
  );
}
