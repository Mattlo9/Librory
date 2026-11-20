import { ChevronRight } from 'lucide-react';
import { memo, useMemo, type CSSProperties } from 'react';
import { Badge } from '@/components/ui/badge';
import { BookCard } from '@/features/library/components/BookCard';
import {
  groupItemsByShelf,
  shouldGroupByShelf,
} from '@/features/library/lib/libraryGrouping';
import { useUiStore } from '@/store/uiStore';
import type {
  LibraryItemWithRelations,
  NavigationSection,
  ShelfWithCount,
} from '@/types/domain';

interface BookShelfGridProps {
  items: LibraryItemWithRelations[];
  shelves: ShelfWithCount[];
  section: NavigationSection;
  groupByShelf: boolean;
  onSelectItem: (id: string) => void;
  onSelectShelf: (shelfId: string) => void;
  onOpenReader?: (id: string) => void;
}

export const BookShelfGrid = memo(function BookShelfGrid({
  items,
  shelves,
  section,
  groupByShelf,
  onSelectItem,
  onSelectShelf,
  onOpenReader,
}: BookShelfGridProps) {
  const coverSize = useUiStore((s) => s.coverSize);
  const isGrouped = shouldGroupByShelf(section, groupByShelf, shelves);

  const groups = useMemo(() => {
    if (!isGrouped) {
      return [
        {
          key: '__flat__',
          shelfId: null,
          segments: [],
          items,
        },
      ];
    }
    return groupItemsByShelf(items, shelves, section);
  }, [isGrouped, items, shelves, section]);

  const gridStyle = useMemo(
    () =>
      ({
        '--cover-w': `${coverSize}px`,
        gridTemplateColumns: 'repeat(auto-fill, minmax(var(--cover-w), var(--cover-w)))',
      }) as CSSProperties,
    [coverSize],
  );

  return (
    <div className="space-y-10 px-6 py-6">
      {groups.map((group) => (
        <section
          key={group.key}
          className="space-y-4 [content-visibility:auto] [contain-intrinsic-size:auto_320px]"
        >
          {group.segments.length > 0 ? (
            <header className="flex items-center gap-3">
              <h2 className="font-sans text-sm font-medium tracking-tight">
                {group.shelfId ? (
                  <button
                    type="button"
                    onClick={() => onSelectShelf(group.shelfId!)}
                    className="flex flex-wrap items-center gap-1.5 rounded-sm text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    {group.segments.map((segment, index) => (
                      <span
                        key={`${segment}-${index}`}
                        className="flex items-center gap-1.5"
                      >
                        {index > 0 ? (
                          <ChevronRight className="size-3.5 text-muted-foreground/60" />
                        ) : null}
                        <span
                          className={
                            index === group.segments.length - 1
                              ? 'text-foreground'
                              : 'text-muted-foreground'
                          }
                        >
                          {segment}
                        </span>
                      </span>
                    ))}
                  </button>
                ) : (
                  <span className="text-muted-foreground">
                    {group.segments[0]}
                  </span>
                )}
              </h2>

              <Badge
                variant="secondary"
                className="h-5 rounded-md px-1.5 font-mono text-[10.5px] font-normal tabular-nums text-muted-foreground"
              >
                {group.items.length}
              </Badge>
              <div className="h-px flex-1 bg-border/60" />
            </header>
          ) : null}

          <div className="grid gap-x-6 gap-y-8" style={gridStyle}>
            {group.items.map((item) => (
              <BookCard
                key={`${group.key}:${item.id}`}
                item={item}
                onSelect={onSelectItem}
                onOpenReader={onOpenReader}
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
});
