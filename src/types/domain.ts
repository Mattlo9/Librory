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

export const POMODORO_PHASES = ['focus', 'short_break', 'long_break'] as const;
export type PomodoroPhase = (typeof POMODORO_PHASES)[number];

export type StudyStatsRange = 'all' | '30d' | '7d';

export type StudyEvolutionGranularity =
  | 'day14'
  | 'day30'
  | 'week12'
  | 'month12'
  | 'year';

export interface StudyEvolutionBucket {
  key: string;
  label: string;
  fullLabel: string;
  focusSeconds: number;
  cumulativeSeconds: number;
  sessions: number;
  isCurrentPeriod: boolean;
}

export interface StudyEvolutionBookBreakdown {
  itemId: string | null;
  title: string;
  author: string;
  focusSeconds: number;
  sessions: number;
  sharePercent: number;
}

export interface StudyPeriodSummary {
  currentSeconds: number;
  previousSeconds: number;
  currentSessions: number;
  deltaPercent: number | null;
}

export interface StudyEvolutionStats {
  granularity: StudyEvolutionGranularity;
  buckets: StudyEvolutionBucket[];
  periodTotalSeconds: number;
  periodSessions: number;
  averageBucketSeconds: number;
  averageActiveBucketSeconds: number;
  bestBucket: StudyEvolutionBucket | null;
  summaries: {
    today: StudyPeriodSummary;
    thisWeek: StudyPeriodSummary;
    thisMonth: StudyPeriodSummary;
    allTimeSeconds: number;
    allTimeSessions: number;
  };
  bookBreakdown: StudyEvolutionBookBreakdown[];
}

export type NavigationSection =
  | 'inbox'
  | 'all'
  | 'favorites'
  | 'recent'
  | 'highlights'
  | 'notes'
  | 'stats'
  | { kind: 'shelf'; shelfId: string }
  | { kind: 'tag'; tagId: string };

export type ViewMode = 'grid' | 'list';

export type CoverFitMode = 'contain' | 'cover';

export type SortOption = 'created_desc' | 'title_asc' | 'author_asc';

export type ThemePreference = 'light' | 'dark' | 'system';

export type ResolvedTheme = 'light' | 'dark';

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
  is_favorite: number;
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
  is_favorite?: number;
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
  is_favorite?: number;
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
  favoriteOnly?: boolean;
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

export interface ReadingStatsSnapshot {
  totals: {
    totalItems: number;
    finishedCount: number;
    readingCount: number;
    toReadCount: number;
    inboxCount: number;
    referenceCount: number;
    totalPagesRead: number;
    totalLibraryPages: number;
    completionRate: number;
    averageActiveProgress: number;
    totalHighlights: number;
    pdfCount: number;
    epubCount: number;
  };
  byStatus: Array<{ status: ItemStatus; count: number }>;
  byType: Array<{ type: ItemType; count: number }>;
  inProgressItems: LibraryItem[];
  recentlyFinished: LibraryItem[];
  topShelves: Array<{
    id: string;
    name: string;
    totalCount: number;
    finishedCount: number;
  }>;
  monthlyActivity: Array<{
    monthKey: string;
    label: string;
    addedCount: number;
    finishedCount: number;
    highlightsCount: number;
  }>;
}

export interface StudySession {
  id: string;
  item_id: string | null;
  phase: PomodoroPhase;
  planned_seconds: number;
  duration_seconds: number;
  completed: number;
  started_at: string;
  ended_at: string;
  local_date: string;
  local_hour: number;
  created_at: string;
}

export interface CreateStudySessionInput {
  item_id?: string | null;
  phase: PomodoroPhase;
  planned_seconds: number;
  duration_seconds: number;
  completed: boolean;
  started_at: string;
  ended_at: string;
  local_date: string;
  local_hour: number;
}

export interface StudyHeatmapDay {
  date: string;
  sessions: number;
  focusSeconds: number;
  intensity: 0 | 1 | 2 | 3 | 4;
}

export interface StudyOverviewStats {
  range: StudyStatsRange;
  totalSessions: number;
  completedSessions: number;
  totalFocusSeconds: number;
  activeDays: number;
  peakHour: number | null;
  currentStreakDays: number;
  longestStreakDays: number;
  topBook: {
    itemId: string;
    title: string;
    author: string;
    focusSeconds: number;
    sessions: number;
  } | null;
  heatmapDays: StudyHeatmapDay[];
  todayFocusSeconds: number;
  todaySessions: number;
  rangeStartDate: string | null;
}

export interface PomodoroBookOption {
  id: string;
  title: string;
  author: string;
  status: ItemStatus;
}

export interface Note {
  id: string;
  title: string;
  content: string;
  folder: string;
  tags_json: string;
  item_id: string | null;
  is_pinned: number;
  created_at: string;
  updated_at: string;
}

export interface NoteWithItem extends Note {
  tags: string[];
  item_title: string | null;
  item_author: string | null;
}

export interface CreateNoteInput {
  title: string;
  content?: string;
  folder?: string;
  tags?: string[];
  item_id?: string | null;
  is_pinned?: boolean;
}

export interface UpdateNoteInput {
  title?: string;
  content?: string;
  folder?: string;
  tags?: string[];
  item_id?: string | null;
  is_pinned?: boolean;
}

export type ActivityRange = '6m' | '30d' | '7d';

export interface ActivityBucket {
  key: string;
  label: string;
  fullLabel: string;
  addedCount: number;
  finishedCount: number;
  highlightsCount: number;
  notesCount: number;
}

export interface ActivityStatsSnapshot {
  range: ActivityRange;
  buckets: ActivityBucket[];
  totals: {
    added: number;
    finished: number;
    highlights: number;
    notes: number;
    total: number;
  };
}
