use tauri_plugin_sql::{Migration, MigrationKind};

pub const DB_URL: &str = "sqlite:library.db";

const INITIAL_SCHEMA_SQL: &str = include_str!("../migrations/001_initial_schema.sql");
const ADD_FAVORITES_SQL: &str = include_str!("../migrations/002_add_favorites.sql");

pub fn migrations() -> Vec<Migration> {
    vec![
        Migration {
            version: 1,
            description: "initial_schema_and_fts5",
            sql: INITIAL_SCHEMA_SQL,
            kind: MigrationKind::Up,
        },
        Migration {
            version: 2,
            description: "add_items_favorites",
            sql: ADD_FAVORITES_SQL,
            kind: MigrationKind::Up,
        },
    ]
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn loads_initial_migration_with_expected_schema() {
        let list = migrations();
        assert_eq!(list.len(), 2);
        let first = &list[0];
        assert_eq!(first.version, 1);
        assert!(first.sql.contains("CREATE TABLE IF NOT EXISTS items"));
        assert!(first.sql.contains("CREATE TABLE IF NOT EXISTS shelves"));
        assert!(first.sql.contains("CREATE TABLE IF NOT EXISTS item_shelves"));
        assert!(first.sql.contains("CREATE TABLE IF NOT EXISTS tags"));
        assert!(first.sql.contains("CREATE TABLE IF NOT EXISTS item_tags"));
        assert!(first.sql.contains("CREATE TABLE IF NOT EXISTS highlights"));
        assert!(first.sql.contains("CREATE VIRTUAL TABLE IF NOT EXISTS items_fts USING fts5"));
        assert!(first.sql.contains("CREATE VIRTUAL TABLE IF NOT EXISTS highlights_fts USING fts5"));

        let second = &list[1];
        assert_eq!(second.version, 2);
        assert!(second.sql.contains("is_favorite"));
    }
}
