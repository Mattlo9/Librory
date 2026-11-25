mod db;
mod export;
mod import;
mod storage;
mod validation;

use tauri::{DragDropEvent, Manager, WindowEvent};
use url::Url;

/// Allows navigation ONLY to the bundled local Tauri origin (plus Vite dev origin in debug builds)
/// and `about:blank` (used by PDF print framing), blocking arbitrary external WebView hijacks.
fn is_allowed_webview_url(url: &Url) -> bool {
    match url.scheme() {
        "tauri" => url.host_str() == Some("localhost"),
        "http" | "https" => {
            let host = url.host_str().unwrap_or_default();
            if host == "tauri.localhost" {
                return true;
            }
            if cfg!(debug_assertions)
                && (host == "localhost" || host == "127.0.0.1")
                && url.port() == Some(1420)
            {
                return true;
            }
            false
        }
        "about" => url.as_str() == "about:blank",
        _ => false,
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let nav_guard = tauri::plugin::Builder::<tauri::Wry, ()>::new("librory-nav-guard")
        .on_navigation(|_webview, url| is_allowed_webview_url(url))
        .build();

    tauri::Builder::default()
        .plugin(nav_guard)
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .manage(import::ApprovedImportPaths::default())
        .on_window_event(|window, event| {
            if let WindowEvent::DragDrop(DragDropEvent::Drop { paths, .. }) = event {
                let approved = window.app_handle().state::<import::ApprovedImportPaths>();
                approved.approve_paths(paths.clone());
            }
        })
        .invoke_handler(tauri::generate_handler![
            // Storage & safe opener commands
            storage::ensure_storage_directories,
            storage::read_book_file,
            storage::write_cover_webp,
            storage::remove_stored_file,
            storage::open_stored_book,
            storage::reveal_stored_book,
            storage::open_external_url,
            // Hardened import & export commands (dialogs executed inside Rust)
            import::pick_importable_files,
            import::import_book_file,
            export::export_markdown_file,
            export::export_obsidian_vault,
            // Typed, parameterized, transactional SQLite commands
            db::db_check_health,
            db::db_run_fts_smoke_test,
            db::db_list_items,
            db::db_list_items_with_relations,
            db::db_get_item_by_id,
            db::db_get_item_with_relations_by_id,
            db::db_create_item,
            db::db_update_item,
            db::db_delete_item,
            db::db_bulk_update_items_status,
            db::db_get_items_file_paths_by_ids,
            db::db_bulk_delete_items,
            db::db_save_reading_progress,
            db::db_search_items_fts,
            db::db_get_item_counts_by_type,
            db::db_get_item_counts_by_status,
            db::db_get_navigation_counts,
            db::db_has_sample_items,
            db::db_list_all_file_hashes,
            db::db_list_shelves_with_counts,
            db::db_create_shelf,
            db::db_update_shelf,
            db::db_delete_shelf,
            db::db_assign_item_to_shelf,
            db::db_remove_item_from_shelf,
            db::db_bulk_assign_items_to_shelf,
            db::db_bulk_remove_items_from_shelf,
            db::db_list_tags_with_counts,
            db::db_create_tag,
            db::db_update_tag,
            db::db_delete_tag,
            db::db_assign_tag_to_item,
            db::db_remove_tag_from_item,
            db::db_get_highlight_by_id,
            db::db_list_highlights_with_items,
            db::db_list_highlights_by_item,
            db::db_create_highlight,
            db::db_update_highlight,
            db::db_search_highlights_fts,
            db::db_delete_highlight,
            db::db_list_notes_with_items,
            db::db_get_note_by_id,
            db::db_search_notes_fts,
            db::db_create_note,
            db::db_update_note,
            db::db_delete_note,
            db::db_create_study_session,
            db::db_list_pomodoro_book_options,
            db::db_list_focus_sessions,
            db::db_get_reading_stats_raw,
            db::db_get_activity_stats_raw,
            db::db_seed_sample_library,
            db::db_clear_sample_library,
        ])
        .setup(|app| {
            storage::ensure_local_storage(app.handle())?;
            let db_state = db::init_db(app.handle())?;
            app.manage(db_state);
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running Librory application");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn navigation_guard_allows_only_local_app_origins() {
        assert!(is_allowed_webview_url(&Url::parse("tauri://localhost/").unwrap()));
        assert!(is_allowed_webview_url(&Url::parse("http://tauri.localhost/index.html").unwrap()));
        assert!(is_allowed_webview_url(&Url::parse("https://tauri.localhost/").unwrap()));
        assert!(is_allowed_webview_url(&Url::parse("about:blank").unwrap()));

        assert!(!is_allowed_webview_url(&Url::parse("https://evil.example/phish").unwrap()));
        assert!(!is_allowed_webview_url(&Url::parse("file:///C:/Windows/win.ini").unwrap()));
        assert!(!is_allowed_webview_url(&Url::parse("javascript:alert(1)").unwrap()));
        assert!(!is_allowed_webview_url(&Url::parse("data:text/html,<h1>hi</h1>").unwrap()));
    }

    #[test]
    fn tauri_security_config_preserves_pdf_viewer_compatibility() {
        let conf: serde_json::Value =
            serde_json::from_str(include_str!("../tauri.conf.json")).expect("valid tauri.conf.json");
        let security = &conf["app"]["security"];
        // `@embedpdf/viewer` bundles Preact, whose VNode cloning throws TypeError if Object.prototype is frozen.
        assert_eq!(security["freezePrototype"], serde_json::Value::Bool(false));
        let csp = security["csp"].as_str().expect("csp string");
        assert!(csp.contains("worker-src 'self' blob:"));
        assert!(csp.contains("'wasm-unsafe-eval'"));
    }
}
