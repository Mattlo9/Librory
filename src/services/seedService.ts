import { hasSampleItems } from '@/services/bookRepository';
import { invokeDb } from '@/services/db';
import type {
  FileFormat,
  HighlightColor,
  ItemStatus,
  ItemType,
  ShelfCategory,
} from '@/types/domain';

export { hasSampleItems };

interface SampleItemSpec {
  slug: string;
  title: string;
  author: string;
  type: ItemType;
  status: ItemStatus;
  file_format: FileFormat;
  page_count: number;
  current_page: number;
  notes: string;
  openedDaysAgo?: number;
  shelves: string[];
  tags: string[];
}

const SAMPLE_SHELVES: Array<{
  key: string;
  name: string;
  parent_key: string | null;
  category: ShelfCategory;
  sort_order: number;
}> = [
  { key: 'projects', name: 'Projects', parent_key: null, category: 'project', sort_order: 1 },
  { key: 'areas', name: 'Areas', parent_key: null, category: 'area', sort_order: 2 },
  { key: 'authors', name: 'Authors', parent_key: null, category: 'author', sort_order: 3 },
  { key: 'dialogic', name: 'Dialogic Studio', parent_key: 'projects', category: 'project', sort_order: 1 },
  { key: 'flowstate', name: 'Flowstate', parent_key: 'projects', category: 'project', sort_order: 2 },
  { key: 'systems', name: 'Design & Systems', parent_key: 'areas', category: 'area', sort_order: 1 },
  { key: 'philosophy', name: 'Philosophy', parent_key: 'areas', category: 'area', sort_order: 2 },
  { key: 'baldwin', name: 'James Baldwin', parent_key: 'authors', category: 'author', sort_order: 1 },
  { key: 'meadows', name: 'Donella Meadows', parent_key: 'authors', category: 'author', sort_order: 2 },
];

const SAMPLE_TAGS = [
  { key: 'local-first', name: 'local-first', color: '#d4a373' },
  { key: 'architecture', name: 'architecture', color: '#7d9b76' },
  { key: 'strategy', name: 'strategy', color: '#6d8aa6' },
  { key: 'essays', name: 'essays', color: '#b57468' },
];

