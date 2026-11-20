import { ChevronRight } from 'lucide-react';
import { useMemo, type CSSProperties } from 'react';
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
            <header className="flex items-center gap-1.5 font-mono text-[13px] text-text-secondary">
              {group.shelfId ? (
                <button
                  type="button"
                  onClick={() => onSelectShelf(group.shelfId!)}
                  className="flex flex-wrap items-center gap-1.5 transition-colors hover:text-text-primary"
                >
                  {group.segments.map((segment, index) => (
                    <span
                      key={`${segment}-${index}`}
                      className="flex items-center gap-1.5"
                    >
                      {index > 0 ? (
                        <ChevronRight className="h-3.5 w-3.5 text-text-muted" />
                      ) : null}
                      <span
                        className={
                          index === group.segments.length - 1
                            ? 'text-text-primary'
                            : 'text-text-secondary'
                        }
                      >
                        {segment}
                      </span>
                    </span>
                  ))}
                </button>
              ) : (
                <span className="text-text-secondary">{group.segments[0]}</span>
              )}
              <span className="ml-1 text-[11px] tabular-nums text-text-muted">
                {group.items.length}
              </span>
            </header>
          ) : null}

          <div
            className="grid gap-x-6 gap-y-8 px-3"
            style={gridStyle}
          >
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
