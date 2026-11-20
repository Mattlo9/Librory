export const ITEM_TYPES = [
  'book',
  'summary',
  'article',
  'paper',
  'course',
  'unsorted',
] as const;

export type ItemType = (typeof ITEM_TYPES)[number];

export const ITEM_STATUSES = [
  'inbox',
  'to_read',
  'reading',
  'reference',
  'finished',
] as const;

export type ItemStatus = (typeof ITEM_STATUSES)[number];

export const FILE_FORMATS = ['pdf', 'epub'] as const;
export type FileFormat = (typeof FILE_FORMATS)[number];

export const SHELF_CATEGORIES = [
  'project',
  'area',
  'author',
  'custom',
] as const;
export type ShelfCategory = (typeof SHELF_CATEGORIES)[number];

export const HIGHLIGHT_COLORS = ['amber', 'sage', 'clay', 'slate'] as const;
export type HighlightColor = (typeof HIGHLIGHT_COLORS)[number];

export type NavigationSection =
  | 'inbox'
  | 'all'
  | 'recent'
  | 'highlights'
  | { kind: 'shelf'; shelfId: string }
  | { kind: 'tag'; tagId: string };

export type ViewMode = 'grid' | 'list';

export type SortOption = 'created_desc' | 'title_asc' | 'author_asc';

export interface LibraryItem {
  id: string;
  title: string;
  author: string;
  type: ItemType;
  status: ItemStatus;
  file_path: string;
  cover_path: string | null;
  file_format: FileFormat;
  file_hash: string | null;
  file_size: number;
  page_count: number;
  current_page: number;
  notes: string;
  last_opened_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateItemInput {
  id?: string;
  title: string;
  author?: string;
  type?: ItemType;
  status?: ItemStatus;
  file_path: string;
  cover_path?: string | null;
  file_format: FileFormat;
  file_hash?: string | null;
  file_size?: number;
  page_count?: number;
  current_page?: number;
  notes?: string;
}

export interface UpdateItemInput {
  title?: string;
  author?: string;
  type?: ItemType;
  status?: ItemStatus;
  cover_path?: string | null;
  page_count?: number;
  current_page?: number;
  notes?: string;
  last_opened_at?: string | null;
}

export interface LibraryItemWithRelations extends LibraryItem {
  shelf_ids: string[];
  tag_ids: string[];
}

export interface ItemFilter {
  status?: ItemStatus;
  type?: ItemType;
  shelfId?: string;
  shelfIds?: string[];
  tagId?: string;
  recentOnly?: boolean;
  sortBy?: SortOption;
  limit?: number;
}

export interface Shelf {
  id: string;
  name: string;
  parent_id: string | null;
  category: ShelfCategory;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface ShelfWithCount extends Shelf {
  direct_item_count: number;
  item_count: number;
}

export interface ShelfTreeNode extends ShelfWithCount {
  children: ShelfTreeNode[];
}

export interface CreateShelfInput {
  name: string;
  parent_id?: string | null;
  category?: ShelfCategory;
  sort_order?: number;
}

export interface UpdateShelfInput {
  name?: string;
  parent_id?: string | null;
  category?: ShelfCategory;
  sort_order?: number;
}

export interface Tag {
  id: string;
  name: string;
  color: string | null;
  created_at: string;
}

export interface TagWithCount extends Tag {
  item_count: number;
}

export interface CreateTagInput {
  name: string;
  color?: string | null;
}

export interface UpdateTagInput {
  name?: string;
  color?: string | null;
}

export interface Highlight {
  id: string;
  item_id: string;
  quote_text: string;
  note_markdown: string;
  page_number: number | null;
  location_cfi: string | null;
  color: HighlightColor;
  created_at: string;
  updated_at: string;
}

export interface HighlightWithItem extends Highlight {
  item_title: string;
  item_author: string;
  item_type: ItemType;
  item_file_format: FileFormat;
  item_file_path: string;
}

export interface CreateHighlightInput {
  item_id: string;
  quote_text: string;
  note_markdown?: string;
  page_number?: number | null;
  location_cfi?: string | null;
  color?: HighlightColor;
}

export interface UpdateHighlightInput {
  quote_text?: string;
  note_markdown?: string;
  page_number?: number | null;
  location_cfi?: string | null;
  color?: HighlightColor;
}

export interface SaveReadingProgressInput {
  itemId: string;
  currentPage: number;
  pageCount?: number;
  markFinished?: boolean;
}

export interface FtsSearchResult {
  item: LibraryItem;
  rank: number;
}

export interface StorageDiagnostics {
  appDataPath: string;
  booksPath: string;
  coversPath: string;
  dbExpectedPath: string;
  booksReady: boolean;
  coversReady: boolean;
}

export interface DatabaseHealthReport {
  connected: boolean;
  journalMode: string;
  foreignKeysEnabled: boolean;
  recursiveTriggersEnabled: boolean;
  tables: string[];
  missingTables: string[];
  appliedMigrations: number[];
  itemsCount: number;
  ftsIndexedCount: number;
}

export type ImportFileOutcome = 'imported' | 'duplicate' | 'unsupported' | 'error';

export interface ImportBatchProgress {
  active: boolean;
  current: number;
  total: number;
  currentFilename: string;
}

export interface ImportBatchSummary {
  imported: LibraryItem[];
  duplicates: string[];
  unsupported: string[];
  errors: Array<{ filename: string; reason: string }>;
}

export interface ExtractedDocumentMeta {
  title: string | null;
  author: string | null;
  pageCount: number;
  coverWebpBytes: Uint8Array | null;
}
