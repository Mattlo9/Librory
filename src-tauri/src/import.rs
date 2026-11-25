use crate::storage::{restrict_dir_permissions, restrict_file_permissions};
use crate::validation::{
    ensure_not_symlink, reject_unsafe_os_path, validate_epub_magic, validate_item_id,
    validate_pdf_magic,
};
use serde::Serialize;
use sha2::{Digest, Sha256};
use std::collections::HashSet;
use std::fs::{self, File, OpenOptions};
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use tauri::Manager;
use tauri_plugin_dialog::DialogExt;

const IO_BUFFER_SIZE: usize = 64 * 1024;
const MAX_IMPORT_FILE_BYTES: u64 = 256 * 1024 * 1024; // 256 MiB
const MAX_APPROVED_PATHS: usize = 1000;

/// Tracks filesystem paths explicitly selected by the user via native file dialogs or OS drag-and-drop.
#[derive(Default)]
pub struct ApprovedImportPaths {
    paths: Mutex<HashSet<PathBuf>>,
}

impl ApprovedImportPaths {
    pub fn approve_paths<I: IntoIterator<Item = PathBuf>>(&self, incoming: I) {
        let Ok(mut guard) = self.paths.lock() else {
            return;
        };
        if guard.len() > MAX_APPROVED_PATHS {
            guard.clear();
        }
        for path in incoming {
            if reject_unsafe_os_path(&path).is_err() {
                continue;
            }
            if detect_supported_format(&path).is_err() {
                continue;
            }
            if ensure_not_symlink(&path).is_err() {
                continue;
            }
            if let Ok(canonical) = fs::canonicalize(&path) {
                guard.insert(canonical);
            }
        }
    }

