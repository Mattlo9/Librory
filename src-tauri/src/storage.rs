use crate::validation::{
    ensure_not_symlink, ensure_within_dir, validate_book_relative_path,
    validate_cover_relative_path, validate_epub_magic, validate_external_http_url,
    validate_item_id, validate_pdf_magic, validate_webp_magic,
};
use serde::Serialize;
use std::fs::{self, File, OpenOptions};
use std::io::{Read, Write};
use std::path::Path;
use tauri::Manager;
use tauri_plugin_opener::OpenerExt;

pub const MAX_BOOK_READ_BYTES: u64 = 256 * 1024 * 1024; // 256 MiB
pub const MAX_COVER_WRITE_BYTES: usize = 5 * 1024 * 1024; // 5 MiB

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StorageDiagnostics {
    pub app_data_path: String,
    pub books_path: String,
    pub covers_path: String,
    pub db_expected_path: String,
    pub books_ready: bool,
    pub covers_ready: bool,
}

#[cfg(unix)]
pub fn restrict_dir_permissions(path: &Path) {
    use std::os::unix::fs::PermissionsExt;
    let _ = fs::set_permissions(path, fs::Permissions::from_mode(0o700));
}

#[cfg(not(unix))]
pub fn restrict_dir_permissions(_path: &Path) {}

#[cfg(unix)]
pub fn restrict_file_permissions(path: &Path) {
    use std::os::unix::fs::PermissionsExt;
    let _ = fs::set_permissions(path, fs::Permissions::from_mode(0o600));
}

#[cfg(not(unix))]
pub fn restrict_file_permissions(_path: &Path) {}

pub fn ensure_local_storage(app: &tauri::AppHandle) -> Result<(), Box<dyn std::error::Error>> {
    let app_data = app.path().app_data_dir()?;
    fs::create_dir_all(&app_data)?;
    restrict_dir_permissions(&app_data);

    let books_dir = app_data.join("books");
    fs::create_dir_all(&books_dir)?;
    restrict_dir_permissions(&books_dir);

    let covers_dir = app_data.join("covers");
    fs::create_dir_all(&covers_dir)?;
    restrict_dir_permissions(&covers_dir);

    let app_config = app.path().app_config_dir()?;
    fs::create_dir_all(&app_config)?;
    restrict_dir_permissions(&app_config);

    Ok(())
}

#[tauri::command]
pub async fn ensure_storage_directories(
    app: tauri::AppHandle,
) -> Result<StorageDiagnostics, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let app_data = app
            .path()
            .app_data_dir()
            .map_err(|_| "No se pudo resolver el directorio de datos local.".to_string())?;
        let app_config = app
            .path()
            .app_config_dir()
            .map_err(|_| "No se pudo resolver el directorio de configuración local.".to_string())?;

        let books_dir = app_data.join("books");
        let covers_dir = app_data.join("covers");
        fs::create_dir_all(&books_dir)
            .map_err(|_| "No se pudo crear la carpeta local de libros.".to_string())?;
        fs::create_dir_all(&covers_dir)
            .map_err(|_| "No se pudo crear la carpeta local de portadas.".to_string())?;
        restrict_dir_permissions(&app_data);
        restrict_dir_permissions(&books_dir);
        restrict_dir_permissions(&covers_dir);

        Ok(StorageDiagnostics {
            app_data_path: app_data.to_string_lossy().to_string(),
            books_path: books_dir.to_string_lossy().to_string(),
            covers_path: covers_dir.to_string_lossy().to_string(),
            db_expected_path: app_config.join("library.db").to_string_lossy().to_string(),
            books_ready: books_dir.is_dir(),
            covers_ready: covers_dir.is_dir(),
        })
    })
    .await
    .map_err(|_| "Error interno al verificar almacenamiento local.".to_string())?
}

