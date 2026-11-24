use std::fs;
use std::net::IpAddr;
use std::path::{Component, Path, PathBuf, Prefix};
use url::Url;

pub const MAX_ITEM_ID_LEN: usize = 80;
pub const MAX_FTS_QUERY_CHARS: usize = 256;
pub const MAX_FTS_TOKENS: usize = 12;
pub const MAX_NOTE_FOLDER_DEPTH: usize = 8;
pub const MAX_NOTE_FOLDER_SEGMENT_CHARS: usize = 80;

/// Checks whether a filename or directory stem matches a Windows reserved DOS device name.
pub fn is_windows_reserved_name(name: &str) -> bool {
    let stem = name.split('.').next().unwrap_or(name).trim();
    if stem.is_empty() {
        return false;
    }
    matches!(
        stem.to_ascii_uppercase().as_str(),
        "CON"
            | "PRN"
            | "AUX"
            | "NUL"
            | "COM1"
            | "COM2"
            | "COM3"
            | "COM4"
            | "COM5"
            | "COM6"
            | "COM7"
            | "COM8"
            | "COM9"
            | "LPT1"
            | "LPT2"
            | "LPT3"
            | "LPT4"
            | "LPT5"
            | "LPT6"
            | "LPT7"
            | "LPT8"
            | "LPT9"
    )
}

pub fn validate_item_id(item_id: &str) -> Result<(), String> {
    if item_id.is_empty() || item_id.len() > MAX_ITEM_ID_LEN {
        return Err("Identificador de recurso inválido.".to_string());
    }
    if !item_id
        .chars()
        .all(|ch| ch.is_ascii_alphanumeric() || ch == '-' || ch == '_')
    {
        return Err("El identificador contiene caracteres no permitidos.".to_string());
    }
    if is_windows_reserved_name(item_id) {
        return Err("El identificador utiliza un nombre reservado del sistema.".to_string());
    }
    Ok(())
}

/// Validates a stored book relative path (`books/<safe_id>.(pdf|epub)`).
/// Returns `(item_id, extension)` when valid.
pub fn validate_book_relative_path(relative_path: &str) -> Result<(&str, &str), String> {
    if relative_path.contains('\0') || relative_path.contains('\\') || relative_path.contains("..") {
        return Err("Ruta de libro inválida.".to_string());
    }
    let Some(filename) = relative_path.strip_prefix("books/") else {
        return Err("La ruta del libro debe permanecer dentro de books/.".to_string());
    };
    if filename.contains('/') {
        return Err("La ruta del libro no puede contener subdirectorios.".to_string());
    }
    let Some((stem, ext)) = filename.rsplit_once('.') else {
        return Err("Extensión de libro inválida.".to_string());
    };
    if ext != "pdf" && ext != "epub" {
        return Err("Solo se admiten archivos locales PDF o EPUB.".to_string());
    }
    validate_item_id(stem)?;
    Ok((stem, ext))
}

/// Validates a stored cover relative path (`covers/<safe_id>.webp`).
pub fn validate_cover_relative_path(relative_path: &str) -> Result<&str, String> {
    if relative_path.contains('\0') || relative_path.contains('\\') || relative_path.contains("..") {
        return Err("Ruta de portada inválida.".to_string());
    }
    let Some(filename) = relative_path.strip_prefix("covers/") else {
        return Err("La ruta de portada debe permanecer dentro de covers/.".to_string());
    };
    if filename.contains('/') {
        return Err("La ruta de portada no puede contener subdirectorios.".to_string());
    }
    let Some(stem) = filename.strip_suffix(".webp") else {
        return Err("La portada debe tener formato .webp.".to_string());
    };
    validate_item_id(stem)?;
    Ok(stem)
}

