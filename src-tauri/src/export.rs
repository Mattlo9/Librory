use crate::validation::{
    ensure_not_symlink, ensure_within_dir, is_windows_reserved_name, reject_unsafe_os_path,
};
use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::{Path, PathBuf};
use tauri_plugin_dialog::DialogExt;

const MAX_FILENAME_STEM_CHARS: usize = 120;
const MAX_FOLDER_SEG_CHARS: usize = 80;
const MAX_FOLDER_DEPTH: usize = 8;
const MAX_SINGLE_EXPORT_BYTES: usize = 16 * 1024 * 1024; // 16 MiB
const MAX_VAULT_ENTRIES: usize = 10_000;
const MAX_VAULT_TOTAL_BYTES: usize = 200 * 1024 * 1024; // 200 MiB

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VaultExportEntry {
    pub filename: String,
    pub folder: String,
    pub content: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VaultExportReport {
    pub exported_count: usize,
    pub root_dir: String,
}

fn is_forbidden_filename_char(ch: char) -> bool {
    ch.is_control()
        || matches!(
            ch,
            '<' | '>' | ':' | '"' | '/' | '\\' | '|' | '?' | '*'
        )
}

pub fn sanitize_filename(raw: &str) -> String {
    let trimmed_raw = raw.trim();
    let without_ext = if trimmed_raw.len() >= 3
        && trimmed_raw[trimmed_raw.len() - 3..].eq_ignore_ascii_case(".md")
    {
        &trimmed_raw[..trimmed_raw.len() - 3]
    } else {
        trimmed_raw
    };

    let cleaned: String = without_ext
        .chars()
        .map(|ch| if is_forbidden_filename_char(ch) { ' ' } else { ch })
        .collect::<String>()
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ");

    let trimmed = cleaned.trim_matches(|ch: char| ch == '.' || ch == ' ');
    let limited: String = trimmed.chars().take(MAX_FILENAME_STEM_CHARS).collect();
    let final_stem = limited.trim_matches(|ch: char| ch == '.' || ch == ' ');

    if final_stem.is_empty() {
        "Nota sin titulo.md".to_string()
    } else if is_windows_reserved_name(final_stem) {
        format!("_{final_stem}.md")
    } else {
        format!("{final_stem}.md")
    }
}

pub fn sanitize_folder_segments(folder: &str) -> Vec<String> {
    folder
        .split(['/', '\\'])
        .filter_map(|raw_seg| {
            let trimmed = raw_seg.trim();
            if trimmed.is_empty() || trimmed == "." || trimmed == ".." {
                return None;
            }
            let cleaned: String = trimmed
                .chars()
                .map(|ch| if is_forbidden_filename_char(ch) { ' ' } else { ch })
                .collect::<String>()
                .split_whitespace()
                .collect::<Vec<_>>()
                .join(" ");
            let pre_trimmed = cleaned.trim_matches(|ch: char| ch == '.' || ch == ' ');
            let limited: String = pre_trimmed.chars().take(MAX_FOLDER_SEG_CHARS).collect();
            let final_seg = limited.trim_matches(|ch: char| ch == '.' || ch == ' ');
            if final_seg.is_empty() || final_seg == "." || final_seg == ".." {
                None
            } else if is_windows_reserved_name(final_seg) {
                Some(format!("_{final_seg}"))
            } else {
                Some(final_seg.to_string())
            }
        })
        .take(MAX_FOLDER_DEPTH)
        .collect()
}

fn ensure_md_extension(path: &Path) -> PathBuf {
    match path.extension().and_then(|ext| ext.to_str()) {
        Some(ext) if ext.eq_ignore_ascii_case("md") => path.to_path_buf(),
        _ => {
            let mut updated = path.to_path_buf();
            let file_name = path
                .file_name()
                .and_then(|n| n.to_str())
                .unwrap_or("nota");
            updated.set_file_name(format!("{file_name}.md"));
            updated
        }
    }
}

fn normalized_key(path: &Path) -> String {
    path.to_string_lossy().to_lowercase()
}

/// Allocates a collision-free path on both case-insensitive filesystems and pre-existing vaults,
/// atomically creating the file with `create_new(true)` so existing files and symlinks are never clobbered.
fn write_unique_vault_file(
    target_dir: &Path,
    filename: &str,
    content: &[u8],
    used_keys: &mut HashSet<String>,
) -> Result<PathBuf, String> {
    let base = sanitize_filename(filename);
    let stem = base.strip_suffix(".md").unwrap_or(&base);

    for counter in 1usize..=10_000 {
        let candidate = if counter == 1 {
            target_dir.join(&base)
        } else {
            target_dir.join(format!("{stem} ({counter}).md"))
        };
        let key = normalized_key(&candidate);
        if used_keys.contains(&key) {
            continue;
        }
        ensure_not_symlink(&candidate)?;
        match OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&candidate)
        {
            Ok(mut file) => {
                file.write_all(content)
                    .map_err(|_| "No se pudo escribir el archivo Markdown exportado.".to_string())?;
                used_keys.insert(key);
                return Ok(candidate);
            }
            Err(err) if err.kind() == std::io::ErrorKind::AlreadyExists => {
                used_keys.insert(key);
                continue;
            }
            Err(_) => {
                return Err("No se pudo crear el archivo Markdown en la bóveda destino.".to_string());
            }
        }
    }

    Err("No se pudo asignar un nombre único para el archivo exportado.".to_string())
}

