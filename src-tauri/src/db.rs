use crate::storage::restrict_file_permissions;
use crate::validation::{
    clamp_limit, sanitize_fts_query, sanitize_note_folder, validate_cover_relative_path,
    validate_hex_color, validate_iso_date_key, validate_item_file_path, validate_item_id,
};
use rusqlite::hooks::{AuthAction, AuthContext, Authorization};
use rusqlite::{params, params_from_iter, types::Value, Connection, OptionalExtension, TransactionBehavior};
use serde::{Deserialize, Deserializer, Serialize};
use sha2::{Digest, Sha256};
use std::collections::{HashMap, HashSet};
use std::sync::Mutex;
use tauri::Manager;

const INITIAL_SCHEMA_SQL: &str = include_str!("../migrations/001_initial_schema.sql");
const ADD_FAVORITES_SQL: &str = include_str!("../migrations/002_add_favorites.sql");
const ADD_STUDY_SESSIONS_SQL: &str = include_str!("../migrations/003_add_study_sessions.sql");
const ADD_NOTES_SQL: &str = include_str!("../migrations/004_add_notes.sql");
const SECURITY_HARDENING_SQL: &str = include_str!("../migrations/005_security_hardening.sql");

const EXPECTED_TABLES: &[&str] = &[
    "items",
    "shelves",
    "item_shelves",
    "tags",
    "item_tags",
    "highlights",
    "study_sessions",
    "notes",
    "items_fts",
    "highlights_fts",
    "notes_fts",
];

const MAX_TITLE_LEN: usize = 512;
const MAX_AUTHOR_LEN: usize = 256;
const MAX_TEXT_FIELD_LEN: usize = 2 * 1024 * 1024; // 2 MiB for long markdown notes/quotes
const MAX_BULK_IDS: usize = 10_000;
const SQLITE_CHUNK_SIZE: usize = 400;

pub struct DbState {
    conn: Mutex<Connection>,
}

struct MigrationSpec {
    version: i64,
    description: &'static str,
    sql: &'static str,
}

fn migration_specs() -> Vec<MigrationSpec> {
    vec![
        MigrationSpec {
            version: 1,
            description: "initial_schema_and_fts5",
            sql: INITIAL_SCHEMA_SQL,
        },
        MigrationSpec {
            version: 2,
            description: "add_items_favorites",
            sql: ADD_FAVORITES_SQL,
        },
        MigrationSpec {
            version: 3,
            description: "add_study_sessions",
            sql: ADD_STUDY_SESSIONS_SQL,
        },
        MigrationSpec {
            version: 4,
            description: "add_markdown_notes_and_fts5",
            sql: ADD_NOTES_SQL,
        },
        MigrationSpec {
            version: 5,
            description: "security_integrity_constraints",
            sql: SECURITY_HARDENING_SQL,
        },
    ]
}

fn configure_and_migrate_connection(conn: &mut Connection) -> Result<(), String> {
    conn.execute_batch(
        "PRAGMA foreign_keys = ON;
         PRAGMA recursive_triggers = ON;
         PRAGMA journal_mode = WAL;
         PRAGMA synchronous = NORMAL;
         PRAGMA busy_timeout = 5000;
         PRAGMA trusted_schema = OFF;",
    )
    .map_err(|err| format!("Error configurando PRAGMAs de SQLite: {err}"))?;

    // Explicitly block ATTACH / DETACH database operations at the SQLite authorizer level.
    conn.authorizer(Some(|ctx: AuthContext<'_>| match ctx.action {
        AuthAction::Attach { .. } | AuthAction::Detach { .. } => Authorization::Deny,
        _ => Authorization::Allow,
    }))
    .map_err(|err| format!("Error configurando autorizador SQLite: {err}"))?;

    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS _sqlx_migrations (
            version BIGINT PRIMARY KEY,
            description TEXT NOT NULL,
            installed_on TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            success BOOLEAN NOT NULL,
            checksum BLOB NOT NULL,
            execution_time BIGINT NOT NULL
        );",
    )
    .map_err(|err| format!("Error inicializando tabla de migraciones: {err}"))?;

    for spec in migration_specs() {
        let already_applied: bool = conn
            .query_row(
                "SELECT EXISTS(SELECT 1 FROM _sqlx_migrations WHERE version = ?1 AND success = 1)",
                params![spec.version],
                |row| row.get::<_, i64>(0),
            )
            .map(|v| v != 0)
            .map_err(|err| format!("Error verificando migración {}: {err}", spec.version))?;

        if already_applied {
            continue;
        }

        let tx = conn
            .transaction_with_behavior(TransactionBehavior::Immediate)
            .map_err(|err| format!("Error iniciando transacción de migración {}: {err}", spec.version))?;
        tx.execute_batch(spec.sql)
            .map_err(|err| format!("Error aplicando migración {}: {err}", spec.version))?;

        let mut hasher = Sha256::new();
        hasher.update(spec.sql.as_bytes());
        let checksum = hasher.finalize().to_vec();

        tx.execute(
            "INSERT OR REPLACE INTO _sqlx_migrations (version, description, success, checksum, execution_time)
             VALUES (?1, ?2, 1, ?3, 0)",
            params![spec.version, spec.description, checksum],
        )
        .map_err(|err| format!("Error registrando migración {}: {err}", spec.version))?;
        tx.commit()
            .map_err(|err| format!("Error confirmando migración {}: {err}", spec.version))?;
    }

    Ok(())
}

pub fn init_db(app: &tauri::AppHandle) -> Result<DbState, Box<dyn std::error::Error>> {
    let config_dir = app.path().app_config_dir()?;
    std::fs::create_dir_all(&config_dir)?;
    let db_path = config_dir.join("library.db");
    let mut conn = Connection::open(&db_path)?;
    restrict_file_permissions(&db_path);
    configure_and_migrate_connection(&mut conn)
        .map_err(|err| std::io::Error::new(std::io::ErrorKind::Other, err))?;
    Ok(DbState {
        conn: Mutex::new(conn),
    })
}

fn deserialize_double_option<'de, T, D>(deserializer: D) -> Result<Option<Option<T>>, D::Error>
where
    T: Deserialize<'de>,
    D: Deserializer<'de>,
{
    Deserialize::deserialize(deserializer).map(Some)
}

fn utc_now_iso(conn: &Connection) -> Result<String, String> {
    conn.query_row("SELECT strftime('%Y-%m-%dT%H:%M:%fZ', 'now')", [], |r| r.get(0))
        .map_err(|err| format!("Error generando marca de tiempo UTC: {err}"))
}

fn validate_item_type(v: &str) -> Result<&str, String> {
    match v {
        "book" | "summary" | "article" | "paper" | "course" | "unsorted" => Ok(v),
        _ => Err("Tipo de recurso inválido.".to_string()),
    }
}

fn validate_item_status(v: &str) -> Result<&str, String> {
    match v {
        "inbox" | "to_read" | "reading" | "reference" | "finished" => Ok(v),
        _ => Err("Estado de recurso inválido.".to_string()),
    }
}

fn validate_file_format(v: &str) -> Result<&str, String> {
    match v {
        "pdf" | "epub" => Ok(v),
        _ => Err("Formato de archivo inválido.".to_string()),
    }
}

fn validate_shelf_category(v: &str) -> Result<&str, String> {
    match v {
        "project" | "area" | "author" | "custom" => Ok(v),
        _ => Err("Categoría de estantería inválida.".to_string()),
    }
}

fn validate_highlight_color(v: &str) -> Result<&str, String> {
    match v {
        "amber" | "sage" | "clay" | "slate" => Ok(v),
        _ => Err("Color de subrayado inválido.".to_string()),
    }
}

fn validate_pomodoro_phase(v: &str) -> Result<&str, String> {
    match v {
        "focus" | "short_break" | "long_break" => Ok(v),
        _ => Err("Fase Pomodoro inválida.".to_string()),
    }
}

fn clean_bounded_text(raw: &str, max_chars: usize) -> String {
    raw.chars()
        .filter(|ch| *ch != '\0')
        .take(max_chars)
        .collect()
}

fn normalize_note_tags(tags: &[String]) -> Vec<String> {
    let mut seen = HashSet::new();
    let mut out = Vec::new();
    for raw in tags.iter().take(64) {
        let trimmed = raw
            .trim()
            .trim_start_matches('#')
            .chars()
            .filter(|ch| !ch.is_control())
            .collect::<String>();
        let collapsed = trimmed.split_whitespace().collect::<Vec<_>>().join("-");
        let limited: String = collapsed.chars().take(64).collect();
        if limited.is_empty() {
            continue;
        }
        let key = limited.to_lowercase();
        if seen.insert(key) {
            out.push(limited);
        }
    }
    out
}

fn parse_tags_json(raw: &str) -> Vec<String> {
    serde_json::from_str::<Vec<String>>(raw)
        .map(|tags| normalize_note_tags(&tags))
        .unwrap_or_default()
}

