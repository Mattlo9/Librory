import { createItem, hasSampleItems } from '@/services/bookRepository';
import { getDb } from '@/services/db';
import { assignItemToShelf, createShelf } from '@/services/shelfRepository';
import { assignTagToItem, createTag } from '@/services/tagRepository';
import type {
  FileFormat,
  ItemStatus,
  ItemType,
  Shelf,
  ShelfCategory,
  Tag,
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

async function ensureShelf(
  existing: Shelf[],
  name: string,
  parentId: string | null,
  category: ShelfCategory,
  sortOrder: number,
): Promise<Shelf> {
  const match = existing.find(
    (shelf) =>
      shelf.name.toLowerCase() === name.toLowerCase() &&
      shelf.parent_id === parentId,
  );
  if (match) return match;

  const created = await createShelf({
    name,
    parent_id: parentId,
    category,
    sort_order: sortOrder,
  });
  existing.push(created);
  return created;
}

async function ensureTag(
  existing: Tag[],
  name: string,
  color: string,
): Promise<Tag> {
  const match = existing.find(
    (tag) => tag.name.toLowerCase() === name.toLowerCase(),
  );
  if (match) return match;

  const created = await createTag({ name, color });
  existing.push(created);
  return created;
}

export async function seedSampleLibrary(): Promise<void> {
  if (await hasSampleItems()) {
    return;
  }

  const db = await getDb();
  const [existingShelves, existingTags] = await Promise.all([
    db.select<Shelf[]>('SELECT * FROM shelves'),
    db.select<Tag[]>('SELECT * FROM tags'),
  ]);

  const [projects, areas, authors, tagLocalFirst, tagArchitecture, tagStrategy, tagEssays] =
    await Promise.all([
      ensureShelf(existingShelves, 'Projects', null, 'project', 1),
      ensureShelf(existingShelves, 'Areas', null, 'area', 2),
      ensureShelf(existingShelves, 'Authors', null, 'author', 3),
      ensureTag(existingTags, 'local-first', '#d4a373'),
      ensureTag(existingTags, 'architecture', '#7d9b76'),
      ensureTag(existingTags, 'strategy', '#6d8aa6'),
      ensureTag(existingTags, 'essays', '#b57468'),
    ]);

  const [dialogic, flowstate, systems, philosophy, baldwin, meadows] =
    await Promise.all([
      ensureShelf(existingShelves, 'Dialogic Studio', projects.id, 'project', 1),
      ensureShelf(existingShelves, 'Flowstate', projects.id, 'project', 2),
      ensureShelf(existingShelves, 'Design & Systems', areas.id, 'area', 1),
      ensureShelf(existingShelves, 'Philosophy', areas.id, 'area', 2),
      ensureShelf(existingShelves, 'James Baldwin', authors.id, 'author', 1),
      ensureShelf(existingShelves, 'Donella Meadows', authors.id, 'author', 2),
    ]);

  const shelfLookup = new Map<string, Shelf>([
    ['dialogic', dialogic],
    ['flowstate', flowstate],
    ['systems', systems],
    ['philosophy', philosophy],
    ['baldwin', baldwin],
    ['meadows', meadows],
  ]);

  const tagLookup = new Map<string, Tag>([
    ['local-first', tagLocalFirst],
    ['architecture', tagArchitecture],
    ['strategy', tagStrategy],
    ['essays', tagEssays],
  ]);

  const sampleItems: SampleItemSpec[] = [
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

  const createdIds = new Map<string, string>();
  const nowMs = Date.now();

  for (const spec of sampleItems) {
    const item = await createItem({
      title: spec.title,
      author: spec.author,
      type: spec.type,
      status: spec.status,
      file_path: `sample/${spec.slug}.${spec.file_format}`,
      cover_path: null,
      file_format: spec.file_format,
      page_count: spec.page_count,
      current_page: spec.current_page,
      notes: spec.notes,
    });

    createdIds.set(spec.slug, item.id);

    const itemOps: Array<Promise<unknown>> = [];

    if (spec.openedDaysAgo !== undefined) {
      const openedAt = new Date(
        nowMs - spec.openedDaysAgo * 24 * 60 * 60 * 1000,
      ).toISOString();
      itemOps.push(
        db.execute('UPDATE items SET last_opened_at = $1 WHERE id = $2', [
          openedAt,
          item.id,
        ]),
      );
    }

    for (const shelfKey of spec.shelves) {
      const shelf = shelfLookup.get(shelfKey);
      if (shelf) {
        itemOps.push(assignItemToShelf(item.id, shelf.id));
      }
    }

    for (const tagKey of spec.tags) {
      const tag = tagLookup.get(tagKey);
      if (tag) {
        itemOps.push(assignTagToItem(item.id, tag.id));
      }
    }

    if (itemOps.length > 0) {
      await Promise.all(itemOps);
    }
  }

  const localFirstId = createdIds.get('local-first-software');
  const meadowsId = createdIds.get('thinking-in-systems');
  const nowIso = new Date().toISOString();

  const highlightOps: Array<Promise<unknown>> = [];

  if (localFirstId) {
    highlightOps.push(
      db.execute(
        `INSERT INTO highlights (id, item_id, quote_text, note_markdown, page_number, color, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          crypto.randomUUID(),
          localFirstId,
          'In local-first software, the availability of your data does not depend on any server remaining online.',
          'Principio base de Librory: el disco local y SQLite son la única fuente de verdad.',
          4,
          'amber',
          nowIso,
          nowIso,
        ],
      ),
    );
  }

  if (meadowsId) {
    highlightOps.push(
      db.execute(
        `INSERT INTO highlights (id, item_id, quote_text, note_markdown, page_number, color, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          crypto.randomUUID(),
          meadowsId,
          'Purposes are deduced from behavior, not from rhetoric or stated goals.',
          'Observar cómo se navega realmente la biblioteca importa más que la taxonomía teórica.',
          14,
          'sage',
          nowIso,
          nowIso,
        ],
      ),
    );
  }

  if (highlightOps.length > 0) {
    await Promise.all(highlightOps);
  }
}

export async function clearSampleLibrary(): Promise<void> {
  const db = await getDb();
  await db.execute("DELETE FROM items WHERE file_path LIKE 'sample/%'");
}
