import { invoke } from '@tauri-apps/api/core';
import { open as openDialog, save as saveDialog } from '@tauri-apps/plugin-dialog';
import type { Highlight, NoteWithItem } from '@/types/domain';

interface VaultExportEntryPayload {
  filename: string;
  folder: string;
  content: string;
}

export interface VaultExportResult {
  exportedCount: number;
  rootDir: string;
}

function escapeYamlString(value: string): string {
  const escaped = value
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\r?\n/g, ' ');
  return `"${escaped}"`;
}

/**
 * Produces a safe `.md` filename compatible with Windows and Obsidian vaults.
 */
export function sanitizeNoteFilename(title: string): string {
  const stripped = title
    .trim()
    .replace(/\.md$/i, '')
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/^[.\s]+|[.\s]+$/g, '')
    .slice(0, 120)
    .replace(/^[.\s]+|[.\s]+$/g, '');

  return stripped ? `${stripped}.md` : 'Nota sin titulo.md';
}

/**
 * Formats a note with Obsidian-compatible YAML frontmatter while preserving [[wikilinks]].
 */
export function buildObsidianMarkdown(note: NoteWithItem): string {
  const frontmatter: string[] = [
    '---',
    `title: ${escapeYamlString(note.title || 'Nota sin título')}`,
    `created: ${note.created_at}`,
    `updated: ${note.updated_at}`,
  ];

  if (note.folder.trim()) {
    frontmatter.push(`folder: ${escapeYamlString(note.folder.trim())}`);
  }
  if (note.item_title) {
    frontmatter.push(`book: ${escapeYamlString(note.item_title)}`);
  }
  if (note.item_author) {
    frontmatter.push(`author: ${escapeYamlString(note.item_author)}`);
  }
  if (note.tags.length > 0) {
    frontmatter.push('tags:');
    for (const tag of note.tags) {
      frontmatter.push(`  - ${escapeYamlString(tag)}`);
    }
  }

  frontmatter.push('---', '');

  const body = note.content.replace(/\r\n/g, '\n');
  const trimmedEnd = body.endsWith('\n') || body.length === 0 ? body : `${body}\n`;
  return `${frontmatter.join('\n')}${trimmedEnd}`;
}

/**
 * Formats a library highlight as an Obsidian-friendly Markdown blockquote.
 */
export function formatHighlightAsMarkdown(highlight: Highlight): string {
  const quoteLines = highlight.quote_text
    .trim()
    .split(/\r?\n/)
    .map((line) => `> ${line}`);

  if (highlight.page_number !== null && highlight.page_number > 0) {
    quoteLines.push(`>\n> — *pág. ${highlight.page_number}*`);
  }

  const noteText = highlight.note_markdown.trim();
  if (noteText) {
    return `${quoteLines.join('\n')}\n\n${noteText}`;
  }

  return quoteLines.join('\n');
}

/**
 * Opens a native save dialog and writes a single Obsidian-formatted `.md` note.
 */
export async function exportSingleNoteToFile(
  note: NoteWithItem,
): Promise<string | null> {
  const targetPath = await saveDialog({
    title: 'Exportar nota Markdown',
    defaultPath: sanitizeNoteFilename(note.title),
    filters: [{ name: 'Markdown', extensions: ['md'] }],
  });

  if (!targetPath) {
    return null;
  }

  const content = buildObsidianMarkdown(note);
  return invoke<string>('export_markdown_file', {
    targetPath,
    content,
  });
}

/**
 * Opens a directory picker and exports all notes into nested folder structure for Obsidian.
 */
export async function exportNotesVaultToFolder(
  notes: NoteWithItem[],
): Promise<VaultExportResult | null> {
  if (notes.length === 0) {
    return null;
  }

  const selected = await openDialog({
    title: 'Seleccionar carpeta para exportar bóveda (Obsidian)',
    directory: true,
    multiple: false,
    canCreateDirectories: true,
  });

  const rootDir = Array.isArray(selected) ? selected[0] : selected;
  if (!rootDir) {
    return null;
  }

  const entries: VaultExportEntryPayload[] = notes.map((note) => ({
    filename: sanitizeNoteFilename(note.title),
    folder: note.folder,
    content: buildObsidianMarkdown(note),
  }));

  return invoke<VaultExportResult>('export_obsidian_vault', {
    rootDir,
    entries,
  });
}
