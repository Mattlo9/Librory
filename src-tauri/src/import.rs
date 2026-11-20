use serde::Serialize;
use sha2::{Digest, Sha256};
use std::collections::HashSet;
use std::fs::{self, File};
use std::io::Read;
use std::path::Path;
use tauri::Manager;

const HASH_BUFFER_SIZE: usize = 64 * 1024;

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

fn validate_item_id(item_id: &str) -> Result<(), String> {
    if item_id.is_empty() || item_id.len() > 80 {
        return Err("Identificador de recurso inválido.".to_string());
    }
    if !item_id
        .chars()
        .all(|ch| ch.is_ascii_alphanumeric() || ch == '-' || ch == '_')
    {
        return Err("El identificador contiene caracteres no permitidos.".to_string());
    }
    Ok(())
}

fn detect_supported_format(path: &Path) -> Result<&'static str, String> {
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

fn compute_sha256_and_size(path: &Path) -> Result<(String, u64), String> {
    let mut file = File::open(path)
        .map_err(|err| format!("No se pudo abrir el archivo origen: {err}"))?;
    let mut hasher = Sha256::new();
    let mut buffer = [0u8; HASH_BUFFER_SIZE];
    let mut total_size: u64 = 0;

    loop {
        let bytes_read = file
            .read(&mut buffer)
            .map_err(|err| format!("Error leyendo el archivo origen: {err}"))?;
        if bytes_read == 0 {
            break;
        }
        hasher.update(&buffer[..bytes_read]);
        total_size += bytes_read as u64;
    }

    let hash_hex = hex::encode(hasher.finalize());
    Ok((hash_hex, total_size))
}

#[tauri::command]
pub fn import_book_file(
    app: tauri::AppHandle,
    source_path: String,
    item_id: String,
    known_hashes: Vec<String>,
) -> Result<ImportedFileReport, String> {
    validate_item_id(&item_id)?;

    let source = Path::new(&source_path);
    let metadata = fs::metadata(source)
        .map_err(|err| format!("No se pudo acceder al archivo '{source_path}': {err}"))?;
    if !metadata.is_file() {
        return Err("La ruta seleccionada no corresponde a un archivo.".to_string());
    }

    let format = detect_supported_format(source)?;
    let original_filename = source
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or("documento")
        .to_string();

    let (file_hash, file_size) = compute_sha256_and_size(source)?;
    let known_set: HashSet<String> = known_hashes.into_iter().collect();

    if known_set.contains(&file_hash) {
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

    let app_data = app
        .path()
        .app_data_dir()
        .map_err(|err| format!("No se pudo resolver app_data_dir: {err}"))?;
    let books_dir = app_data.join("books");
    fs::create_dir_all(&books_dir)
        .map_err(|err| format!("No se pudo crear la carpeta /books: {err}"))?;

    let target_filename = format!("{item_id}.{format}");
    let target_path = books_dir.join(&target_filename);

    fs::copy(source, &target_path)
        .map_err(|err| format!("No se pudo copiar el archivo a la biblioteca local: {err}"))?;

    Ok(ImportedFileReport {
        status: "imported".to_string(),
        item_id,
        file_path: format!("books/{target_filename}"),
        file_format: format.to_string(),
        file_size,
        file_hash,
        original_filename,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn validates_safe_item_ids() {
        assert!(validate_item_id("550e8400-e29b-41d4-a716-446655440000").is_ok());
        assert!(validate_item_id("item_123").is_ok());
        assert!(validate_item_id("").is_err());
        assert!(validate_item_id("../escape").is_err());
        assert!(validate_item_id("bad/path").is_err());
        assert!(validate_item_id("bad\\path").is_err());
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
    fn computes_deterministic_sha256() {
        let temp_path = std::env::temp_dir().join("librory_sha256_test.bin");
        fs::write(&temp_path, b"librory-local-first").unwrap();
        let (hash, size) = compute_sha256_and_size(&temp_path).unwrap();
        let _ = fs::remove_file(&temp_path);

        assert_eq!(size, 19);
        assert_eq!(hash.len(), 64);
    }
}
