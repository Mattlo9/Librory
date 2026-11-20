import { memo, useMemo } from 'react';
import { CoverImage } from '@/components/ui/CoverImage';
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
  shelfNames: string[];
  tagNames: string[];
  onSelect: (id: string) => void;
}

const BookListRow = memo(function BookListRow({
  item,
  shelfNames,
  tagNames,
  onSelect,
}: BookListRowProps) {
  const assetUrl = useAssetUrl(item.cover_path);

  return (
    <button
      type="button"
      onClick={() => onSelect(item.id)}
      className="group grid w-full grid-cols-[40px_minmax(0,2fr)_minmax(0,1.2fr)_110px_100px_76px] items-center gap-4 border-b border-border-subtle/70 px-3 py-2.5 text-left transition-colors [content-visibility:auto] [contain-intrinsic-size:64px] hover:bg-bg-hover/70 focus-visible:bg-bg-hover/70 focus-visible:outline-none"
    >
      <div className="w-10 shrink-0">
        <CoverImage
          id={item.id}
          title={item.title}
          author={item.author}
          type={item.type}
          fileFormat={item.file_format}
          assetUrl={assetUrl}
          width={40}
        />
      </div>

      <div className="min-w-0">
        <p className="truncate font-mono text-xs text-text-primary transition-colors group-hover:text-accent">
          {item.title}
        </p>
        <p className="mt-0.5 truncate text-[11px] italic text-text-secondary">
          {item.author || 'Sin autor'}
        </p>
      </div>

      <div className="flex min-w-0 flex-wrap gap-1">
        {shelfNames.slice(0, 2).map((name) => (
          <span
            key={name}
            className="max-w-[130px] truncate rounded border border-border-subtle bg-bg-elevated px-1.5 py-0.5 font-mono text-[10px] text-text-secondary"
          >
            {name}
          </span>
        ))}
        {tagNames.slice(0, 2).map((name) => (
          <span
            key={name}
            className="max-w-[100px] truncate rounded border border-border-subtle/80 px-1.5 py-0.5 font-mono text-[10px] text-text-muted"
          >
            #{name}
          </span>
        ))}
      </div>

      <span className="truncate font-mono text-[11px] text-text-secondary">
        {ITEM_TYPE_SINGULAR[item.type]}
      </span>

      <span className="truncate font-mono text-[11px] text-text-muted">
        {ITEM_STATUS_LABELS[item.status]}
      </span>

      <span className="text-right font-mono text-[10.5px] uppercase text-text-muted">
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
      <div className="grid grid-cols-[40px_minmax(0,2fr)_minmax(0,1.2fr)_110px_100px_76px] gap-4 border-b border-border-strong px-3 pb-2 font-mono text-[10px] uppercase tracking-wider text-text-muted">
        <span />
        <span>Título / Autor</span>
        <span>Estanterías y etiquetas</span>
        <span>Tipo</span>
        <span>Estado</span>
        <span className="text-right">Formato</span>
      </div>

      <div>
        {items.map((item) => {
          const shelfNames = item.shelf_ids
            .map((id) => shelfNameById.get(id))
            .filter((name): name is string => Boolean(name));
          const tagNames = item.tag_ids
            .map((id) => tagNameById.get(id))
            .filter((name): name is string => Boolean(name));

          return (
            <BookListRow
              key={item.id}
              item={item}
              shelfNames={shelfNames}
              tagNames={tagNames}
              onSelect={onSelectItem}
            />
          );
        })}
      </div>
    </div>
  );
}
