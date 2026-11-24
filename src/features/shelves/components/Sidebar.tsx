import {
  BarChart3,
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
  NotebookPen,
  Pencil,
  Plus,
  Search,
  Star,
  Trash2,
} from 'lucide-react';
import { memo, useCallback, useMemo, useState, type ReactNode } from 'react';
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
  ShelfTreeNode,
  ShelfWithCount,
  TagWithCount,
} from '@/types/domain';

interface SidebarProps {
  navCounts: {
    inbox: number;
    all: number;
    favorites: number;
    recent: number;
    highlights: number;
    notes: number;
  };
  shelves: ShelfWithCount[];
  tags: TagWithCount[];
  onCreateShelf: (parentId?: string | null) => void;
  onEditShelf: (shelf: ShelfWithCount) => void;
  onCreateTag: () => void;
  onEditTag: (tag: TagWithCount) => void;
  onPreloadCommandPalette?: () => void;
}

const INBOX_ICON = <Inbox className="size-4" />;
const LIBRARY_ICON = <Library className="size-4" />;
const FAVORITES_ICON = <Star className="size-4" />;
const RECENT_ICON = <Clock className="size-4" />;
const HIGHLIGHTS_ICON = <Highlighter className="size-4" />;
const NOTES_ICON = <NotebookPen className="size-4" />;
const STATS_ICON = <BarChart3 className="size-4" />;

interface PrimaryNavItemProps {
  icon: ReactNode;
  label: string;
  count?: number;
  active: boolean;
  onSelect: () => void;
}

const PrimaryNavItem = memo(function PrimaryNavItem({
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
        aria-current={active ? 'page' : undefined}
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
      {count !== undefined ? (
        <SidebarMenuBadge className="font-mono text-[11px] font-normal text-muted-foreground">
          {count}
        </SidebarMenuBadge>
      ) : null}
    </SidebarMenuItem>
  );
});

interface ShelfTreeItemProps {
  node: ShelfTreeNode;
  depth: number;
  onSelect: (shelfId: string) => void;
  onCreateChild: (parentId: string) => void;
  onEdit: (shelf: ShelfWithCount) => void;
  onRequestDelete: (shelf: ShelfWithCount) => void;
}

const MAX_SHELF_RENDER_DEPTH = 32;
const MAX_SHELF_INDENT_DEPTH = 8;

