import { strFromU8 } from 'fflate';
import {
  canvasToWebpBytes,
  COVER_MAX_HEIGHT,
  COVER_TARGET_WIDTH,
  drawImageHighQuality,
} from '@/lib/imageEncoding';
import { normalizeZipLookupKey, safeUnzipEpub } from '@/lib/safeZip';
import { cleanMetadataString } from '@/lib/validation';
import type { ExtractedDocumentMeta } from '@/types/domain';

const MAX_META_XML_BYTES = 4 * 1024 * 1024; // 4 MiB for container.xml / OPF
const MAX_COVER_IMAGE_BYTES = 15 * 1024 * 1024; // 15 MiB compressed cover cap
const MAX_COVER_PIXELS = 25_000_000; // 25 megapixels max decoded bitmap

function resolveOpfHref(opfPath: string, href: string): string {
  let cleanHref = (href.split('#')[0] ?? href).split('?')[0] ?? href;
  try {
    cleanHref = decodeURIComponent(cleanHref);
  } catch {
    // Mantener string original si tiene % malformado.
  }

  const normalizedBase = opfPath.replace(/\\/g, '/').replace(/^\/+/, '');
  const lastSlash = normalizedBase.lastIndexOf('/');
  const baseParts =
    lastSlash >= 0 ? normalizedBase.slice(0, lastSlash).split('/').filter(Boolean) : [];

  for (const segment of cleanHref.replace(/\\/g, '/').split('/')) {
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

function findCoverItem(doc: Document): { href: string; mediaType: string } | null {
  const items = Array.from(doc.getElementsByTagNameNS('*', 'item'));
  const fallbackItems =
    items.length > 0 ? items : Array.from(doc.getElementsByTagName('item'));

  const pick = (el: Element | undefined) => {
    const href = el?.getAttribute('href');
    if (!href) return null;
    const mediaType = (el?.getAttribute('media-type') ?? '').toLowerCase();
    return { href, mediaType };
  };

  const epub3Cover = fallbackItems.find((item) => {
    const props = item.getAttribute('properties') ?? '';
    return props.split(/\s+/).includes('cover-image');
  });
  if (epub3Cover) {
    return pick(epub3Cover);
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
      return pick(byId);
    }
  }

  const heuristicCover = fallbackItems.find((item) => {
    const id = (item.getAttribute('id') ?? '').toLowerCase();
    const mediaType = (item.getAttribute('media-type') ?? '').toLowerCase();
    return (
      mediaType.startsWith('image/') &&
      mediaType !== 'image/svg+xml' &&
      id.includes('cover')
    );
  });

  return pick(heuristicCover);
}

function isSvgPathOrMime(path: string, mediaType: string): boolean {
  return (
    mediaType.includes('svg') ||
    path.toLowerCase().endsWith('.svg') ||
    path.toLowerCase().endsWith('.svgz')
  );
}

async function encodeImageBytesToWebp(imageBytes: Uint8Array): Promise<Uint8Array | null> {
  if (imageBytes.byteLength === 0 || imageBytes.byteLength > MAX_COVER_IMAGE_BYTES) {
    return null;
  }

  const blob = new Blob([imageBytes.slice()]);
  let bitmap: ImageBitmap | null = null;
  let canvas: HTMLCanvasElement | null = null;

  try {
    bitmap = await createImageBitmap(blob);
    if (
      bitmap.width === 0 ||
      bitmap.height === 0 ||
      bitmap.width * bitmap.height > MAX_COVER_PIXELS
    ) {
      return null;
    }

    const scale = Math.min(
      1,
      COVER_TARGET_WIDTH / bitmap.width,
      COVER_MAX_HEIGHT / bitmap.height,
    );
    const targetWidth = Math.max(
      1,
      Math.min(COVER_TARGET_WIDTH, Math.round(bitmap.width * scale)),
    );
    const targetHeight = Math.max(
      1,
      Math.min(COVER_MAX_HEIGHT, Math.round(bitmap.height * scale)),
    );

    canvas = drawImageHighQuality(
      bitmap,
      bitmap.width,
      bitmap.height,
      targetWidth,
      targetHeight,
    );
    if (!canvas) return null;

    return await canvasToWebpBytes(canvas);
  } catch {
    return null;
  } finally {
    bitmap?.close();
    if (canvas) {
      canvas.width = 0;
      canvas.height = 0;
    }
  }
}

/**
 * Extracts EPUB OPF metadata (dc:title, dc:creator) and cover image resized to WebP
 * using targeted zip extraction with strict zip-bomb and pixel-bomb bounds.
 */
export async function extractEpubMetadataAndCover(
  epubBytes: Uint8Array,
): Promise<ExtractedDocumentMeta> {
  const containerKey = normalizeZipLookupKey('META-INF/container.xml');
  const pass1 = safeUnzipEpub(epubBytes, {
    onlyNormalizedPaths: new Set([containerKey]),
    maxEntryBytes: MAX_META_XML_BYTES,
    maxTotalUncompressedBytes: MAX_META_XML_BYTES,
  });
  const containerBytes = pass1.get(containerKey);
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

  const opfKey = normalizeZipLookupKey(opfPath);
  const pass2 = safeUnzipEpub(epubBytes, {
    onlyNormalizedPaths: new Set([opfKey]),
    maxEntryBytes: MAX_META_XML_BYTES,
    maxTotalUncompressedBytes: MAX_META_XML_BYTES,
  });
  const opfBytes = pass2.get(opfKey);
  if (!opfBytes) {
    return { title: null, author: null, pageCount: 0, coverWebpBytes: null };
  }

  const opfDoc = parser.parseFromString(strFromU8(opfBytes), 'application/xml');
  const title = cleanMetadataString(firstElementText(opfDoc, 'title'), 512);
  const author = cleanMetadataString(firstElementText(opfDoc, 'creator'), 256);

  const spineRefs = Array.from(opfDoc.getElementsByTagNameNS('*', 'itemref'));
  const fallbackRefs =
    spineRefs.length > 0
      ? spineRefs
      : Array.from(opfDoc.getElementsByTagName('itemref'));
  const pageCount = Math.min(
    2_000,
    fallbackRefs.filter((ref) => ref.getAttribute('linear') !== 'no').length,
  );

  let coverWebpBytes: Uint8Array | null = null;
  const coverInfo = findCoverItem(opfDoc);
  if (coverInfo && !isSvgPathOrMime(coverInfo.href, coverInfo.mediaType)) {
    const resolvedCoverPath = resolveOpfHref(opfPath, coverInfo.href);
    const coverKey = normalizeZipLookupKey(resolvedCoverPath);
    const pass3 = safeUnzipEpub(epubBytes, {
      onlyNormalizedPaths: new Set([coverKey]),
      maxEntryBytes: MAX_COVER_IMAGE_BYTES,
      maxTotalUncompressedBytes: MAX_COVER_IMAGE_BYTES,
    });
    const coverEntry = pass3.get(coverKey);
    if (coverEntry) {
      coverWebpBytes = await encodeImageBytesToWebp(coverEntry);
    }
  }

  return {
    title,
    author,
    pageCount,
    coverWebpBytes,
  };
}
