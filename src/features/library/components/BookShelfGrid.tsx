import { ChevronRight } from 'lucide-react';
import { useMemo, type CSSProperties } from 'react';
import { Badge } from '@/components/ui/badge';
import { BookCard } from '@/features/library/components/BookCard';
import {
  groupItemsByShelf,
  shouldGroupByShelf,
} from '@/features/library/lib/libraryGrouping';
import type {
  LibraryItemWithRelations,
  NavigationSection,
  ShelfWithCount,
} from '@/types/domain';

interface BookShelfGridProps {
  items: LibraryItemWithRelations[];
  shelves: ShelfWithCount[];
  section: NavigationSection;
  coverSize: number;
  groupByShelf: boolean;
  onSelectItem: (id: string) => void;
  onSelectShelf: (shelfId: string) => void;
}

export function BookShelfGrid({
  items,
  shelves,
  section,
  coverSize,
  groupByShelf,
  onSelectItem,
  onSelectShelf,
}: BookShelfGridProps) {
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
        <section key={group.key} className="space-y-4">
          {group.segments.length > 0 ? (
            <header className="flex items-center gap-3">
              {group.shelfId ? (
                <button
                  type="button"
                  onClick={() => onSelectShelf(group.shelfId!)}
                  className="flex flex-wrap items-center gap-1.5 font-sans text-sm font-medium tracking-tight text-muted-foreground transition-colors hover:text-foreground"
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
                <span className="font-sans text-sm font-medium tracking-tight text-muted-foreground">
                  {group.segments[0]}
                </span>
              )}

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
                coverWidth={coverSize}
                onSelect={onSelectItem}
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