const SAMPLE_ITEMS: SampleItemSpec[] = [
  {
    slug: 'agile-strategy-guide',
    title: 'Agile Strategy Guide',
    author: 'Dialogic Press',
    type: 'summary',
    status: 'reference',
    file_format: 'pdf',
    page_count: 42,
    current_page: 42,
    notes: 'Síntesis práctica sobre decisiones estratégicas iterativas y posicionamiento.',
    openedDaysAgo: 2,
    shelves: ['dialogic'],
    tags: ['strategy'],
  },
  {
    slug: 'anduril-comms-strategy',
    title: 'Anduril Comms Strategy: 18 Rules',
    author: 'Lulu Cheng Meservey',
    type: 'article',
    status: 'reading',
    file_format: 'pdf',
    page_count: 14,
    current_page: 8,
    notes: 'Reglas directas de narrativa y comunicación estratégica sin fricción.',
    openedDaysAgo: 1,
    shelves: ['dialogic'],
    tags: ['strategy', 'essays'],
  },
  {
    slug: 'artists-struggle-for-integrity',
    title: "The Artist's Struggle for Integrity",
    author: 'James Baldwin',
    type: 'article',
    status: 'finished',
    file_format: 'pdf',
    page_count: 19,
    current_page: 19,
    notes: 'Sobre la responsabilidad del creador frente a su propio oficio.',
    shelves: ['dialogic', 'baldwin', 'philosophy'],
    tags: ['essays'],
  },
  {
    slug: 'effectual-entrepreneurship',
    title: 'Effectual Entrepreneurship',
    author: 'Stuart Read',
    type: 'book',
    status: 'reading',
    file_format: 'epub',
    page_count: 268,
    current_page: 112,
    notes: 'Principios de efectuación: partir de los medios disponibles en lugar de predecir.',
    openedDaysAgo: 3,
    shelves: ['dialogic'],
    tags: ['strategy'],
  },
  {
    slug: 'strategic-independent',
    title: 'Strategic Independent',
    author: 'Tom Critchlow',
    type: 'book',
    status: 'to_read',
    file_format: 'epub',
    page_count: 184,
    current_page: 0,
    notes: 'Modelo mental para consultoría independiente y pensamiento sistémico.',
    shelves: ['dialogic', 'systems'],
    tags: ['strategy'],
  },
  {
    slug: 'pip-decks-storyteller',
    title: 'PIP Decks: Storyteller Tactics',
    author: 'Charles Burdett',
    type: 'course',
    status: 'reference',
    file_format: 'pdf',
    page_count: 54,
    current_page: 21,
    notes: 'Baraja visual de estructuras narrativas para presentaciones y ensayos.',
    shelves: ['dialogic'],
    tags: ['strategy'],
  },
  {
    slug: 'pip-decks-brand-tactics',
    title: 'PIP Decks: Brand Tactics',
    author: 'Jarek Durnian',
    type: 'course',
    status: 'reference',
    file_format: 'pdf',
    page_count: 54,
    current_page: 10,
    notes: 'Sistema táctico de posicionamiento y coherencia visual.',
    shelves: ['dialogic'],
    tags: ['strategy'],
  },
  {
    slug: 'thinking-in-systems',
    title: 'Thinking in Systems: A Primer',
    author: 'Donella H. Meadows',
    type: 'book',
    status: 'finished',
    file_format: 'epub',
    page_count: 240,
    current_page: 240,
    notes: 'Stocks, flujos, bucles de retroalimentación y puntos de apalancamiento.',
    openedDaysAgo: 5,
    shelves: ['meadows', 'systems'],
    tags: ['architecture'],
  },
  {
    slug: 'local-first-software',
    title: 'Local-First Software: You Own Your Data',
    author: 'Martin Kleppmann et al.',
    type: 'paper',
    status: 'reference',
    file_format: 'pdf',
    page_count: 25,
    current_page: 25,
    notes: 'Manifiesto fundacional sobre CRDTs, propiedad de datos y apps sin nube.',
    openedDaysAgo: 0,
    shelves: ['systems', 'flowstate'],
    tags: ['local-first', 'architecture'],
  },
  {
    slug: 'sqlite-fts5-internals',
    title: 'SQLite FTS5 Extension & Ranking Notes',
    author: 'D. Richard Hipp',
    type: 'paper',
    status: 'to_read',
    file_format: 'pdf',
    page_count: 32,
    current_page: 0,
    notes: 'Notas técnicas sobre BM25, tokenización unicode61 y tablas externas.',
    shelves: ['systems'],
    tags: ['local-first', 'architecture'],
  },
  {
    slug: 'phenomenology-of-the-hand',
    title: 'Phenomenology of the Hand',
    author: 'Helena Vance',
    type: 'paper',
    status: 'inbox',
    file_format: 'pdf',
    page_count: 28,
    current_page: 0,
    notes: 'Por clasificar dentro del proyecto Flowstate.',
    shelves: ['flowstate', 'philosophy'],
    tags: ['essays'],
  },
  {
    slug: 'reading-notes-inbox-draft',
    title: 'Apuntes sobre Arquitectura Minimalista',
    author: 'Borrador personal',
    type: 'unsorted',
    status: 'inbox',
    file_format: 'pdf',
    page_count: 9,
    current_page: 0,
    notes: 'Recién ingresado a Inbox para etiquetar y mover a una estantería.',
    shelves: [],
    tags: ['architecture'],
  },
];

const SAMPLE_HIGHLIGHTS: Array<{
  item_slug: string;
  quote_text: string;
  note_markdown: string;
  page_number: number;
  color: HighlightColor;
}> = [
  {
    item_slug: 'local-first-software',
    quote_text:
      'In local-first software, the availability of your data does not depend on any server remaining online.',
    note_markdown:
      'Principio base de Librory: el disco local y SQLite son la única fuente de verdad.',
    page_number: 4,
    color: 'amber',
  },
  {
    item_slug: 'thinking-in-systems',
    quote_text:
      'Purposes are deduced from behavior, not from rhetoric or stated goals.',
    note_markdown:
      'Observar cómo se navega realmente la biblioteca importa más que la taxonomía teórica.',
    page_number: 14,
    color: 'sage',
  },
];

let seedInFlight: Promise<void> | null = null;

/**
 * Atomically and idempotently seeds the sample library inside a single Rust SQLite transaction.
 */
export async function seedSampleLibrary(): Promise<void> {
  if (seedInFlight) {
    return seedInFlight;
  }

  seedInFlight = (async () => {
    const nowMs = Date.now();
    const items = SAMPLE_ITEMS.map((spec) => ({
      slug: spec.slug,
      title: spec.title,
      author: spec.author,
      type: spec.type,
      status: spec.status,
      file_format: spec.file_format,
      page_count: spec.page_count,
      current_page: spec.current_page,
      notes: spec.notes,
      opened_at:
        spec.openedDaysAgo !== undefined
          ? new Date(
              nowMs - spec.openedDaysAgo * 24 * 60 * 60 * 1000,
            ).toISOString()
          : null,
      shelves: spec.shelves,
      tags: spec.tags,
    }));

    await invokeDb<void>('db_seed_sample_library', {
      payload: {
        shelves: SAMPLE_SHELVES,
        tags: SAMPLE_TAGS,
        items,
        highlights: SAMPLE_HIGHLIGHTS,
      },
    });
  })().finally(() => {
    seedInFlight = null;
  });

  return seedInFlight;
}

export async function clearSampleLibrary(): Promise<void> {
  await invokeDb<void>('db_clear_sample_library');
}
