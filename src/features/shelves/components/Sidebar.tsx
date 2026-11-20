import * as Collapsible from '@radix-ui/react-collapsible';
import {
  ChevronDown,
  ChevronRight,
  Clock,
  Hash,
  Highlighter,
  Inbox,
  Library,
  MoreHorizontal,
  Pencil,
  Plus,
  Trash2,
} from 'lucide-react';
import { memo, useMemo, useState, type ReactNode } from 'react';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/DropdownMenu';
import {
  useDeleteShelf,
  useDeleteTag,
} from '@/features/shelves/hooks/useShelvesAndTags';
import { cn } from '@/lib/cn';
import { buildShelfTree } from '@/lib/shelfTree';
import { isSameNavigationSection, useUiStore } from '@/store/uiStore';
import type {
  NavigationSection,
  ShelfTreeNode,
  ShelfWithCount,
  TagWithCount,
} from '@/types/domain';

interface SidebarProps {
  navCounts: {
    inbox: number;
    all: number;
    recent: number;
    highlights: number;
  };
  shelves: ShelfWithCount[];
  tags: TagWithCount[];
  onCreateShelf: (parentId?: string | null) => void;
  onEditShelf: (shelf: ShelfWithCount) => void;
  onCreateTag: () => void;
  onEditTag: (tag: TagWithCount) => void;
}

interface PrimaryNavRowProps {
  icon: ReactNode;
  label: string;
  count: number;
  active: boolean;
  onSelect: () => void;
}

function PrimaryNavRow({
  icon,
  label,
  count,
  active,
  onSelect,
}: PrimaryNavRowProps) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        'flex w-full items-center justify-between rounded px-2.5 py-1.5 text-left text-[12px] transition-colors',
        active
          ? 'bg-bg-active text-text-primary'
          : 'text-text-secondary hover:bg-bg-hover hover:text-text-primary',
      )}
    >
      <span className="flex min-w-0 items-center gap-2 font-mono">
        <span className={active ? 'text-accent' : 'text-text-muted'}>
          {icon}
        </span>
        <span className="truncate">{label}</span>
      </span>
      <span className="ml-2 shrink-0 font-mono text-[11px] tabular-nums text-text-muted">
        {count}
      </span>
    </button>
  );
}

interface ShelfTreeItemProps {
  node: ShelfTreeNode;
  depth: number;
  activeSection: NavigationSection;
  expandedShelfIds: Record<string, boolean>;
  onToggleExpand: (id: string) => void;
  onSelect: (shelfId: string) => void;
  onCreateChild: (parentId: string) => void;
  onEdit: (shelf: ShelfWithCount) => void;
  onRequestDelete: (shelf: ShelfWithCount) => void;
}

