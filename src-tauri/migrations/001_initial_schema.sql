-- 1. Recursos principales (libros, papers, artículos, cursos, etc.)
CREATE TABLE IF NOT EXISTS items (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    author TEXT NOT NULL DEFAULT '',
    type TEXT NOT NULL DEFAULT 'unsorted'
        CHECK (type IN ('book', 'summary', 'article', 'paper', 'course', 'unsorted')),
    status TEXT NOT NULL DEFAULT 'inbox'
        CHECK (status IN ('inbox', 'to_read', 'reading', 'reference', 'finished')),
    file_path TEXT NOT NULL,
    cover_path TEXT,
    file_format TEXT NOT NULL CHECK (file_format IN ('pdf', 'epub')),
    file_hash TEXT,
    file_size INTEGER NOT NULL DEFAULT 0,
    page_count INTEGER NOT NULL DEFAULT 0,
    current_page INTEGER NOT NULL DEFAULT 0,
    notes TEXT NOT NULL DEFAULT '',
    last_opened_at TEXT,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- 2. Estanterías jerárquicas recursivas (Projects, Areas, Authors/Teachers, Custom)
CREATE TABLE IF NOT EXISTS shelves (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    parent_id TEXT REFERENCES shelves(id) ON DELETE CASCADE,
    category TEXT NOT NULL DEFAULT 'custom'
        CHECK (category IN ('project', 'area', 'author', 'custom')),
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- 3. Relación M:N Items <-> Shelves (sin duplicar archivo físico)
CREATE TABLE IF NOT EXISTS item_shelves (
    item_id TEXT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
    shelf_id TEXT NOT NULL REFERENCES shelves(id) ON DELETE CASCADE,
    added_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    PRIMARY KEY (item_id, shelf_id)
);

-- 4. Etiquetas y relación M:N
CREATE TABLE IF NOT EXISTS tags (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE COLLATE NOCASE,
    color TEXT,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS item_tags (
    item_id TEXT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
    tag_id TEXT NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
    PRIMARY KEY (item_id, tag_id)
);

-- 5. Subrayados y notas en Markdown
CREATE TABLE IF NOT EXISTS highlights (
    id TEXT PRIMARY KEY,
    item_id TEXT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
    quote_text TEXT NOT NULL,
    note_markdown TEXT NOT NULL DEFAULT '',
    page_number INTEGER,
    location_cfi TEXT,
    color TEXT NOT NULL DEFAULT 'amber',
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- 6. Índices para filtros, ordenamiento y árbol de estanterías
CREATE INDEX IF NOT EXISTS idx_items_status ON items(status);
CREATE INDEX IF NOT EXISTS idx_items_type ON items(type);
CREATE INDEX IF NOT EXISTS idx_items_last_opened ON items(last_opened_at DESC);
CREATE INDEX IF NOT EXISTS idx_items_created_at ON items(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_items_file_hash ON items(file_hash);
CREATE INDEX IF NOT EXISTS idx_shelves_parent_order ON shelves(parent_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_item_shelves_shelf ON item_shelves(shelf_id);
CREATE INDEX IF NOT EXISTS idx_item_tags_tag ON item_tags(tag_id);
CREATE INDEX IF NOT EXISTS idx_highlights_item_page ON highlights(item_id, page_number);

-- 7. Búsqueda de texto completo (FTS5) sincronizada automáticamente
CREATE VIRTUAL TABLE IF NOT EXISTS items_fts USING fts5(
    item_id UNINDEXED,
    title,
    author,
    notes,
    tokenize='unicode61 remove_diacritics 2'
);

CREATE VIRTUAL TABLE IF NOT EXISTS highlights_fts USING fts5(
    highlight_id UNINDEXED,
    item_id UNINDEXED,
    quote_text,
    note_markdown,
    tokenize='unicode61 remove_diacritics 2'
);

-- Triggers de sincronización para items_fts
CREATE TRIGGER IF NOT EXISTS items_fts_ai AFTER INSERT ON items BEGIN
    INSERT INTO items_fts(item_id, title, author, notes)
    VALUES (new.id, new.title, new.author, new.notes);
END;

CREATE TRIGGER IF NOT EXISTS items_fts_au AFTER UPDATE OF title, author, notes ON items BEGIN
    DELETE FROM items_fts WHERE item_id = old.id;
    INSERT INTO items_fts(item_id, title, author, notes)
    VALUES (new.id, new.title, new.author, new.notes);
END;

CREATE TRIGGER IF NOT EXISTS items_fts_ad AFTER DELETE ON items BEGIN
    DELETE FROM items_fts WHERE item_id = old.id;
    DELETE FROM highlights_fts WHERE item_id = old.id;
END;

-- Triggers de sincronización para highlights_fts
CREATE TRIGGER IF NOT EXISTS highlights_fts_ai AFTER INSERT ON highlights BEGIN
    INSERT INTO highlights_fts(highlight_id, item_id, quote_text, note_markdown)
    VALUES (new.id, new.item_id, new.quote_text, new.note_markdown);
END;

CREATE TRIGGER IF NOT EXISTS highlights_fts_au AFTER UPDATE OF quote_text, note_markdown ON highlights BEGIN
    DELETE FROM highlights_fts WHERE highlight_id = old.id;
    INSERT INTO highlights_fts(highlight_id, item_id, quote_text, note_markdown)
    VALUES (new.id, new.item_id, new.quote_text, new.note_markdown);
END;

CREATE TRIGGER IF NOT EXISTS highlights_fts_ad AFTER DELETE ON highlights BEGIN
    DELETE FROM highlights_fts WHERE highlight_id = old.id;
END;