/// Validates `items.file_path` persisted in SQLite (`books/<id>.(pdf|epub)` or `sample/<slug>.(pdf|epub)`).
pub fn validate_item_file_path(relative_path: &str) -> Result<(), String> {
    if validate_book_relative_path(relative_path).is_ok() {
        return Ok(());
    }
    if relative_path.contains('\0') || relative_path.contains('\\') || relative_path.contains("..") {
        return Err("Ruta de recurso inválida.".to_string());
    }
    let Some(filename) = relative_path.strip_prefix("sample/") else {
        return Err("La ruta del recurso debe pertenecer a books/ o sample/.".to_string());
    };
    if filename.contains('/') {
        return Err("La ruta de muestra no puede contener subdirectorios.".to_string());
    }
    let Some((stem, ext)) = filename.rsplit_once('.') else {
        return Err("Extensión de recurso inválida.".to_string());
    };
    if ext != "pdf" && ext != "epub" {
        return Err("Solo se admiten archivos PDF o EPUB.".to_string());
    }
    validate_item_id(stem)
}

/// Rejects UNC network shares, device namespaces, NUL bytes, and NTFS Alternate Data Streams.
pub fn reject_unsafe_os_path(path: &Path) -> Result<(), String> {
    let raw = path.to_string_lossy();
    if raw.is_empty() || raw.contains('\0') {
        return Err("La ruta proporcionada no es válida.".to_string());
    }

    if raw.starts_with(r"\\") || raw.starts_with("//") {
        return Err("No se permiten rutas de red UNC o de dispositivo.".to_string());
    }

    for component in path.components() {
        if let Component::Prefix(prefix_component) = component {
            match prefix_component.kind() {
                Prefix::Disk(_) | Prefix::VerbatimDisk(_) => {}
                Prefix::UNC(_, _)
                | Prefix::VerbatimUNC(_, _)
                | Prefix::DeviceNS(_)
                | Prefix::Verbatim(_) => {
                    return Err("No se permiten rutas UNC ni espacios de dispositivo.".to_string());
                }
            }
        } else if let Component::Normal(segment) = component {
            let seg_str = segment.to_string_lossy();
            // Reject NTFS Alternate Data Streams (e.g., "note.txt:.md")
            if seg_str.contains(':') {
                return Err("La ruta contiene caracteres de flujo alternativo no permitidos.".to_string());
            }
        }
    }

    Ok(())
}

/// Rejects symlinks/reparse points when the path already exists.
pub fn ensure_not_symlink(path: &Path) -> Result<(), String> {
    match fs::symlink_metadata(path) {
        Ok(meta) => {
            if meta.file_type().is_symlink() {
                return Err("No se permiten enlaces simbólicos en esta operación.".to_string());
            }
            Ok(())
        }
        Err(err) if err.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(_) => Err("No se pudo verificar la ruta del archivo.".to_string()),
    }
}

/// Canonicalizes both `root` and `candidate` and verifies component-wise containment.
pub fn ensure_within_dir(root: &Path, candidate: &Path) -> Result<PathBuf, String> {
    let canonical_root = fs::canonicalize(root)
        .map_err(|_| "No se pudo resolver el directorio raíz autorizado.".to_string())?;
    let canonical_candidate = fs::canonicalize(candidate)
        .map_err(|_| "No se pudo resolver la ruta solicitada.".to_string())?;

    if !canonical_candidate.starts_with(&canonical_root) {
        return Err("La ruta solicitada escapa del directorio permitido.".to_string());
    }

    Ok(canonical_candidate)
}

/// Verifies PDF header magic bytes (`%PDF-`) within the initial 1024 bytes.
pub fn validate_pdf_magic(header: &[u8]) -> bool {
    let window = &header[..header.len().min(1024)];
    window.windows(5).any(|w| w == b"%PDF-")
}

/// Verifies ZIP local file header magic bytes (`PK\x03\x04`) required by EPUB archives.
pub fn validate_epub_magic(header: &[u8]) -> bool {
    header.len() >= 4 && &header[..4] == b"PK\x03\x04"
}

/// Verifies WebP RIFF container magic bytes (`RIFF....WEBP`).
pub fn validate_webp_magic(bytes: &[u8]) -> bool {
    bytes.len() >= 12 && &bytes[0..4] == b"RIFF" && &bytes[8..12] == b"WEBP"
}

