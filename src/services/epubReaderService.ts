import { strFromU8, unzipSync } from 'fflate';

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

const IMAGE_MIME_BY_EXT: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  svg: 'image/svg+xml',
  avif: 'image/avif',
  bmp: 'image/bmp',
};

const UNSAFE_TAGS = new Set([
  'script',
  'iframe',
  'object',
  'embed',
  'applet',
  'form',
  'base',
  'meta',
  'link',
  'style',
  'noscript',
]);

function normalizeZipLookupKey(path: string): string {
  return path.replace(/\\/g, '/').replace(/^\/+/, '').toLowerCase();
}

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

function resolveRelativePath(baseFilePath: string, href: string): string {
  const { pathPart } = splitHref(href);
  const decoded = decodeSafe(pathPart);
  const lastSlash = baseFilePath.lastIndexOf('/');
  const baseParts =
    lastSlash >= 0
      ? baseFilePath.slice(0, lastSlash).split('/').filter(Boolean)
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

function inferMimeType(path: string): string {
  const dotIdx = path.lastIndexOf('.');
  if (dotIdx < 0) return 'application/octet-stream';
  const ext = path.slice(dotIdx + 1).toLowerCase();
  return IMAGE_MIME_BY_EXT[ext] ?? 'application/octet-stream';
}

function isDangerousUrl(value: string): boolean {
  const normalized = value.replace(/[\s\u0000-\u001F]+/g, '').toLowerCase();
  return (
    normalized.startsWith('javascript:') ||
    normalized.startsWith('vbscript:') ||
    normalized.startsWith('data:text/html')
  );
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
  const h1Text = h1?.textContent?.replace(/\s+/g, ' ').trim();
  if (h1Text) return h1Text;

  const h2 = doc.querySelector('h2');
  const h2Text = h2?.textContent?.replace(/\s+/g, ' ').trim();
  if (h2Text) return h2Text;

  const titleEl = doc.querySelector('title');
  const titleText = titleEl?.textContent?.replace(/\s+/g, ' ').trim();
  if (titleText && titleText.toLowerCase() !== 'unknown') return titleText;

  return fallback;
}

/**
 * Parses an EPUB archive in memory into linear chapters, TOC entries, and sanitized XHTML renderer.
 */
export function parseEpubBook(bytes: Uint8Array): ParsedEpubBook {
  const rawFiles = unzipSync(bytes);
  const filesByNormalized = new Map<string, Uint8Array>();
  for (const [key, value] of Object.entries(rawFiles)) {
    filesByNormalized.set(normalizeZipLookupKey(key), value);
  }

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
  const title = firstElementText(opfDoc, 'title');
  const author = firstElementText(opfDoc, 'creator');

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
    chapterIndexByPath.set(normalizeZipLookupKey(entry.zipPath), index);
  }

  if (chapters.length === 0) {
    throw new Error('Este EPUB no contiene capítulos legibles en su spine.');
  }

  const resolveChapterByPath = (zipPath: string): number =>
    chapterIndexByPath.get(normalizeZipLookupKey(zipPath)) ?? -1;

  // Extraer tabla de contenidos (EPUB 3 nav -> EPUB 2 NCX -> fallback spine)
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
        for (const child of Array.from(olEl.children)) {
          if (child.localName !== 'li') continue;
          const anchor = Array.from(child.children).find(
            (el) => el.localName === 'a',
          );
          const spanLabel = Array.from(child.children).find(
            (el) => el.localName === 'span',
          );
          const href = anchor?.getAttribute('href');
          const label =
            anchor?.textContent?.replace(/\s+/g, ' ').trim() ||
            spanLabel?.textContent?.replace(/\s+/g, ' ').trim() ||
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
          for (const child of Array.from(parent.children)) {
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
            const label = textEl?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
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

  // Enriquecer títulos de capítulos desde el TOC o desde los encabezados del capítulo.
  const tocLabelByChapter = new Map<number, string>();
  for (const entry of toc) {
    if (!tocLabelByChapter.has(entry.chapterIndex)) {
      tocLabelByChapter.set(entry.chapterIndex, entry.label);
    }
  }

  for (const chapter of chapters) {
    const tocTitle = tocLabelByChapter.get(chapter.index);
    if (tocTitle) {
      chapter.title = tocTitle;
      continue;
    }
    const chBytes = getFile(chapter.zipPath);
    if (chBytes) {
      const chDoc = parseDocumentSafe(chBytes, parser);
      chapter.title = extractChapterTitleFromDoc(chDoc, chapter.title);
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

  const getOrCreateBlobUrl = (zipPath: string): string | null => {
    const norm = normalizeZipLookupKey(zipPath);
    const existing = blobUrlCache.get(norm);
    if (existing) return existing;

    const entryBytes = getFile(zipPath);
    if (!entryBytes) return null;

    const mimeType = inferMimeType(zipPath);
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

    const container = document.createElement('div');
    const sourceRoot = doc.body ?? doc.documentElement;
    if (sourceRoot) {
      for (const child of Array.from(sourceRoot.childNodes)) {
        container.appendChild(document.importNode(child, true));
      }
    }

    // Eliminar elementos potencialmente peligrosos o que filtren estilos globales.
    const allElements = Array.from(container.querySelectorAll('*'));
    for (const el of allElements) {
      const tag = el.tagName.toLowerCase();
      if (UNSAFE_TAGS.has(tag)) {
        el.remove();
        continue;
      }

      // Limpiar manejadores inline y URLs inseguras
      for (const attr of Array.from(el.attributes)) {
        const attrName = attr.name.toLowerCase();
        if (attrName.startsWith('on')) {
          el.removeAttribute(attr.name);
          continue;
        }
        if (
          (attrName === 'href' ||
            attrName === 'src' ||
            attrName === 'xlink:href' ||
            attrName === 'action' ||
            attrName === 'formaction') &&
          isDangerousUrl(attr.value)
        ) {
          el.removeAttribute(attr.name);
        }
      }

      if (tag === 'img') {
        const rawSrc = el.getAttribute('src');
        if (rawSrc && !rawSrc.startsWith('data:image/') && !rawSrc.startsWith('blob:')) {
          if (/^https?:\/\//i.test(rawSrc)) {
            el.removeAttribute('src');
          } else {
            const imgZipPath = resolveRelativePath(chapter.zipPath, rawSrc);
            const blobUrl = getOrCreateBlobUrl(imgZipPath);
            if (blobUrl) {
              el.setAttribute('src', blobUrl);
            } else {
              el.removeAttribute('src');
            }
          }
        }
        el.removeAttribute('srcset');
      } else if (tag === 'image') {
        const rawHref =
          el.getAttribute('href') ??
          el.getAttribute('xlink:href') ??
          el.getAttributeNS('http://www.w3.org/1999/xlink', 'href');
        if (rawHref && !rawHref.startsWith('data:image/') && !rawHref.startsWith('blob:')) {
          const imgZipPath = resolveRelativePath(chapter.zipPath, rawHref);
          const blobUrl = getOrCreateBlobUrl(imgZipPath);
          if (blobUrl) {
            el.setAttribute('href', blobUrl);
            el.setAttribute('xlink:href', blobUrl);
          }
        }
      } else if (tag === 'a') {
        const rawHref = el.getAttribute('href');
        if (!rawHref) continue;
        if (/^(https?:|mailto:)/i.test(rawHref)) {
          el.setAttribute('data-epub-external', 'true');
          el.setAttribute('target', '_blank');
          el.setAttribute('rel', 'noopener noreferrer');
        } else if (rawHref.startsWith('#')) {
          el.setAttribute('data-epub-path', chapter.zipPath);
          el.setAttribute('data-epub-hash', decodeSafe(rawHref.slice(1)));
          el.setAttribute('href', '#');
        } else {
          const targetPath = resolveRelativePath(chapter.zipPath, rawHref);
          const { hashPart } = splitHref(rawHref);
          el.setAttribute('data-epub-path', targetPath);
          if (hashPart) {
            el.setAttribute('data-epub-hash', hashPart);
          }
          el.setAttribute('href', '#');
        }
      }
    }

    return {
      html: container.innerHTML,
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