/// Reads a validated local book file (`books/<id>.(pdf|epub)`) and returns raw binary bytes.
#[tauri::command]
pub async fn read_book_file(
    app: tauri::AppHandle,
    relative_path: String,
) -> Result<tauri::ipc::Response, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let (stem, ext) = validate_book_relative_path(&relative_path)?;
        let app_data = app
            .path()
            .app_data_dir()
            .map_err(|_| "No se pudo resolver el directorio local.".to_string())?;
        let books_dir = app_data.join("books");
        let candidate = books_dir.join(format!("{stem}.{ext}"));

        ensure_not_symlink(&candidate)?;
        let canonical = ensure_within_dir(&books_dir, &candidate)?;
        let meta = fs::symlink_metadata(&canonical)
            .map_err(|_| "No se pudo acceder al libro local.".to_string())?;
        if !meta.is_file() || meta.file_type().is_symlink() {
            return Err("El recurso solicitado no es un archivo regular válido.".to_string());
        }
        if meta.len() > MAX_BOOK_READ_BYTES {
            return Err("El archivo supera el límite máximo permitido para lectura integrada (256 MB).".to_string());
        }

        let file = File::open(&canonical)
            .map_err(|_| "No se pudo abrir el libro local.".to_string())?;
        let mut bytes = Vec::with_capacity(meta.len() as usize);
        file.take(MAX_BOOK_READ_BYTES + 1)
            .read_to_end(&mut bytes)
            .map_err(|_| "Error leyendo el archivo local.".to_string())?;
        if bytes.len() as u64 > MAX_BOOK_READ_BYTES {
            return Err("El archivo supera el límite máximo permitido (256 MB).".to_string());
        }

        Ok(tauri::ipc::Response::new(bytes))
    })
    .await
    .map_err(|_| "Error interno al leer el libro local.".to_string())?
}

/// Validates and stores a WebP cover image under `covers/<item_id>.webp`.
#[tauri::command]
pub async fn write_cover_webp(
    app: tauri::AppHandle,
    item_id: String,
    bytes: Vec<u8>,
) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        validate_item_id(&item_id)?;
        if bytes.is_empty() || bytes.len() > MAX_COVER_WRITE_BYTES {
            return Err("La portada excede el tamaño máximo permitido (5 MB).".to_string());
        }
        if !validate_webp_magic(&bytes) {
            return Err("La portada debe tener formato WebP válido.".to_string());
        }

        let app_data = app
            .path()
            .app_data_dir()
            .map_err(|_| "No se pudo resolver el directorio local.".to_string())?;
        let covers_dir = app_data.join("covers");
        fs::create_dir_all(&covers_dir)
            .map_err(|_| "No se pudo crear la carpeta de portadas.".to_string())?;
        restrict_dir_permissions(&covers_dir);

        let target = covers_dir.join(format!("{item_id}.webp"));
        ensure_not_symlink(&target)?;

        let tmp_name = format!(".tmp_{}_{}.webp", item_id, uuid::Uuid::new_v4());
        let tmp_path = covers_dir.join(tmp_name);
        let write_result = (|| -> Result<(), String> {
            let mut tmp_file = OpenOptions::new()
                .write(true)
                .create_new(true)
                .open(&tmp_path)
                .map_err(|_| "No se pudo crear el archivo temporal de portada.".to_string())?;
            tmp_file
                .write_all(&bytes)
                .map_err(|_| "No se pudo escribir la portada.".to_string())?;
            tmp_file
                .sync_all()
                .map_err(|_| "No se pudo sincronizar la portada en disco.".to_string())?;
            restrict_file_permissions(&tmp_path);

            ensure_not_symlink(&target)?;
            if target.exists() {
                fs::remove_file(&target)
                    .map_err(|_| "No se pudo reemplazar la portada anterior.".to_string())?;
            }
            fs::rename(&tmp_path, &target)
                .map_err(|_| "No se pudo guardar la portada en la biblioteca.".to_string())?;
            Ok(())
        })();

        if write_result.is_err() {
            let _ = fs::remove_file(&tmp_path);
        }
        write_result?;

        Ok(format!("covers/{item_id}.webp"))
    })
    .await
    .map_err(|_| "Error interno al guardar la portada.".to_string())?
}

