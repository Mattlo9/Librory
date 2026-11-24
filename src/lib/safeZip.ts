import { unzipSync, type UnzipFileInfo } from 'fflate';

export interface SafeUnzipLimits {
  maxArchiveBytes?: number;
  maxEntries?: number;
  maxEntryBytes?: number;
  maxTotalUncompressedBytes?: number;
  maxCompressionRatio?: number;
  /** Optional normalized lowercase paths to extract; all other entries are skipped before allocation. */
  onlyNormalizedPaths?: ReadonlySet<string>;
}

const DEFAULT_MAX_ARCHIVE_BYTES = 256 * 1024 * 1024; // 256 MiB
const DEFAULT_MAX_ENTRIES = 2_000;
const DEFAULT_MAX_ENTRY_BYTES = 25 * 1024 * 1024; // 25 MiB
const DEFAULT_MAX_TOTAL_UNCOMPRESSED_BYTES = 150 * 1024 * 1024; // 150 MiB
const DEFAULT_MAX_COMPRESSION_RATIO = 100;
const RATIO_CHECK_MIN_BYTES = 64 * 1024; // Only enforce ratio check above 64 KiB

const PROTOTYPE_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

export function normalizeZipLookupKey(path: string): string {
  return path.replace(/\\/g, '/').replace(/^\/+/, '').toLowerCase();
}

function isZipMagic(bytes: Uint8Array): boolean {
  return (
    bytes.length >= 4 &&
    bytes[0] === 0x50 &&
    bytes[1] === 0x4b &&
    bytes[2] === 0x03 &&
    bytes[3] === 0x04
  );
}

/**
 * Decompresses an untrusted EPUB/ZIP buffer into a prototype-safe Map while enforcing
 * pre-allocation limits on entry count, per-entry size, cumulative uncompressed size,
 * and compression ratio to defend against Zip Bombs and memory exhaustion.
 */
export function safeUnzipEpub(
  bytes: Uint8Array,
  limits: SafeUnzipLimits = {},
): Map<string, Uint8Array> {
  const maxArchiveBytes = limits.maxArchiveBytes ?? DEFAULT_MAX_ARCHIVE_BYTES;
  const maxEntries = limits.maxEntries ?? DEFAULT_MAX_ENTRIES;
  const maxEntryBytes = limits.maxEntryBytes ?? DEFAULT_MAX_ENTRY_BYTES;
  const maxTotalBytes =
    limits.maxTotalUncompressedBytes ?? DEFAULT_MAX_TOTAL_UNCOMPRESSED_BYTES;
  const maxRatio = limits.maxCompressionRatio ?? DEFAULT_MAX_COMPRESSION_RATIO;

  if (!isZipMagic(bytes)) {
    throw new Error('El archivo EPUB no tiene una firma ZIP válida.');
  }
  if (bytes.byteLength > maxArchiveBytes) {
    throw new Error('El archivo EPUB supera el límite máximo permitido.');
  }

  let seenEntries = 0;
  let totalUncompressed = 0;
  let limitViolation: string | null = null;

  const rawFiles = unzipSync(bytes, {
    filter(file: UnzipFileInfo): boolean {
      if (limitViolation) return false;

      seenEntries += 1;
      if (seenEntries > maxEntries) {
        limitViolation =
          'El archivo EPUB supera el límite máximo de entradas ZIP permitidas.';
        return false;
      }

      const norm = normalizeZipLookupKey(file.name);
      if (
        !norm ||
        norm.endsWith('/') ||
        norm.includes('\0') ||
        PROTOTYPE_KEYS.has(norm)
      ) {
        return false;
      }

      if (limits.onlyNormalizedPaths && !limits.onlyNormalizedPaths.has(norm)) {
        return false;
      }

      const uncompressedSize = Number(file.originalSize);
      const compressedSize = Number(file.size);
      if (
        !Number.isFinite(uncompressedSize) ||
        uncompressedSize < 0 ||
        uncompressedSize > maxEntryBytes
      ) {
        limitViolation =
          'Una entrada del archivo EPUB excede el límite máximo de tamaño descomprimido.';
        return false;
      }

      if (uncompressedSize > RATIO_CHECK_MIN_BYTES) {
        if (
          !Number.isFinite(compressedSize) ||
          compressedSize <= 0 ||
          uncompressedSize / compressedSize > maxRatio
        ) {
          limitViolation =
            'El archivo EPUB fue rechazado por presentar una relación de compresión sospechosa (posible bomba ZIP).';
          return false;
        }
      }

      totalUncompressed += uncompressedSize;
      if (totalUncompressed > maxTotalBytes) {
        limitViolation =
          'El tamaño total descomprimido del EPUB supera el límite de seguridad permitido.';
        return false;
      }

      return true;
    },
  });

  if (limitViolation) {
    throw new Error(limitViolation);
  }

  const map = new Map<string, Uint8Array>();
  let actualTotal = 0;
  for (const [key, value] of Object.entries(rawFiles)) {
    if (!(value instanceof Uint8Array)) continue;
    const norm = normalizeZipLookupKey(key);
    if (!norm || PROTOTYPE_KEYS.has(norm)) continue;
    if (value.byteLength > maxEntryBytes) {
      throw new Error(
        'Una entrada del archivo EPUB excede el límite máximo de tamaño descomprimido.',
      );
    }
    actualTotal += value.byteLength;
    if (actualTotal > maxTotalBytes) {
      throw new Error(
        'El tamaño total descomprimido del EPUB supera el límite de seguridad permitido.',
      );
    }
    map.set(norm, value);
  }

  return map;
}