fn write_single_markdown_checked(target_path: &Path, content: &str) -> Result<String, String> {
    if content.len() > MAX_SINGLE_EXPORT_BYTES {
        return Err("La nota excede el tamaño máximo permitido para exportación (16 MB).".to_string());
    }
    reject_unsafe_os_path(target_path)?;

    let resolved = ensure_md_extension(target_path);
    reject_unsafe_os_path(&resolved)?;
    if let Some(stem) = resolved.file_stem().and_then(|s| s.to_str()) {
        if is_windows_reserved_name(stem) {
            return Err("El nombre de archivo destino es un nombre reservado del sistema.".to_string());
        }
    }

    ensure_not_symlink(&resolved)?;
    let Some(parent) = resolved.parent() else {
        return Err("La ruta destino no contiene una carpeta válida.".to_string());
    };
    if parent.as_os_str().is_empty() || !parent.is_dir() {
        return Err("La carpeta destino seleccionada no existe.".to_string());
    }
    ensure_not_symlink(parent)?;

    let tmp_path = parent.join(format!(".librory_export_{}.tmp", uuid::Uuid::new_v4()));
    let result = (|| -> Result<(), String> {
        let mut tmp = OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&tmp_path)
            .map_err(|_| "No se pudo crear el archivo temporal de exportación.".to_string())?;
        tmp.write_all(content.as_bytes())
            .map_err(|_| "No se pudo escribir el archivo Markdown.".to_string())?;
        tmp.sync_all()
            .map_err(|_| "No se pudo confirmar la escritura del archivo Markdown.".to_string())?;

        ensure_not_symlink(&resolved)?;
        if resolved.exists() {
            fs::remove_file(&resolved)
                .map_err(|_| "No se pudo reemplazar el archivo destino seleccionado.".to_string())?;
        }
        fs::rename(&tmp_path, &resolved)
            .map_err(|_| "No se pudo guardar el archivo Markdown.".to_string())?;
        Ok(())
    })();

    if result.is_err() {
        let _ = fs::remove_file(&tmp_path);
    }
    result?;

    Ok(resolved.to_string_lossy().to_string())
}

fn export_vault_to_root(
    root: &Path,
    entries: &[VaultExportEntry],
) -> Result<VaultExportReport, String> {
    if entries.is_empty() {
        return Err("No hay notas para exportar.".to_string());
    }
    if entries.len() > MAX_VAULT_ENTRIES {
        return Err("La exportación excede el límite máximo de notas por lote.".to_string());
    }
    let total_bytes: usize = entries
        .iter()
        .try_fold(0usize, |acc, e| acc.checked_add(e.content.len()))
        .ok_or_else(|| "El tamaño total de la exportación excede el límite permitido.".to_string())?;
    if total_bytes > MAX_VAULT_TOTAL_BYTES {
        return Err("La exportación supera el límite máximo de 200 MB.".to_string());
    }

    reject_unsafe_os_path(root)?;
    ensure_not_symlink(root)?;
    fs::create_dir_all(root)
        .map_err(|_| "No se pudo preparar la carpeta destino de la bóveda.".to_string())?;
    ensure_not_symlink(root)?;

    let canonical_root = fs::canonicalize(root)
        .map_err(|_| "No se pudo resolver la carpeta de la bóveda.".to_string())?;

    let mut used_keys = HashSet::new();
    let mut exported_count = 0usize;

    for entry in entries {
        let mut target_dir = canonical_root.clone();
        for seg in sanitize_folder_segments(&entry.folder) {
            target_dir.push(seg);
            ensure_not_symlink(&target_dir)?;
            if !target_dir.exists() {
                fs::create_dir(&target_dir)
                    .map_err(|_| "No se pudo crear la subcarpeta de notas.".to_string())?;
            }
            ensure_not_symlink(&target_dir)?;
            target_dir = ensure_within_dir(&canonical_root, &target_dir)?;
        }

        write_unique_vault_file(
            &target_dir,
            &entry.filename,
            entry.content.as_bytes(),
            &mut used_keys,
        )?;
        exported_count += 1;
    }

    Ok(VaultExportReport {
        exported_count,
        root_dir: canonical_root.to_string_lossy().to_string(),
    })
}

