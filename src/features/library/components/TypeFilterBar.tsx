import { memo, useCallback, useLayoutEffect, useRef, useState } from 'react';
import { ITEM_TYPE_LABELS } from '@/lib/text';
import { cn } from '@/lib/utils';
import { ITEM_TYPES, type ItemType } from '@/types/domain';

interface TypeFilterBarProps {
  activeType: ItemType | 'all';
  counts: Record<ItemType | 'all', number>;
  onSelectType: (type: ItemType | 'all') => void;
}

const FILTER_OPTIONS: Array<{ key: ItemType | 'all'; label: string }> = [
  { key: 'all', label: 'All' },
  ...ITEM_TYPES.map((type) => ({
    key: type,
    label: ITEM_TYPE_LABELS[type],
  })),
];

/**
 * Pure-CSS animated underline filter bar using semantic toggle buttons (aria-pressed).
 */
export const TypeFilterBar = memo(function TypeFilterBar({
  activeType,
  counts,
  onSelectType,
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
      aria-label="Filtrar por tipo de recurso"
      className="scrollbar-subtle shrink-0 overflow-x-auto border-b border-border bg-background/60 px-5"
    >
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
    </nav>
  );
});
