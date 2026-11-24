import { cleanMetadataString, isSafeStoredBookPath } from '@/lib/validation';
import {
  bulkDeleteItems,
  createItem,
  deleteItem,
  getItemById,
  listAllFileHashes,
  updateItem,
} from '@/services/bookRepository';
import {
  copyExternalBookToLibrary,
  openStoredBook,
  readStoredFileBytes,
  removeStoredFile,
  revealStoredBook,
  writeCoverWebp,
} from '@/services/fileService';
import type {
  ExtractedDocumentMeta,
  FileFormat,
  ImportBatchProgress,
  ImportBatchSummary,
  ItemType,
  LibraryItem,
} from '@/types/domain';

const MAX_METADATA_TITLE_LEN = 512;
const MAX_METADATA_AUTHOR_LEN = 256;
const MAX_METADATA_EXTRACT_BYTES = 128 * 1024 * 1024; // 128 MiB cap for in-WebView cover extraction

function basenameFromPath(sourcePath: string): string {
  const normalized = sourcePath.replace(/\\/g, '/');
  const lastSlash = normalized.lastIndexOf('/');
  return lastSlash >= 0 ? normalized.slice(lastSlash + 1) : normalized;
}

function getSupportedExtension(filename: string): FileFormat | null {
  const dotIdx = filename.lastIndexOf('.');
  if (dotIdx < 0) return null;
  const ext = filename.slice(dotIdx + 1).toLowerCase();
  if (ext === 'pdf' || ext === 'epub') return ext;
  return null;
}

export function parseFilenameMetadata(filename: string): {
  title: string;
  author: string;
} {
  const withoutExt = filename.replace(/\.(pdf|epub)$/i, '');
  const cleaned = withoutExt.replace(/_/g, ' ').replace(/\s+/g, ' ').trim();
  const parts = cleaned.split(' - ');

  if (parts.length === 2) {
    const candidateAuthor = cleanMetadataString(parts[0], MAX_METADATA_AUTHOR_LEN) ?? '';
    const candidateTitle = cleanMetadataString(parts[1], MAX_METADATA_TITLE_LEN) ?? '';
    if (candidateAuthor.length >= 2 && candidateTitle.length >= 2) {
      return { title: candidateTitle, author: candidateAuthor };
    }
  }

  return {
    title: cleanMetadataString(cleaned, MAX_METADATA_TITLE_LEN) ?? 'Documento sin título',
    author: '',
  };
}

export function inferInitialItemType(
  format: FileFormat,
  pageCount: number,
  filename: string,
): ItemType {
  if (format === 'epub') {
    return 'book';
  }

  const lower = filename.toLowerCase();
  if (/(\bsummary\b|\bresumen\b|\bcheat[\s_-]?sheet\b)/.test(lower)) {
    return 'summary';
  }
  if (/(\bcourse\b|\bslides\b|\bdeck\b|\bsyllabus\b|\bclase\b|\bcurso\b)/.test(lower)) {
    return 'course';
  }
  if (/(\bpaper\b|\barxiv\b|\bjournal\b|\bproceedings\b)/.test(lower)) {
    return 'paper';
  }
  if (pageCount > 0 && pageCount <= 45) {
    return 'paper';
  }
  if (pageCount >= 80) {
    return 'book';
  }
  return 'unsorted';
}

async function extractDocumentMetadata(
  relativePath: string,
  format: FileFormat,
): Promise<ExtractedDocumentMeta> {
  const bytes = await readStoredFileBytes(relativePath);

  if (format === 'pdf') {
    const { extractPdfMetadataAndCover } = await import('@/services/pdfProcessor');
    return extractPdfMetadataAndCover(bytes);
  }

  const { extractEpubMetadataAndCover } = await import('@/services/epubProcessor');
  return extractEpubMetadataAndCover(bytes);
}

