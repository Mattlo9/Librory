import { strFromU8 } from 'fflate';
import { normalizeZipLookupKey, safeUnzipEpub } from '@/lib/safeZip';
import { cleanMetadataString, isSafeHttpUrl } from '@/lib/validation';

export interface EpubChapterMeta {
  index: number;
  id: string;
  href: string;
  zipPath: string;
  title: string;
}

export interface EpubTocEntry {
  id: string;
  label: string;
  chapterIndex: number;
  anchorId: string | null;
  depth: number;
}

export interface ParsedEpubBook {
  title: string | null;
  author: string | null;
  chapters: EpubChapterMeta[];
  toc: EpubTocEntry[];
  renderChapterHtml: (chapterIndex: number) => { html: string; title: string };
  resolveChapterByPath: (zipPath: string) => number;
  dispose: () => void;
}

interface ManifestEntry {
  id: string;
  href: string;
  zipPath: string;
  mediaType: string;
  properties: string;
}

const MAX_SPINE_CHAPTERS = 2_000;
const MAX_TOC_DEPTH = 16;
const MAX_TOC_ENTRIES = 5_000;
const MAX_SANITIZE_DEPTH = 64;
const MAX_SANITIZE_NODES = 50_000;

/**
 * Strictly raster image MIME types only (SVG intentionally excluded to prevent script/SMIL/XLink risks).
 */
const RASTER_IMAGE_MIME_BY_EXT: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  avif: 'image/avif',
  bmp: 'image/bmp',
};

const SAFE_RASTER_DATA_URI_RE =
  /^data:image\/(png|jpeg|jpg|gif|webp|avif|bmp);base64,[A-Za-z0-9+/=\s]+$/i;

/**
 * Strict allowlist of safe prose HTML elements (zero raw-text elements, zero foreign namespaces,
 * zero interactive/executable/navigation/style tags).
 */
const ALLOWED_HTML_TAGS = new Set([
  'p',
  'div',
  'span',
  'br',
  'hr',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'blockquote',
  'pre',
  'code',
  'em',
  'strong',
  'i',
  'b',
  'u',
  's',
  'del',
  'ins',
  'sub',
  'sup',
  'small',
  'mark',
  'abbr',
  'cite',
  'q',
  'dfn',
  'kbd',
  'samp',
  'var',
  'time',
  'ruby',
  'rt',
  'rp',
  'bdi',
  'bdo',
  'wbr',
  'ul',
  'ol',
  'li',
  'dl',
  'dt',
  'dd',
  'table',
  'thead',
  'tbody',
  'tfoot',
  'tr',
  'th',
  'td',
  'caption',
  'colgroup',
  'col',
  'figure',
  'figcaption',
  'section',
  'article',
  'aside',
  'header',
  'footer',
  'nav',
  'main',
  'address',
  'img',
  'a',
]);

/**
 * Elements whose entire subtree must be discarded (never unwrapped as plain text).
 */
const DROP_SUBTREE_TAGS = new Set([
  'script',
  'style',
  'noscript',
  'template',
  'iframe',
  'object',
  'embed',
  'applet',
  'form',
  'input',
  'button',
  'select',
  'textarea',
  'fieldset',
  'option',
  'optgroup',
  'base',
  'meta',
  'link',
  'head',
  'title',
  'audio',
  'video',
  'source',
  'track',
  'canvas',
  'dialog',
  'marquee',
  'portal',
  'frame',
  'frameset',
  'math',
  'annotation-xml',
  'xmp',
  'noembed',
  'noframes',
  'plaintext',
]);

function splitHref(href: string): { pathPart: string; hashPart: string | null } {
  const hashIndex = href.indexOf('#');
  const withoutHash = hashIndex >= 0 ? href.slice(0, hashIndex) : href;
  const hashPart = hashIndex >= 0 ? href.slice(hashIndex + 1) : null;
  const queryIndex = withoutHash.indexOf('?');
  const pathPart = queryIndex >= 0 ? withoutHash.slice(0, queryIndex) : withoutHash;
  return {
    pathPart,
    hashPart: hashPart ? decodeSafe(hashPart) : null,
  };
}