pub fn validate_iso_date_key(date: &str) -> Result<(), String> {
    let bytes = date.as_bytes();
    if bytes.len() != 10 || bytes[4] != b'-' || bytes[7] != b'-' {
        return Err("Formato de fecha inválido (esperado YYYY-MM-DD).".to_string());
    }
    let year: u32 = date[0..4]
        .parse()
        .map_err(|_| "Año de fecha inválido.".to_string())?;
    let month: u32 = date[5..7]
        .parse()
        .map_err(|_| "Mes de fecha inválido.".to_string())?;
    let day: u32 = date[8..10]
        .parse()
        .map_err(|_| "Día de fecha inválido.".to_string())?;
    if !(1970..=2200).contains(&year) || !(1..=12).contains(&month) || !(1..=31).contains(&day) {
        return Err("Fecha fuera de rango válido.".to_string());
    }
    Ok(())
}

pub fn validate_hex_color(color: &str) -> Result<(), String> {
    let bytes = color.as_bytes();
    if bytes.len() != 7 || bytes[0] != b'#' || !bytes[1..].iter().all(|b| b.is_ascii_hexdigit()) {
        return Err("Color hexadecimal inválido (esperado #RRGGBB).".to_string());
    }
    Ok(())
}

pub fn sanitize_note_folder(raw: &str) -> String {
    raw.split(['/', '\\'])
        .filter_map(|seg| {
            let cleaned: String = seg
                .chars()
                .filter(|ch| !ch.is_control() && !matches!(ch, '<' | '>' | ':' | '"' | '|' | '?' | '*'))
                .collect::<String>()
                .split_whitespace()
                .collect::<Vec<_>>()
                .join(" ");
            let trimmed = cleaned.trim_matches(|ch: char| ch == '.' || ch == ' ');
            if trimmed.is_empty() || trimmed == "." || trimmed == ".." {
                return None;
            }
            let limited: String = trimmed.chars().take(MAX_NOTE_FOLDER_SEGMENT_CHARS).collect();
            let final_seg = limited.trim_matches(|ch: char| ch == '.' || ch == ' ');
            if final_seg.is_empty() || final_seg == "." || final_seg == ".." {
                None
            } else if is_windows_reserved_name(final_seg) {
                Some(format!("_{final_seg}"))
            } else {
                Some(final_seg.to_string())
            }
        })
        .take(MAX_NOTE_FOLDER_DEPTH)
        .collect::<Vec<_>>()
        .join("/")
}

/// Builds a bounded, operator-safe SQLite FTS5 prefix match expression.
pub fn sanitize_fts_query(raw: &str) -> String {
    let cleaned_input: String = raw
        .chars()
        .filter(|ch| !ch.is_control())
        .take(MAX_FTS_QUERY_CHARS)
        .collect();

    cleaned_input
        .split_whitespace()
        .filter_map(|token| {
            let stripped: String = token
                .chars()
                .filter(|ch| !matches!(ch, '"' | '*' | '^' | '(' | ')' | ':' | '\''))
                .collect();
            let trimmed = stripped.trim();
            if trimmed.is_empty() {
                None
            } else {
                Some(format!("\"{trimmed}\"*"))
            }
        })
        .take(MAX_FTS_TOKENS)
        .collect::<Vec<_>>()
        .join(" ")
}

pub fn clamp_limit(limit: Option<i64>, default_val: i64, max_val: i64) -> i64 {
    match limit {
        Some(v) if v > 0 => v.min(max_val),
        _ => default_val,
    }
}

