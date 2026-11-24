-- 10. Endurecimiento de integridad y seguridad de esquema

-- Limpiar posibles hashes duplicados heredados antes de crear índice único parcial
UPDATE items
SET file_hash = NULL
WHERE file_hash IS NOT NULL
  AND rowid NOT IN (
      SELECT MIN(rowid)
      FROM items
      WHERE file_hash IS NOT NULL
      GROUP BY file_hash
  );

CREATE UNIQUE INDEX IF NOT EXISTS idx_items_file_hash_unique
    ON items(file_hash)
    WHERE file_hash IS NOT NULL;

-- Validaciones de integridad para items (rutas confinadas, números no negativos, booleano favorito)
CREATE TRIGGER IF NOT EXISTS items_security_validate_insert
BEFORE INSERT ON items
BEGIN
    SELECT CASE
        WHEN (NEW.file_path NOT GLOB 'books/*' AND NEW.file_path NOT GLOB 'sample/*')
          OR NEW.file_path GLOB '*..*'
          OR NEW.file_path GLOB '*\*'
          OR NEW.file_path GLOB 'books/*/*'
          OR NEW.file_path GLOB 'sample/*/*'
          OR (NEW.file_path NOT GLOB '*.pdf' AND NEW.file_path NOT GLOB '*.epub')
        THEN RAISE(ABORT, 'Invalid items.file_path')
    END;
    SELECT CASE
        WHEN NEW.cover_path IS NOT NULL AND (
            NEW.cover_path NOT GLOB 'covers/*.webp'
            OR NEW.cover_path GLOB '*..*'
            OR NEW.cover_path GLOB '*\*'
            OR NEW.cover_path GLOB 'covers/*/*'
        )
        THEN RAISE(ABORT, 'Invalid items.cover_path')
    END;
    SELECT CASE
        WHEN NEW.file_size < 0 OR NEW.page_count < 0 OR NEW.current_page < 0 OR NEW.is_favorite NOT IN (0, 1)
        THEN RAISE(ABORT, 'Invalid numeric or boolean field on items')
    END;
END;

CREATE TRIGGER IF NOT EXISTS items_security_validate_update
BEFORE UPDATE ON items
BEGIN
    SELECT CASE
        WHEN (NEW.file_path NOT GLOB 'books/*' AND NEW.file_path NOT GLOB 'sample/*')
          OR NEW.file_path GLOB '*..*'
          OR NEW.file_path GLOB '*\*'
          OR NEW.file_path GLOB 'books/*/*'
          OR NEW.file_path GLOB 'sample/*/*'
          OR (NEW.file_path NOT GLOB '*.pdf' AND NEW.file_path NOT GLOB '*.epub')
        THEN RAISE(ABORT, 'Invalid items.file_path')
    END;
    SELECT CASE
        WHEN NEW.cover_path IS NOT NULL AND (
            NEW.cover_path NOT GLOB 'covers/*.webp'
            OR NEW.cover_path GLOB '*..*'
            OR NEW.cover_path GLOB '*\*'
            OR NEW.cover_path GLOB 'covers/*/*'
        )
        THEN RAISE(ABORT, 'Invalid items.cover_path')
    END;
    SELECT CASE
        WHEN NEW.file_size < 0 OR NEW.page_count < 0 OR NEW.current_page < 0 OR NEW.is_favorite NOT IN (0, 1)
        THEN RAISE(ABORT, 'Invalid numeric or boolean field on items')
    END;
END;

-- Impedir auto-referencias directas en shelves
CREATE TRIGGER IF NOT EXISTS shelves_security_no_self_parent_insert
BEFORE INSERT ON shelves
WHEN NEW.parent_id IS NOT NULL AND NEW.parent_id = NEW.id
BEGIN
    SELECT RAISE(ABORT, 'Shelf cannot be its own parent');
END;

CREATE TRIGGER IF NOT EXISTS shelves_security_no_self_parent_update
BEFORE UPDATE OF parent_id ON shelves
WHEN NEW.parent_id IS NOT NULL AND NEW.parent_id = NEW.id
BEGIN
    SELECT RAISE(ABORT, 'Shelf cannot be its own parent');
END;

-- Validar color y page_number en highlights
CREATE TRIGGER IF NOT EXISTS highlights_security_validate_insert
BEFORE INSERT ON highlights
BEGIN
    SELECT CASE
        WHEN NEW.color NOT IN ('amber', 'sage', 'clay', 'slate')
        THEN RAISE(ABORT, 'Invalid highlights.color')
    END;
    SELECT CASE
        WHEN NEW.page_number IS NOT NULL AND NEW.page_number <= 0
        THEN RAISE(ABORT, 'Invalid highlights.page_number')
    END;
END;

CREATE TRIGGER IF NOT EXISTS highlights_security_validate_update
BEFORE UPDATE ON highlights
BEGIN
    SELECT CASE
        WHEN NEW.color NOT IN ('amber', 'sage', 'clay', 'slate')
        THEN RAISE(ABORT, 'Invalid highlights.color')
    END;
    SELECT CASE
        WHEN NEW.page_number IS NOT NULL AND NEW.page_number <= 0
        THEN RAISE(ABORT, 'Invalid highlights.page_number')
    END;
END;

-- Validar formato de fecha y rangos máximos en study_sessions
CREATE TRIGGER IF NOT EXISTS study_sessions_security_validate_insert
BEFORE INSERT ON study_sessions
BEGIN
    SELECT CASE
        WHEN NEW.local_date NOT GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'
        THEN RAISE(ABORT, 'Invalid study_sessions.local_date')
    END;
    SELECT CASE
        WHEN NEW.planned_seconds > 86400 OR NEW.duration_seconds > 86400
        THEN RAISE(ABORT, 'study_sessions duration exceeds maximum')
    END;
END;

-- Validar tags_json en notes
CREATE TRIGGER IF NOT EXISTS notes_security_validate_insert
BEFORE INSERT ON notes
WHEN NOT json_valid(NEW.tags_json) OR json_type(NEW.tags_json) != 'array'
BEGIN
    SELECT RAISE(ABORT, 'Invalid notes.tags_json');
END;

CREATE TRIGGER IF NOT EXISTS notes_security_validate_update
BEFORE UPDATE OF tags_json ON notes
WHEN NOT json_valid(NEW.tags_json) OR json_type(NEW.tags_json) != 'array'
BEGIN
    SELECT RAISE(ABORT, 'Invalid notes.tags_json');
END;

-- Validar color hexadecimal en tags
CREATE TRIGGER IF NOT EXISTS tags_security_validate_insert
BEFORE INSERT ON tags
WHEN NEW.color IS NOT NULL AND NEW.color NOT GLOB '#[0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f]'
BEGIN
    SELECT RAISE(ABORT, 'Invalid tags.color');
END;

CREATE TRIGGER IF NOT EXISTS tags_security_validate_update
BEFORE UPDATE OF color ON tags
WHEN NEW.color IS NOT NULL AND NEW.color NOT GLOB '#[0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f]'
BEGIN
    SELECT RAISE(ABORT, 'Invalid tags.color');
END;
