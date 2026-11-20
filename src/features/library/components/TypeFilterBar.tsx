import { motion } from 'motion/react';
import { useState } from 'react';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
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
 * Animated underline filter tabs modeled after ShadcnSpace tabs-05.
 */
export function TypeFilterBar({
  activeType,
  counts,
  onSelectType,
}: TypeFilterBarProps) {
  const [hoveredTab, setHoveredTab] = useState<string | null>(null);

  return (
    <div className="scrollbar-subtle shrink-0 overflow-x-auto border-b border-border bg-background/60 px-5">
      <Tabs
        value={activeType}
        onValueChange={(value) => onSelectType(value as ItemType | 'all')}
      >
        <TabsList
          variant="line"
          onMouseLeave={() => setHoveredTab(null)}
          className="h-auto w-max justify-start gap-1 rounded-none bg-transparent p-0"
        >
          {FILTER_OPTIONS.map((option) => {
            const isActive = activeType === option.key;
            const isHovered = hoveredTab === option.key;
            const count = counts[option.key] ?? 0;

            return (
              <TabsTrigger
                key={option.key}
                value={option.key}
                onMouseEnter={() => setHoveredTab(option.key)}
                className={cn(
                  'relative h-auto flex-none cursor-pointer rounded-none border-0 bg-transparent px-1 py-2 text-xs font-medium shadow-none after:hidden data-[state=active]:bg-transparent data-[state=active]:shadow-none dark:data-[state=active]:border-transparent dark:data-[state=active]:bg-transparent',
                  isActive
                    ? 'text-foreground'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                <span className="relative z-10 flex items-center gap-1.5 rounded-md px-2 py-1">
                  {isHovered ? (
                    <motion.span
                      layoutId="library-type-tab-hover"
                      className="pointer-events-none absolute inset-0 rounded-md bg-secondary/80"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ type: 'spring', stiffness: 420, damping: 32 }}
                    />
                  ) : null}
                  <span className="relative z-10">{option.label}</span>
                  <span
                    className={cn(
                      'relative z-10 rounded-full px-1.5 py-0.2 font-mono text-[10px] tabular-nums transition-colors',
                      isActive
                        ? 'bg-accent-brand/15 text-accent-brand'
                        : 'bg-secondary text-muted-foreground',
                    )}
                  >
                    {count}
                  </span>
                </span>

                {isActive ? (
                  <motion.div
                    layoutId="library-type-tab-indicator"
                    className="absolute inset-x-1 bottom-0 h-[2px] rounded-full bg-accent-brand"
                    initial={false}
                    transition={{ type: 'spring', stiffness: 420, damping: 32 }}
                  />
                ) : null}
              </TabsTrigger>
            );
          })}
        </TabsList>
      </Tabs>
    </div>
  );
}
