use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::fs;
use std::path::{Path, PathBuf};

const MAX_FILENAME_STEM_CHARS: usize = 120;

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
    let without_ext = raw.trim().strip_suffix(".md").unwrap_or(raw.trim());
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
            let final_seg = cleaned.trim_matches(|ch: char| ch == '.' || ch == ' ');
            if final_seg.is_empty() || final_seg == "." || final_seg == ".." {
                None
            } else {
                Some(final_seg.chars().take(80).collect())
            }
        })
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

fn allocate_unique_path(
    target_dir: &Path,
    filename: &str,
    used_paths: &mut HashSet<PathBuf>,
) -> PathBuf {
    let base = sanitize_filename(filename);
    let stem = base.strip_suffix(".md").unwrap_or(&base);
    let first_candidate = target_dir.join(&base);
    if used_paths.insert(first_candidate.clone()) {
        return first_candidate;
    }

    let mut counter = 2usize;
    loop {
        let candidate = target_dir.join(format!("{stem} ({counter}).md"));
        if used_paths.insert(candidate.clone()) {
            return candidate;
        }
        counter += 1;
    }
}

#[tauri::command]
pub fn export_markdown_file(
    target_path: String,
    content: String,
) -> Result<String, String> {
    let trimmed = target_path.trim();
    if trimmed.is_empty() {
        return Err("La ruta de destino está vacía.".to_string());
    }

    let resolved = ensure_md_extension(Path::new(trimmed));
    if let Some(parent) = resolved.parent() {
        if !parent.as_os_str().is_empty() {
            fs::create_dir_all(parent)
                .map_err(|err| format!("No se pudo crear la carpeta destino: {err}"))?;
        }
    }

    fs::write(&resolved, content.as_bytes())
        .map_err(|err| format!("No se pudo guardar el archivo Markdown: {err}"))?;

    Ok(resolved.to_string_lossy().to_string())
}

#[tauri::command]
pub fn export_obsidian_vault(
    root_dir: String,
    entries: Vec<VaultExportEntry>,
) -> Result<VaultExportReport, String> {
    let trimmed_root = root_dir.trim();
    if trimmed_root.is_empty() {
        return Err("Selecciona una carpeta válida para exportar la bóveda.".to_string());
    }

    let root = PathBuf::from(trimmed_root);
    fs::create_dir_all(&root)
        .map_err(|err| format!("No se pudo crear la carpeta de la bóveda: {err}"))?;

    let mut used_paths = HashSet::new();
    let mut exported_count = 0usize;

    for entry in entries {
        let mut target_dir = root.clone();
        for seg in sanitize_folder_segments(&entry.folder) {
            target_dir.push(seg);
        }
        fs::create_dir_all(&target_dir)
            .map_err(|err| format!("No se pudo crear la subcarpeta de notas: {err}"))?;

        let target_path = allocate_unique_path(&target_dir, &entry.filename, &mut used_paths);
        fs::write(&target_path, entry.content.as_bytes())
            .map_err(|err| format!("No se pudo escribir '{}': {err}", target_path.display()))?;
        exported_count += 1;
    }

    Ok(VaultExportReport {
        exported_count,
        root_dir: root.to_string_lossy().to_string(),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sanitizes_filenames_and_folder_traversal() {
        assert_eq!(sanitize_filename("Mi: Nota / Clave?"), "Mi Nota Clave.md");
        assert_eq!(sanitize_filename("   ...  "), "Nota sin titulo.md");
        assert_eq!(sanitize_filename("Resumen.md"), "Resumen.md");

        assert_eq!(
            sanitize_folder_segments("../secreto/../../Libros/Filosofía/."),
            vec!["secreto".to_string(), "Libros".to_string(), "Filosofía".to_string()]
        );
        assert!(sanitize_folder_segments("..//./..").is_empty());
    }

    #[test]
    fn exports_vault_with_deduplication_and_subfolders() {
        let unique_dir = std::env::temp_dir().join(format!(
            "librory_vault_test_{}",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .expect("time")
                .as_nanos()
        ));

        let entries = vec![
            VaultExportEntry {
                filename: "Ideas".to_string(),
                folder: "Lecturas/2026".to_string(),
                content: "# Ideas 1".to_string(),
            },
            VaultExportEntry {
                filename: "Ideas".to_string(),
                folder: "Lecturas/2026".to_string(),
                content: "# Ideas 2".to_string(),
            },
            VaultExportEntry {
                filename: "Raiz".to_string(),
                folder: "../../".to_string(),
                content: "# Raiz".to_string(),
            },
        ];

        let report = export_obsidian_vault(unique_dir.to_string_lossy().to_string(), entries)
            .expect("vault export");
        assert_eq!(report.exported_count, 3);

        let first = unique_dir.join("Lecturas").join("2026").join("Ideas.md");
        let second = unique_dir.join("Lecturas").join("2026").join("Ideas (2).md");
        let root_file = unique_dir.join("Raiz.md");

        assert_eq!(fs::read_to_string(&first).expect("read first"), "# Ideas 1");
        assert_eq!(fs::read_to_string(&second).expect("read second"), "# Ideas 2");
        assert_eq!(fs::read_to_string(&root_file).expect("read root"), "# Raiz");

        let _ = fs::remove_dir_all(&unique_dir);
    }
}
