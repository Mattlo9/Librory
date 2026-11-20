import {
  BookOpen,
  ChevronDown,
  ChevronRight,
  Clock,
  Folder,
  Hash,
  Highlighter,
  Inbox,
  Library,
  MoreHorizontal,
  Pencil,
  Plus,
  Search,
  Trash2,
} from 'lucide-react';
import { memo, useMemo, useState, type ReactNode } from 'react';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Kbd, KbdGroup } from '@/components/ui/kbd';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Sidebar as ShadcnSidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupAction,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@/components/ui/sidebar';
import {
  useDeleteShelf,
  useDeleteTag,
} from '@/features/shelves/hooks/useShelvesAndTags';
import { buildShelfTree } from '@/lib/shelfTree';
import { cn } from '@/lib/utils';
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

interface PrimaryNavItemProps {
  icon: ReactNode;
  label: string;
  count: number;
  active: boolean;
  onSelect: () => void;
}

function PrimaryNavItem({
  icon,
  label,
  count,
  active,
  onSelect,
}: PrimaryNavItemProps) {
  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        isActive={active}
        tooltip={label}
        onClick={onSelect}
        className={cn(
          'h-8 rounded-md px-2.5 text-[13px] transition-colors',
          active
            ? 'bg-sidebar-accent font-medium text-sidebar-accent-foreground'
            : 'text-sidebar-foreground/80 hover:text-sidebar-accent-foreground',
        )}
      >
        <span className={active ? 'text-accent-brand' : 'text-muted-foreground'}>
          {icon}
        </span>
        <span>{label}</span>
      </SidebarMenuButton>
      <SidebarMenuBadge className="font-mono text-[11px] font-normal text-muted-foreground">
        {count}
      </SidebarMenuBadge>
    </SidebarMenuItem>
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
      <SidebarMenuItem className="group/shelf-row">
        <div
          className={cn(
            'flex h-7 items-center rounded-md pr-1 transition-colors',
            isActive
              ? 'bg-sidebar-accent text-sidebar-accent-foreground'
              : 'text-sidebar-foreground/80 hover:bg-sidebar-accent/70 hover:text-sidebar-accent-foreground',
          )}
          style={{ paddingLeft: `${6 + depth * 12}px` }}
        >
          {hasChildren ? (
            <button
              type="button"
              aria-label={isExpanded ? `Contraer ${node.name}` : `Expandir ${node.name}`}
              onClick={() => onToggleExpand(node.id)}
              className="mr-1 flex size-4 shrink-0 items-center justify-center rounded text-muted-foreground hover:text-foreground"
            >
              {isExpanded ? (
                <ChevronDown className="size-3" />
              ) : (
                <ChevronRight className="size-3" />
              )}
            </button>
          ) : (
            <Folder className="mr-1.5 size-3 shrink-0 text-muted-foreground/70" />
          )}

          <button
            type="button"
            onClick={() => onSelect(node.id)}
            className={cn(
              'min-w-0 flex-1 truncate py-1 text-left text-[12.5px]',
              isActive && 'font-medium',
            )}
          >
            {node.name}
          </button>

          <div className="relative ml-1 flex w-7 shrink-0 items-center justify-end">
            <span className="pr-1 font-mono text-[11px] tabular-nums text-muted-foreground transition-opacity group-hover/shelf-row:opacity-0 group-focus-within/shelf-row:opacity-0">
              {node.item_count}
            </span>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  aria-label={`Opciones de ${node.name}`}
                  onClick={(e) => e.stopPropagation()}
                  className="absolute right-0 rounded p-0.5 text-muted-foreground opacity-0 transition-opacity hover:bg-background/60 hover:text-foreground group-hover/shelf-row:opacity-100 group-focus-within/shelf-row:opacity-100 data-[state=open]:opacity-100"
                >
                  <MoreHorizontal className="size-3.5" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onSelect={() => onCreateChild(node.id)}>
                  <Plus className="size-3.5" />
                  Nueva sub-estantería
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => onEdit(node)}>
                  <Pencil className="size-3.5" />
                  Editar
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  variant="destructive"
                  onSelect={() => onRequestDelete(node)}
                >
                  <Trash2 className="size-3.5" />
                  Eliminar
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </SidebarMenuItem>

      {hasChildren && isExpanded ? (
        <div className="space-y-0.5">
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
  const setCommandPaletteOpen = useUiStore((s) => s.setCommandPaletteOpen);

  const deleteShelf = useDeleteShelf();
  const deleteTag = useDeleteTag();

  const [shelfToDelete, setShelfToDelete] = useState<ShelfWithCount | null>(null);
  const [tagToDelete, setTagToDelete] = useState<TagWithCount | null>(null);

  const shelfTree = useMemo(() => buildShelfTree(shelves), [shelves]);

  return (
    <>
      <ShadcnSidebar collapsible="icon" className="border-r border-sidebar-border">
        <SidebarHeader className="gap-2.5 px-3 pt-3.5 pb-2">
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton
                size="lg"
                tooltip="Librory"
                onClick={() => navigate('all')}
                className="h-9 gap-2.5 px-2 hover:bg-sidebar-accent/60"
              >
                <div className="flex size-6 shrink-0 items-center justify-center rounded-md bg-accent-brand/15 text-accent-brand ring-1 ring-accent-brand/25">
                  <BookOpen className="size-3.5" />
                </div>
                <span className="font-sans text-[15px] font-semibold tracking-tight text-foreground">
                  Librory
                </span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>

          <button
            type="button"
            onClick={() => setCommandPaletteOpen(true)}
            className="flex h-8 w-full items-center justify-between rounded-md border border-border bg-background/70 px-2.5 text-xs text-muted-foreground transition-colors hover:border-border/80 hover:bg-background hover:text-foreground group-data-[collapsible=icon]:hidden"
          >
            <span className="flex items-center gap-2">
              <Search className="size-3.5" />
              <span>Buscar...</span>
            </span>
            <KbdGroup>
              <Kbd className="h-4 min-w-4 border border-border bg-secondary px-1 font-mono text-[10px]">
                Ctrl
              </Kbd>
              <Kbd className="h-4 min-w-4 border border-border bg-secondary px-1 font-mono text-[10px]">
                K
              </Kbd>
            </KbdGroup>
          </button>
        </SidebarHeader>

        <SidebarContent className="overflow-hidden">
          <ScrollArea className="h-full px-1">
            <SidebarGroup className="py-1.5">
              <SidebarMenu className="gap-0.5">
                <PrimaryNavItem
                  icon={<Inbox className="size-4" />}
                  label="Inbox"
                  count={navCounts.inbox}
                  active={activeSection === 'inbox'}
                  onSelect={() => navigate('inbox')}
                />
                <PrimaryNavItem
                  icon={<Library className="size-4" />}
                  label="All Books"
                  count={navCounts.all}
                  active={activeSection === 'all'}
                  onSelect={() => navigate('all')}
                />
                <PrimaryNavItem
                  icon={<Clock className="size-4" />}
                  label="Recent"
                  count={navCounts.recent}
                  active={activeSection === 'recent'}
                  onSelect={() => navigate('recent')}
                />
                <PrimaryNavItem
                  icon={<Highlighter className="size-4" />}
                  label="Highlights"
                  count={navCounts.highlights}
                  active={activeSection === 'highlights'}
                  onSelect={() => navigate('highlights')}
                />
              </SidebarMenu>
            </SidebarGroup>

            <Collapsible
              open={tagsExpanded}
              onOpenChange={toggleTagsExpanded}
              className="group-data-[collapsible=icon]:hidden"
            >
              <SidebarGroup className="py-2">
                <SidebarGroupLabel asChild>
                  <CollapsibleTrigger className="flex w-full cursor-pointer items-center gap-1 pr-6 text-[11px] font-medium tracking-wider text-muted-foreground uppercase hover:text-foreground">
                    <span>Tags</span>
                    {tagsExpanded ? (
                      <ChevronDown className="size-3" />
                    ) : (
                      <ChevronRight className="size-3" />
                    )}
                  </CollapsibleTrigger>
                </SidebarGroupLabel>
                <SidebarGroupAction
                  title="Nueva etiqueta"
                  aria-label="Nueva etiqueta"
                  onClick={onCreateTag}
                >
                  <Plus className="size-3.5" />
                </SidebarGroupAction>

                <CollapsibleContent>
                  <SidebarGroupContent>
                    <SidebarMenu className="gap-0.5">
                      {tags.length === 0 ? (
                        <p className="px-2 py-1 text-xs text-muted-foreground">
                          Sin etiquetas
                        </p>
                      ) : (
                        tags.map((tag) => {
                          const isActive = isSameNavigationSection(
                            activeSection,
                            { kind: 'tag', tagId: tag.id },
                          );
                          return (
                            <SidebarMenuItem key={tag.id} className="group/menu-item">
                              <SidebarMenuButton
                                size="sm"
                                isActive={isActive}
                                onClick={() =>
                                  navigate({ kind: 'tag', tagId: tag.id })
                                }
                                className={cn(
                                  'h-7 px-2 text-[12.5px]',
                                  isActive
                                    ? 'bg-sidebar-accent font-medium text-sidebar-accent-foreground'
                                    : 'text-sidebar-foreground/80',
                                )}
                              >
                                <Hash className="size-3.5 text-muted-foreground" />
                                {tag.color ? (
                                  <span
                                    className="size-1.5 shrink-0 rounded-full"
                                    style={{ backgroundColor: tag.color }}
                                  />
                                ) : null}
                                <span className="truncate">{tag.name}</span>
                              </SidebarMenuButton>

                              <SidebarMenuBadge className="font-mono text-[11px] font-normal text-muted-foreground transition-opacity group-hover/menu-item:opacity-0">
                                {tag.item_count}
                              </SidebarMenuBadge>

                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <SidebarMenuAction
                                    showOnHover
                                    aria-label={`Opciones de etiqueta ${tag.name}`}
                                  >
                                    <MoreHorizontal className="size-3.5" />
                                  </SidebarMenuAction>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                  <DropdownMenuItem onSelect={() => onEditTag(tag)}>
                                    <Pencil className="size-3.5" />
                                    Editar
                                  </DropdownMenuItem>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem
                                    variant="destructive"
                                    onSelect={() => setTagToDelete(tag)}
                                  >
                                    <Trash2 className="size-3.5" />
                                    Eliminar
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </SidebarMenuItem>
                          );
                        })
                      )}
                    </SidebarMenu>
                  </SidebarGroupContent>
                </CollapsibleContent>
              </SidebarGroup>
            </Collapsible>

            <SidebarGroup className="py-2 group-data-[collapsible=icon]:hidden">
              <SidebarGroupLabel className="text-[11px] font-medium tracking-wider text-muted-foreground uppercase">
                Shelves
              </SidebarGroupLabel>
              <SidebarGroupAction
                title="Nueva estantería"
                aria-label="Nueva estantería"
                onClick={() => onCreateShelf(null)}
              >
                <Plus className="size-3.5" />
              </SidebarGroupAction>

              <SidebarGroupContent>
                <SidebarMenu className="gap-0.5">
                  {shelfTree.length === 0 ? (
                    <p className="px-2 py-1 text-xs text-muted-foreground">
                      Sin estanterías
                    </p>
                  ) : (
                    shelfTree.map((node) => (
                      <ShelfTreeItem
                        key={node.id}
                        node={node}
                        depth={0}
                        activeSection={activeSection}
                        expandedShelfIds={expandedShelfIds}
                        onToggleExpand={toggleShelfExpanded}
                        onSelect={(shelfId) =>
                          navigate({ kind: 'shelf', shelfId })
                        }
                        onCreateChild={(parentId) => onCreateShelf(parentId)}
                        onEdit={onEditShelf}
                        onRequestDelete={setShelfToDelete}
                      />
                    ))
                  )}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          </ScrollArea>
        </SidebarContent>

        <SidebarFooter className="border-t border-sidebar-border px-3 py-2.5 group-data-[collapsible=icon]:hidden">
          <div className="flex items-center justify-between font-mono text-[10px] text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <span className="size-1.5 rounded-full bg-emerald-400/80" />
              Local-first
            </span>
            <span>SQLite FTS5</span>
          </div>
        </SidebarFooter>
      </ShadcnSidebar>

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
    </>
  );
}
