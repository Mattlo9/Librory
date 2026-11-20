import { strFromU8, unzipSync } from 'fflate';
import { canvasToWebpBytes, COVER_TARGET_WIDTH } from '@/lib/imageEncoding';
import type { ExtractedDocumentMeta } from '@/types/domain';

function findZipEntry(
  files: Record<string, Uint8Array>,
  targetPath: string,
): Uint8Array | null {
  if (files[targetPath]) {
    return files[targetPath];
  }
  const lower = targetPath.toLowerCase();
  for (const [key, value] of Object.entries(files)) {
    if (key.toLowerCase() === lower) {
      return value;
    }
  }
  return null;
}

function resolveOpfHref(opfPath: string, href: string): string {
  let cleanHref = href.split('#')[0] ?? href;
  try {
    cleanHref = decodeURIComponent(cleanHref);
  } catch {
    // Mantener string original si tiene % malformado.
  }

  const lastSlash = opfPath.lastIndexOf('/');
  const baseParts = lastSlash >= 0 ? opfPath.slice(0, lastSlash).split('/') : [];

  for (const segment of cleanHref.split('/')) {
    if (!segment || segment === '.') continue;
    if (segment === '..') {
      baseParts.pop();
    } else {
      baseParts.push(segment);
    }
  }

  return baseParts.join('/');
}

function firstElementText(doc: Document, localName: string): string | null {
  const byNs = doc.getElementsByTagNameNS('*', localName);
  const el = byNs[0] ?? doc.getElementsByTagName(localName)[0];
  const text = el?.textContent?.replace(/\s+/g, ' ').trim();
  return text || null;
}

function findCoverHref(doc: Document): string | null {
  const items = Array.from(doc.getElementsByTagNameNS('*', 'item'));
  const fallbackItems =
    items.length > 0 ? items : Array.from(doc.getElementsByTagName('item'));

  const epub3Cover = fallbackItems.find((item) => {
    const props = item.getAttribute('properties') ?? '';
    return props.split(/\s+/).includes('cover-image');
  });
  if (epub3Cover) {
    return epub3Cover.getAttribute('href');
  }

  const metas = Array.from(doc.getElementsByTagNameNS('*', 'meta'));
  const fallbackMetas =
    metas.length > 0 ? metas : Array.from(doc.getElementsByTagName('meta'));
  const coverMeta = fallbackMetas.find(
    (meta) => meta.getAttribute('name') === 'cover',
  );
  const coverId = coverMeta?.getAttribute('content');

  if (coverId) {
    const byId = fallbackItems.find((item) => item.getAttribute('id') === coverId);
    if (byId) {
      return byId.getAttribute('href');
    }
  }

  const heuristicCover = fallbackItems.find((item) => {
    const id = (item.getAttribute('id') ?? '').toLowerCase();
    const mediaType = (item.getAttribute('media-type') ?? '').toLowerCase();
    return mediaType.startsWith('image/') && id.includes('cover');
  });

  return heuristicCover?.getAttribute('href') ?? null;
}

async function encodeImageBytesToWebp(imageBytes: Uint8Array): Promise<Uint8Array | null> {
  const blob = new Blob([imageBytes.slice()]);
  let bitmap: ImageBitmap | null = null;
  const canvas = document.createElement('canvas');

  try {
    bitmap = await createImageBitmap(blob);
    if (bitmap.width === 0 || bitmap.height === 0) {
      return null;
    }

    const scale = Math.min(1, COVER_TARGET_WIDTH / bitmap.width);
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));

    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    return await canvasToWebpBytes(canvas);
  } catch {
    return null;
  } finally {
    bitmap?.close();
    canvas.width = 0;
    canvas.height = 0;
  }
}

/**
 * Extracts EPUB OPF metadata (dc:title, dc:creator) and cover image resized to WebP.
 */
export async function extractEpubMetadataAndCover(
  epubBytes: Uint8Array,
): Promise<ExtractedDocumentMeta> {
  const files = unzipSync(epubBytes);
  const containerBytes = findZipEntry(files, 'META-INF/container.xml');
  if (!containerBytes) {
    return { title: null, author: null, pageCount: 0, coverWebpBytes: null };
  }

  const parser = new DOMParser();
  const containerDoc = parser.parseFromString(
    strFromU8(containerBytes),
    'application/xml',
  );
  const rootfile =
    containerDoc.getElementsByTagNameNS('*', 'rootfile')[0] ??
    containerDoc.getElementsByTagName('rootfile')[0];
  const opfPath = rootfile?.getAttribute('full-path');
  if (!opfPath) {
    return { title: null, author: null, pageCount: 0, coverWebpBytes: null };
  }

  const opfBytes = findZipEntry(files, opfPath);
  if (!opfBytes) {
    return { title: null, author: null, pageCount: 0, coverWebpBytes: null };
  }

  const opfDoc = parser.parseFromString(strFromU8(opfBytes), 'application/xml');
  const title = firstElementText(opfDoc, 'title');
  const author = firstElementText(opfDoc, 'creator');

  let coverWebpBytes: Uint8Array | null = null;
  const coverHref = findCoverHref(opfDoc);
  if (coverHref) {
    const resolvedCoverPath = resolveOpfHref(opfPath, coverHref);
    const coverEntry = findZipEntry(files, resolvedCoverPath);
    if (coverEntry) {
      coverWebpBytes = await encodeImageBytesToWebp(coverEntry);
    }
  }

  return {
    title,
    author,
    pageCount: 0,
    coverWebpBytes,
  };
}