/// Opens a native save dialog inside Rust and writes a single `.md` note.
/// Returns `Ok(None)` when the user cancels the dialog.
#[tauri::command]
pub async fn export_markdown_file(
    app: tauri::AppHandle,
    suggested_filename: String,
    content: String,
) -> Result<Option<String>, String> {
    if content.len() > MAX_SINGLE_EXPORT_BYTES {
        return Err("La nota excede el tamaño máximo permitido para exportación (16 MB).".to_string());
    }
    let safe_name = sanitize_filename(&suggested_filename);

    tauri::async_runtime::spawn_blocking(move || {
        let picked = app
            .dialog()
            .file()
            .set_title("Exportar nota Markdown")
            .set_file_name(&safe_name)
            .add_filter("Markdown", &["md"])
            .blocking_save_file();

        let Some(file_path) = picked else {
            return Ok(None);
        };
        let target_path = file_path
            .into_path()
            .map_err(|_| "La ruta seleccionada no es una ruta local válida.".to_string())?;

        let written = write_single_markdown_checked(&target_path, &content)?;
        Ok(Some(written))
    })
    .await
    .map_err(|_| "Error interno durante la exportación Markdown.".to_string())?
}

/// Opens a native folder picker inside Rust and exports all entries safely into an Obsidian vault.
/// Returns `Ok(None)` when the user cancels the dialog.
#[tauri::command]
pub async fn export_obsidian_vault(
    app: tauri::AppHandle,
    entries: Vec<VaultExportEntry>,
) -> Result<Option<VaultExportReport>, String> {
    if entries.is_empty() {
        return Ok(None);
    }

    tauri::async_runtime::spawn_blocking(move || {
        let picked = app
            .dialog()
            .file()
            .set_title("Seleccionar carpeta para exportar bóveda (Obsidian)")
            .set_can_create_directories(true)
            .blocking_pick_folder();

        let Some(folder_path) = picked else {
            return Ok(None);
        };
        let root_path = folder_path
            .into_path()
            .map_err(|_| "La carpeta seleccionada no es una ruta local válida.".to_string())?;

        let report = export_vault_to_root(&root_path, &entries)?;
        Ok(Some(report))
    })
    .await
    .map_err(|_| "Error interno durante la exportación de la bóveda.".to_string())?
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sanitizes_filenames_reserved_names_and_folder_traversal() {
        assert_eq!(sanitize_filename("Mi: Nota / Clave?"), "Mi Nota Clave.md");
        assert_eq!(sanitize_filename("   ...  "), "Nota sin titulo.md");
        assert_eq!(sanitize_filename("Resumen.md"), "Resumen.md");
        assert_eq!(sanitize_filename("CON"), "_CON.md");
        assert_eq!(sanitize_filename("nul.MD"), "_nul.md");

        assert_eq!(
            sanitize_folder_segments("../secreto/../../Libros/AUX/Filosofía/."),
            vec![
                "secreto".to_string(),
                "Libros".to_string(),
                "_AUX".to_string(),
                "Filosofía".to_string(),
            ]
        );
        assert!(sanitize_folder_segments("..//./..").is_empty());

        // Trailing dot after 80-char truncation must be stripped
        let long_seg = format!("{}.trailing", "a".repeat(79));
        let segs = sanitize_folder_segments(&long_seg);
        assert_eq!(segs.len(), 1);
        assert!(!segs[0].ends_with('.'));
    }

    #[test]
    fn exports_vault_without_overwriting_existing_or_case_colliding_files() {
        let unique_dir = std::env::temp_dir().join(format!(
            "librory_vault_test_{}",
            uuid::Uuid::new_v4()
        ));
        let sub = unique_dir.join("Lecturas").join("2026");
        fs::create_dir_all(&sub).unwrap();
        let preexisting = sub.join("Ideas.md");
        fs::write(&preexisting, "# Pre-existing user note").unwrap();

        let entries = vec![
            VaultExportEntry {
                filename: "Ideas".to_string(),
                folder: "Lecturas/2026".to_string(),
                content: "# Ideas 1".to_string(),
            },
            VaultExportEntry {
                filename: "ideas".to_string(),
                folder: "Lecturas/2026".to_string(),
                content: "# Ideas 2".to_string(),
            },
            VaultExportEntry {
                filename: "Raiz".to_string(),
                folder: "../../".to_string(),
                content: "# Raiz".to_string(),
            },
        ];

        let report = export_vault_to_root(&unique_dir, &entries).expect("vault export");
        assert_eq!(report.exported_count, 3);

        // Pre-existing note MUST NOT be overwritten
        assert_eq!(fs::read_to_string(&preexisting).unwrap(), "# Pre-existing user note");
        assert_eq!(fs::read_to_string(sub.join("Ideas (2).md")).unwrap(), "# Ideas 1");
        assert_eq!(fs::read_to_string(sub.join("ideas (3).md")).unwrap(), "# Ideas 2");
        assert_eq!(fs::read_to_string(unique_dir.join("Raiz.md")).unwrap(), "# Raiz");

        let _ = fs::remove_dir_all(&unique_dir);
    }

    #[test]
    fn rejects_unc_and_ads_export_targets() {
        assert!(write_single_markdown_checked(Path::new(r"\\attacker\share\x.md"), "hi").is_err());
        assert!(write_single_markdown_checked(Path::new(r"C:\tmp\file.exe:.md"), "hi").is_err());
    }
}
