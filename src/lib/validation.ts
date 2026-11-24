const WINDOWS_RESERVED_RE = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\..*)?$/i;
const SAFE_ITEM_ID_RE = /^[A-Za-z0-9_-]{1,80}$/;
const SAFE_BOOK_PATH_RE = /^books\/([A-Za-z0-9_-]{1,80})\.(pdf|epub)$/;
const SAFE_COVER_PATH_RE = /^covers\/([A-Za-z0-9_-]{1,80})\.webp$/;
const SAFE_ITEM_PATH_RE = /^(books|sample)\/([A-Za-z0-9_-]{1,80})\.(pdf|epub)$/;
const MAX_FILENAME_STEM_CHARS = 120;
const MAX_FOLDER_DEPTH = 8;
const MAX_FOLDER_SEG_CHARS = 80;

export function isWindowsReservedName(name: string): boolean {
  return WINDOWS_RESERVED_RE.test(name.trim());
}

export function isSafeItemId(id: string): boolean {
  return SAFE_ITEM_ID_RE.test(id) && !isWindowsReservedName(id);
}

export function isSafeStoredBookPath(path: string | null | undefined): path is string {
  if (!path) return false;
  const match = SAFE_BOOK_PATH_RE.exec(path);
  if (!match) return false;
  return !isWindowsReservedName(match[1] ?? '');
}

export function isSafeStoredCoverPath(path: string | null | undefined): path is string {
  if (!path) return false;
  const match = SAFE_COVER_PATH_RE.exec(path);
  if (!match) return false;
  return !isWindowsReservedName(match[1] ?? '');
}

export function isSafeItemFilePath(path: string | null | undefined): path is string {
  if (!path) return false;
  const match = SAFE_ITEM_PATH_RE.exec(path);
  if (!match) return false;
  return !isWindowsReservedName(match[2] ?? '');
}

export function isSafeAssetUrl(url: string | null | undefined): url is string {
  if (!url) return false;
  return (
    url.startsWith('asset://') ||
    url.startsWith('http://asset.localhost/') ||
    url.startsWith('https://asset.localhost/')
  );
}

/**
 * Validates external links: strictly `http:` or `https:`, disallowing control characters,
 * localhost, `*.localhost` (including `ipc.localhost`/`asset.localhost`), and loopback IPs.
 */
export function isSafeHttpUrl(rawUrl: string): boolean {
  const trimmed = rawUrl.trim();
  if (!trimmed || trimmed.length > 2048 || /[\u0000-\u001F\u007F]/.test(trimmed)) {
    return false;
  }
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return false;
    }
    const host = parsed.hostname.toLowerCase();
    if (
      !host ||
      host === 'localhost' ||
      host.endsWith('.localhost') ||
      host === '0.0.0.0' ||
      host === '::1' ||
      host === '[::1]' ||
      host === '::' ||
      host === '[::]' ||
      /^127\./.test(host)
    ) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

/**
 * Linear O(N) trimmer for leading/trailing dots and whitespace (avoids regex backtracking).
 */
export function trimDotsAndSpaces(value: string): string {
  let start = 0;
  let end = value.length;
  while (start < end) {
    const ch = value.charCodeAt(start);
    if (ch === 46 || ch === 32 || ch === 9 || ch === 10 || ch === 13) {
      start += 1;
    } else {
      break;
    }
  }
  while (end > start) {
    const ch = value.charCodeAt(end - 1);
    if (ch === 46 || ch === 32 || ch === 9 || ch === 10 || ch === 13) {
      end -= 1;
    } else {
      break;
    }
  }
  return value.slice(start, end);
}

/**
 * Safely encodes a YAML double-quoted scalar, neutralizing standalone CR, Unicode line
 * separators (NEL/LS/PS), and C0/C1 control characters to prevent frontmatter breakout.
 */
export function escapeYamlString(value: string): string {
  const cleaned = value
    .replace(/[\r\n\u0085\u2028\u2029]+/g, ' ')
    .replace(/[\u0000-\u001F\u007F-\u009F]/g, '')
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"');
  return `"${cleaned}"`;
}

/**
 * Produces a safe `.md` filename compatible with Windows (blocking reserved DOS device names)
 * and Obsidian vaults in O(N) time.
 */
export function sanitizeNoteFilename(title: string): string {
  const trimmed = title.trim();
  const withoutExt = trimmed.toLowerCase().endsWith('.md')
    ? trimmed.slice(0, -3)
    : trimmed;
  const cleaned = withoutExt
    .replace(/[<>:"/\\|?*\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ');
  const stripped = trimDotsAndSpaces(
    trimDotsAndSpaces(cleaned).slice(0, MAX_FILENAME_STEM_CHARS),
  );

  if (!stripped) {
    return 'Nota sin titulo.md';
  }
  if (isWindowsReservedName(stripped)) {
    return `_${stripped}.md`;
  }
  return `${stripped}.md`;
}

/**
 * Normalizes a relative Obsidian folder path, rejecting traversal and Windows reserved names.
 */
export function sanitizeNoteFolder(folder: string): string {
  const out: string[] = [];
  for (const rawSeg of folder.split(/[\\/]/)) {
    const cleaned = rawSeg
      .replace(/[<>:"|?*\u0000-\u001f\u007f]/g, ' ')
      .replace(/\s+/g, ' ');
    const seg = trimDotsAndSpaces(
      trimDotsAndSpaces(cleaned).slice(0, MAX_FOLDER_SEG_CHARS),
    );
    if (!seg || seg === '.' || seg === '..') {
      continue;
    }
    out.push(isWindowsReservedName(seg) ? `_${seg}` : seg);
    if (out.length >= MAX_FOLDER_DEPTH) {
      break;
    }
  }
  return out.join('/');
}

export function cleanMetadataString(
  raw: string | null | undefined,
  maxLength: number,
): string | null {
  if (typeof raw !== 'string') return null;
  const cleaned = raw
    .replace(/[\u0000-\u001F\u007F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength)
    .trim();
  return cleaned || null;
}
