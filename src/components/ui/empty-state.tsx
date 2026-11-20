import type { ReactNode } from 'react';
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';
import { cn } from '@/lib/utils';

interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  description: string;
  actions?: ReactNode;
  className?: string;
}

/**
 * Minimalist card empty state modeled after ShadcnSpace empty-state-01.
 */
export function EmptyState({
  icon,
  title,
  description,
  actions,
  className,
}: EmptyStateProps) {
  return (
    <div className={cn('mx-auto w-full max-w-md', className)}>
      <div className="rounded-2xl border border-border bg-card p-8 shadow-sm">
        <Empty className="gap-5 border-none p-0 md:p-0">
          <EmptyHeader className="gap-3">
            {icon ? (
              <EmptyMedia
                variant="icon"
                className="mb-0 size-11 rounded-xl bg-accent-brand/12 text-accent-brand [&_svg:not([class*='size-'])]:size-5"
              >
                {icon}
              </EmptyMedia>
            ) : null}
            <EmptyTitle className="text-base font-semibold tracking-tight text-foreground">
              {title}
            </EmptyTitle>
            <EmptyDescription className="text-xs leading-relaxed text-muted-foreground">
              {description}
            </EmptyDescription>
          </EmptyHeader>
          {actions ? (
            <EmptyContent className="flex-row flex-wrap justify-center gap-2">
              {actions}
            </EmptyContent>
          ) : null}
        </Empty>
      </div>
    </div>
  );
}
