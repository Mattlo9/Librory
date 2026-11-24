import type { ItemStatus, ItemType, ShelfCategory, SortOption } from '@/types/domain';

const DIACRITICS_REGEX = /[\u0300-\u036f]/g;
const MAX_FTS_QUERY_CHARS = 256;
const MAX_FTS_TOKENS = 12;

export function normalizeForSearch(value: string): string {
  return value
    .normalize('NFD')
    .replace(DIACRITICS_REGEX, '')
    .toLowerCase()
    .trim();
}

export function sanitizeFtsQuery(rawQuery: string): string {
  const bounded = rawQuery
    .replace(/[\u0000-\u001F\u007F]/g, '')
    .slice(0, MAX_FTS_QUERY_CHARS)
    .trim();

  if (!bounded) return '';

  const tokens = bounded
    .split(/\s+/)
    .map((token) => token.replace(/["*^():']/g, '').trim())
    .filter((token) => token.length > 0)
    .slice(0, MAX_FTS_TOKENS);

  return tokens.map((token) => `"${token}"*`).join(' ');
}

export const ITEM_TYPE_LABELS: Record<ItemType, string> = {
  book: 'Books',
  summary: 'Summaries',
  article: 'Articles',
  paper: 'Papers',
  course: 'Course Materials',
  unsorted: 'Unsorted',
};

export const ITEM_TYPE_SINGULAR: Record<ItemType, string> = {
  book: 'Libro',
  summary: 'Resumen',
  article: 'Artículo',
  paper: 'Paper',
  course: 'Material de curso',
  unsorted: 'Sin clasificar',
};

export const ITEM_STATUS_LABELS: Record<ItemStatus, string> = {
  inbox: 'Inbox',
  to_read: 'Por leer',
  reading: 'Leyendo',
  reference: 'Referencia',
  finished: 'Terminado',
};

export const SHELF_CATEGORY_LABELS: Record<ShelfCategory, string> = {
  project: 'Proyecto',
  area: 'Área',
  author: 'Autor / Docente',
  custom: 'Personalizada',
};

export const SORT_OPTION_LABELS: Record<SortOption, string> = {
  created_desc: 'Más recientes primero',
  title_asc: 'Título (A–Z)',
  author_asc: 'Autor (A–Z)',
};