// ============================================================================
// Domain DTOs (field names match src/types/domain.ts 1:1)
// ============================================================================

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DatabaseHealthReport {
    pub connected: bool,
    pub journal_mode: String,
    pub foreign_keys_enabled: bool,
    pub recursive_triggers_enabled: bool,
    pub tables: Vec<String>,
    pub missing_tables: Vec<String>,
    pub applied_migrations: Vec<i64>,
    pub items_count: i64,
    pub fts_indexed_count: i64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FtsSmokeTestResult {
    pub ok: bool,
    pub matched_title: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LibraryItem {
    pub id: String,
    pub title: String,
    pub author: String,
    #[serde(rename = "type")]
    pub item_type: String,
    pub status: String,
    pub file_path: String,
    pub cover_path: Option<String>,
    pub file_format: String,
    pub file_hash: Option<String>,
    pub file_size: i64,
    pub page_count: i64,
    pub current_page: i64,
    pub is_favorite: i64,
    pub notes: String,
    pub last_opened_at: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct LibraryItemWithRelations {
    #[serde(flatten)]
    pub item: LibraryItem,
    pub shelf_ids: Vec<String>,
    pub tag_ids: Vec<String>,
}

#[derive(Debug, Clone, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct ItemFilter {
    pub status: Option<String>,
    #[serde(rename = "type")]
    pub item_type: Option<String>,
    pub shelf_id: Option<String>,
    pub shelf_ids: Option<Vec<String>>,
    pub tag_id: Option<String>,
    pub favorite_only: Option<bool>,
    pub recent_only: Option<bool>,
    pub sort_by: Option<String>,
    pub limit: Option<i64>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct CreateItemInput {
    pub id: Option<String>,
    pub title: String,
    pub author: Option<String>,
    #[serde(rename = "type")]
    pub item_type: Option<String>,
    pub status: Option<String>,
    pub file_path: String,
    pub cover_path: Option<String>,
    pub file_format: String,
    pub file_hash: Option<String>,
    pub file_size: Option<i64>,
    pub page_count: Option<i64>,
    pub current_page: Option<i64>,
    pub is_favorite: Option<i64>,
    pub notes: Option<String>,
}

#[derive(Debug, Clone, Deserialize, Default)]
pub struct UpdateItemInput {
    pub title: Option<String>,
    pub author: Option<String>,
    #[serde(rename = "type")]
    pub item_type: Option<String>,
    pub status: Option<String>,
    #[serde(default, deserialize_with = "deserialize_double_option")]
    pub cover_path: Option<Option<String>>,
    pub page_count: Option<i64>,
    pub current_page: Option<i64>,
    pub is_favorite: Option<i64>,
    pub notes: Option<String>,
    #[serde(default, deserialize_with = "deserialize_double_option")]
    pub last_opened_at: Option<Option<String>>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveReadingProgressInput {
    pub item_id: String,
    pub current_page: f64,
    pub page_count: Option<f64>,
    pub mark_finished: Option<bool>,
}

#[derive(Debug, Clone, Serialize)]
pub struct ItemFilePathsRow {
    pub id: String,
    pub file_path: String,
    pub cover_path: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct FtsSearchResult {
    pub item: LibraryItem,
    pub rank: f64,
}

#[derive(Debug, Clone, Serialize)]
pub struct NavigationCounts {
    pub inbox: i64,
    pub all: i64,
    pub favorites: i64,
    pub recent: i64,
    pub highlights: i64,
    pub notes: i64,
}

#[derive(Debug, Clone, Serialize)]
pub struct Shelf {
    pub id: String,
    pub name: String,
    pub parent_id: Option<String>,
    pub category: String,
    pub sort_order: i64,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct ShelfWithCount {
    #[serde(flatten)]
    pub shelf: Shelf,
    pub direct_item_count: i64,
    pub item_count: i64,
}

#[derive(Debug, Clone, Deserialize)]
pub struct CreateShelfInput {
    pub name: String,
    pub parent_id: Option<String>,
    pub category: Option<String>,
    pub sort_order: Option<i64>,
}

#[derive(Debug, Clone, Deserialize, Default)]
pub struct UpdateShelfInput {
    pub name: Option<String>,
    #[serde(default, deserialize_with = "deserialize_double_option")]
    pub parent_id: Option<Option<String>>,
    pub category: Option<String>,
    pub sort_order: Option<i64>,
}

#[derive(Debug, Clone, Serialize)]
pub struct Tag {
    pub id: String,
    pub name: String,
    pub color: Option<String>,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct TagWithCount {
    #[serde(flatten)]
    pub tag: Tag,
    pub item_count: i64,
}

#[derive(Debug, Clone, Deserialize)]
pub struct CreateTagInput {
    pub name: String,
    pub color: Option<String>,
}

#[derive(Debug, Clone, Deserialize, Default)]
pub struct UpdateTagInput {
    pub name: Option<String>,
    #[serde(default, deserialize_with = "deserialize_double_option")]
    pub color: Option<Option<String>>,
}

#[derive(Debug, Clone, Serialize)]
pub struct Highlight {
    pub id: String,
    pub item_id: String,
    pub quote_text: String,
    pub note_markdown: String,
    pub page_number: Option<i64>,
    pub location_cfi: Option<String>,
    pub color: String,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct HighlightWithItem {
    #[serde(flatten)]
    pub highlight: Highlight,
    pub item_title: String,
    pub item_author: String,
    pub item_type: String,
    pub item_file_format: String,
    pub item_file_path: String,
}

#[derive(Debug, Clone, Deserialize)]
pub struct CreateHighlightInput {
    pub item_id: String,
    pub quote_text: String,
    pub note_markdown: Option<String>,
    pub page_number: Option<i64>,
    pub location_cfi: Option<String>,
    pub color: Option<String>,
}

#[derive(Debug, Clone, Deserialize, Default)]
pub struct UpdateHighlightInput {
    pub quote_text: Option<String>,
    pub note_markdown: Option<String>,
    #[serde(default, deserialize_with = "deserialize_double_option")]
    pub page_number: Option<Option<i64>>,
    #[serde(default, deserialize_with = "deserialize_double_option")]
    pub location_cfi: Option<Option<String>>,
    pub color: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct NoteWithItem {
    pub id: String,
    pub title: String,
    pub content: String,
    pub folder: String,
    pub tags_json: String,
    pub item_id: Option<String>,
    pub is_pinned: i64,
    pub created_at: String,
    pub updated_at: String,
    pub tags: Vec<String>,
    pub item_title: Option<String>,
    pub item_author: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct CreateNoteInput {
    pub title: String,
    pub content: Option<String>,
    pub folder: Option<String>,
    pub tags: Option<Vec<String>>,
    pub item_id: Option<String>,
    pub is_pinned: Option<bool>,
}

#[derive(Debug, Clone, Deserialize, Default)]
pub struct UpdateNoteInput {
    pub title: Option<String>,
    pub content: Option<String>,
    pub folder: Option<String>,
    pub tags: Option<Vec<String>>,
    #[serde(default, deserialize_with = "deserialize_double_option")]
    pub item_id: Option<Option<String>>,
    pub is_pinned: Option<bool>,
}

#[derive(Debug, Clone, Serialize)]
pub struct StudySession {
    pub id: String,
    pub item_id: Option<String>,
    pub phase: String,
    pub planned_seconds: i64,
    pub duration_seconds: i64,
    pub completed: i64,
    pub started_at: String,
    pub ended_at: String,
    pub local_date: String,
    pub local_hour: i64,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct StudySessionWithItem {
    #[serde(flatten)]
    pub session: StudySession,
    pub item_title: Option<String>,
    pub item_author: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct CreateStudySessionInput {
    pub item_id: Option<String>,
    pub phase: String,
    pub planned_seconds: f64,
    pub duration_seconds: f64,
    pub completed: bool,
    pub started_at: String,
    pub ended_at: String,
    pub local_date: String,
    pub local_hour: f64,
}

#[derive(Debug, Clone, Serialize)]
pub struct PomodoroBookOption {
    pub id: String,
    pub title: String,
    pub author: String,
    pub status: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ShelfProgressRow {
    pub id: String,
    pub name: String,
    pub total_count: i64,
    pub finished_count: i64,
}

#[derive(Debug, Clone, Serialize)]
pub struct ReadingStatsRawPayload {
    pub items: Vec<LibraryItem>,
    pub top_shelves: Vec<ShelfProgressRow>,
    pub highlight_created_at: Vec<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct ActivityItemRow {
    pub status: String,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct ActivityStatsRawPayload {
    pub items: Vec<ActivityItemRow>,
    pub highlight_created_at: Vec<String>,
    pub note_created_at: Vec<String>,
}

// ============================================================================
// Row Mappers
// ============================================================================

fn map_library_item(row: &rusqlite::Row<'_>) -> rusqlite::Result<LibraryItem> {
    Ok(LibraryItem {
        id: row.get("id")?,
        title: row.get("title")?,
        author: row.get("author")?,
        item_type: row.get("type")?,
        status: row.get("status")?,
        file_path: row.get("file_path")?,
        cover_path: row.get("cover_path")?,
        file_format: row.get("file_format")?,
        file_hash: row.get("file_hash")?,
        file_size: row.get("file_size")?,
        page_count: row.get("page_count")?,
        current_page: row.get("current_page")?,
        is_favorite: row.get("is_favorite")?,
        notes: row.get("notes")?,
        last_opened_at: row.get("last_opened_at")?,
        created_at: row.get("created_at")?,
        updated_at: row.get("updated_at")?,
    })
}

fn map_shelf(row: &rusqlite::Row<'_>) -> rusqlite::Result<Shelf> {
    Ok(Shelf {
        id: row.get("id")?,
        name: row.get("name")?,
        parent_id: row.get("parent_id")?,
        category: row.get("category")?,
        sort_order: row.get("sort_order")?,
        created_at: row.get("created_at")?,
        updated_at: row.get("updated_at")?,
    })
}

fn map_tag(row: &rusqlite::Row<'_>) -> rusqlite::Result<Tag> {
    Ok(Tag {
        id: row.get("id")?,
        name: row.get("name")?,
        color: row.get("color")?,
        created_at: row.get("created_at")?,
    })
}

fn map_highlight(row: &rusqlite::Row<'_>) -> rusqlite::Result<Highlight> {
    Ok(Highlight {
        id: row.get("id")?,
        item_id: row.get("item_id")?,
        quote_text: row.get("quote_text")?,
        note_markdown: row.get("note_markdown")?,
        page_number: row.get("page_number")?,
        location_cfi: row.get("location_cfi")?,
        color: row.get("color")?,
        created_at: row.get("created_at")?,
        updated_at: row.get("updated_at")?,
    })
}

fn map_highlight_with_item(row: &rusqlite::Row<'_>) -> rusqlite::Result<HighlightWithItem> {
    Ok(HighlightWithItem {
        highlight: map_highlight(row)?,
        item_title: row.get("item_title")?,
        item_author: row.get("item_author")?,
        item_type: row.get("item_type")?,
        item_file_format: row.get("item_file_format")?,
        item_file_path: row.get("item_file_path")?,
    })
}

fn map_note_with_item(row: &rusqlite::Row<'_>) -> rusqlite::Result<NoteWithItem> {
    let tags_json: String = row.get("tags_json")?;
    let tags = parse_tags_json(&tags_json);
    Ok(NoteWithItem {
        id: row.get("id")?,
        title: row.get("title")?,
        content: row.get("content")?,
        folder: row.get("folder")?,
        tags_json,
        item_id: row.get("item_id")?,
        is_pinned: row.get("is_pinned")?,
        created_at: row.get("created_at")?,
        updated_at: row.get("updated_at")?,
        tags,
        item_title: row.get("item_title")?,
        item_author: row.get("item_author")?,
    })
}

fn map_study_session(row: &rusqlite::Row<'_>) -> rusqlite::Result<StudySession> {
    Ok(StudySession {
        id: row.get("id")?,
        item_id: row.get("item_id")?,
        phase: row.get("phase")?,
        planned_seconds: row.get("planned_seconds")?,
        duration_seconds: row.get("duration_seconds")?,
        completed: row.get("completed")?,
        started_at: row.get("started_at")?,
        ended_at: row.get("ended_at")?,
        local_date: row.get("local_date")?,
        local_hour: row.get("local_hour")?,
        created_at: row.get("created_at")?,
    })
}

// ============================================================================
// Filter Helpers
// ============================================================================

fn resolve_order_clause(sort_by: Option<&str>, recent_only: bool) -> &'static str {
    if recent_only {
        return "ORDER BY i.last_opened_at DESC";
    }
    match sort_by {
        Some("title_asc") => "ORDER BY i.title COLLATE NOCASE ASC",
        Some("author_asc") => {
            "ORDER BY CASE WHEN i.author = '' THEN 1 ELSE 0 END, i.author COLLATE NOCASE ASC, i.title COLLATE NOCASE ASC"
        }
        _ => "ORDER BY i.created_at DESC",
    }
}

struct FilterSql {
    empty_result: bool,
    joins_sql: String,
    where_sql: String,
    params: Vec<Value>,
}

fn build_filter_sql(filter: &ItemFilter) -> Result<FilterSql, String> {
    let mut joins = Vec::new();
    let mut clauses = Vec::new();
    let mut values: Vec<Value> = Vec::new();

    if let Some(ref shelf_ids) = filter.shelf_ids {
        if shelf_ids.is_empty() {
            return Ok(FilterSql {
                empty_result: true,
                joins_sql: String::new(),
                where_sql: String::new(),
                params: Vec::new(),
            });
        }
        if shelf_ids.len() > MAX_BULK_IDS {
            return Err("Demasiadas estanterías en el filtro.".to_string());
        }
        joins.push("INNER JOIN item_shelves ishf ON ishf.item_id = i.id");
        let unique: Vec<&String> = {
            let mut seen = HashSet::new();
            shelf_ids.iter().filter(|id| seen.insert(*id)).take(900).collect()
        };
        let placeholders: Vec<String> = unique
            .iter()
            .map(|sid| {
                values.push(Value::Text((*sid).clone()));
                format!("?{}", values.len())
            })
            .collect();
        clauses.push(format!("ishf.shelf_id IN ({})", placeholders.join(", ")));
    } else if let Some(ref shelf_id) = filter.shelf_id {
        if !shelf_id.is_empty() {
            joins.push("INNER JOIN item_shelves ishf ON ishf.item_id = i.id");
            values.push(Value::Text(shelf_id.clone()));
            clauses.push(format!("ishf.shelf_id = ?{}", values.len()));
        }
    }

    if let Some(ref tag_id) = filter.tag_id {
        if !tag_id.is_empty() {
            joins.push("INNER JOIN item_tags itag ON itag.item_id = i.id");
            values.push(Value::Text(tag_id.clone()));
            clauses.push(format!("itag.tag_id = ?{}", values.len()));
        }
    }

    if let Some(ref status) = filter.status {
        validate_item_status(status)?;
        values.push(Value::Text(status.clone()));
        clauses.push(format!("i.status = ?{}", values.len()));
    }

    if let Some(ref item_type) = filter.item_type {
        validate_item_type(item_type)?;
        values.push(Value::Text(item_type.clone()));
        clauses.push(format!("i.type = ?{}", values.len()));
    }

    if filter.favorite_only.unwrap_or(false) {
        clauses.push("i.is_favorite = 1".to_string());
    }

    if filter.recent_only.unwrap_or(false) {
        clauses.push("i.last_opened_at IS NOT NULL".to_string());
    }

    Ok(FilterSql {
        empty_result: false,
        joins_sql: joins.join("\n"),
        where_sql: if clauses.is_empty() {
            String::new()
        } else {
            format!("WHERE {}", clauses.join(" AND "))
        },
        params: values,
    })
}

fn query_item_by_id_internal(conn: &Connection, id: &str) -> Result<Option<LibraryItem>, String> {
    conn.query_row("SELECT * FROM items WHERE id = ?1 LIMIT 1", params![id], map_library_item)
        .optional()
        .map_err(|err| format!("Error consultando libro: {err}"))
}

fn query_list_items_internal(conn: &Connection, filter: &ItemFilter) -> Result<Vec<LibraryItem>, String> {
    let mut parts = build_filter_sql(filter)?;
    if parts.empty_result {
        return Ok(Vec::new());
    }

    let order_sql = resolve_order_clause(filter.sort_by.as_deref(), filter.recent_only.unwrap_or(false));
    let mut limit_sql = String::new();
    if let Some(limit) = filter.limit {
        if limit > 0 {
            let safe_limit = limit.min(10_000);
            parts.params.push(Value::Integer(safe_limit));
            limit_sql = format!("LIMIT ?{}", parts.params.len());
        }
    }

    let sql = format!(
        "SELECT DISTINCT i.* FROM items i {} {} {} {}",
        parts.joins_sql, parts.where_sql, order_sql, limit_sql
    );
    let mut stmt = conn
        .prepare(&sql)
        .map_err(|err| format!("Error preparando consulta de libros: {err}"))?;
    let rows = stmt
        .query_map(params_from_iter(parts.params.iter()), map_library_item)
        .map_err(|err| format!("Error ejecutando consulta de libros: {err}"))?;

    let mut out = Vec::new();
    for row in rows {
        out.push(row.map_err(|err| format!("Error leyendo libro: {err}"))?);
    }
    Ok(out)
}

// ============================================================================
// Health & Smoke Test Commands
// ============================================================================

#[tauri::command]
pub fn db_check_health(state: tauri::State<'_, DbState>) -> Result<DatabaseHealthReport, String> {
    let conn = state.conn.lock().map_err(|_| "Bloqueo de base de datos corrupto.".to_string())?;

    let mut table_stmt = conn
        .prepare("SELECT name FROM sqlite_master WHERE type IN ('table', 'view') AND name NOT LIKE 'sqlite_%' ORDER BY name")
        .map_err(|err| format!("Error consultando tablas: {err}"))?;
    let tables: Vec<String> = table_stmt
        .query_map([], |r| r.get(0))
        .map_err(|err| format!("Error listando tablas: {err}"))?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|err| format!("Error leyendo tablas: {err}"))?;

    let fk: i64 = conn
        .query_row("PRAGMA foreign_keys", [], |r| r.get(0))
        .unwrap_or(0);
    let rt: i64 = conn
        .query_row("PRAGMA recursive_triggers", [], |r| r.get(0))
        .unwrap_or(0);
    let journal_mode: String = conn
        .query_row("PRAGMA journal_mode", [], |r| r.get(0))
        .unwrap_or_else(|_| "unknown".to_string());

    let mut mig_stmt = conn
        .prepare("SELECT version FROM _sqlx_migrations WHERE success = 1 ORDER BY version")
        .map_err(|err| format!("Error consultando migraciones: {err}"))?;
    let applied_migrations: Vec<i64> = mig_stmt
        .query_map([], |r| r.get(0))
        .map_err(|err| format!("Error listando migraciones: {err}"))?
        .collect::<Result<Vec<_>, _>>()
        .unwrap_or_default();

    let items_count: i64 = conn
        .query_row("SELECT COUNT(*) FROM items", [], |r| r.get(0))
        .unwrap_or(0);
    let fts_indexed_count: i64 = conn
        .query_row("SELECT COUNT(*) FROM items_fts", [], |r| r.get(0))
        .unwrap_or(0);

    let table_set: HashSet<&str> = tables.iter().map(|s| s.as_str()).collect();
    let missing_tables: Vec<String> = EXPECTED_TABLES
        .iter()
        .filter(|name| !table_set.contains(**name))
        .map(|s| (*s).to_string())
        .collect();

    Ok(DatabaseHealthReport {
        connected: true,
        journal_mode,
        foreign_keys_enabled: fk == 1,
        recursive_triggers_enabled: rt == 1,
        tables,
        missing_tables,
        applied_migrations,
        items_count,
        fts_indexed_count,
    })
}

/// Runs FTS5 smoke test inside an isolated in-memory SQLite database (never mutates production `library.db`).
#[tauri::command]
pub fn db_run_fts_smoke_test() -> Result<FtsSmokeTestResult, String> {
    let mut mem = Connection::open_in_memory()
        .map_err(|err| format!("No se pudo inicializar SQLite en memoria: {err}"))?;
    configure_and_migrate_connection(&mut mem)?;

    let temp_id = format!("smoke-{}", uuid::Uuid::new_v4());
    let now = utc_now_iso(&mem)?;
    mem.execute(
        "INSERT INTO items (id, title, author, type, status, file_path, file_format, notes, created_at, updated_at)
         VALUES (?1, ?2, ?3, 'paper', 'inbox', ?4, 'pdf', ?5, ?6, ?6)",
        params![
            temp_id,
            "Filosofía Local-First",
            "Prueba de Sistema",
            format!("books/{temp_id}.pdf"),
            "Verificación de índice FTS5 sin diacríticos.",
            now,
        ],
    )
    .map_err(|err| format!("Error insertando prueba FTS5: {err}"))?;

    let match_expr = sanitize_fts_query("filosofia");
    let matched_title: Option<String> = mem
        .query_row(
            "SELECT i.title FROM items_fts INNER JOIN items i ON i.id = items_fts.item_id
             WHERE items_fts MATCH ?1 AND i.id = ?2 LIMIT 1",
            params![match_expr, temp_id],
            |r| r.get(0),
        )
        .optional()
        .map_err(|err| format!("Error consultando FTS5: {err}"))?;

    Ok(FtsSmokeTestResult {
        ok: matched_title.is_some(),
        matched_title,
    })
}

// ============================================================================
// Book / Item Commands
// ============================================================================

#[tauri::command]
pub fn db_list_items(
    state: tauri::State<'_, DbState>,
    filter: Option<ItemFilter>,
) -> Result<Vec<LibraryItem>, String> {
    let conn = state.conn.lock().map_err(|_| "Error de concurrencia en base de datos.".to_string())?;
    query_list_items_internal(&conn, &filter.unwrap_or_default())
}

#[tauri::command]
pub fn db_list_items_with_relations(
    state: tauri::State<'_, DbState>,
    filter: Option<ItemFilter>,
) -> Result<Vec<LibraryItemWithRelations>, String> {
    let conn = state.conn.lock().map_err(|_| "Error de concurrencia en base de datos.".to_string())?;
    let items = query_list_items_internal(&conn, &filter.unwrap_or_default())?;
    if items.is_empty() {
        return Ok(Vec::new());
    }

    let mut shelves_by_item: HashMap<String, Vec<String>> = HashMap::new();
    let mut tags_by_item: HashMap<String, Vec<String>> = HashMap::new();

    for chunk in items.chunks(SQLITE_CHUNK_SIZE) {
        let placeholders = (1..=chunk.len())
            .map(|idx| format!("?{idx}"))
            .collect::<Vec<_>>()
            .join(", ");
        let ids: Vec<Value> = chunk.iter().map(|i| Value::Text(i.id.clone())).collect();

        let sql_shelves = format!(
            "SELECT item_id, shelf_id FROM item_shelves WHERE item_id IN ({placeholders})"
        );
        let mut stmt_s = conn.prepare(&sql_shelves).map_err(|err| err.to_string())?;
        let shelf_rows = stmt_s
            .query_map(params_from_iter(ids.iter()), |r| {
                Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?))
            })
            .map_err(|err| err.to_string())?;
        for pair in shelf_rows {
            let (item_id, shelf_id) = pair.map_err(|err| err.to_string())?;
            shelves_by_item.entry(item_id).or_default().push(shelf_id);
        }

        let sql_tags = format!(
            "SELECT item_id, tag_id FROM item_tags WHERE item_id IN ({placeholders})"
        );
        let mut stmt_t = conn.prepare(&sql_tags).map_err(|err| err.to_string())?;
        let tag_rows = stmt_t
            .query_map(params_from_iter(ids.iter()), |r| {
                Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?))
            })
            .map_err(|err| err.to_string())?;
        for pair in tag_rows {
            let (item_id, tag_id) = pair.map_err(|err| err.to_string())?;
            tags_by_item.entry(item_id).or_default().push(tag_id);
        }
    }

    Ok(items
        .into_iter()
        .map(|item| {
            let shelf_ids = shelves_by_item.remove(&item.id).unwrap_or_default();
            let tag_ids = tags_by_item.remove(&item.id).unwrap_or_default();
            LibraryItemWithRelations {
                item,
                shelf_ids,
                tag_ids,
            }
        })
        .collect())
}

#[tauri::command]
pub fn db_get_item_by_id(
    state: tauri::State<'_, DbState>,
    id: String,
) -> Result<Option<LibraryItem>, String> {
    let conn = state.conn.lock().map_err(|_| "Error de concurrencia en base de datos.".to_string())?;
    query_item_by_id_internal(&conn, &id)
}

#[tauri::command]
pub fn db_get_item_with_relations_by_id(
    state: tauri::State<'_, DbState>,
    id: String,
) -> Result<Option<LibraryItemWithRelations>, String> {
    let conn = state.conn.lock().map_err(|_| "Error de concurrencia en base de datos.".to_string())?;
    let Some(item) = query_item_by_id_internal(&conn, &id)? else {
        return Ok(None);
    };

    let mut stmt_s = conn
        .prepare("SELECT shelf_id FROM item_shelves WHERE item_id = ?1")
        .map_err(|err| err.to_string())?;
    let shelf_ids = stmt_s
        .query_map(params![id], |r| r.get::<_, String>(0))
        .map_err(|err| err.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|err| err.to_string())?;

    let mut stmt_t = conn
        .prepare("SELECT tag_id FROM item_tags WHERE item_id = ?1")
        .map_err(|err| err.to_string())?;
    let tag_ids = stmt_t
        .query_map(params![id], |r| r.get::<_, String>(0))
        .map_err(|err| err.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|err| err.to_string())?;

    Ok(Some(LibraryItemWithRelations {
        item,
        shelf_ids,
        tag_ids,
    }))
}

#[tauri::command]
pub fn db_create_item(
    state: tauri::State<'_, DbState>,
    input: CreateItemInput,
) -> Result<LibraryItem, String> {
    let id = match input.id {
        Some(raw) => {
            validate_item_id(&raw)?;
            raw
        }
        None => uuid::Uuid::new_v4().to_string(),
    };
    let title = clean_bounded_text(input.title.trim(), MAX_TITLE_LEN);
    if title.is_empty() {
        return Err("El título del recurso no puede estar vacío.".to_string());
    }
    let author = clean_bounded_text(input.author.as_deref().unwrap_or("").trim(), MAX_AUTHOR_LEN);
    let item_type = validate_item_type(input.item_type.as_deref().unwrap_or("unsorted"))?;
    let status = validate_item_status(input.status.as_deref().unwrap_or("inbox"))?;
    let file_format = validate_file_format(&input.file_format)?;
    validate_item_file_path(&input.file_path)?;
    if let Some(ref cover) = input.cover_path {
        validate_cover_relative_path(cover)?;
    }
    let file_size = input.file_size.unwrap_or(0).max(0);
    let page_count = input.page_count.unwrap_or(0).max(0);
    let current_page = input.current_page.unwrap_or(0).max(0);
    let is_favorite = if input.is_favorite.unwrap_or(0) == 1 { 1 } else { 0 };
    let notes = clean_bounded_text(input.notes.as_deref().unwrap_or(""), MAX_TEXT_FIELD_LEN);

    let conn = state.conn.lock().map_err(|_| "Error de concurrencia en base de datos.".to_string())?;
    let now = utc_now_iso(&conn)?;

    conn.execute(
        "INSERT INTO items (
            id, title, author, type, status, file_path, cover_path,
            file_format, file_hash, file_size, page_count, current_page,
            is_favorite, notes, created_at, updated_at
        ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16)",
        params![
            id,
            title,
            author,
            item_type,
            status,
            input.file_path,
            input.cover_path,
            file_format,
            input.file_hash,
            file_size,
            page_count,
            current_page,
            is_favorite,
            notes,
            now,
            now,
        ],
    )
    .map_err(|err| format!("No se pudo guardar el recurso: {err}"))?;

    query_item_by_id_internal(&conn, &id)?
        .ok_or_else(|| "No se pudo recuperar el recurso recién creado.".to_string())
}

#[tauri::command]
pub fn db_update_item(
    state: tauri::State<'_, DbState>,
    id: String,
    patch: UpdateItemInput,
) -> Result<Option<LibraryItem>, String> {
    let conn = state.conn.lock().map_err(|_| "Error de concurrencia en base de datos.".to_string())?;
    let mut assignments: Vec<String> = Vec::new();
    let mut values: Vec<Value> = Vec::new();

    if let Some(title) = patch.title {
        let cleaned = clean_bounded_text(title.trim(), MAX_TITLE_LEN);
        if cleaned.is_empty() {
            return Err("El título no puede estar vacío.".to_string());
        }
        values.push(Value::Text(cleaned));
        assignments.push(format!("title = ?{}", values.len()));
    }
    if let Some(author) = patch.author {
        values.push(Value::Text(clean_bounded_text(author.trim(), MAX_AUTHOR_LEN)));
        assignments.push(format!("author = ?{}", values.len()));
    }
    if let Some(item_type) = patch.item_type {
        validate_item_type(&item_type)?;
        values.push(Value::Text(item_type));
        assignments.push(format!("type = ?{}", values.len()));
    }
    if let Some(status) = patch.status {
        validate_item_status(&status)?;
        values.push(Value::Text(status));
        assignments.push(format!("status = ?{}", values.len()));
    }
    if let Some(cover_opt) = patch.cover_path {
        if let Some(ref cover) = cover_opt {
            validate_cover_relative_path(cover)?;
            values.push(Value::Text(cover.clone()));
        } else {
            values.push(Value::Null);
        }
        assignments.push(format!("cover_path = ?{}", values.len()));
    }
    if let Some(page_count) = patch.page_count {
        if page_count < 0 {
            return Err("El conteo de páginas no puede ser negativo.".to_string());
        }
        values.push(Value::Integer(page_count));
        assignments.push(format!("page_count = ?{}", values.len()));
    }
    if let Some(current_page) = patch.current_page {
        if current_page < 0 {
            return Err("La página actual no puede ser negativa.".to_string());
        }
        values.push(Value::Integer(current_page));
        assignments.push(format!("current_page = ?{}", values.len()));
    }
    if let Some(is_favorite) = patch.is_favorite {
        if is_favorite != 0 && is_favorite != 1 {
            return Err("Valor de favorito inválido.".to_string());
        }
        values.push(Value::Integer(is_favorite));
        assignments.push(format!("is_favorite = ?{}", values.len()));
    }
    if let Some(notes) = patch.notes {
        values.push(Value::Text(clean_bounded_text(&notes, MAX_TEXT_FIELD_LEN)));
        assignments.push(format!("notes = ?{}", values.len()));
    }
    if let Some(last_opened_opt) = patch.last_opened_at {
        match last_opened_opt {
            Some(ts) => values.push(Value::Text(clean_bounded_text(&ts, 64))),
            None => values.push(Value::Null),
        }
        assignments.push(format!("last_opened_at = ?{}", values.len()));
    }

    if assignments.is_empty() {
        return query_item_by_id_internal(&conn, &id);
    }

    let now = utc_now_iso(&conn)?;
    values.push(Value::Text(now));
    assignments.push(format!("updated_at = ?{}", values.len()));
    values.push(Value::Text(id.clone()));

    let sql = format!(
        "UPDATE items SET {} WHERE id = ?{}",
        assignments.join(", "),
        values.len()
    );
    conn.execute(&sql, params_from_iter(values.iter()))
        .map_err(|err| format!("Error actualizando recurso: {err}"))?;

    query_item_by_id_internal(&conn, &id)
}

#[tauri::command]
pub fn db_delete_item(state: tauri::State<'_, DbState>, id: String) -> Result<(), String> {
    let conn = state.conn.lock().map_err(|_| "Error de concurrencia en base de datos.".to_string())?;
    conn.execute("DELETE FROM items WHERE id = ?1", params![id])
        .map_err(|err| format!("Error eliminando recurso: {err}"))?;
    Ok(())
}

#[tauri::command]
pub fn db_bulk_update_items_status(
    state: tauri::State<'_, DbState>,
    ids: Vec<String>,
    status: String,
) -> Result<(), String> {
    validate_item_status(&status)?;
    if ids.len() > MAX_BULK_IDS {
        return Err("Demasiados elementos en operación en lote.".to_string());
    }
    let unique: Vec<String> = {
        let mut seen = HashSet::new();
        ids.into_iter().filter(|id| seen.insert(id.clone())).collect()
    };
    if unique.is_empty() {
        return Ok(());
    }

    let mut conn = state.conn.lock().map_err(|_| "Error de concurrencia en base de datos.".to_string())?;
    let now = utc_now_iso(&conn)?;
    let tx = conn
        .transaction_with_behavior(TransactionBehavior::Immediate)
        .map_err(|err| format!("Error iniciando transacción: {err}"))?;

    for chunk in unique.chunks(SQLITE_CHUNK_SIZE) {
        let placeholders = (3..=chunk.len() + 2)
            .map(|idx| format!("?{idx}"))
            .collect::<Vec<_>>()
            .join(", ");
        let mut values = Vec::with_capacity(chunk.len() + 2);
        values.push(Value::Text(status.clone()));
        values.push(Value::Text(now.clone()));
        for id in chunk {
            values.push(Value::Text(id.clone()));
        }
        let sql = format!("UPDATE items SET status = ?1, updated_at = ?2 WHERE id IN ({placeholders})");
        tx.execute(&sql, params_from_iter(values.iter()))
            .map_err(|err| format!("Error actualizando estados en lote: {err}"))?;
    }

    tx.commit()
        .map_err(|err| format!("Error confirmando transacción: {err}"))
}

#[tauri::command]
pub fn db_get_items_file_paths_by_ids(
    state: tauri::State<'_, DbState>,
    ids: Vec<String>,
) -> Result<Vec<ItemFilePathsRow>, String> {
    if ids.len() > MAX_BULK_IDS {
        return Err("Demasiados elementos solicitados.".to_string());
    }
    let unique: Vec<String> = {
        let mut seen = HashSet::new();
        ids.into_iter().filter(|id| seen.insert(id.clone())).collect()
    };
    if unique.is_empty() {
        return Ok(Vec::new());
    }

    let conn = state.conn.lock().map_err(|_| "Error de concurrencia en base de datos.".to_string())?;
    let mut rows_out = Vec::new();
    for chunk in unique.chunks(SQLITE_CHUNK_SIZE) {
        let placeholders = (1..=chunk.len())
            .map(|idx| format!("?{idx}"))
            .collect::<Vec<_>>()
            .join(", ");
        let values: Vec<Value> = chunk.iter().map(|id| Value::Text(id.clone())).collect();
        let sql = format!("SELECT id, file_path, cover_path FROM items WHERE id IN ({placeholders})");
        let mut stmt = conn.prepare(&sql).map_err(|err| err.to_string())?;
        let mapped = stmt
            .query_map(params_from_iter(values.iter()), |r| {
                Ok(ItemFilePathsRow {
                    id: r.get(0)?,
                    file_path: r.get(1)?,
                    cover_path: r.get(2)?,
                })
            })
            .map_err(|err| err.to_string())?;
        for row in mapped {
            rows_out.push(row.map_err(|err| err.to_string())?);
        }
    }
    Ok(rows_out)
}

/// Atomically deletes items in a single transaction and returns their deleted file/cover paths.
#[tauri::command]
pub fn db_bulk_delete_items(
    state: tauri::State<'_, DbState>,
    ids: Vec<String>,
) -> Result<Vec<ItemFilePathsRow>, String> {
    if ids.len() > MAX_BULK_IDS {
        return Err("Demasiados elementos para eliminar en lote.".to_string());
    }
    let unique: Vec<String> = {
        let mut seen = HashSet::new();
        ids.into_iter().filter(|id| seen.insert(id.clone())).collect()
    };
    if unique.is_empty() {
        return Ok(Vec::new());
    }

    let mut conn = state.conn.lock().map_err(|_| "Error de concurrencia en base de datos.".to_string())?;
    let tx = conn
        .transaction_with_behavior(TransactionBehavior::Immediate)
        .map_err(|err| format!("Error iniciando transacción de eliminación: {err}"))?;

    let mut deleted = Vec::new();
    for chunk in unique.chunks(SQLITE_CHUNK_SIZE) {
        let placeholders = (1..=chunk.len())
            .map(|idx| format!("?{idx}"))
            .collect::<Vec<_>>()
            .join(", ");
        let values: Vec<Value> = chunk.iter().map(|id| Value::Text(id.clone())).collect();
        let sql = format!(
            "DELETE FROM items WHERE id IN ({placeholders}) RETURNING id, file_path, cover_path"
        );
        let mut stmt = tx.prepare(&sql).map_err(|err| err.to_string())?;
        let mapped = stmt
            .query_map(params_from_iter(values.iter()), |r| {
                Ok(ItemFilePathsRow {
                    id: r.get(0)?,
                    file_path: r.get(1)?,
                    cover_path: r.get(2)?,
                })
            })
            .map_err(|err| err.to_string())?;
        for row in mapped {
            deleted.push(row.map_err(|err| err.to_string())?);
        }
    }

    tx.commit()
        .map_err(|err| format!("Error confirmando eliminación en lote: {err}"))?;
    Ok(deleted)
}

/// Atomically updates reading progress inside a `BEGIN IMMEDIATE` transaction without clobbering concurrent status edits.
#[tauri::command]
pub fn db_save_reading_progress(
    state: tauri::State<'_, DbState>,
    input: SaveReadingProgressInput,
) -> Result<Option<LibraryItem>, String> {
    if !input.current_page.is_finite() {
        return Err("La página actual no es un número válido.".to_string());
    }
    let input_page_count = match input.page_count {
        Some(v) if v.is_finite() && v > 0.0 => Some(v.floor() as i64),
        Some(v) if !v.is_finite() => return Err("El total de páginas no es un número válido.".to_string()),
        _ => None,
    };

    let mut conn = state.conn.lock().map_err(|_| "Error de concurrencia en base de datos.".to_string())?;
    let tx = conn
        .transaction_with_behavior(TransactionBehavior::Immediate)
        .map_err(|err| format!("Error iniciando transacción de progreso: {err}"))?;

    let Some(existing) = query_item_by_id_internal(&tx, &input.item_id)? else {
        return Ok(None);
    };

    let resolved_page_count = input_page_count.unwrap_or(existing.page_count).max(0);
    let floored_page = (input.current_page.floor() as i64).max(1);
    let clamped_page = if resolved_page_count > 0 {
        floored_page.min(resolved_page_count)
    } else {
        floored_page
    };

    let next_status = match input.mark_finished {
        Some(true) => "finished",
        Some(false) if existing.status == "finished" => "reading",
        None if existing.status == "inbox" || existing.status == "to_read" => "reading",
        _ => existing.status.as_str(),
    };

    let now = utc_now_iso(&tx)?;
    tx.execute(
        "UPDATE items
         SET current_page = ?1,
             page_count = ?2,
             status = ?3,
             last_opened_at = ?4,
             updated_at = ?4
         WHERE id = ?5",
        params![clamped_page, resolved_page_count, next_status, now, input.item_id],
    )
    .map_err(|err| format!("Error guardando progreso de lectura: {err}"))?;

    let updated = query_item_by_id_internal(&tx, &input.item_id)?;
    tx.commit()
        .map_err(|err| format!("Error confirmando progreso de lectura: {err}"))?;
    Ok(updated)
}

#[tauri::command]
pub fn db_search_items_fts(
    state: tauri::State<'_, DbState>,
    query: String,
    limit: Option<i64>,
) -> Result<Vec<FtsSearchResult>, String> {
    let match_expr = sanitize_fts_query(&query);
    if match_expr.is_empty() {
        return Ok(Vec::new());
    }
    let safe_limit = clamp_limit(limit, 40, 200);
    let conn = state.conn.lock().map_err(|_| "Error de concurrencia en base de datos.".to_string())?;
    let mut stmt = conn
        .prepare(
            "SELECT i.*, bm25(items_fts) AS fts_rank
             FROM items_fts
             INNER JOIN items i ON i.id = items_fts.item_id
             WHERE items_fts MATCH ?1
             ORDER BY fts_rank ASC
             LIMIT ?2",
        )
        .map_err(|err| format!("Error preparando búsqueda FTS5: {err}"))?;

    let rows = stmt
        .query_map(params![match_expr, safe_limit], |r| {
            let item = map_library_item(r)?;
            let rank: f64 = r.get("fts_rank")?;
            Ok(FtsSearchResult { item, rank })
        })
        .map_err(|err| format!("Error ejecutando búsqueda FTS5: {err}"))?;

    let mut out = Vec::new();
    for row in rows {
        out.push(row.map_err(|err| err.to_string())?);
    }
    Ok(out)
}

#[tauri::command]
pub fn db_get_item_counts_by_type(
    state: tauri::State<'_, DbState>,
    filter: Option<ItemFilter>,
) -> Result<HashMap<String, i64>, String> {
    let mut counts: HashMap<String, i64> = [
        "all", "book", "summary", "article", "paper", "course", "unsorted",
    ]
    .into_iter()
    .map(|k| (k.to_string(), 0))
    .collect();

    let mut f = filter.unwrap_or_default();
    f.item_type = None;
    let parts = build_filter_sql(&f)?;
    if parts.empty_result {
        return Ok(counts);
    }

    let conn = state.conn.lock().map_err(|_| "Error de concurrencia en base de datos.".to_string())?;
    let sql = format!(
        "SELECT i.type, COUNT(DISTINCT i.id) AS count FROM items i {} {} GROUP BY i.type",
        parts.joins_sql, parts.where_sql
    );
    let mut stmt = conn.prepare(&sql).map_err(|err| err.to_string())?;
    let rows = stmt
        .query_map(params_from_iter(parts.params.iter()), |r| {
            Ok((r.get::<_, String>(0)?, r.get::<_, i64>(1)?))
        })
        .map_err(|err| err.to_string())?;

    let mut total = 0i64;
    for row in rows {
        let (k, c) = row.map_err(|err| err.to_string())?;
        counts.insert(k, c);
        total += c;
    }
    counts.insert("all".to_string(), total);
    Ok(counts)
}

#[tauri::command]
pub fn db_get_item_counts_by_status(
    state: tauri::State<'_, DbState>,
    filter: Option<ItemFilter>,
) -> Result<HashMap<String, i64>, String> {
    let mut counts: HashMap<String, i64> = [
        "all", "inbox", "to_read", "reading", "reference", "finished",
    ]
    .into_iter()
    .map(|k| (k.to_string(), 0))
    .collect();

    let mut f = filter.unwrap_or_default();
    f.status = None;
    let parts = build_filter_sql(&f)?;
    if parts.empty_result {
        return Ok(counts);
    }

    let conn = state.conn.lock().map_err(|_| "Error de concurrencia en base de datos.".to_string())?;
    let sql = format!(
        "SELECT i.status, COUNT(DISTINCT i.id) AS count FROM items i {} {} GROUP BY i.status",
        parts.joins_sql, parts.where_sql
    );
    let mut stmt = conn.prepare(&sql).map_err(|err| err.to_string())?;
    let rows = stmt
        .query_map(params_from_iter(parts.params.iter()), |r| {
            Ok((r.get::<_, String>(0)?, r.get::<_, i64>(1)?))
        })
        .map_err(|err| err.to_string())?;

    let mut total = 0i64;
    for row in rows {
        let (k, c) = row.map_err(|err| err.to_string())?;
        counts.insert(k, c);
        total += c;
    }
    counts.insert("all".to_string(), total);
    Ok(counts)
}

#[tauri::command]
pub fn db_get_navigation_counts(
    state: tauri::State<'_, DbState>,
) -> Result<NavigationCounts, String> {
    let conn = state.conn.lock().map_err(|_| "Error de concurrencia en base de datos.".to_string())?;

    let inbox: i64 = conn
        .query_row("SELECT COUNT(*) FROM items WHERE status = 'inbox'", [], |r| r.get(0))
        .unwrap_or(0);
    let all: i64 = conn
        .query_row("SELECT COUNT(*) FROM items", [], |r| r.get(0))
        .unwrap_or(0);
    let favorites: i64 = conn
        .query_row("SELECT COUNT(*) FROM items WHERE is_favorite = 1", [], |r| r.get(0))
        .unwrap_or(0);
    let recent: i64 = conn
        .query_row("SELECT COUNT(*) FROM items WHERE last_opened_at IS NOT NULL", [], |r| r.get(0))
        .unwrap_or(0);
    let highlights: i64 = conn
        .query_row("SELECT COUNT(*) FROM highlights", [], |r| r.get(0))
        .unwrap_or(0);
    let notes: i64 = conn
        .query_row("SELECT COUNT(*) FROM notes", [], |r| r.get(0))
        .unwrap_or(0);

    Ok(NavigationCounts {
        inbox,
        all,
        favorites,
        recent,
        highlights,
        notes,
    })
}

#[tauri::command]
pub fn db_has_sample_items(state: tauri::State<'_, DbState>) -> Result<bool, String> {
    let conn = state.conn.lock().map_err(|_| "Error de concurrencia en base de datos.".to_string())?;
    let count: i64 = conn
        .query_row("SELECT COUNT(*) FROM items WHERE file_path GLOB 'sample/*'", [], |r| r.get(0))
        .unwrap_or(0);
    Ok(count > 0)
}

#[tauri::command]
pub fn db_list_all_file_hashes(state: tauri::State<'_, DbState>) -> Result<Vec<String>, String> {
    let conn = state.conn.lock().map_err(|_| "Error de concurrencia en base de datos.".to_string())?;
    let mut stmt = conn
        .prepare("SELECT file_hash FROM items WHERE file_hash IS NOT NULL")
        .map_err(|err| err.to_string())?;
    let rows = stmt
        .query_map([], |r| r.get::<_, String>(0))
        .map_err(|err| err.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|err| err.to_string())?;
    Ok(rows)
}

// ============================================================================
// Shelf Commands
// ============================================================================

#[tauri::command]
pub fn db_list_shelves_with_counts(
    state: tauri::State<'_, DbState>,
) -> Result<Vec<ShelfWithCount>, String> {
    let conn = state.conn.lock().map_err(|_| "Error de concurrencia en base de datos.".to_string())?;
    let mut stmt_s = conn
        .prepare("SELECT * FROM shelves ORDER BY sort_order ASC, name COLLATE NOCASE ASC")
        .map_err(|err| err.to_string())?;
    let shelves: Vec<Shelf> = stmt_s
        .query_map([], map_shelf)
        .map_err(|err| err.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|err| err.to_string())?;

    let mut stmt_l = conn
        .prepare("SELECT item_id, shelf_id FROM item_shelves")
        .map_err(|err| err.to_string())?;
    let mut direct_items: HashMap<String, HashSet<String>> = HashMap::new();
    let link_rows = stmt_l
        .query_map([], |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?)))
        .map_err(|err| err.to_string())?;
    for pair in link_rows {
        let (item_id, shelf_id) = pair.map_err(|err| err.to_string())?;
        direct_items.entry(shelf_id).or_default().insert(item_id);
    }

    let mut children_by_parent: HashMap<String, Vec<String>> = HashMap::new();
    for shelf in &shelves {
        if let Some(ref pid) = shelf.parent_id {
            children_by_parent
                .entry(pid.clone())
                .or_default()
                .push(shelf.id.clone());
        }
    }

    fn collect_subtree(
        shelf_id: &str,
        direct: &HashMap<String, HashSet<String>>,
        children: &HashMap<String, Vec<String>>,
        visiting: &mut HashSet<String>,
        out: &mut HashSet<String>,
    ) {
        if !visiting.insert(shelf_id.to_string()) {
            return;
        }
        if let Some(set) = direct.get(shelf_id) {
            for id in set {
                out.insert(id.clone());
            }
        }
        if let Some(kids) = children.get(shelf_id) {
            for kid in kids {
                collect_subtree(kid, direct, children, visiting, out);
            }
        }
    }

    Ok(shelves
        .into_iter()
        .map(|shelf| {
            let direct_count = direct_items.get(&shelf.id).map_or(0, |s| s.len() as i64);
            let mut visiting = HashSet::new();
            let mut total_set = HashSet::new();
            collect_subtree(&shelf.id, &direct_items, &children_by_parent, &mut visiting, &mut total_set);
            ShelfWithCount {
                shelf,
                direct_item_count: direct_count,
                item_count: total_set.len() as i64,
            }
        })
        .collect())
}

#[tauri::command]
pub fn db_create_shelf(
    state: tauri::State<'_, DbState>,
    input: CreateShelfInput,
) -> Result<Shelf, String> {
    let name = clean_bounded_text(input.name.trim(), 160);
    if name.is_empty() {
        return Err("El nombre de la estantería no puede estar vacío.".to_string());
    }
    let category = validate_shelf_category(input.category.as_deref().unwrap_or("custom"))?;
    let sort_order = input.sort_order.unwrap_or(0);

    let conn = state.conn.lock().map_err(|_| "Error de concurrencia en base de datos.".to_string())?;
    let id = uuid::Uuid::new_v4().to_string();
    let now = utc_now_iso(&conn)?;

    conn.execute(
        "INSERT INTO shelves (id, name, parent_id, category, sort_order, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
        params![id, name, input.parent_id, category, sort_order, now, now],
    )
    .map_err(|err| format!("Error creando estantería: {err}"))?;

    conn.query_row("SELECT * FROM shelves WHERE id = ?1 LIMIT 1", params![id], map_shelf)
        .map_err(|err| format!("Error recuperando estantería creada: {err}"))
}

/// Atomically updates a shelf inside `BEGIN IMMEDIATE` with a recursive-CTE cycle guard.
#[tauri::command]
pub fn db_update_shelf(
    state: tauri::State<'_, DbState>,
    id: String,
    patch: UpdateShelfInput,
) -> Result<Option<Shelf>, String> {
    let mut conn = state.conn.lock().map_err(|_| "Error de concurrencia en base de datos.".to_string())?;
    let tx = conn
        .transaction_with_behavior(TransactionBehavior::Immediate)
        .map_err(|err| format!("Error iniciando transacción de estantería: {err}"))?;

    if let Some(Some(ref new_parent)) = patch.parent_id {
        if new_parent == &id {
            return Err("Una estantería no puede ser su propio padre.".to_string());
        }
        // Atomic recursive CTE verifies `new_parent` is not `id` or any descendant of `id`.
        let creates_cycle: bool = tx
            .query_row(
                "WITH RECURSIVE descendants(sid) AS (
                    SELECT ?1
                    UNION
                    SELECT s.id FROM shelves s INNER JOIN descendants d ON s.parent_id = d.sid
                 )
                 SELECT EXISTS(SELECT 1 FROM descendants WHERE sid = ?2)",
                params![id, new_parent],
                |r| r.get::<_, i64>(0),
            )
            .map(|v| v != 0)
            .map_err(|err| format!("Error verificando ciclos de estantería: {err}"))?;
        if creates_cycle {
            return Err("No se puede mover una estantería dentro de sus propias sub-estanterías.".to_string());
        }
    }

    let mut assignments = Vec::new();
    let mut values: Vec<Value> = Vec::new();

    if let Some(name) = patch.name {
        let trimmed = clean_bounded_text(name.trim(), 160);
        if trimmed.is_empty() {
            return Err("El nombre de la estantería no puede estar vacío.".to_string());
        }
        values.push(Value::Text(trimmed));
        assignments.push(format!("name = ?{}", values.len()));
    }
    if let Some(parent_opt) = patch.parent_id {
        match parent_opt {
            Some(pid) => values.push(Value::Text(pid)),
            None => values.push(Value::Null),
        }
        assignments.push(format!("parent_id = ?{}", values.len()));
    }
    if let Some(category) = patch.category {
        validate_shelf_category(&category)?;
        values.push(Value::Text(category));
        assignments.push(format!("category = ?{}", values.len()));
    }
    if let Some(sort_order) = patch.sort_order {
        values.push(Value::Integer(sort_order));
        assignments.push(format!("sort_order = ?{}", values.len()));
    }

    if !assignments.is_empty() {
        let now = utc_now_iso(&tx)?;
        values.push(Value::Text(now));
        assignments.push(format!("updated_at = ?{}", values.len()));
        values.push(Value::Text(id.clone()));

        let sql = format!(
            "UPDATE shelves SET {} WHERE id = ?{}",
            assignments.join(", "),
            values.len()
        );
        tx.execute(&sql, params_from_iter(values.iter()))
            .map_err(|err| format!("Error actualizando estantería: {err}"))?;
    }

    let updated = tx
        .query_row("SELECT * FROM shelves WHERE id = ?1 LIMIT 1", params![id], map_shelf)
        .optional()
        .map_err(|err| err.to_string())?;
    tx.commit().map_err(|err| err.to_string())?;
    Ok(updated)
}

#[tauri::command]
pub fn db_delete_shelf(state: tauri::State<'_, DbState>, id: String) -> Result<(), String> {
    let conn = state.conn.lock().map_err(|_| "Error de concurrencia en base de datos.".to_string())?;
    conn.execute("DELETE FROM shelves WHERE id = ?1", params![id])
        .map_err(|err| format!("Error eliminando estantería: {err}"))?;
    Ok(())
}

#[tauri::command]
pub fn db_assign_item_to_shelf(
    state: tauri::State<'_, DbState>,
    item_id: String,
    shelf_id: String,
) -> Result<(), String> {
    let conn = state.conn.lock().map_err(|_| "Error de concurrencia en base de datos.".to_string())?;
    // Uses targeted ON CONFLICT DO NOTHING so foreign-key violations still fail loudly.
    conn.execute(
        "INSERT INTO item_shelves (item_id, shelf_id) VALUES (?1, ?2)
         ON CONFLICT(item_id, shelf_id) DO NOTHING",
        params![item_id, shelf_id],
    )
    .map_err(|err| format!("Error asignando libro a estantería: {err}"))?;
    Ok(())
}

#[tauri::command]
pub fn db_remove_item_from_shelf(
    state: tauri::State<'_, DbState>,
    item_id: String,
    shelf_id: String,
) -> Result<(), String> {
    let conn = state.conn.lock().map_err(|_| "Error de concurrencia en base de datos.".to_string())?;
    conn.execute(
        "DELETE FROM item_shelves WHERE item_id = ?1 AND shelf_id = ?2",
        params![item_id, shelf_id],
    )
    .map_err(|err| format!("Error quitando libro de estantería: {err}"))?;
    Ok(())
}

#[tauri::command]
pub fn db_bulk_assign_items_to_shelf(
    state: tauri::State<'_, DbState>,
    item_ids: Vec<String>,
    shelf_id: String,
) -> Result<(), String> {
    if item_ids.len() > MAX_BULK_IDS {
        return Err("Demasiados elementos en operación en lote.".to_string());
    }
    let unique: Vec<String> = {
        let mut seen = HashSet::new();
        item_ids.into_iter().filter(|id| seen.insert(id.clone())).collect()
    };
    if unique.is_empty() {
        return Ok(());
    }

    let mut conn = state.conn.lock().map_err(|_| "Error de concurrencia en base de datos.".to_string())?;
    let tx = conn
        .transaction_with_behavior(TransactionBehavior::Immediate)
        .map_err(|err| err.to_string())?;
    {
        let mut stmt = tx
            .prepare(
                "INSERT INTO item_shelves (item_id, shelf_id) VALUES (?1, ?2)
                 ON CONFLICT(item_id, shelf_id) DO NOTHING",
            )
            .map_err(|err| err.to_string())?;
        for item_id in &unique {
            stmt.execute(params![item_id, shelf_id])
                .map_err(|err| format!("Error asignando elementos en lote: {err}"))?;
        }
    }
    tx.commit().map_err(|err| err.to_string())
}

#[tauri::command]
pub fn db_bulk_remove_items_from_shelf(
    state: tauri::State<'_, DbState>,
    item_ids: Vec<String>,
    shelf_id: String,
) -> Result<(), String> {
    if item_ids.len() > MAX_BULK_IDS {
        return Err("Demasiados elementos en operación en lote.".to_string());
    }
    let unique: Vec<String> = {
        let mut seen = HashSet::new();
        item_ids.into_iter().filter(|id| seen.insert(id.clone())).collect()
    };
    if unique.is_empty() {
        return Ok(());
    }

    let mut conn = state.conn.lock().map_err(|_| "Error de concurrencia en base de datos.".to_string())?;
    let tx = conn
        .transaction_with_behavior(TransactionBehavior::Immediate)
        .map_err(|err| err.to_string())?;
    for chunk in unique.chunks(SQLITE_CHUNK_SIZE) {
        let placeholders = (2..=chunk.len() + 1)
            .map(|idx| format!("?{idx}"))
            .collect::<Vec<_>>()
            .join(", ");
        let mut values = Vec::with_capacity(chunk.len() + 1);
        values.push(Value::Text(shelf_id.clone()));
        for id in chunk {
            values.push(Value::Text(id.clone()));
        }
        let sql = format!("DELETE FROM item_shelves WHERE shelf_id = ?1 AND item_id IN ({placeholders})");
        tx.execute(&sql, params_from_iter(values.iter()))
            .map_err(|err| err.to_string())?;
    }
    tx.commit().map_err(|err| err.to_string())
}

// ============================================================================
// Tag Commands
// ============================================================================

#[tauri::command]
pub fn db_list_tags_with_counts(
    state: tauri::State<'_, DbState>,
) -> Result<Vec<TagWithCount>, String> {
    let conn = state.conn.lock().map_err(|_| "Error de concurrencia en base de datos.".to_string())?;
    let mut stmt = conn
        .prepare(
            "SELECT t.*, COUNT(it.item_id) AS item_count
             FROM tags t
             LEFT JOIN item_tags it ON it.tag_id = t.id
             GROUP BY t.id
             ORDER BY t.name COLLATE NOCASE ASC",
        )
        .map_err(|err| err.to_string())?;

    let rows = stmt
        .query_map([], |r| {
            Ok(TagWithCount {
                tag: map_tag(r)?,
                item_count: r.get("item_count")?,
            })
        })
        .map_err(|err| err.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|err| err.to_string())?;

    Ok(rows)
}

#[tauri::command]
pub fn db_create_tag(
    state: tauri::State<'_, DbState>,
    input: CreateTagInput,
) -> Result<Tag, String> {
    let name = clean_bounded_text(input.name.trim(), 80);
    if name.is_empty() {
        return Err("El nombre de la etiqueta no puede estar vacío.".to_string());
    }
    if let Some(ref color) = input.color {
        validate_hex_color(color)?;
    }

    let conn = state.conn.lock().map_err(|_| "Error de concurrencia en base de datos.".to_string())?;
    let id = uuid::Uuid::new_v4().to_string();
    let now = utc_now_iso(&conn)?;

    conn.execute(
        "INSERT INTO tags (id, name, color, created_at) VALUES (?1, ?2, ?3, ?4)",
        params![id, name, input.color, now],
    )
    .map_err(|err| format!("Error creando etiqueta: {err}"))?;

    conn.query_row("SELECT * FROM tags WHERE id = ?1 LIMIT 1", params![id], map_tag)
        .map_err(|err| err.to_string())
}

#[tauri::command]
pub fn db_update_tag(
    state: tauri::State<'_, DbState>,
    id: String,
    patch: UpdateTagInput,
) -> Result<Option<Tag>, String> {
    let conn = state.conn.lock().map_err(|_| "Error de concurrencia en base de datos.".to_string())?;
    let mut assignments = Vec::new();
    let mut values: Vec<Value> = Vec::new();

    if let Some(name) = patch.name {
        let trimmed = clean_bounded_text(name.trim(), 80);
        if trimmed.is_empty() {
            return Err("El nombre de la etiqueta no puede estar vacío.".to_string());
        }
        values.push(Value::Text(trimmed));
        assignments.push(format!("name = ?{}", values.len()));
    }
    if let Some(color_opt) = patch.color {
        match color_opt {
            Some(color) => {
                validate_hex_color(&color)?;
                values.push(Value::Text(color));
            }
            None => values.push(Value::Null),
        }
        assignments.push(format!("color = ?{}", values.len()));
    }

    if !assignments.is_empty() {
        values.push(Value::Text(id.clone()));
        let sql = format!("UPDATE tags SET {} WHERE id = ?{}", assignments.join(", "), values.len());
        conn.execute(&sql, params_from_iter(values.iter()))
            .map_err(|err| format!("Error actualizando etiqueta: {err}"))?;
    }

    conn.query_row("SELECT * FROM tags WHERE id = ?1 LIMIT 1", params![id], map_tag)
        .optional()
        .map_err(|err| err.to_string())
}

#[tauri::command]
pub fn db_delete_tag(state: tauri::State<'_, DbState>, id: String) -> Result<(), String> {
    let conn = state.conn.lock().map_err(|_| "Error de concurrencia en base de datos.".to_string())?;
    conn.execute("DELETE FROM tags WHERE id = ?1", params![id])
        .map_err(|err| err.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn db_assign_tag_to_item(
    state: tauri::State<'_, DbState>,
    item_id: String,
    tag_id: String,
) -> Result<(), String> {
    let conn = state.conn.lock().map_err(|_| "Error de concurrencia en base de datos.".to_string())?;
    conn.execute(
        "INSERT INTO item_tags (item_id, tag_id) VALUES (?1, ?2)
         ON CONFLICT(item_id, tag_id) DO NOTHING",
        params![item_id, tag_id],
    )
    .map_err(|err| format!("Error asignando etiqueta: {err}"))?;
    Ok(())
}

#[tauri::command]
pub fn db_remove_tag_from_item(
    state: tauri::State<'_, DbState>,
    item_id: String,
    tag_id: String,
) -> Result<(), String> {
    let conn = state.conn.lock().map_err(|_| "Error de concurrencia en base de datos.".to_string())?;
    conn.execute(
        "DELETE FROM item_tags WHERE item_id = ?1 AND tag_id = ?2",
        params![item_id, tag_id],
    )
    .map_err(|err| err.to_string())?;
    Ok(())
}

// ============================================================================
// Highlight Commands
// ============================================================================

#[tauri::command]
pub fn db_get_highlight_by_id(
    state: tauri::State<'_, DbState>,
    id: String,
) -> Result<Option<Highlight>, String> {
    let conn = state.conn.lock().map_err(|_| "Error de concurrencia en base de datos.".to_string())?;
    conn.query_row("SELECT * FROM highlights WHERE id = ?1 LIMIT 1", params![id], map_highlight)
        .optional()
        .map_err(|err| err.to_string())
}

#[tauri::command]
pub fn db_list_highlights_with_items(
    state: tauri::State<'_, DbState>,
) -> Result<Vec<HighlightWithItem>, String> {
    let conn = state.conn.lock().map_err(|_| "Error de concurrencia en base de datos.".to_string())?;
    let mut stmt = conn
        .prepare(
            "SELECT h.*, i.title AS item_title, i.author AS item_author,
                    i.type AS item_type, i.file_format AS item_file_format,
                    i.file_path AS item_file_path
             FROM highlights h
             INNER JOIN items i ON i.id = h.item_id
             ORDER BY h.created_at DESC",
        )
        .map_err(|err| err.to_string())?;

    let rows = stmt
        .query_map([], map_highlight_with_item)
        .map_err(|err| err.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|err| err.to_string())?;
    Ok(rows)
}

#[tauri::command]
pub fn db_list_highlights_by_item(
    state: tauri::State<'_, DbState>,
    item_id: String,
) -> Result<Vec<Highlight>, String> {
    let conn = state.conn.lock().map_err(|_| "Error de concurrencia en base de datos.".to_string())?;
    let mut stmt = conn
        .prepare(
            "SELECT * FROM highlights
             WHERE item_id = ?1
             ORDER BY CASE WHEN page_number IS NULL THEN 1 ELSE 0 END,
                      page_number ASC, created_at ASC",
        )
        .map_err(|err| err.to_string())?;
    let rows = stmt
        .query_map(params![item_id], map_highlight)
        .map_err(|err| err.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|err| err.to_string())?;
    Ok(rows)
}

#[tauri::command]
pub fn db_create_highlight(
    state: tauri::State<'_, DbState>,
    input: CreateHighlightInput,
) -> Result<Highlight, String> {
    let quote_text = clean_bounded_text(input.quote_text.trim(), MAX_TEXT_FIELD_LEN);
    if quote_text.is_empty() {
        return Err("La cita del subrayado no puede estar vacía.".to_string());
    }
    let color = validate_highlight_color(input.color.as_deref().unwrap_or("amber"))?;
    if let Some(p) = input.page_number {
        if p <= 0 {
            return Err("El número de página del subrayado debe ser positivo.".to_string());
        }
    }
    let note_md = clean_bounded_text(input.note_markdown.as_deref().unwrap_or(""), MAX_TEXT_FIELD_LEN);
    let cfi = input.location_cfi.map(|c| clean_bounded_text(&c, 512));

    let conn = state.conn.lock().map_err(|_| "Error de concurrencia en base de datos.".to_string())?;
    let id = uuid::Uuid::new_v4().to_string();
    let now = utc_now_iso(&conn)?;

    conn.execute(
        "INSERT INTO highlights (
            id, item_id, quote_text, note_markdown, page_number, location_cfi, color,
            created_at, updated_at
        ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
        params![id, input.item_id, quote_text, note_md, input.page_number, cfi, color, now, now],
    )
    .map_err(|err| format!("Error guardando subrayado: {err}"))?;

    conn.query_row("SELECT * FROM highlights WHERE id = ?1 LIMIT 1", params![id], map_highlight)
        .map_err(|err| err.to_string())
}

#[tauri::command]
pub fn db_update_highlight(
    state: tauri::State<'_, DbState>,
    id: String,
    patch: UpdateHighlightInput,
) -> Result<Option<Highlight>, String> {
    let conn = state.conn.lock().map_err(|_| "Error de concurrencia en base de datos.".to_string())?;
    let mut assignments = Vec::new();
    let mut values: Vec<Value> = Vec::new();

    if let Some(quote) = patch.quote_text {
        let trimmed = clean_bounded_text(quote.trim(), MAX_TEXT_FIELD_LEN);
        if trimmed.is_empty() {
            return Err("La cita del subrayado no puede estar vacía.".to_string());
        }
        values.push(Value::Text(trimmed));
        assignments.push(format!("quote_text = ?{}", values.len()));
    }
    if let Some(note_md) = patch.note_markdown {
        values.push(Value::Text(clean_bounded_text(&note_md, MAX_TEXT_FIELD_LEN)));
        assignments.push(format!("note_markdown = ?{}", values.len()));
    }
    if let Some(page_opt) = patch.page_number {
        match page_opt {
            Some(p) if p > 0 => values.push(Value::Integer(p)),
            Some(_) => return Err("El número de página debe ser positivo.".to_string()),
            None => values.push(Value::Null),
        }
        assignments.push(format!("page_number = ?{}", values.len()));
    }
    if let Some(cfi_opt) = patch.location_cfi {
        match cfi_opt {
            Some(c) => values.push(Value::Text(clean_bounded_text(&c, 512))),
            None => values.push(Value::Null),
        }
        assignments.push(format!("location_cfi = ?{}", values.len()));
    }
    if let Some(color) = patch.color {
        validate_highlight_color(&color)?;
        values.push(Value::Text(color));
        assignments.push(format!("color = ?{}", values.len()));
    }

    if !assignments.is_empty() {
        let now = utc_now_iso(&conn)?;
        values.push(Value::Text(now));
        assignments.push(format!("updated_at = ?{}", values.len()));
        values.push(Value::Text(id.clone()));

        let sql = format!(
            "UPDATE highlights SET {} WHERE id = ?{}",
            assignments.join(", "),
            values.len()
        );
        conn.execute(&sql, params_from_iter(values.iter()))
            .map_err(|err| err.to_string())?;
    }

    conn.query_row("SELECT * FROM highlights WHERE id = ?1 LIMIT 1", params![id], map_highlight)
        .optional()
        .map_err(|err| err.to_string())
}

#[tauri::command]
pub fn db_search_highlights_fts(
    state: tauri::State<'_, DbState>,
    query: String,
    limit: Option<i64>,
) -> Result<Vec<HighlightWithItem>, String> {
    let match_expr = sanitize_fts_query(&query);
    if match_expr.is_empty() {
        return Ok(Vec::new());
    }
    let safe_limit = clamp_limit(limit, 50, 200);
    let conn = state.conn.lock().map_err(|_| "Error de concurrencia en base de datos.".to_string())?;
    let mut stmt = conn
        .prepare(
            "SELECT h.*, i.title AS item_title, i.author AS item_author,
                    i.type AS item_type, i.file_format AS item_file_format,
                    i.file_path AS item_file_path
             FROM highlights_fts
             INNER JOIN highlights h ON h.id = highlights_fts.highlight_id
             INNER JOIN items i ON i.id = h.item_id
             WHERE highlights_fts MATCH ?1
             ORDER BY bm25(highlights_fts) ASC, h.created_at DESC
             LIMIT ?2",
        )
        .map_err(|err| err.to_string())?;

    let rows = stmt
        .query_map(params![match_expr, safe_limit], map_highlight_with_item)
        .map_err(|err| err.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|err| err.to_string())?;
    Ok(rows)
}

#[tauri::command]
pub fn db_delete_highlight(state: tauri::State<'_, DbState>, id: String) -> Result<(), String> {
    let conn = state.conn.lock().map_err(|_| "Error de concurrencia en base de datos.".to_string())?;
    conn.execute("DELETE FROM highlights WHERE id = ?1", params![id])
        .map_err(|err| err.to_string())?;
    Ok(())
}

// ============================================================================
// Note Commands
// ============================================================================

#[tauri::command]
pub fn db_list_notes_with_items(
    state: tauri::State<'_, DbState>,
) -> Result<Vec<NoteWithItem>, String> {
    let conn = state.conn.lock().map_err(|_| "Error de concurrencia en base de datos.".to_string())?;
    let mut stmt = conn
        .prepare(
            "SELECT n.*, i.title AS item_title, i.author AS item_author
             FROM notes n
             LEFT JOIN items i ON i.id = n.item_id
             ORDER BY n.is_pinned DESC, n.updated_at DESC",
        )
        .map_err(|err| err.to_string())?;
    let rows = stmt
        .query_map([], map_note_with_item)
        .map_err(|err| err.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|err| err.to_string())?;
    Ok(rows)
}

#[tauri::command]
pub fn db_get_note_by_id(
    state: tauri::State<'_, DbState>,
    id: String,
) -> Result<Option<NoteWithItem>, String> {
    let conn = state.conn.lock().map_err(|_| "Error de concurrencia en base de datos.".to_string())?;
    conn.query_row(
        "SELECT n.*, i.title AS item_title, i.author AS item_author
         FROM notes n
         LEFT JOIN items i ON i.id = n.item_id
         WHERE n.id = ?1 LIMIT 1",
        params![id],
        map_note_with_item,
    )
    .optional()
    .map_err(|err| err.to_string())
}

#[tauri::command]
pub fn db_search_notes_fts(
    state: tauri::State<'_, DbState>,
    query: String,
    limit: Option<i64>,
) -> Result<Vec<NoteWithItem>, String> {
    let match_expr = sanitize_fts_query(&query);
    if match_expr.is_empty() {
        return Ok(Vec::new());
    }
    let safe_limit = clamp_limit(limit, 50, 200);
    let conn = state.conn.lock().map_err(|_| "Error de concurrencia en base de datos.".to_string())?;
    let mut stmt = conn
        .prepare(
            "SELECT n.*, i.title AS item_title, i.author AS item_author
             FROM notes_fts
             INNER JOIN notes n ON n.id = notes_fts.note_id
             LEFT JOIN items i ON i.id = n.item_id
             WHERE notes_fts MATCH ?1
             ORDER BY n.is_pinned DESC, bm25(notes_fts) ASC, n.updated_at DESC
             LIMIT ?2",
        )
        .map_err(|err| err.to_string())?;
    let rows = stmt
        .query_map(params![match_expr, safe_limit], map_note_with_item)
        .map_err(|err| err.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|err| err.to_string())?;
    Ok(rows)
}

#[tauri::command]
pub fn db_create_note(
    state: tauri::State<'_, DbState>,
    input: CreateNoteInput,
) -> Result<NoteWithItem, String> {
    let trimmed_title = clean_bounded_text(input.title.trim(), MAX_TITLE_LEN);
    let title = if trimmed_title.is_empty() {
        "Nota sin título".to_string()
    } else {
        trimmed_title
    };
    let content = clean_bounded_text(input.content.as_deref().unwrap_or(""), MAX_TEXT_FIELD_LEN);
    let folder = sanitize_note_folder(input.folder.as_deref().unwrap_or(""));
    let tags = normalize_note_tags(input.tags.as_deref().unwrap_or(&[]));
    let tags_json = serde_json::to_string(&tags).unwrap_or_else(|_| "[]".to_string());
    let is_pinned: i64 = if input.is_pinned.unwrap_or(false) { 1 } else { 0 };

    let conn = state.conn.lock().map_err(|_| "Error de concurrencia en base de datos.".to_string())?;
    let id = uuid::Uuid::new_v4().to_string();
    let now = utc_now_iso(&conn)?;

    conn.execute(
        "INSERT INTO notes (id, title, content, folder, tags_json, item_id, is_pinned, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
        params![id, title, content, folder, tags_json, input.item_id, is_pinned, now, now],
    )
    .map_err(|err| format!("Error creando nota: {err}"))?;

    conn.query_row(
        "SELECT n.*, i.title AS item_title, i.author AS item_author
         FROM notes n LEFT JOIN items i ON i.id = n.item_id
         WHERE n.id = ?1 LIMIT 1",
        params![id],
        map_note_with_item,
    )
    .map_err(|err| err.to_string())
}

#[tauri::command]
pub fn db_update_note(
    state: tauri::State<'_, DbState>,
    id: String,
    patch: UpdateNoteInput,
) -> Result<Option<NoteWithItem>, String> {
    let conn = state.conn.lock().map_err(|_| "Error de concurrencia en base de datos.".to_string())?;
    let mut assignments = Vec::new();
    let mut values: Vec<Value> = Vec::new();

    if let Some(title) = patch.title {
        let trimmed = clean_bounded_text(title.trim(), MAX_TITLE_LEN);
        let resolved = if trimmed.is_empty() {
            "Nota sin título".to_string()
        } else {
            trimmed
        };
        values.push(Value::Text(resolved));
        assignments.push(format!("title = ?{}", values.len()));
    }
    if let Some(content) = patch.content {
        values.push(Value::Text(clean_bounded_text(&content, MAX_TEXT_FIELD_LEN)));
        assignments.push(format!("content = ?{}", values.len()));
    }
    if let Some(folder) = patch.folder {
        values.push(Value::Text(sanitize_note_folder(&folder)));
        assignments.push(format!("folder = ?{}", values.len()));
    }
    if let Some(tags) = patch.tags {
        let normalized = normalize_note_tags(&tags);
        let json = serde_json::to_string(&normalized).unwrap_or_else(|_| "[]".to_string());
        values.push(Value::Text(json));
        assignments.push(format!("tags_json = ?{}", values.len()));
    }
    if let Some(item_opt) = patch.item_id {
        match item_opt {
            Some(iid) => values.push(Value::Text(iid)),
            None => values.push(Value::Null),
        }
        assignments.push(format!("item_id = ?{}", values.len()));
    }
    if let Some(is_pinned) = patch.is_pinned {
        values.push(Value::Integer(if is_pinned { 1 } else { 0 }));
        assignments.push(format!("is_pinned = ?{}", values.len()));
    }

    if !assignments.is_empty() {
        let now = utc_now_iso(&conn)?;
        values.push(Value::Text(now));
        assignments.push(format!("updated_at = ?{}", values.len()));
        values.push(Value::Text(id.clone()));

        let sql = format!("UPDATE notes SET {} WHERE id = ?{}", assignments.join(", "), values.len());
        conn.execute(&sql, params_from_iter(values.iter()))
            .map_err(|err| err.to_string())?;
    }

    conn.query_row(
        "SELECT n.*, i.title AS item_title, i.author AS item_author
         FROM notes n LEFT JOIN items i ON i.id = n.item_id
         WHERE n.id = ?1 LIMIT 1",
        params![id],
        map_note_with_item,
    )
    .optional()
    .map_err(|err| err.to_string())
}

#[tauri::command]
pub fn db_delete_note(state: tauri::State<'_, DbState>, id: String) -> Result<(), String> {
    let conn = state.conn.lock().map_err(|_| "Error de concurrencia en base de datos.".to_string())?;
    conn.execute("DELETE FROM notes WHERE id = ?1", params![id])
        .map_err(|err| err.to_string())?;
    Ok(())
}

// ============================================================================
// Study Session & Stats Commands
// ============================================================================

#[tauri::command]
pub fn db_create_study_session(
    state: tauri::State<'_, DbState>,
    input: CreateStudySessionInput,
) -> Result<StudySession, String> {
    validate_pomodoro_phase(&input.phase)?;
    if !input.planned_seconds.is_finite()
        || !input.duration_seconds.is_finite()
        || !input.local_hour.is_finite()
    {
        return Err("Valores numéricos de sesión Pomodoro inválidos.".to_string());
    }
    validate_iso_date_key(&input.local_date)?;

    let planned_seconds = (input.planned_seconds.round() as i64).clamp(1, 86400);
    let duration_seconds = (input.duration_seconds.round() as i64).clamp(1, 86400);
    let local_hour = (input.local_hour.floor() as i64).clamp(0, 23);
    let completed = if input.completed { 1i64 } else { 0i64 };
    let started_at = clean_bounded_text(input.started_at.trim(), 64);
    let ended_at = clean_bounded_text(input.ended_at.trim(), 64);

    let conn = state.conn.lock().map_err(|_| "Error de concurrencia en base de datos.".to_string())?;
    let id = uuid::Uuid::new_v4().to_string();

    conn.execute(
        "INSERT INTO study_sessions (
            id, item_id, phase, planned_seconds, duration_seconds, completed,
            started_at, ended_at, local_date, local_hour
        ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
        params![
            id,
            input.item_id,
            input.phase,
            planned_seconds,
            duration_seconds,
            completed,
            started_at,
            ended_at,
            input.local_date,
            local_hour,
        ],
    )
    .map_err(|err| format!("Error guardando sesión Pomodoro: {err}"))?;

    conn.query_row(
        "SELECT * FROM study_sessions WHERE id = ?1 LIMIT 1",
        params![id],
        map_study_session,
    )
    .map_err(|err| err.to_string())
}

#[tauri::command]
pub fn db_list_pomodoro_book_options(
    state: tauri::State<'_, DbState>,
) -> Result<Vec<PomodoroBookOption>, String> {
    let conn = state.conn.lock().map_err(|_| "Error de concurrencia en base de datos.".to_string())?;
    let mut stmt = conn
        .prepare(
            "SELECT id, title, author, status
             FROM items
             ORDER BY CASE WHEN status = 'reading' THEN 0 ELSE 1 END,
                      COALESCE(last_opened_at, updated_at) DESC
             LIMIT 100",
        )
        .map_err(|err| err.to_string())?;
    let rows = stmt
        .query_map([], |r| {
            Ok(PomodoroBookOption {
                id: r.get(0)?,
                title: r.get(1)?,
                author: r.get(2)?,
                status: r.get(3)?,
            })
        })
        .map_err(|err| err.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|err| err.to_string())?;
    Ok(rows)
}

#[tauri::command]
pub fn db_list_focus_sessions(
    state: tauri::State<'_, DbState>,
) -> Result<Vec<StudySessionWithItem>, String> {
    let conn = state.conn.lock().map_err(|_| "Error de concurrencia en base de datos.".to_string())?;
    let mut stmt = conn
        .prepare(
            "SELECT s.*, i.title AS item_title, i.author AS item_author
             FROM study_sessions s
             LEFT JOIN items i ON i.id = s.item_id
             WHERE s.phase = 'focus'
             ORDER BY s.started_at ASC",
        )
        .map_err(|err| err.to_string())?;
    let rows = stmt
        .query_map([], |r| {
            Ok(StudySessionWithItem {
                session: map_study_session(r)?,
                item_title: r.get("item_title")?,
                item_author: r.get("item_author")?,
            })
        })
        .map_err(|err| err.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|err| err.to_string())?;
    Ok(rows)
}

#[tauri::command]
pub fn db_get_reading_stats_raw(
    state: tauri::State<'_, DbState>,
) -> Result<ReadingStatsRawPayload, String> {
    let conn = state.conn.lock().map_err(|_| "Error de concurrencia en base de datos.".to_string())?;

    let mut stmt_items = conn
        .prepare(
            "SELECT id, title, author, type, status, file_path, cover_path, file_format,
                    file_hash, file_size, page_count, current_page, is_favorite,
                    '' AS notes, last_opened_at, created_at, updated_at
             FROM items",
        )
        .map_err(|err| err.to_string())?;
    let items = stmt_items
        .query_map([], map_library_item)
        .map_err(|err| err.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|err| err.to_string())?;

    let mut stmt_shelves = conn
        .prepare(
            "SELECT s.id, s.name, COUNT(DISTINCT ishf.item_id) AS total_count,
                    SUM(CASE WHEN i.status = 'finished' THEN 1 ELSE 0 END) AS finished_count
             FROM shelves s
             INNER JOIN item_shelves ishf ON ishf.shelf_id = s.id
             INNER JOIN items i ON i.id = ishf.item_id
             GROUP BY s.id
             ORDER BY total_count DESC, s.name COLLATE NOCASE ASC
             LIMIT 6",
        )
        .map_err(|err| err.to_string())?;
    let top_shelves = stmt_shelves
        .query_map([], |r| {
            Ok(ShelfProgressRow {
                id: r.get(0)?,
                name: r.get(1)?,
                total_count: r.get(2)?,
                finished_count: r.get(3)?,
            })
        })
        .map_err(|err| err.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|err| err.to_string())?;

    let mut stmt_hl = conn
        .prepare("SELECT created_at FROM highlights")
        .map_err(|err| err.to_string())?;
    let highlight_created_at = stmt_hl
        .query_map([], |r| r.get::<_, String>(0))
        .map_err(|err| err.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|err| err.to_string())?;

    Ok(ReadingStatsRawPayload {
        items,
        top_shelves,
        highlight_created_at,
    })
}

#[tauri::command]
pub fn db_get_activity_stats_raw(
    state: tauri::State<'_, DbState>,
    since_iso: Option<String>,
) -> Result<ActivityStatsRawPayload, String> {
    let conn = state.conn.lock().map_err(|_| "Error de concurrencia en base de datos.".to_string())?;
    let cutoff = since_iso.unwrap_or_else(|| "1970-01-01T00:00:00.000Z".to_string());

    let mut stmt_items = conn
        .prepare(
            "SELECT status, created_at, updated_at FROM items
             WHERE created_at >= ?1 OR (status = 'finished' AND updated_at >= ?1)",
        )
        .map_err(|err| err.to_string())?;
    let items = stmt_items
        .query_map(params![cutoff], |r| {
            Ok(ActivityItemRow {
                status: r.get(0)?,
                created_at: r.get(1)?,
                updated_at: r.get(2)?,
            })
        })
        .map_err(|err| err.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|err| err.to_string())?;

    let mut stmt_hl = conn
        .prepare("SELECT created_at FROM highlights WHERE created_at >= ?1")
        .map_err(|err| err.to_string())?;
    let highlight_created_at = stmt_hl
        .query_map(params![cutoff], |r| r.get::<_, String>(0))
        .map_err(|err| err.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|err| err.to_string())?;

    let mut stmt_notes = conn
        .prepare("SELECT created_at FROM notes WHERE created_at >= ?1")
        .map_err(|err| err.to_string())?;
    let note_created_at = stmt_notes
        .query_map(params![cutoff], |r| r.get::<_, String>(0))
        .map_err(|err| err.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|err| err.to_string())?;

    Ok(ActivityStatsRawPayload {
        items,
        highlight_created_at,
        note_created_at,
    })
}

// ============================================================================
// Atomic Sample Seeding & Clearing Commands
// ============================================================================

#[derive(Debug, Clone, Deserialize)]
pub struct SeedSampleItemPayload {
    pub slug: String,
    pub title: String,
    pub author: String,
    #[serde(rename = "type")]
    pub item_type: String,
    pub status: String,
    pub file_format: String,
    pub page_count: i64,
    pub current_page: i64,
    pub notes: String,
    pub opened_at: Option<String>,
    pub shelves: Vec<String>,
    pub tags: Vec<String>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct SeedSampleHighlightPayload {
    pub item_slug: String,
    pub quote_text: String,
    pub note_markdown: String,
    pub page_number: i64,
    pub color: String,
}

#[derive(Debug, Clone, Deserialize)]
pub struct SeedSampleShelfPayload {
    pub key: String,
    pub name: String,
    pub parent_key: Option<String>,
    pub category: String,
    pub sort_order: i64,
}

#[derive(Debug, Clone, Deserialize)]
pub struct SeedSampleTagPayload {
    pub key: String,
    pub name: String,
    pub color: String,
}

#[derive(Debug, Clone, Deserialize)]
pub struct SeedSampleLibraryPayload {
    pub shelves: Vec<SeedSampleShelfPayload>,
    pub tags: Vec<SeedSampleTagPayload>,
    pub items: Vec<SeedSampleItemPayload>,
    pub highlights: Vec<SeedSampleHighlightPayload>,
}

/// Atomically and idempotently seeds the sample library inside a single `BEGIN IMMEDIATE` transaction.
#[tauri::command]
pub fn db_seed_sample_library(
    state: tauri::State<'_, DbState>,
    payload: SeedSampleLibraryPayload,
) -> Result<(), String> {
    let mut conn = state.conn.lock().map_err(|_| "Error de concurrencia en base de datos.".to_string())?;
    let tx = conn
        .transaction_with_behavior(TransactionBehavior::Immediate)
        .map_err(|err| format!("Error iniciando transacción de colección de ejemplo: {err}"))?;

    let existing_sample_count: i64 = tx
        .query_row("SELECT COUNT(*) FROM items WHERE file_path GLOB 'sample/*'", [], |r| r.get(0))
        .unwrap_or(0);
    if existing_sample_count > 0 {
        return Ok(());
    }

    let now = utc_now_iso(&tx)?;
    let mut shelf_id_by_key: HashMap<String, String> = HashMap::new();

    for shelf in &payload.shelves {
        validate_shelf_category(&shelf.category)?;
        let parent_id = shelf
            .parent_key
            .as_ref()
            .and_then(|pk| shelf_id_by_key.get(pk))
            .cloned();

        let existing_id: Option<String> = match &parent_id {
            Some(pid) => tx
                .query_row(
                    "SELECT id FROM shelves WHERE lower(name) = lower(?1) AND parent_id = ?2 LIMIT 1",
                    params![shelf.name, pid],
                    |r| r.get(0),
                )
                .optional()
                .map_err(|err| err.to_string())?,
            None => tx
                .query_row(
                    "SELECT id FROM shelves WHERE lower(name) = lower(?1) AND parent_id IS NULL LIMIT 1",
                    params![shelf.name],
                    |r| r.get(0),
                )
                .optional()
                .map_err(|err| err.to_string())?,
        };

        let resolved_id = match existing_id {
            Some(id) => id,
            None => {
                let id = uuid::Uuid::new_v4().to_string();
                tx.execute(
                    "INSERT INTO shelves (id, name, parent_id, category, sort_order, created_at, updated_at)
                     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
                    params![id, shelf.name, parent_id, shelf.category, shelf.sort_order, now, now],
                )
                .map_err(|err| err.to_string())?;
                id
            }
        };
        shelf_id_by_key.insert(shelf.key.clone(), resolved_id);
    }

    let mut tag_id_by_key: HashMap<String, String> = HashMap::new();
    for tag in &payload.tags {
        validate_hex_color(&tag.color)?;
        let existing_id: Option<String> = tx
            .query_row(
                "SELECT id FROM tags WHERE name = ?1 COLLATE NOCASE LIMIT 1",
                params![tag.name],
                |r| r.get(0),
            )
            .optional()
            .map_err(|err| err.to_string())?;
        let resolved_id = match existing_id {
            Some(id) => id,
            None => {
                let id = uuid::Uuid::new_v4().to_string();
                tx.execute(
                    "INSERT INTO tags (id, name, color, created_at) VALUES (?1, ?2, ?3, ?4)",
                    params![id, tag.name, tag.color, now],
                )
                .map_err(|err| err.to_string())?;
                id
            }
        };
        tag_id_by_key.insert(tag.key.clone(), resolved_id);
    }

    let mut item_id_by_slug: HashMap<String, String> = HashMap::new();
    for spec in &payload.items {
        validate_item_type(&spec.item_type)?;
        validate_item_status(&spec.status)?;
        validate_file_format(&spec.file_format)?;
        let file_path = format!("sample/{}.{}", spec.slug, spec.file_format);
        validate_item_file_path(&file_path)?;

        let item_id = uuid::Uuid::new_v4().to_string();
        tx.execute(
            "INSERT INTO items (
                id, title, author, type, status, file_path, cover_path, file_format,
                file_size, page_count, current_page, is_favorite, notes, last_opened_at,
                created_at, updated_at
             ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, NULL, ?7, 0, ?8, ?9, 0, ?10, ?11, ?12, ?12)",
            params![
                item_id,
                spec.title,
                spec.author,
                spec.item_type,
                spec.status,
                file_path,
                spec.file_format,
                spec.page_count.max(0),
                spec.current_page.max(0),
                spec.notes,
                spec.opened_at,
                now,
            ],
        )
        .map_err(|err| err.to_string())?;

        for sk in &spec.shelves {
            if let Some(shelf_id) = shelf_id_by_key.get(sk) {
                tx.execute(
                    "INSERT INTO item_shelves (item_id, shelf_id) VALUES (?1, ?2)
                     ON CONFLICT(item_id, shelf_id) DO NOTHING",
                    params![item_id, shelf_id],
                )
                .map_err(|err| err.to_string())?;
            }
        }
        for tk in &spec.tags {
            if let Some(tag_id) = tag_id_by_key.get(tk) {
                tx.execute(
                    "INSERT INTO item_tags (item_id, tag_id) VALUES (?1, ?2)
                     ON CONFLICT(item_id, tag_id) DO NOTHING",
                    params![item_id, tag_id],
                )
                .map_err(|err| err.to_string())?;
            }
        }
        item_id_by_slug.insert(spec.slug.clone(), item_id);
    }

    for hl in &payload.highlights {
        validate_highlight_color(&hl.color)?;
        if let Some(item_id) = item_id_by_slug.get(&hl.item_slug) {
            let hl_id = uuid::Uuid::new_v4().to_string();
            tx.execute(
                "INSERT INTO highlights (id, item_id, quote_text, note_markdown, page_number, color, created_at, updated_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?7)",
                params![hl_id, item_id, hl.quote_text, hl.note_markdown, hl.page_number, hl.color, now],
            )
            .map_err(|err| err.to_string())?;
        }
    }

    tx.commit()
        .map_err(|err| format!("Error confirmando colección de ejemplo: {err}"))
}

#[tauri::command]
pub fn db_clear_sample_library(state: tauri::State<'_, DbState>) -> Result<(), String> {
    let conn = state.conn.lock().map_err(|_| "Error de concurrencia en base de datos.".to_string())?;
    // Uses case-sensitive GLOB instead of case-insensitive LIKE.
    conn.execute("DELETE FROM items WHERE file_path GLOB 'sample/*'", [])
        .map_err(|err| format!("Error limpiando colección de ejemplo: {err}"))?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn test_conn() -> Connection {
        let mut conn = Connection::open_in_memory().unwrap();
        configure_and_migrate_connection(&mut conn).unwrap();
        conn
    }

    #[test]
    fn runs_all_five_migrations_and_verifies_pragmas() {
        let conn = test_conn();
        let fk: i64 = conn.query_row("PRAGMA foreign_keys", [], |r| r.get(0)).unwrap();
        let rt: i64 = conn.query_row("PRAGMA recursive_triggers", [], |r| r.get(0)).unwrap();
        assert_eq!(fk, 1);
        assert_eq!(rt, 1);

        let version: String = conn.query_row("SELECT sqlite_version()", [], |r| r.get(0)).unwrap();
        // Verify upgraded SQLite >= 3.54.0 (patches CVE-2025-29087, 6965, 7709, CVE-2026-119375)
        let parts: Vec<u32> = version.split('.').filter_map(|p| p.parse().ok()).collect();
        assert!(parts.len() >= 2 && (parts[0] > 3 || (parts[0] == 3 && parts[1] >= 54)), "SQLite version too old: {version}");
    }

    #[test]
    fn blocks_attach_database_via_authorizer() {
        let conn = test_conn();
        let res = conn.execute("ATTACH DATABASE ':memory:' AS evil", []);
        assert!(res.is_err(), "ATTACH DATABASE must be denied by SQLite authorizer");
    }

    #[test]
    fn schema_triggers_block_path_traversal_and_invalid_fields() {
        let conn = test_conn();
        let res = conn.execute(
            "INSERT INTO items (id, title, file_path, file_format) VALUES ('id1', 'Bad', 'books/../library.db', 'pdf')",
            [],
        );
        assert!(res.is_err(), "Traversal file_path must be rejected by trigger");

        let res_cover = conn.execute(
            "INSERT INTO items (id, title, file_path, cover_path, file_format) VALUES ('id2', 'Bad', 'books/id2.pdf', 'covers/../evil.webp', 'pdf')",
            [],
        );
        assert!(res_cover.is_err(), "Traversal cover_path must be rejected by trigger");

        let res_color = conn.execute(
            "INSERT INTO tags (id, name, color) VALUES ('t1', 'bad', 'red;url(evil)')",
            [],
        );
        assert!(res_color.is_err(), "Non-hex tag color must be rejected by trigger");
    }

    #[test]
    fn shelf_self_parent_and_fk_conflicts_are_enforced() {
        let conn = test_conn();
        conn.execute("INSERT INTO shelves (id, name, category) VALUES ('s1', 'Root', 'custom')", []).unwrap();
        assert!(
            conn.execute("UPDATE shelves SET parent_id = 's1' WHERE id = 's1'", []).is_err(),
            "Self-parent shelf must fail"
        );
        // ON CONFLICT DO NOTHING still rejects missing foreign keys
        assert!(
            conn.execute(
                "INSERT INTO item_shelves (item_id, shelf_id) VALUES ('missing-item', 's1') ON CONFLICT(item_id, shelf_id) DO NOTHING",
                [],
            )
            .is_err(),
            "Missing FK must fail loudly"
        );
    }

    #[test]
    fn fts_smoke_test_runs_cleanly_in_memory() {
        let result = db_run_fts_smoke_test().unwrap();
        assert!(result.ok);
        assert_eq!(result.matched_title.as_deref(), Some("Filosofía Local-First"));
    }
}