const ShelfTreeItem = memo(function ShelfTreeItem({
  node,
  depth,
  activeSection,
  expandedShelfIds,
  onToggleExpand,
  onSelect,
  onCreateChild,
  onEdit,
  onRequestDelete,
}: ShelfTreeItemProps) {
  const hasChildren = node.children.length > 0;
  const isExpanded = expandedShelfIds[node.id] ?? true;
  const isActive = isSameNavigationSection(activeSection, {
    kind: 'shelf',
    shelfId: node.id,
  });

  return (
    <div>
      <div
        className={cn(
          'group flex items-center justify-between rounded pr-1 transition-colors',
          isActive
            ? 'bg-bg-active text-text-primary'
            : 'text-text-secondary hover:bg-bg-hover hover:text-text-primary',
        )}
        style={{ paddingLeft: `${8 + depth * 12}px` }}
      >
        <div className="flex min-w-0 flex-1 items-center">
          {hasChildren ? (
            <button
              type="button"
              aria-label={isExpanded ? `Contraer ${node.name}` : `Expandir ${node.name}`}
              onClick={() => onToggleExpand(node.id)}
              className="mr-1 flex h-5 w-4 shrink-0 items-center justify-center rounded text-text-muted hover:text-text-primary"
            >
              {isExpanded ? (
                <ChevronDown className="h-3 w-3" />
              ) : (
                <ChevronRight className="h-3 w-3" />
              )}
            </button>
          ) : (
            <span className="mr-1 inline-block w-4 shrink-0" />
          )}

          <button
            type="button"
            onClick={() => onSelect(node.id)}
            className="min-w-0 flex-1 truncate py-1 text-left font-mono text-[11.5px]"
          >
            {node.name}
          </button>
        </div>

        <div className="ml-1 flex shrink-0 items-center gap-0.5">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                aria-label={`Opciones de ${node.name}`}
                onClick={(e) => e.stopPropagation()}
                className="rounded p-0.5 text-text-muted opacity-0 transition-opacity hover:bg-bg-base hover:text-text-primary group-hover:opacity-100 data-[state=open]:opacity-100"
              >
                <MoreHorizontal className="h-3.5 w-3.5" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={() => onCreateChild(node.id)}>
                <Plus className="h-3.5 w-3.5 text-text-muted" />
                Nueva sub-estantería
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => onEdit(node)}>
                <Pencil className="h-3.5 w-3.5 text-text-muted" />
                Editar
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onSelect={() => onRequestDelete(node)}
                className="text-status-error data-[highlighted]:text-status-error"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Eliminar
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <span className="min-w-[18px] pr-1 text-right font-mono text-[10.5px] tabular-nums text-text-muted">
            {node.item_count}
          </span>
        </div>
      </div>

      {hasChildren && isExpanded ? (
        <div>
          {node.children.map((child) => (
            <ShelfTreeItem
              key={child.id}
              node={child}
              depth={depth + 1}
              activeSection={activeSection}
              expandedShelfIds={expandedShelfIds}
              onToggleExpand={onToggleExpand}
              onSelect={onSelect}
              onCreateChild={onCreateChild}
              onEdit={onEdit}
              onRequestDelete={onRequestDelete}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
});

export function Sidebar({
  navCounts,
  shelves,
  tags,
  onCreateShelf,
  onEditShelf,
  onCreateTag,
  onEditTag,
}: SidebarProps) {
  const activeSection = useUiStore((s) => s.activeSection);
  const navigate = useUiStore((s) => s.navigate);
  const expandedShelfIds = useUiStore((s) => s.expandedShelfIds);
  const toggleShelfExpanded = useUiStore((s) => s.toggleShelfExpanded);
  const tagsExpanded = useUiStore((s) => s.tagsExpanded);
  const toggleTagsExpanded = useUiStore((s) => s.toggleTagsExpanded);

  const deleteShelf = useDeleteShelf();
  const deleteTag = useDeleteTag();

  const [shelfToDelete, setShelfToDelete] = useState<ShelfWithCount | null>(null);
  const [tagToDelete, setTagToDelete] = useState<TagWithCount | null>(null);

  const shelfTree = useMemo(() => buildShelfTree(shelves), [shelves]);

  return (
    <aside className="flex h-full w-[236px] shrink-0 select-none flex-col border-r border-border-subtle bg-bg-sidebar">
      <div className="px-4 pb-3 pt-4">
        <button
          type="button"
          onClick={() => navigate('all')}
          className="font-mono text-[19px] font-medium tracking-tight text-text-primary transition-colors hover:text-accent"
        >
          Librory
        </button>
      </div>

      <div className="scrollbar-subtle flex-1 space-y-5 overflow-y-auto px-2 pb-4">
        <nav aria-label="Navegación principal" className="space-y-0.5">
          <PrimaryNavRow
            icon={<Inbox className="h-3.5 w-3.5" />}
            label="Inbox"
            count={navCounts.inbox}
            active={activeSection === 'inbox'}
            onSelect={() => navigate('inbox')}
          />
          <PrimaryNavRow
            icon={<Library className="h-3.5 w-3.5" />}
            label="All Books"
            count={navCounts.all}
            active={activeSection === 'all'}
            onSelect={() => navigate('all')}
          />
          <PrimaryNavRow
            icon={<Clock className="h-3.5 w-3.5" />}
            label="Recent"
            count={navCounts.recent}
            active={activeSection === 'recent'}
            onSelect={() => navigate('recent')}
          />
          <PrimaryNavRow
            icon={<Highlighter className="h-3.5 w-3.5" />}
            label="Highlights"
            count={navCounts.highlights}
            active={activeSection === 'highlights'}
            onSelect={() => navigate('highlights')}
          />
        </nav>

        <Collapsible.Root
          open={tagsExpanded}
          onOpenChange={toggleTagsExpanded}
          className="space-y-1"
        >
          <div className="flex items-center justify-between px-2">
            <Collapsible.Trigger asChild>
              <button
                type="button"
                className="flex items-center gap-1 font-mono text-[10px] tracking-[0.08em] text-text-muted uppercase transition-colors hover:text-text-secondary"
              >
                <span>Tags</span>
                {tagsExpanded ? (
                  <ChevronDown className="h-3 w-3" />
                ) : (
                  <ChevronRight className="h-3 w-3" />
                )}
              </button>
            </Collapsible.Trigger>
            <button
              type="button"
              aria-label="Nueva etiqueta"
              onClick={onCreateTag}
              className="rounded p-0.5 text-text-muted transition-colors hover:bg-bg-hover hover:text-text-primary"
            >
              <Plus className="h-3.5 w-3.5" />
            </button>
          </div>

          <Collapsible.Content className="space-y-0.5">
            {tags.length === 0 ? (
              <p className="px-2.5 py-1 font-mono text-[11px] text-text-muted">
                Sin etiquetas
              </p>
            ) : (
              tags.map((tag) => {
                const isActive = isSameNavigationSection(activeSection, {
                  kind: 'tag',
                  tagId: tag.id,
                });
                return (
                  <div
                    key={tag.id}
                    className={cn(
                      'group flex items-center justify-between rounded pl-2.5 pr-1 transition-colors',
                      isActive
                        ? 'bg-bg-active text-text-primary'
                        : 'text-text-secondary hover:bg-bg-hover hover:text-text-primary',
                    )}
                  >
                    <button
                      type="button"
                      onClick={() => navigate({ kind: 'tag', tagId: tag.id })}
                      className="flex min-w-0 flex-1 items-center gap-1.5 py-1 text-left font-mono text-[11.5px]"
                    >
                      <Hash className="h-3 w-3 shrink-0 text-text-muted" />
                      {tag.color ? (
                        <span
                          className="h-1.5 w-1.5 shrink-0 rounded-full"
                          style={{ backgroundColor: tag.color }}
                        />
                      ) : null}
                      <span className="truncate">{tag.name}</span>
                    </button>

                    <div className="ml-1 flex shrink-0 items-center gap-0.5">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button
                            type="button"
                            aria-label={`Opciones de etiqueta ${tag.name}`}
                            onClick={(e) => e.stopPropagation()}
                            className="rounded p-0.5 text-text-muted opacity-0 transition-opacity hover:bg-bg-base hover:text-text-primary group-hover:opacity-100 data-[state=open]:opacity-100"
                          >
                            <MoreHorizontal className="h-3.5 w-3.5" />
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onSelect={() => onEditTag(tag)}>
                            <Pencil className="h-3.5 w-3.5 text-text-muted" />
                            Editar
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            onSelect={() => setTagToDelete(tag)}
                            className="text-status-error data-[highlighted]:text-status-error"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                            Eliminar
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>

                      <span className="min-w-[18px] pr-1 text-right font-mono text-[10.5px] tabular-nums text-text-muted">
                        {tag.item_count}
                      </span>
                    </div>
                  </div>
                );
              })
            )}
          </Collapsible.Content>
        </Collapsible.Root>

        <section className="space-y-1">
          <div className="flex items-center justify-between px-2">
            <span className="font-mono text-[10px] tracking-[0.08em] text-text-muted uppercase">
              Shelves
            </span>
            <button
              type="button"
              aria-label="Nueva estantería"
              onClick={() => onCreateShelf(null)}
              className="rounded p-0.5 text-text-muted transition-colors hover:bg-bg-hover hover:text-text-primary"
            >
              <Plus className="h-3.5 w-3.5" />
            </button>
          </div>

          {shelfTree.length === 0 ? (
            <p className="px-2.5 py-1 font-mono text-[11px] text-text-muted">
              Sin estanterías
            </p>
          ) : (
            <div className="space-y-0.5">
              {shelfTree.map((node) => (
                <ShelfTreeItem
                  key={node.id}
                  node={node}
                  depth={0}
                  activeSection={activeSection}
                  expandedShelfIds={expandedShelfIds}
                  onToggleExpand={toggleShelfExpanded}
                  onSelect={(shelfId) => navigate({ kind: 'shelf', shelfId })}
                  onCreateChild={(parentId) => onCreateShelf(parentId)}
                  onEdit={onEditShelf}
                  onRequestDelete={setShelfToDelete}
                />
              ))}
            </div>
          )}
        </section>
      </div>

      <footer className="border-t border-border-subtle px-4 py-2 font-mono text-[10px] text-text-muted">
        Local-first · SQLite FTS5
      </footer>

      <ConfirmDialog
        open={Boolean(shelfToDelete)}
        onOpenChange={(open) => {
          if (!open) setShelfToDelete(null);
        }}
        title="Eliminar estantería"
        description={
          shelfToDelete
            ? `Se eliminará "${shelfToDelete.name}" y sus sub-estanterías. Los libros asociados permanecerán en tu biblioteca.`
            : ''
        }
        isPending={deleteShelf.isPending}
        onConfirm={async () => {
          if (!shelfToDelete) return;
          const deletedId = shelfToDelete.id;
          await deleteShelf.mutateAsync(deletedId);
          setShelfToDelete(null);
          if (
            typeof activeSection === 'object' &&
            activeSection.kind === 'shelf' &&
            activeSection.shelfId === deletedId
          ) {
            navigate('all');
          }
        }}
      />

      <ConfirmDialog
        open={Boolean(tagToDelete)}
        onOpenChange={(open) => {
          if (!open) setTagToDelete(null);
        }}
        title="Eliminar etiqueta"
        description={
          tagToDelete
            ? `Se quitará la etiqueta "#${tagToDelete.name}" de todos los recursos.`
            : ''
        }
        isPending={deleteTag.isPending}
        onConfirm={async () => {
          if (!tagToDelete) return;
          const deletedId = tagToDelete.id;
          await deleteTag.mutateAsync(deletedId);
          setTagToDelete(null);
          if (
            typeof activeSection === 'object' &&
            activeSection.kind === 'tag' &&
            activeSection.tagId === deletedId
          ) {
            navigate('all');
          }
        }}
      />
    </aside>
  );
}
