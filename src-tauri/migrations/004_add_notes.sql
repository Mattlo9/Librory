-- 9. Notas en formato Markdown compatibles con Obsidian
CREATE TABLE IF NOT EXISTS notes (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    content TEXT NOT NULL DEFAULT '',
    folder TEXT NOT NULL DEFAULT '',
    tags_json TEXT NOT NULL DEFAULT '[]',
    item_id TEXT REFERENCES items(id) ON DELETE SET NULL,
    is_pinned INTEGER NOT NULL DEFAULT 0 CHECK (is_pinned IN (0, 1)),
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_notes_updated_at ON notes(is_pinned DESC, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_notes_folder ON notes(folder COLLATE NOCASE);
CREATE INDEX IF NOT EXISTS idx_notes_item_id ON notes(item_id);
CREATE INDEX IF NOT EXISTS idx_notes_created_at ON notes(created_at DESC);

CREATE VIRTUAL TABLE IF NOT EXISTS notes_fts USING fts5(
    note_id UNINDEXED,
    title,
    content,
    folder,
    tags_text,
    tokenize='unicode61 remove_diacritics 2'
);

CREATE TRIGGER IF NOT EXISTS notes_fts_ai AFTER INSERT ON notes BEGIN
    INSERT INTO notes_fts(note_id, title, content, folder, tags_text)
    VALUES (new.id, new.title, new.content, new.folder, new.tags_json);
END;

CREATE TRIGGER IF NOT EXISTS notes_fts_au AFTER UPDATE OF title, content, folder, tags_json ON notes BEGIN
    DELETE FROM notes_fts WHERE note_id = old.id;
    INSERT INTO notes_fts(note_id, title, content, folder, tags_text)
    VALUES (new.id, new.title, new.content, new.folder, new.tags_json);
END;

CREATE TRIGGER IF NOT EXISTS notes_fts_ad AFTER DELETE ON notes BEGIN
    DELETE FROM notes_fts WHERE note_id = old.id;
END;