const ShelfTreeItem = memo(function ShelfTreeItem({
  node,
  depth,
  onSelect,
  onCreateChild,
  onEdit,
  onRequestDelete,
}: ShelfTreeItemProps) {
  const hasChildren = node.children.length > 0 && depth < MAX_SHELF_RENDER_DEPTH;
  const isExpanded = useUiStore((s) => s.expandedShelfIds?.[node.id] ?? true);
  const toggleShelfExpanded = useUiStore((s) => s.toggleShelfExpanded);
  const isActive = useUiStore((s) =>
    isSameNavigationSection(s.activeSection, {
      kind: 'shelf',
      shelfId: node.id,
    }),
  );

  if (depth > MAX_SHELF_RENDER_DEPTH) {
    return null;
  }

  return (
    <SidebarMenuItem className="group/shelf-row">
      <div
        className={cn(
          'flex h-7 items-center rounded-md pr-1 transition-colors',
          isActive
            ? 'bg-sidebar-accent text-sidebar-accent-foreground'
            : 'text-sidebar-foreground/80 hover:bg-sidebar-accent/70 hover:text-sidebar-accent-foreground',
        )}
        style={{ paddingLeft: `${6 + Math.min(depth, MAX_SHELF_INDENT_DEPTH) * 12}px` }}
      >
        {hasChildren ? (
          <button
            type="button"
            aria-expanded={isExpanded}
            aria-label={isExpanded ? `Contraer ${node.name}` : `Expandir ${node.name}`}
            onClick={() => toggleShelfExpanded(node.id)}
            className="mr-1 flex size-4 shrink-0 items-center justify-center rounded text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-sidebar-ring"
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
          aria-current={isActive ? 'page' : undefined}
          onClick={() => onSelect(node.id)}
          className={cn(
            'min-w-0 flex-1 truncate rounded-sm py-1 text-left text-[12.5px] outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring',
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
                className="absolute right-0 rounded p-0.5 text-muted-foreground opacity-0 outline-none transition-opacity hover:bg-background/60 hover:text-foreground focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-sidebar-ring group-hover/shelf-row:opacity-100 group-focus-within/shelf-row:opacity-100 data-[state=open]:opacity-100"
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

      {hasChildren && isExpanded ? (
        <ul className="mt-0.5 space-y-0.5">
          {node.children.map((child) => (
            <ShelfTreeItem
              key={child.id}
              node={child}
              depth={depth + 1}
              onSelect={onSelect}
              onCreateChild={onCreateChild}
              onEdit={onEdit}
              onRequestDelete={onRequestDelete}
            />
          ))}
        </ul>
      ) : null}
    </SidebarMenuItem>
  );
});

export const Sidebar = memo(function Sidebar({
  navCounts,
  shelves,
  tags,
  onCreateShelf,
  onEditShelf,
  onCreateTag,
  onEditTag,
  onPreloadCommandPalette,
}: SidebarProps) {
  const activeSection = useUiStore((s) => s.activeSection);
  const navigate = useUiStore((s) => s.navigate);
  const tagsExpanded = useUiStore((s) => s.tagsExpanded);
  const toggleTagsExpanded = useUiStore((s) => s.toggleTagsExpanded);
  const setCommandPaletteOpen = useUiStore((s) => s.setCommandPaletteOpen);

  const deleteShelf = useDeleteShelf();
  const deleteTag = useDeleteTag();

  const [shelfToDelete, setShelfToDelete] = useState<ShelfWithCount | null>(null);
  const [tagToDelete, setTagToDelete] = useState<TagWithCount | null>(null);

  const shelfTree = useMemo(() => buildShelfTree(shelves), [shelves]);

  const handleSelectInbox = useCallback(() => navigate('inbox'), [navigate]);
  const handleSelectAll = useCallback(() => navigate('all'), [navigate]);
  const handleSelectFavorites = useCallback(
    () => navigate('favorites'),
    [navigate],
  );
  const handleSelectRecent = useCallback(() => navigate('recent'), [navigate]);
  const handleSelectHighlights = useCallback(
    () => navigate('highlights'),
    [navigate],
  );
  const handleSelectNotes = useCallback(() => navigate('notes'), [navigate]);
  const handleSelectStats = useCallback(() => navigate('stats'), [navigate]);
  const handleSelectShelf = useCallback(
    (shelfId: string) => navigate({ kind: 'shelf', shelfId }),
    [navigate],
  );

  return (
    <>
      <ShadcnSidebar collapsible="icon" className="border-r border-sidebar-border">
        <SidebarHeader className="gap-2.5 px-3 pt-3.5 pb-2">
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton
                size="lg"
                tooltip="Librory"
                onClick={handleSelectAll}
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
            aria-keyshortcuts="Control+K Meta+K"
            onMouseEnter={onPreloadCommandPalette}
            onFocus={onPreloadCommandPalette}
            onClick={() => setCommandPaletteOpen(true)}
            className="flex h-8 w-full items-center justify-between rounded-md border border-border bg-background/70 px-2.5 text-xs text-muted-foreground outline-none transition-colors hover:border-border/80 hover:bg-background hover:text-foreground focus-visible:ring-2 focus-visible:ring-sidebar-ring group-data-[collapsible=icon]:hidden"
          >
            <span className="flex items-center gap-2">
              <Search className="size-3.5" />
              <span>Buscar...</span>
            </span>
            <KbdGroup aria-hidden="true">
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
            <nav aria-label="Navegación principal">
              <SidebarGroup className="py-1.5">
                <SidebarMenu className="gap-0.5">
                  <PrimaryNavItem
                    icon={INBOX_ICON}
                    label="Inbox"
                    count={navCounts.inbox}
                    active={activeSection === 'inbox'}
                    onSelect={handleSelectInbox}
                  />
                  <PrimaryNavItem
                    icon={LIBRARY_ICON}
                    label="All Books"
                    count={navCounts.all}
                    active={activeSection === 'all'}
                    onSelect={handleSelectAll}
                  />
                  <PrimaryNavItem
                    icon={FAVORITES_ICON}
                    label="Favoritos"
                    count={navCounts.favorites}
                    active={activeSection === 'favorites'}
                    onSelect={handleSelectFavorites}
                  />
                  <PrimaryNavItem
                    icon={RECENT_ICON}
                    label="Recent"
                    count={navCounts.recent}
                    active={activeSection === 'recent'}
                    onSelect={handleSelectRecent}
                  />
                  <PrimaryNavItem
                    icon={HIGHLIGHTS_ICON}
                    label="Highlights"
                    count={navCounts.highlights}
                    active={activeSection === 'highlights'}
                    onSelect={handleSelectHighlights}
                  />
                  <PrimaryNavItem
                    icon={NOTES_ICON}
                    label="Notas"
                    count={navCounts.notes}
                    active={activeSection === 'notes'}
                    onSelect={handleSelectNotes}
                  />
                  <PrimaryNavItem
                    icon={STATS_ICON}
                    label="Estadísticas"
                    active={activeSection === 'stats'}
                    onSelect={handleSelectStats}
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
                      {tags.length === 0 ? (
                        <p className="px-2 py-1 text-xs text-muted-foreground">
                          Sin etiquetas
                        </p>
                      ) : (
                        <SidebarMenu className="gap-0.5">
                          {tags.map((tag) => {
                            const isActive = isSameNavigationSection(
                              activeSection,
                              { kind: 'tag', tagId: tag.id },
                            );
                            return (
                              <SidebarMenuItem key={tag.id} className="group/menu-item">
                                <SidebarMenuButton
                                  size="sm"
                                  isActive={isActive}
                                  aria-current={isActive ? 'page' : undefined}
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
                                      aria-hidden="true"
                                      className="size-1.5 shrink-0 rounded-full"
                                      style={{ backgroundColor: tag.color }}
                                    />
                                  ) : null}
                                  <span className="truncate">{tag.name}</span>
                                </SidebarMenuButton>

                                <SidebarMenuBadge className="font-mono text-[11px] font-normal text-muted-foreground transition-opacity group-hover/menu-item:opacity-0 group-focus-within/menu-item:opacity-0">
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
                          })}
                        </SidebarMenu>
                      )}
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
                  {shelfTree.length === 0 ? (
                    <p className="px-2 py-1 text-xs text-muted-foreground">
                      Sin estanterías
                    </p>
                  ) : (
                    <SidebarMenu className="gap-0.5">
                      {shelfTree.map((node) => (
                        <ShelfTreeItem
                          key={node.id}
                          node={node}
                          depth={0}
                          onSelect={handleSelectShelf}
                          onCreateChild={onCreateShelf}
                          onEdit={onEditShelf}
                          onRequestDelete={setShelfToDelete}
                        />
                      ))}
                    </SidebarMenu>
                  )}
                </SidebarGroupContent>
              </SidebarGroup>
            </nav>
          </ScrollArea>
        </SidebarContent>

        <SidebarFooter className="border-t border-sidebar-border px-3 py-2.5 group-data-[collapsible=icon]:hidden">
          <div className="flex items-center justify-between font-mono text-[10px] text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <span aria-hidden="true" className="size-1.5 rounded-full bg-emerald-400/80" />
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
});