    fn consume_if_approved(&self, path: &Path) -> Result<PathBuf, String> {
        let canonical = fs::canonicalize(path)
            .map_err(|_| "No se pudo acceder al archivo seleccionado.".to_string())?;
        let mut guard = self
            .paths
            .lock()
            .map_err(|_| "Error interno al verificar permisos de importación.".to_string())?;
        if guard.remove(&canonical) {
            Ok(canonical)
        } else {
            Err("Solo se pueden importar archivos seleccionados explícitamente por el usuario.".to_string())
        }
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportedFileReport {
    pub status: String,
    pub item_id: String,
    pub file_path: String,
    pub file_format: String,
    pub file_size: u64,
    pub file_hash: String,
    pub original_filename: String,
}

pub fn detect_supported_format(path: &Path) -> Result<&'static str, String> {
    let ext = path
        .extension()
        .and_then(|value| value.to_str())
        .map(|value| value.to_ascii_lowercase());

    match ext.as_deref() {
        Some("pdf") => Ok("pdf"),
        Some("epub") => Ok("epub"),
        _ => Err("Formato no soportado. Solo se admiten archivos PDF o EPUB.".to_string()),
    }
}

/// Streams a single open file handle into a newly created destination file while validating magic
/// bytes, enforcing size caps, and computing SHA-256 in one pass (eliminating TOCTOU races).
fn stream_validate_and_hash_to_file(
    source_path: &Path,
    format: &str,
    temp_dest: &Path,
) -> Result<(String, u64), String> {
    ensure_not_symlink(source_path)?;

    let mut source_file = File::open(source_path)
        .map_err(|_| "No se pudo abrir el archivo origen.".to_string())?;
    let meta = source_file
        .metadata()
        .map_err(|_| "No se pudo inspeccionar el archivo origen.".to_string())?;
    if !meta.is_file() {
        return Err("La ruta seleccionada no corresponde a un archivo regular.".to_string());
    }
    if meta.len() == 0 {
        return Err("El archivo seleccionado está vacío.".to_string());
    }
    if meta.len() > MAX_IMPORT_FILE_BYTES {
        return Err("El archivo supera el tamaño máximo permitido de 256 MB.".to_string());
    }

    let mut dest_file = OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(temp_dest)
        .map_err(|_| "No se pudo crear el archivo destino en la biblioteca local.".to_string())?;

    let mut hasher = Sha256::new();
    let mut buffer = [0u8; IO_BUFFER_SIZE];
    let mut header_probe = Vec::with_capacity(1024);
    let mut header_checked = false;
    let mut total_size: u64 = 0;

    loop {
        let bytes_read = source_file
            .read(&mut buffer)
            .map_err(|_| "Error leyendo el archivo origen.".to_string())?;
        if bytes_read == 0 {
            break;
        }

        total_size = total_size
            .checked_add(bytes_read as u64)
            .ok_or_else(|| "El tamaño del archivo supera el límite soportado.".to_string())?;
        if total_size > MAX_IMPORT_FILE_BYTES {
            return Err("El archivo supera el tamaño máximo permitido de 256 MB.".to_string());
        }

        let chunk = &buffer[..bytes_read];
        if !header_checked {
            let needed = 1024usize.saturating_sub(header_probe.len());
            let take = needed.min(chunk.len());
            header_probe.extend_from_slice(&chunk[..take]);
            if header_probe.len() >= 1024 {
                check_magic_header(&header_probe, format)?;
                header_checked = true;
            }
        }

        hasher.update(chunk);
        dest_file
            .write_all(chunk)
            .map_err(|_| "Error escribiendo el archivo en la biblioteca local.".to_string())?;
    }

    if total_size == 0 {
        return Err("El archivo seleccionado está vacío.".to_string());
    }
    if !header_checked {
        check_magic_header(&header_probe, format)?;
    }

    dest_file
        .sync_all()
        .map_err(|_| "No se pudo confirmar la escritura del archivo importado.".to_string())?;
    restrict_file_permissions(temp_dest);

    let hash_hex = hex::encode(hasher.finalize());
    Ok((hash_hex, total_size))
}

fn check_magic_header(header: &[u8], format: &str) -> Result<(), String> {
    let valid = match format {
        "pdf" => validate_pdf_magic(header),
        "epub" => validate_epub_magic(header),
        _ => false,
    };
    if valid {
        Ok(())
    } else {
        Err(format!(
            "El contenido del archivo no corresponde a un documento {} válido.",
            format.to_ascii_uppercase()
        ))
    }
}

/// Opens a native OS file picker inside Rust and registers the chosen paths in `ApprovedImportPaths`.
#[tauri::command]
pub async fn pick_importable_files(
    app: tauri::AppHandle,
    approved: tauri::State<'_, ApprovedImportPaths>,
) -> Result<Vec<String>, String> {
    let picked = tauri::async_runtime::spawn_blocking(move || {
        app.dialog()
            .file()
            .set_title("Importar libros y documentos")
            .add_filter("Documentos (PDF, EPUB)", &["pdf", "epub"])
            .blocking_pick_files()
    })
    .await
    .map_err(|_| "No se pudo abrir el selector de archivos.".to_string())?;

    let Some(files) = picked else {
        return Ok(Vec::new());
    };

    let mut resolved = Vec::new();
    let mut approved_bufs = Vec::new();
    for file_path in files {
        if let Ok(path_buf) = file_path.into_path() {
            if reject_unsafe_os_path(&path_buf).is_ok()
                && detect_supported_format(&path_buf).is_ok()
                && ensure_not_symlink(&path_buf).is_ok()
                && fs::canonicalize(&path_buf).is_ok()
            {
                resolved.push(path_buf.to_string_lossy().to_string());
                approved_bufs.push(path_buf);
            }
        }
    }

    approved.approve_paths(approved_bufs);
    Ok(resolved)
}

#[tauri::command]
pub async fn import_book_file(
    app: tauri::AppHandle,
    approved: tauri::State<'_, ApprovedImportPaths>,
    source_path: String,
    item_id: String,
    known_hashes: Vec<String>,
) -> Result<ImportedFileReport, String> {
    validate_item_id(&item_id)?;

    let raw_source = PathBuf::from(&source_path);
    reject_unsafe_os_path(&raw_source)?;
    // Validate supported extension before probing disk to prevent filesystem existence oracles.
    let format = detect_supported_format(&raw_source)?;

    // Require user approval from native picker or OS drag-and-drop event.
    let canonical_source = approved.consume_if_approved(&raw_source)?;

    tauri::async_runtime::spawn_blocking(move || {
        let original_filename = canonical_source
            .file_name()
            .and_then(|value| value.to_str())
            .unwrap_or("documento")
            .to_string();

        let app_data = app
            .path()
            .app_data_dir()
            .map_err(|_| "No se pudo resolver el directorio local.".to_string())?;
        let books_dir = app_data.join("books");
        fs::create_dir_all(&books_dir)
            .map_err(|_| "No se pudo crear la carpeta local de libros.".to_string())?;
        restrict_dir_permissions(&books_dir);

        let target_filename = format!("{item_id}.{format}");
        let target_path = books_dir.join(&target_filename);
        if target_path.exists() {
            return Err("Ya existe un recurso con el mismo identificador.".to_string());
        }
        ensure_not_symlink(&target_path)?;

        let temp_path = books_dir.join(format!(".import_{}_{}.{format}", item_id, uuid::Uuid::new_v4()));
        let stream_result = stream_validate_and_hash_to_file(&canonical_source, format, &temp_path);

        let (file_hash, file_size) = match stream_result {
            Ok(pair) => pair,
            Err(err) => {
                let _ = fs::remove_file(&temp_path);
                return Err(err);
            }
        };

        let known_set: HashSet<String> = known_hashes.into_iter().collect();
        if known_set.contains(&file_hash) {
            let _ = fs::remove_file(&temp_path);
            return Ok(ImportedFileReport {
                status: "duplicate".to_string(),
                item_id,
                file_path: String::new(),
                file_format: format.to_string(),
                file_size,
                file_hash,
                original_filename,
            });
        }

        // Publish atomically without overwriting an existing destination file.
        if let Err(_) = fs::hard_link(&temp_path, &target_path) {
            let _ = fs::remove_file(&temp_path);
            return Err("No se pudo finalizar la importación del archivo.".to_string());
        }
        let _ = fs::remove_file(&temp_path);

        Ok(ImportedFileReport {
            status: "imported".to_string(),
            item_id,
            file_path: format!("books/{target_filename}"),
            file_format: format.to_string(),
            file_size,
            file_hash,
            original_filename,
        })
    })
    .await
    .map_err(|_| "Error interno durante la importación.".to_string())?
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn validates_safe_item_ids_and_rejects_reserved_names() {
        assert!(validate_item_id("550e8400-e29b-41d4-a716-446655440000").is_ok());
        assert!(validate_item_id("item_123").is_ok());
        assert!(validate_item_id("").is_err());
        assert!(validate_item_id("../escape").is_err());
        assert!(validate_item_id("bad/path").is_err());
        assert!(validate_item_id("bad\\path").is_err());
        assert!(validate_item_id("CON").is_err());
        assert!(validate_item_id("nul").is_err());
    }

    #[test]
    fn detects_only_pdf_and_epub() {
        assert_eq!(detect_supported_format(Path::new("book.pdf")).unwrap(), "pdf");
        assert_eq!(detect_supported_format(Path::new("BOOK.PDF")).unwrap(), "pdf");
        assert_eq!(detect_supported_format(Path::new("novel.epub")).unwrap(), "epub");
        assert!(detect_supported_format(Path::new("notes.txt")).is_err());
        assert!(detect_supported_format(Path::new("no_extension")).is_err());
    }

    #[test]
    fn streams_hashes_and_rejects_spoofed_magic_bytes() {
        let dir = std::env::temp_dir().join(format!("librory_import_test_{}", uuid::Uuid::new_v4()));
        fs::create_dir_all(&dir).unwrap();

        let valid_pdf = dir.join("valid.pdf");
        let spoofed_pdf = dir.join("spoofed.pdf");
        let dest_ok = dir.join("out_ok.pdf");
        let dest_bad = dir.join("out_bad.pdf");

        fs::write(&valid_pdf, b"%PDF-1.7\nlibrory-local-first").unwrap();
        fs::write(&spoofed_pdf, b"MZ\x90\x00not-a-pdf").unwrap();

        let (hash, size) = stream_validate_and_hash_to_file(&valid_pdf, "pdf", &dest_ok).unwrap();
        assert_eq!(size, 28);
        assert_eq!(hash.len(), 64);
        assert_eq!(fs::read(&dest_ok).unwrap(), b"%PDF-1.7\nlibrory-local-first");

        let err = stream_validate_and_hash_to_file(&spoofed_pdf, "pdf", &dest_bad);
        assert!(err.is_err());

        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn enforces_approved_import_allowlist() {
        let dir = std::env::temp_dir().join(format!("librory_allowlist_test_{}", uuid::Uuid::new_v4()));
        fs::create_dir_all(&dir).unwrap();
        let file = dir.join("doc.pdf");
        fs::write(&file, b"%PDF-1.4\n").unwrap();

        let state = ApprovedImportPaths::default();
        assert!(state.consume_if_approved(&file).is_err());

        state.approve_paths([file.clone()]);
        // Must still pass `reject_unsafe_os_path` before consuming (Windows picker flow).
        assert!(reject_unsafe_os_path(&file).is_ok());
        assert!(state.consume_if_approved(&file).is_ok());
        // Single-use consumption prevents replay
        assert!(state.consume_if_approved(&file).is_err());

        let _ = fs::remove_dir_all(&dir);
    }
}
