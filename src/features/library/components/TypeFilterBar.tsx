import { cn } from '@/lib/cn';
import { ITEM_TYPE_LABELS } from '@/lib/text';
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

export function TypeFilterBar({
  activeType,
  counts,
  onSelectType,
}: TypeFilterBarProps) {
  return (
    <nav
      aria-label="Filtros por tipo de recurso"
      className="scrollbar-subtle flex items-center gap-5 overflow-x-auto border-b border-border-subtle/80 px-6 pb-2.5 pt-1"
    >
      {FILTER_OPTIONS.map((option) => {
        const active = activeType === option.key;
        const count = counts[option.key] ?? 0;

        return (
          <button
            key={option.key}
            type="button"
            onClick={() => onSelectType(option.key)}
            className={cn(
              'relative flex shrink-0 items-baseline gap-1.5 pb-1 font-mono text-[12px] transition-colors',
              active
                ? 'text-text-primary'
                : 'text-text-secondary hover:text-text-primary',
            )}
          >
            <span>{option.label}</span>
            <span className="text-[10.5px] tabular-nums text-text-muted">
              {count}
            </span>
            {active ? (
              <span
                aria-hidden
                className="absolute inset-x-0 -bottom-2.5 h-[1.5px] bg-accent/85"
              />
            ) : null}
          </button>
        );
      })}
    </nav>
  );
}
