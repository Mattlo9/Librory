import { invoke } from '@tauri-apps/api/core';
import {
  escapeYamlString,
  sanitizeNoteFilename,
  sanitizeNoteFolder,
} from '@/lib/validation';
import type { Highlight, NoteWithItem } from '@/types/domain';

export { sanitizeNoteFilename };

interface VaultExportEntryPayload {
  filename: string;
  folder: string;
  content: string;
}

export interface VaultExportResult {
  exportedCount: number;
  rootDir: string;
}

/**
 * Formats a note with Obsidian-compatible YAML frontmatter while preserving [[wikilinks]].
 * All dynamic fields (including timestamps) are quoted and line-break/control-escaped.
 */
export function buildObsidianMarkdown(note: NoteWithItem): string {
  const frontmatter: string[] = [
    '---',
    `title: ${escapeYamlString(note.title || 'Nota sin título')}`,
    `created: ${escapeYamlString(note.created_at)}`,
    `updated: ${escapeYamlString(note.updated_at)}`,
  ];

  const safeFolder = sanitizeNoteFolder(note.folder);
  if (safeFolder) {
    frontmatter.push(`folder: ${escapeYamlString(safeFolder)}`);
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
 * Invokes the Rust-owned native save dialog and writes a single Obsidian-formatted `.md` note.
 */
export async function exportSingleNoteToFile(
  note: NoteWithItem,
): Promise<string | null> {
  const content = buildObsidianMarkdown(note);
  return invoke<string | null>('export_markdown_file', {
    suggestedFilename: sanitizeNoteFilename(note.title),
    content,
  });
}

/**
 * Invokes the Rust-owned native folder picker and exports all notes into a nested Obsidian vault.
 */
export async function exportNotesVaultToFolder(
  notes: NoteWithItem[],
): Promise<VaultExportResult | null> {
  if (notes.length === 0) {
    return null;
  }

  const entries: VaultExportEntryPayload[] = notes.map((note) => ({
    filename: sanitizeNoteFilename(note.title),
    folder: sanitizeNoteFolder(note.folder),
    content: buildObsidianMarkdown(note),
  }));

  return invoke<VaultExportResult | null>('export_obsidian_vault', {
    entries,
  });
}
