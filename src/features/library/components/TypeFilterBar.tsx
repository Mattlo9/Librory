import { ChevronDown, ListFilter, X } from 'lucide-react';
import { memo, useCallback, useLayoutEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ITEM_STATUS_LABELS, ITEM_TYPE_LABELS } from '@/lib/text';
import { cn } from '@/lib/utils';
import {
  ITEM_STATUSES,
  ITEM_TYPES,
  type ItemStatus,
  type ItemType,
} from '@/types/domain';

interface TypeFilterBarProps {
  activeType: ItemType | 'all';
  counts: Record<ItemType | 'all', number>;
  activeStatus: ItemStatus | 'all';
  statusCounts: Record<ItemStatus | 'all', number>;
  showStatusFilter?: boolean;
  onSelectType: (type: ItemType | 'all') => void;
  onSelectStatus: (status: ItemStatus | 'all') => void;
}

const STATUS_DOT_CLASS: Record<ItemStatus, string> = {
  inbox: 'bg-amber-400',
  to_read: 'bg-zinc-400',
  reading: 'bg-accent-brand',
  reference: 'bg-sky-400',
  finished: 'bg-emerald-500',
};

const FILTER_OPTIONS: Array<{ key: ItemType | 'all'; label: string }> = [
  { key: 'all', label: 'All' },
  ...ITEM_TYPES.map((type) => ({
    key: type,
    label: ITEM_TYPE_LABELS[type],
  })),
];

/**
 * Pure-CSS animated underline filter bar using semantic toggle buttons (aria-pressed)
 * paired with a compact reading-status dropdown filter.
 */
export const TypeFilterBar = memo(function TypeFilterBar({
  activeType,
  counts,
  activeStatus,
  statusCounts,
  showStatusFilter = true,
  onSelectType,
  onSelectStatus,
}: TypeFilterBarProps) {
  const listRef = useRef<HTMLDivElement | null>(null);
  const buttonRefs = useRef<Partial<Record<ItemType | 'all', HTMLButtonElement | null>>>({});
  const [indicator, setIndicator] = useState<{ left: number; width: number } | null>(null);

  const measureIndicator = useCallback(() => {
    const activeButton = buttonRefs.current[activeType];
    if (!activeButton) return;
    const nextLeft = activeButton.offsetLeft + 4;
    const nextWidth = Math.max(0, activeButton.offsetWidth - 8);
    setIndicator((prev) =>
      prev && prev.left === nextLeft && prev.width === nextWidth
        ? prev
        : { left: nextLeft, width: nextWidth },
    );
  }, [activeType]);

  useLayoutEffect(() => {
    measureIndicator();
    const listEl = listRef.current;
    if (!listEl || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measureIndicator);
    observer.observe(listEl);
    return () => observer.disconnect();
  }, [measureIndicator, counts]);

  return (
    <nav
      aria-label="Filtrar recursos por tipo y estado"
      className="flex shrink-0 items-center justify-between gap-3 border-b border-border bg-background/60 px-5"
    >
      <div className="scrollbar-subtle min-w-0 flex-1 overflow-x-auto">
        <div
          ref={listRef}
          role="group"
          aria-label="Tipos de recurso"
          className="relative flex w-max items-center gap-1"
        >
          {FILTER_OPTIONS.map((option) => {
            const isActive = activeType === option.key;
            const count = counts[option.key] ?? 0;

            return (
              <button
                key={option.key}
                ref={(el) => {
                  buttonRefs.current[option.key] = el;
                }}
                type="button"
                aria-pressed={isActive}
                onClick={() => onSelectType(option.key)}
                className={cn(
                  'group relative flex-none cursor-pointer px-1 py-2 text-xs font-medium outline-none transition-colors focus-visible:z-10',
                  isActive
                    ? 'text-foreground'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                <span className="flex items-center gap-1.5 rounded-md px-2 py-1 transition-colors duration-150 group-hover:bg-secondary/80 group-focus-visible:ring-2 group-focus-visible:ring-ring">
                  <span>{option.label}</span>
                  <span
                    className={cn(
                      'rounded-full px-1.5 py-0.2 font-mono text-[10px] tabular-nums transition-colors',
                      isActive
                        ? 'bg-accent-brand/15 text-accent-brand'
                        : 'bg-secondary text-muted-foreground',
                    )}
                  >
                    {count}
                  </span>
                </span>
              </button>
            );
          })}

          {indicator ? (
            <span
              aria-hidden="true"
              className="pointer-events-none absolute bottom-0 left-0 h-[2px] rounded-full bg-accent-brand transition-[transform,width] duration-200 ease-out motion-reduce:transition-none"
              style={{
                width: `${indicator.width}px`,
                transform: `translateX(${indicator.left}px)`,
              }}
            />
          ) : null}
        </div>
      </div>

      {showStatusFilter ? (
        <div className="flex shrink-0 items-center gap-1.5 py-1.5">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="outline"
                size="xs"
                aria-label="Filtrar por estado de lectura"
                className={cn(
                  'h-7 gap-1.5 px-2.5 text-xs font-medium',
                  activeStatus !== 'all'
                    ? 'border-accent-brand/50 bg-accent-brand/10 text-foreground hover:bg-accent-brand/15'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {activeStatus === 'all' ? (
                  <ListFilter className="size-3.5" />
                ) : (
                  <span
                    aria-hidden="true"
                    className={cn(
                      'size-2 rounded-full',
                      STATUS_DOT_CLASS[activeStatus],
                    )}
                  />
                )}
                <span>
                  {activeStatus === 'all'
                    ? 'Estado'
                    : ITEM_STATUS_LABELS[activeStatus]}
                </span>
                <span
                  className={cn(
                    'rounded-full px-1.5 font-mono text-[10px] tabular-nums',
                    activeStatus !== 'all'
                      ? 'bg-accent-brand/20 text-accent-brand'
                      : 'bg-secondary text-muted-foreground',
                  )}
                >
                  {statusCounts[activeStatus] ?? 0}
                </span>
                <ChevronDown className="size-3 opacity-60" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              <DropdownMenuLabel className="text-[11px] font-medium text-muted-foreground">
                Estado de lectura
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuRadioGroup
                value={activeStatus}
                onValueChange={(value) =>
                  onSelectStatus(value as ItemStatus | 'all')
                }
              >
                <DropdownMenuRadioItem
                  value="all"
                  className="justify-between text-xs"
                >
                  <span>Todos los estados</span>
                  <span className="ml-auto pl-2 font-mono text-[10.5px] tabular-nums text-muted-foreground">
                    {statusCounts.all}
                  </span>
                </DropdownMenuRadioItem>
                {ITEM_STATUSES.map((status) => (
                  <DropdownMenuRadioItem
                    key={status}
                    value={status}
                    className="justify-between text-xs"
                  >
                    <span className="flex items-center gap-2">
                      <span
                        aria-hidden="true"
                        className={cn(
                          'size-2 rounded-full',
                          STATUS_DOT_CLASS[status],
                        )}
                      />
                      <span>{ITEM_STATUS_LABELS[status]}</span>
                    </span>
                    <span className="ml-auto pl-2 font-mono text-[10.5px] tabular-nums text-muted-foreground">
                      {statusCounts[status] ?? 0}
                    </span>
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>

          {activeStatus !== 'all' ? (
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              aria-label="Limpiar filtro de estado"
              title="Limpiar filtro de estado"
              onClick={() => onSelectStatus('all')}
              className="size-7 text-muted-foreground hover:text-foreground"
            >
              <X className="size-3.5" />
            </Button>
          ) : null}
        </div>
      ) : null}
    </nav>
  );
});