/// Removes a validated file strictly inside `books/` or `covers/`.
#[tauri::command]
pub async fn remove_stored_file(
    app: tauri::AppHandle,
    relative_path: String,
) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        let app_data = app
            .path()
            .app_data_dir()
            .map_err(|_| "No se pudo resolver el directorio local.".to_string())?;

        let (subdir, filename) = if let Ok((stem, ext)) = validate_book_relative_path(&relative_path) {
            (app_data.join("books"), format!("{stem}.{ext}"))
        } else if let Ok(stem) = validate_cover_relative_path(&relative_path) {
            (app_data.join("covers"), format!("{stem}.webp"))
        } else {
            return Err("Ruta de almacenamiento no autorizada para eliminación.".to_string());
        };

        let candidate = subdir.join(filename);
        if !candidate.exists() {
            return Ok(());
        }
        ensure_not_symlink(&candidate)?;
        let canonical = ensure_within_dir(&subdir, &candidate)?;
        let _ = fs::remove_file(canonical);
        Ok(())
    })
    .await
    .map_err(|_| "Error interno al eliminar el archivo local.".to_string())?
}

/// Opens a validated local PDF or EPUB in the OS default viewer after re-checking magic bytes.
#[tauri::command]
pub async fn open_stored_book(
    app: tauri::AppHandle,
    relative_path: String,
) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        let (stem, ext) = validate_book_relative_path(&relative_path)?;
        let app_data = app
            .path()
            .app_data_dir()
            .map_err(|_| "No se pudo resolver el directorio local.".to_string())?;
        let books_dir = app_data.join("books");
        let candidate = books_dir.join(format!("{stem}.{ext}"));

        ensure_not_symlink(&candidate)?;
        let canonical = ensure_within_dir(&books_dir, &candidate)?;
        let meta = fs::symlink_metadata(&canonical)
            .map_err(|_| "No se encontró el archivo del libro.".to_string())?;
        if !meta.is_file() || meta.file_type().is_symlink() {
            return Err("La ruta del libro no corresponde a un archivo válido.".to_string());
        }

        // Re-verify magic bytes before delegating to OS shell handler (defense-in-depth against RCE).
        let mut header = [0u8; 1024];
        let mut file = File::open(&canonical)
            .map_err(|_| "No se pudo leer el archivo del libro.".to_string())?;
        let n = file
            .read(&mut header)
            .map_err(|_| "No se pudo validar el archivo del libro.".to_string())?;
        let valid_magic = match ext {
            "pdf" => validate_pdf_magic(&header[..n]),
            "epub" => validate_epub_magic(&header[..n]),
            _ => false,
        };
        if !valid_magic {
            return Err("El archivo almacenado no coincide con la firma de formato esperada.".to_string());
        }

        app.opener()
            .open_path(canonical.to_string_lossy().as_ref(), None::<&str>)
            .map_err(|_| "No se pudo abrir el libro en la aplicación externa.".to_string())
    })
    .await
    .map_err(|_| "Error interno al abrir el libro externamente.".to_string())?
}

/// Reveals a validated local PDF or EPUB file in the system file explorer.
#[tauri::command]
pub async fn reveal_stored_book(
    app: tauri::AppHandle,
    relative_path: String,
) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        let (stem, ext) = validate_book_relative_path(&relative_path)?;
        let app_data = app
            .path()
            .app_data_dir()
            .map_err(|_| "No se pudo resolver el directorio local.".to_string())?;
        let books_dir = app_data.join("books");
        let candidate = books_dir.join(format!("{stem}.{ext}"));

        ensure_not_symlink(&candidate)?;
        let canonical = ensure_within_dir(&books_dir, &candidate)?;

        app.opener()
            .reveal_item_in_dir(canonical)
            .map_err(|_| "No se pudo mostrar el archivo en el explorador.".to_string())
    })
    .await
    .map_err(|_| "Error interno al revelar el archivo.".to_string())?
}

/// Opens a validated external `http://` or `https://` URL in the OS default browser.
#[tauri::command]
pub async fn open_external_url(app: tauri::AppHandle, url: String) -> Result<(), String> {
    let parsed = validate_external_http_url(&url)?;
    app.opener()
        .open_url(parsed.as_str(), None::<&str>)
        .map_err(|_| "No se pudo abrir el enlace en el navegador.".to_string())
}
