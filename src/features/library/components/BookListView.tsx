import { memo, useMemo } from 'react';
import { Badge } from '@/components/ui/badge';
import { CoverImage } from '@/components/ui/cover-image';
import { useAssetUrl } from '@/features/library/hooks/useAssetUrl';
import { ITEM_STATUS_LABELS, ITEM_TYPE_SINGULAR } from '@/lib/text';
import type {
  LibraryItemWithRelations,
  ShelfWithCount,
  TagWithCount,
} from '@/types/domain';

interface BookListViewProps {
  items: LibraryItemWithRelations[];
  shelves: ShelfWithCount[];
  tags: TagWithCount[];
  onSelectItem: (id: string) => void;
}

interface BookListRowProps {
  item: LibraryItemWithRelations;
  shelfNameById: Map<string, string>;
  tagNameById: Map<string, string>;
  onSelect: (id: string) => void;
}

function takeResolvedNames(
  ids: string[],
  nameMap: Map<string, string>,
  limit: number,
): string[] {
  const result: string[] = [];
  for (const id of ids) {
    const name = nameMap.get(id);
    if (name) {
      result.push(name);
      if (result.length >= limit) break;
    }
  }
  return result;
}

const BookListRow = memo(function BookListRow({
  item,
  shelfNameById,
  tagNameById,
  onSelect,
}: BookListRowProps) {
  const assetUrl = useAssetUrl(item.cover_path);
  const shelfNames = takeResolvedNames(item.shelf_ids, shelfNameById, 2);
  const tagNames = takeResolvedNames(item.tag_ids, tagNameById, 2);

  return (
    <button
      type="button"
      onClick={() => onSelect(item.id)}
      className="group grid w-full grid-cols-[40px_minmax(0,2fr)_minmax(0,1.3fr)_120px_100px_84px] items-center gap-4 rounded-lg px-3 py-2.5 text-left outline-none transition-colors [content-visibility:auto] [contain-intrinsic-size:64px] hover:bg-secondary/70 focus-visible:bg-secondary/70 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
    >
      <div className="w-10 shrink-0">
        <CoverImage
          id={item.id}
          title={item.title}
          author={item.author}
          type={item.type}
          fileFormat={item.file_format}
          assetUrl={assetUrl}
          compact
        />
      </div>

      <div className="min-w-0">
        <p className="truncate font-sans text-[13px] font-medium tracking-tight text-foreground transition-colors group-hover:text-accent-brand group-focus-visible:text-accent-brand">
          {item.title}
        </p>
        <p className="mt-0.5 truncate font-serif text-[12px] italic text-muted-foreground">
          {item.author || 'Sin autor'}
        </p>
      </div>

      <div className="flex min-w-0 flex-wrap gap-1">
        {shelfNames.map((name) => (
          <Badge
            key={name}
            variant="secondary"
            className="max-w-[130px] truncate rounded-md px-1.5 py-0.5 text-[10.5px] font-normal text-secondary-foreground/90"
          >
            {name}
          </Badge>
        ))}
        {tagNames.map((name) => (
          <Badge
            key={name}
            variant="outline"
            className="max-w-[100px] truncate rounded-md px-1.5 py-0.5 font-mono text-[10px] font-normal text-muted-foreground"
          >
            #{name}
          </Badge>
        ))}
      </div>

      <span className="truncate text-xs text-muted-foreground">
        {ITEM_TYPE_SINGULAR[item.type]}
      </span>

      <span className="truncate text-xs text-muted-foreground">
        {ITEM_STATUS_LABELS[item.status]}
      </span>

      <span className="text-right font-mono text-[11px] uppercase tabular-nums text-muted-foreground">
        {item.file_format}
        {item.page_count > 0 ? ` · ${item.page_count}p` : ''}
      </span>
    </button>
  );
});

export function BookListView({
  items,
  shelves,
  tags,
  onSelectItem,
}: BookListViewProps) {
  const shelfNameById = useMemo(
    () => new Map(shelves.map((shelf) => [shelf.id, shelf.name])),
    [shelves],
  );
  const tagNameById = useMemo(
    () => new Map(tags.map((tag) => [tag.id, tag.name])),
    [tags],
  );

  return (
    <div className="px-6 py-4">
      <div className="mb-1 grid grid-cols-[40px_minmax(0,2fr)_minmax(0,1.3fr)_120px_100px_84px] gap-4 border-b border-border px-3 pb-2 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
        <span />
        <span>Título y autor</span>
        <span>Estanterías y etiquetas</span>
        <span>Tipo</span>
        <span>Estado</span>
        <span className="text-right">Formato</span>
      </div>

      <div className="divide-y divide-border/50">
        {items.map((item) => (
          <BookListRow
            key={item.id}
            item={item}
            shelfNameById={shelfNameById}
            tagNameById={tagNameById}
            onSelect={onSelectItem}
          />
        ))}
      </div>
    </div>
  );
}