export async function importLocalFiles(
  sourcePaths: string[],
  onProgress?: (progress: ImportBatchProgress) => void,
): Promise<ImportBatchSummary> {
  const summary: ImportBatchSummary = {
    imported: [],
    duplicates: [],
    unsupported: [],
    errors: [],
  };

  if (sourcePaths.length === 0) {
    return summary;
  }

  const knownHashes = new Set(await listAllFileHashes());
  const total = sourcePaths.length;

  for (let i = 0; i < total; i += 1) {
    const sourcePath = sourcePaths[i];
    if (!sourcePath) continue;

    const filename = basenameFromPath(sourcePath);
    onProgress?.({
      active: true,
      current: i + 1,
      total,
      currentFilename: filename,
    });

    if (!getSupportedExtension(filename)) {
      summary.unsupported.push(filename);
      continue;
    }

    const itemId = crypto.randomUUID();
    let copiedFilePath: string | null = null;
    let savedCoverPath: string | null = null;

    try {
      const report = await copyExternalBookToLibrary(
        sourcePath,
        itemId,
        Array.from(knownHashes),
      );

      if (report.status === 'duplicate') {
        summary.duplicates.push(report.originalFilename);
        continue;
      }

      copiedFilePath = report.filePath;
      knownHashes.add(report.fileHash);

      const fallbackMeta = parseFilenameMetadata(report.originalFilename);
      let extracted: ExtractedDocumentMeta = {
        title: null,
        author: null,
        pageCount: 0,
        coverWebpBytes: null,
      };

      if (report.fileSize <= MAX_METADATA_EXTRACT_BYTES) {
        try {
          extracted = await extractDocumentMetadata(
            report.filePath,
            report.fileFormat,
          );
        } catch (metaError) {
          // Reject structural archive bombs cleanly; allow benign cover-thumbnail failures to fall back.
          const msg = metaError instanceof Error ? metaError.message : '';
          if (msg.includes('límite') || msg.includes('descompresión') || msg.includes('ZIP')) {
            throw metaError;
          }
        }
      }

      if (extracted.coverWebpBytes) {
        try {
          savedCoverPath = await writeCoverWebp(itemId, extracted.coverWebpBytes);
        } catch {
          savedCoverPath = null;
        }
      }

      const resolvedTitle =
        cleanMetadataString(extracted.title, MAX_METADATA_TITLE_LEN) ??
        fallbackMeta.title;
      const resolvedAuthor =
        cleanMetadataString(extracted.author, MAX_METADATA_AUTHOR_LEN) ??
        fallbackMeta.author;

      const item = await createItem({
        id: itemId,
        title: resolvedTitle,
        author: resolvedAuthor,
        type: inferInitialItemType(
          report.fileFormat,
          extracted.pageCount,
          report.originalFilename,
        ),
        status: 'inbox',
        file_path: report.filePath,
        cover_path: savedCoverPath,
        file_format: report.fileFormat,
        file_hash: report.fileHash,
        file_size: report.fileSize,
        page_count: extracted.pageCount,
      });

      summary.imported.push(item);
    } catch (error) {
      await Promise.all([
        removeStoredFile(copiedFilePath),
        removeStoredFile(savedCoverPath),
      ]);
      summary.errors.push({
        filename,
        reason: error instanceof Error ? error.message : String(error),
      });
    }
  }

  onProgress?.({
    active: false,
    current: total,
    total,
    currentFilename: '',
  });

  return summary;
}

export async function regenerateItemCover(
  item: LibraryItem,
): Promise<LibraryItem | null> {
  if (!isSafeStoredBookPath(item.file_path)) {
    return item;
  }

  const extracted = await extractDocumentMetadata(item.file_path, item.file_format);
  let nextCoverPath: string | null = item.cover_path;

  if (extracted.coverWebpBytes) {
    nextCoverPath = await writeCoverWebp(item.id, extracted.coverWebpBytes);
  } else if (item.cover_path) {
    await removeStoredFile(item.cover_path);
    nextCoverPath = null;
  }

  return updateItem(item.id, {
    cover_path: nextCoverPath,
    page_count:
      item.page_count === 0 && extracted.pageCount > 0
        ? extracted.pageCount
        : undefined,
  });
}

export async function clearItemCover(
  item: LibraryItem,
): Promise<LibraryItem | null> {
  if (item.cover_path) {
    await removeStoredFile(item.cover_path);
  }
  return updateItem(item.id, { cover_path: null });
}

export async function deleteItemAndFiles(id: string): Promise<void> {
  const item = await getItemById(id);
  await deleteItem(id);

  if (item) {
    await Promise.all([
      removeStoredFile(item.file_path),
      removeStoredFile(item.cover_path),
    ]);
  }
}

export async function bulkDeleteItemsAndFiles(ids: string[]): Promise<void> {
  const uniqueIds = Array.from(new Set(ids));
  if (uniqueIds.length === 0) return;

  // Atomic Rust transaction returns exact deleted rows so disk cleanup matches committed state.
  const deletedItems = await bulkDeleteItems(uniqueIds);

  const fileRemovals: Array<Promise<void>> = [];
  for (const item of deletedItems) {
    fileRemovals.push(removeStoredFile(item.file_path));
    if (item.cover_path) {
      fileRemovals.push(removeStoredFile(item.cover_path));
    }
  }
  await Promise.all(fileRemovals);
}

export async function openBookExternally(item: LibraryItem): Promise<void> {
  if (!isSafeStoredBookPath(item.file_path)) {
    throw new Error('Este elemento no tiene un archivo local válido para apertura externa.');
  }

  await openStoredBook(item.file_path);
  await updateItem(item.id, {
    last_opened_at: new Date().toISOString(),
  });
}

export async function revealBookInExplorer(item: LibraryItem): Promise<void> {
  if (!isSafeStoredBookPath(item.file_path)) {
    throw new Error('Este elemento no tiene un archivo local válido.');
  }

  await revealStoredBook(item.file_path);
}