/// Validates an external browser URL: strictly `http:` or `https:`, disallowing localhost,
/// `*.localhost` (including `ipc.localhost`, `asset.localhost`, `tauri.localhost`), and loopback/unspecified IPs.
pub fn validate_external_http_url(raw: &str) -> Result<Url, String> {
    let trimmed = raw.trim();
    if trimmed.is_empty() || trimmed.len() > 2048 || trimmed.chars().any(|ch| ch.is_control()) {
        return Err("URL externa inválida.".to_string());
    }

    let parsed = Url::parse(trimmed).map_err(|_| "URL externa malformada.".to_string())?;
    if parsed.scheme() != "http" && parsed.scheme() != "https" {
        return Err("Solo se permite abrir enlaces http:// o https://.".to_string());
    }

    let Some(host) = parsed.host_str() else {
        return Err("La URL externa no contiene un host válido.".to_string());
    };
    let host_lower = host.to_ascii_lowercase();
    if host_lower == "localhost"
        || host_lower.ends_with(".localhost")
        || host_lower == "0.0.0.0"
        || host_lower == "[::]"
    {
        return Err("No se permite abrir URLs locales o internas desde contenido externo.".to_string());
    }

    let bare_host = host_lower.trim_start_matches('[').trim_end_matches(']');
    if let Ok(ip) = bare_host.parse::<IpAddr>() {
        if ip.is_loopback() || ip.is_unspecified() {
            return Err("No se permite abrir direcciones de loopback.".to_string());
        }
    }

    Ok(parsed)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn detects_windows_reserved_device_names() {
        assert!(is_windows_reserved_name("CON"));
        assert!(is_windows_reserved_name("nul.md"));
        assert!(is_windows_reserved_name("Com1.pdf"));
        assert!(is_windows_reserved_name("lpt9"));
        assert!(!is_windows_reserved_name("console"));
        assert!(!is_windows_reserved_name("notes"));
    }

    #[test]
    fn validates_book_and_cover_paths_strictly() {
        assert!(validate_book_relative_path("books/550e8400-e29b-41d4-a716-446655440000.pdf").is_ok());
        assert!(validate_book_relative_path("books/item_1.epub").is_ok());
        assert!(validate_book_relative_path("books/../library.db").is_err());
        assert!(validate_book_relative_path("books/sub/book.pdf").is_err());
        assert!(validate_book_relative_path("books/payload.bat").is_err());
        assert!(validate_book_relative_path("books/CON.pdf").is_err());
        assert!(validate_book_relative_path("covers/abc.webp").is_err());

        assert!(validate_cover_relative_path("covers/item_1.webp").is_ok());
        assert!(validate_cover_relative_path("covers/../library.db").is_err());
        assert!(validate_cover_relative_path("covers/icon.svg").is_err());
        assert!(validate_cover_relative_path("books/item_1.pdf").is_err());
    }

    #[test]
    fn rejects_unc_and_ads_paths() {
        assert!(reject_unsafe_os_path(Path::new(r"\\attacker.example\share\book.pdf")).is_err());
        assert!(reject_unsafe_os_path(Path::new("//attacker.example/share/book.pdf")).is_err());
        assert!(reject_unsafe_os_path(Path::new(r"C:\tmp\evil.exe:.md")).is_err());
        assert!(reject_unsafe_os_path(Path::new("valid_note.md")).is_ok());
    }

    #[test]
    fn validates_magic_bytes() {
        assert!(validate_pdf_magic(b"%PDF-1.7\n..."));
        assert!(validate_pdf_magic(b"\xef\xbb\xbf%PDF-2.0"));
        assert!(!validate_pdf_magic(b"MZ\x90\x00not a pdf"));

        assert!(validate_epub_magic(b"PK\x03\x04\x14\x00"));
        assert!(!validate_epub_magic(b"<html>fake epub</html>"));

        assert!(validate_webp_magic(b"RIFF\x24\x00\x00\x00WEBPVP8 "));
        assert!(!validate_webp_magic(b"<svg xmlns='http://www.w3.org/2000/svg'/>"));
    }

    #[test]
    fn validates_external_urls() {
        assert!(validate_external_http_url("https://example.org/docs?a=1").is_ok());
        assert!(validate_external_http_url("http://example.org").is_ok());
        assert!(validate_external_http_url("javascript:alert(1)").is_err());
        assert!(validate_external_http_url("file:///C:/Windows/win.ini").is_err());
        assert!(validate_external_http_url("http://ipc.localhost/invoke").is_err());
        assert!(validate_external_http_url("http://asset.localhost/covers/a.webp").is_err());
        assert!(validate_external_http_url("http://127.0.0.1:1420").is_err());
        assert!(validate_external_http_url("http://localhost:8080").is_err());
    }

    #[test]
    fn sanitizes_fts_queries_with_bounds() {
        let huge = "word ".repeat(500);
        let q = sanitize_fts_query(&huge);
        assert_eq!(q.split_whitespace().count(), MAX_FTS_TOKENS);
        assert_eq!(sanitize_fts_query("foo\0bar \"baz\":*"), "\"foobar\"* \"baz\"*");
    }

    #[test]
    fn sanitizes_note_folders() {
        assert_eq!(sanitize_note_folder("../secret/../../Libros/CON/./Notas.."), "secret/Libros/_CON/Notas");
    }
}