function decodeSafe(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export function resolveRelativePath(baseFilePath: string, href: string): string {
  const { pathPart } = splitHref(href);
  const decoded = decodeSafe(pathPart).replace(/\\/g, '/');
  const normalizedBase = baseFilePath.replace(/\\/g, '/').replace(/^\/+/, '');
  const lastSlash = normalizedBase.lastIndexOf('/');
  const baseParts =
    lastSlash >= 0
      ? normalizedBase.slice(0, lastSlash).split('/').filter(Boolean)
      : [];

  for (const segment of decoded.split('/')) {
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

function getElementsByLocalName(
  root: Document | Element,
  localName: string,
): Element[] {
  const byNs = root.getElementsByTagNameNS('*', localName);
  if (byNs.length > 0) {
    return Array.from(byNs);
  }
  return Array.from(root.getElementsByTagName(localName));
}

function inferRasterMimeType(path: string): string | null {
  const dotIdx = path.lastIndexOf('.');
  if (dotIdx < 0) return null;
  const ext = path.slice(dotIdx + 1).toLowerCase();
  return RASTER_IMAGE_MIME_BY_EXT[ext] ?? null;
}

function parseDocumentSafe(
  bytes: Uint8Array,
  parser: DOMParser,
): Document {
  const markup = strFromU8(bytes);
  const xhtmlDoc = parser.parseFromString(markup, 'application/xhtml+xml');
  if (xhtmlDoc.getElementsByTagName('parsererror').length === 0) {
    return xhtmlDoc;
  }
  return parser.parseFromString(markup, 'text/html');
}

function extractChapterTitleFromDoc(doc: Document, fallback: string): string {
  const h1 = doc.querySelector('h1');
  const h1Text = cleanMetadataString(h1?.textContent, 200);
  if (h1Text) return h1Text;

  const h2 = doc.querySelector('h2');
  const h2Text = cleanMetadataString(h2?.textContent, 200);
  if (h2Text) return h2Text;

  const titleEl = doc.querySelector('title');
  const titleText = cleanMetadataString(titleEl?.textContent, 200);
  if (titleText && titleText.toLowerCase() !== 'unknown') return titleText;

  return fallback;
}

function getAttributeByLocalName(el: Element, targetLocalName: string): string | null {
  const direct = el.getAttribute(targetLocalName);
  if (direct !== null) return direct;
  for (const attr of Array.from(el.attributes)) {
    if (attr.localName.toLowerCase() === targetLocalName) {
      return attr.value;
    }
  }
  return null;
}

function sanitizePositiveIntAttr(raw: string | null, max: number): string | null {
  if (!raw) return null;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed < 1 || parsed > max) return null;
  return String(parsed);
}

/**
 * Rebuilds an EPUB XHTML/HTML chapter DOM strictly from scratch using an HTML-only element
 * and attribute allowlist. Eliminates XML namespace-prefix bypasses, XHTML-to-HTML raw-text
 * mXSS (`xmp`/`noembed`/`noframes`/`plaintext`), `<template>` blind spots, SVG/SMIL/XLink
 * vectors, inline `style` UI redressing, and DOM clobbering (`id`/`name`).
 */
export function sanitizeChapterMarkupToHtml(
  doc: Document,
  chapterZipPath: string,
  resolveRasterImageUrl: (zipPath: string) => string | null,
  ownerDocument: Document = document,
): string {
  const outputContainer = ownerDocument.createElement('div');
  const sourceRoot = doc.body ?? doc.documentElement;
  if (!sourceRoot) {
    return '';
  }

  let emittedNodes = 0;

  const createSafeImg = (rawSrc: string | null, altText: string | null): HTMLImageElement | null => {
    if (!rawSrc) return null;
    const trimmed = rawSrc.trim();
    if (!trimmed) return null;

    let resolvedSrc: string | null = null;
    if (SAFE_RASTER_DATA_URI_RE.test(trimmed)) {
      resolvedSrc = trimmed;
    } else if (!/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(trimmed) && !trimmed.startsWith('//')) {
      const imgZipPath = resolveRelativePath(chapterZipPath, trimmed);
      resolvedSrc = resolveRasterImageUrl(imgZipPath);
    }

    if (!resolvedSrc) return null;
    const img = ownerDocument.createElement('img');
    img.setAttribute('src', resolvedSrc);
    if (altText) {
      img.setAttribute('alt', altText.slice(0, 500));
    }
    return img;
  };

  const walk = (sourceNode: Node, targetParent: Node, depth: number): void => {
    if (depth > MAX_SANITIZE_DEPTH || emittedNodes >= MAX_SANITIZE_NODES) {
      return;
    }

    if (sourceNode.nodeType === 3 /* TEXT_NODE */) {
      const text = sourceNode.nodeValue;
      if (text) {
        emittedNodes += 1;
        targetParent.appendChild(ownerDocument.createTextNode(text));
      }
      return;
    }

    if (sourceNode.nodeType !== 1 /* ELEMENT_NODE */) {
      return;
    }

    const sourceEl = sourceNode as Element;
    // Always inspect `localName`, never `tagName`, so XML namespace prefixes cannot bypass checks.
    const localTag = sourceEl.localName.toLowerCase();

    if (DROP_SUBTREE_TAGS.has(localTag)) {
      return;
    }

    // Preserve cover illustrations wrapped in `<svg><image href="..."/></svg>` as safe raster `<img>`,
    // while dropping `<svg>` and all other SVG/SMIL elements entirely.
    if (localTag === 'svg') {
      const images = getElementsByLocalName(sourceEl, 'image');
      for (const svgImg of images) {
        if (emittedNodes >= MAX_SANITIZE_NODES) break;
        const rawHref = getAttributeByLocalName(svgImg, 'href');
        const safeImg = createSafeImg(rawHref, null);
        if (safeImg) {
          emittedNodes += 1;
          targetParent.appendChild(safeImg);
        }
      }
      return;
    }

    if (!ALLOWED_HTML_TAGS.has(localTag)) {
      // Unknown structural wrapper (e.g. epub-specific custom tags): unwrap safe children only.
      for (const child of Array.from(sourceEl.childNodes)) {
        walk(child, targetParent, depth + 1);
      }
      return;
    }

    if (localTag === 'img') {
      const rawSrc = getAttributeByLocalName(sourceEl, 'src');
      const alt = getAttributeByLocalName(sourceEl, 'alt');
      const safeImg = createSafeImg(rawSrc, alt);
      if (safeImg) {
        const anchorId = getAttributeByLocalName(sourceEl, 'id');
        if (anchorId && anchorId.length <= 200) {
          safeImg.setAttribute('data-epub-id', anchorId);
        }
        emittedNodes += 1;
        targetParent.appendChild(safeImg);
      }
      return;
    }

    const cleanEl = ownerDocument.createElement(localTag);
    emittedNodes += 1;

    // Store original anchor IDs in `data-epub-id` instead of live `id`/`name` to prevent DOM Clobbering.
    const rawAnchorId =
      getAttributeByLocalName(sourceEl, 'id') ??
      getAttributeByLocalName(sourceEl, 'name');
    if (rawAnchorId && rawAnchorId.trim() && rawAnchorId.length <= 200) {
      cleanEl.setAttribute('data-epub-id', rawAnchorId.trim());
    }

    const dir = getAttributeByLocalName(sourceEl, 'dir');
    if (dir === 'ltr' || dir === 'rtl' || dir === 'auto') {
      cleanEl.setAttribute('dir', dir);
    }

    const lang = getAttributeByLocalName(sourceEl, 'lang');
    if (lang && /^[A-Za-z0-9-]{2,20}$/.test(lang)) {
      cleanEl.setAttribute('lang', lang);
    }

    const titleAttr = getAttributeByLocalName(sourceEl, 'title');
    if (titleAttr && localTag !== 'a') {
      cleanEl.setAttribute('title', titleAttr.slice(0, 300));
    }

    if (localTag === 'td' || localTag === 'th') {
      const colspan = sanitizePositiveIntAttr(getAttributeByLocalName(sourceEl, 'colspan'), 50);
      const rowspan = sanitizePositiveIntAttr(getAttributeByLocalName(sourceEl, 'rowspan'), 50);
      if (colspan) cleanEl.setAttribute('colspan', colspan);
      if (rowspan) cleanEl.setAttribute('rowspan', rowspan);
    } else if (localTag === 'ol') {
      const start = sanitizePositiveIntAttr(getAttributeByLocalName(sourceEl, 'start'), 10_000);
      if (start) cleanEl.setAttribute('start', start);
    } else if (localTag === 'a') {
      const rawHref = getAttributeByLocalName(sourceEl, 'href')?.trim() ?? '';
      cleanEl.setAttribute('draggable', 'false');
      if (rawHref) {
        if (isSafeHttpUrl(rawHref)) {
          cleanEl.setAttribute('href', rawHref);
          cleanEl.setAttribute('title', rawHref);
          cleanEl.setAttribute('data-epub-external', 'true');
          cleanEl.setAttribute('target', '_blank');
          cleanEl.setAttribute('rel', 'noopener noreferrer');
        } else if (rawHref.startsWith('#')) {
          cleanEl.setAttribute('href', '#');
          cleanEl.setAttribute('data-epub-path', chapterZipPath);
          cleanEl.setAttribute('data-epub-hash', decodeSafe(rawHref.slice(1)));
        } else if (!/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(rawHref) && !rawHref.startsWith('//')) {
          const targetPath = resolveRelativePath(chapterZipPath, rawHref);
          const { hashPart } = splitHref(rawHref);
          cleanEl.setAttribute('href', '#');
          cleanEl.setAttribute('data-epub-path', targetPath);
          if (hashPart) {
            cleanEl.setAttribute('data-epub-hash', hashPart);
          }
        }
        // Any unsafe scheme (javascript:, vbscript:, data:, file:, smb:, mailto:, ms-settings:, etc.)
        // is intentionally stripped, leaving harmless anchor text only.
      }
    }

    for (const child of Array.from(sourceEl.childNodes)) {
      walk(child, cleanEl, depth + 1);
    }

    targetParent.appendChild(cleanEl);
  };

  for (const child of Array.from(sourceRoot.childNodes)) {
    walk(child, outputContainer, 0);
  }

  return outputContainer.innerHTML;
}

/**
 * Parses an EPUB archive in memory with strict Zip-Bomb bounds, structural caps,
 * and an allowlist-based HTML sanitizer.
 */
export function parseEpubBook(bytes: Uint8Array): ParsedEpubBook {
  const filesByNormalized = safeUnzipEpub(bytes);

  const getFile = (zipPath: string): Uint8Array | null =>
    filesByNormalized.get(normalizeZipLookupKey(zipPath)) ?? null;

  const parser = new DOMParser();
  const containerBytes = getFile('META-INF/container.xml');
  if (!containerBytes) {
    throw new Error('El archivo EPUB no contiene META-INF/container.xml.');
  }

  const containerDoc = parser.parseFromString(
    strFromU8(containerBytes),
    'application/xml',
  );
  const rootfile = getElementsByLocalName(containerDoc, 'rootfile')[0];
  const opfPath = rootfile?.getAttribute('full-path');
  if (!opfPath) {
    throw new Error('No se encontró la ruta OPF dentro del archivo EPUB.');
  }

  const opfBytes = getFile(opfPath);
  if (!opfBytes) {
    throw new Error('No se pudo leer el manifiesto OPF del EPUB.');
  }

  const opfDoc = parser.parseFromString(strFromU8(opfBytes), 'application/xml');
  const title = cleanMetadataString(firstElementText(opfDoc, 'title'), 512);
  const author = cleanMetadataString(firstElementText(opfDoc, 'creator'), 256);

  const manifestById = new Map<string, ManifestEntry>();
  let navEntry: ManifestEntry | null = null;
  let ncxFallbackEntry: ManifestEntry | null = null;

  for (const el of getElementsByLocalName(opfDoc, 'item')) {
    const id = el.getAttribute('id') ?? '';
    const href = el.getAttribute('href') ?? '';
    const mediaType = (el.getAttribute('media-type') ?? '').toLowerCase();
    const properties = el.getAttribute('properties') ?? '';
    if (!id || !href) continue;

    const entry: ManifestEntry = {
      id,
      href,
      zipPath: resolveRelativePath(opfPath, href),
      mediaType,
      properties,
    };
    manifestById.set(id, entry);

    if (properties.split(/\s+/).includes('nav')) {
      navEntry = entry;
    }
    if (mediaType === 'application/x-dtbncx+xml') {
      ncxFallbackEntry = entry;
    }
  }

  const spineEl = getElementsByLocalName(opfDoc, 'spine')[0];
  const chapters: EpubChapterMeta[] = [];
  const chapterIndexByPath = new Map<string, number>();

  for (const itemref of getElementsByLocalName(opfDoc, 'itemref')) {
    if (chapters.length >= MAX_SPINE_CHAPTERS) break;
    if (itemref.getAttribute('linear') === 'no') continue;
    const idref = itemref.getAttribute('idref');
    if (!idref) continue;
    const entry = manifestById.get(idref);
    if (!entry) continue;

    const index = chapters.length;
    const chapterMeta: EpubChapterMeta = {
      index,
      id: entry.id,
      href: entry.href,
      zipPath: entry.zipPath,
      title: `Capítulo ${index + 1}`,
    };
    chapters.push(chapterMeta);
    const normPath = normalizeZipLookupKey(entry.zipPath);
    if (!chapterIndexByPath.has(normPath)) {
      chapterIndexByPath.set(normPath, index);
    }
  }

  if (chapters.length === 0) {
    throw new Error('Este EPUB no contiene capítulos legibles en su spine.');
  }

  const resolveChapterByPath = (zipPath: string): number =>
    chapterIndexByPath.get(normalizeZipLookupKey(zipPath)) ?? -1;

  // Extraer tabla de contenidos con límites estrictos de profundidad y entradas.
  const toc: EpubTocEntry[] = [];

  if (navEntry) {
    const navBytes = getFile(navEntry.zipPath);
    if (navBytes) {
      const navDoc = parseDocumentSafe(navBytes, parser);
      const navEls = Array.from(navDoc.querySelectorAll('nav'));
      const tocNav =
        navEls.find(
          (nav) =>
            nav.getAttribute('epub:type') === 'toc' ||
            nav.getAttributeNS('http://www.idpf.org/2007/ops', 'type') === 'toc',
        ) ?? navEls.find((nav) => nav.querySelector('ol'));

      const walkOl = (olEl: Element, depth: number) => {
        if (depth > MAX_TOC_DEPTH || toc.length >= MAX_TOC_ENTRIES) return;
        for (const child of Array.from(olEl.children)) {
          if (toc.length >= MAX_TOC_ENTRIES) break;
          if (child.localName !== 'li') continue;
          const anchor = Array.from(child.children).find(
            (el) => el.localName === 'a',
          );
          const spanLabel = Array.from(child.children).find(
            (el) => el.localName === 'span',
          );
          const href = anchor?.getAttribute('href');
          const label =
            cleanMetadataString(anchor?.textContent, 200) ||
            cleanMetadataString(spanLabel?.textContent, 200) ||
            '';

          if (href && label) {
            const targetZip = resolveRelativePath(navEntry!.zipPath, href);
            const { hashPart } = splitHref(href);
            const chapterIndex = resolveChapterByPath(targetZip);
            if (chapterIndex >= 0) {
              toc.push({
                id: `toc-${toc.length}`,
                label,
                chapterIndex,
                anchorId: hashPart,
                depth,
              });
            }
          }

          for (const nestedOl of Array.from(child.children)) {
            if (nestedOl.localName === 'ol') {
              walkOl(nestedOl, depth + 1);
            }
          }
        }
      };

      const rootOl = tocNav?.querySelector('ol');
      if (rootOl) {
        walkOl(rootOl, 0);
      }
    }
  }

  if (toc.length === 0) {
    const tocId = spineEl?.getAttribute('toc');
    const ncxEntry = (tocId ? manifestById.get(tocId) : null) ?? ncxFallbackEntry;
    if (ncxEntry) {
      const ncxBytes = getFile(ncxEntry.zipPath);
      if (ncxBytes) {
        const ncxDoc = parser.parseFromString(strFromU8(ncxBytes), 'application/xml');
        const navMap = getElementsByLocalName(ncxDoc, 'navMap')[0];

        const walkNavPoints = (parent: Element, depth: number) => {
          if (depth > MAX_TOC_DEPTH || toc.length >= MAX_TOC_ENTRIES) return;
          for (const child of Array.from(parent.children)) {
            if (toc.length >= MAX_TOC_ENTRIES) break;
            if (child.localName !== 'navPoint') continue;
            const navLabel = Array.from(child.children).find(
              (el) => el.localName === 'navLabel',
            );
            const textEl = navLabel
              ? getElementsByLocalName(navLabel, 'text')[0]
              : undefined;
            const contentEl = Array.from(child.children).find(
              (el) => el.localName === 'content',
            );
            const label = cleanMetadataString(textEl?.textContent, 200) ?? '';
            const src = contentEl?.getAttribute('src') ?? '';

            if (label && src) {
              const targetZip = resolveRelativePath(ncxEntry.zipPath, src);
              const { hashPart } = splitHref(src);
              const chapterIndex = resolveChapterByPath(targetZip);
              if (chapterIndex >= 0) {
                toc.push({
                  id: `toc-${toc.length}`,
                  label,
                  chapterIndex,
                  anchorId: hashPart,
                  depth,
                });
              }
            }

            walkNavPoints(child, depth + 1);
          }
        };

        if (navMap) {
          walkNavPoints(navMap, 0);
        }
      }
    }
  }

  // Enriquecer títulos de capítulos deduplicando por zipPath para evitar amplificación DoS.
  const tocLabelByChapter = new Map<number, string>();
  for (const entry of toc) {
    if (!tocLabelByChapter.has(entry.chapterIndex)) {
      tocLabelByChapter.set(entry.chapterIndex, entry.label);
    }
  }

  const extractedTitleCache = new Map<string, string>();
  for (const chapter of chapters) {
    const tocTitle = tocLabelByChapter.get(chapter.index);
    if (tocTitle) {
      chapter.title = tocTitle;
      continue;
    }
    const normPath = normalizeZipLookupKey(chapter.zipPath);
    const cached = extractedTitleCache.get(normPath);
    if (cached !== undefined) {
      chapter.title = cached || chapter.title;
      continue;
    }
    const chBytes = getFile(chapter.zipPath);
    if (chBytes) {
      const chDoc = parseDocumentSafe(chBytes, parser);
      const extracted = extractChapterTitleFromDoc(chDoc, '');
      extractedTitleCache.set(normPath, extracted);
      if (extracted) {
        chapter.title = extracted;
      }
    } else {
      extractedTitleCache.set(normPath, '');
    }
  }

  if (toc.length === 0) {
    for (const chapter of chapters) {
      toc.push({
        id: `toc-${chapter.index}`,
        label: chapter.title,
        chapterIndex: chapter.index,
        anchorId: null,
        depth: 0,
      });
    }
  }

  const blobUrlCache = new Map<string, string>();

  const getOrCreateRasterBlobUrl = (zipPath: string): string | null => {
    const norm = normalizeZipLookupKey(zipPath);
    const existing = blobUrlCache.get(norm);
    if (existing) return existing;

    const mimeType = inferRasterMimeType(zipPath);
    if (!mimeType) return null;

    const entryBytes = getFile(zipPath);
    if (!entryBytes) return null;

    const blob = new Blob([entryBytes.slice()], { type: mimeType });
    const url = URL.createObjectURL(blob);
    blobUrlCache.set(norm, url);
    return url;
  };

  const renderChapterHtml = (
    chapterIndex: number,
  ): { html: string; title: string } => {
    const chapter = chapters[chapterIndex];
    if (!chapter) {
      return { html: '<p>Capítulo no encontrado.</p>', title: '' };
    }

    const chapterBytes = getFile(chapter.zipPath);
    if (!chapterBytes) {
      return {
        html: '<p>No se pudo cargar el contenido de este capítulo.</p>',
        title: chapter.title,
      };
    }

    const doc = parseDocumentSafe(chapterBytes, parser);
    const resolvedTitle = extractChapterTitleFromDoc(doc, chapter.title);
    const html = sanitizeChapterMarkupToHtml(
      doc,
      chapter.zipPath,
      getOrCreateRasterBlobUrl,
    );

    return {
      html,
      title: resolvedTitle,
    };
  };

  const dispose = () => {
    for (const url of blobUrlCache.values()) {
      URL.revokeObjectURL(url);
    }
    blobUrlCache.clear();
  };

  return {
    title,
    author,
    chapters,
    toc,
    renderChapterHtml,
    resolveChapterByPath,
    dispose,
  };
}
