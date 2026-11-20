mod db;

use std::fs;
use tauri::Manager;

fn ensure_local_storage(app: &tauri::AppHandle) -> Result<(), Box<dyn std::error::Error>> {
    let app_data = app.path().app_data_dir()?;
    fs::create_dir_all(app_data.join("books"))?;
    fs::create_dir_all(app_data.join("covers"))?;

    let app_config = app.path().app_config_dir()?;
    fs::create_dir_all(app_config)?;

    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(
            tauri_plugin_sql::Builder::default()
                .add_migrations(db::DB_URL, db::migrations())
                .build(),
        )
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            ensure_local_storage(app.handle())?;
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running Librory application");
}
