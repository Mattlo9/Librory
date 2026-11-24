import * as pdfjsLib from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { canvasToWebpBytes, COVER_TARGET_WIDTH } from '@/lib/imageEncoding';
import { cleanMetadataString } from '@/lib/validation';
import type { ExtractedDocumentMeta } from '@/types/domain';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

const MAX_PDF_IMAGE_PIXELS = 16_777_216; // 16 megapixels per embedded PDF image
const MAX_COVER_HEIGHT = 960;
const PDF_COVER_RENDER_TIMEOUT_MS = 10_000;

function cleanPdfMetaString(
  raw: unknown,
  maxLength: number,
  rejectFilenames = false,
): string | null {
  if (typeof raw !== 'string') return null;
  const trimmed = cleanMetadataString(raw, maxLength);
  if (!trimmed) return null;

  const lower = trimmed.toLowerCase();
  if (lower === 'untitled' || lower === 'sin título' || lower === 'unknown') {
    return null;
  }

  if (
    rejectFilenames &&
    (/\.(pdf|docx?|pptx?|txt)$/i.test(trimmed) ||
      lower.startsWith('microsoft word -') ||
      lower.startsWith('microsoft powerpoint -'))
  ) {
    return null;
  }

  return trimmed;
}

function readInfoField(info: unknown, key: string): unknown {
  if (typeof info !== 'object' || info === null) return undefined;
  return Object.hasOwn(info, key) ? (info as Record<string, unknown>)[key] : undefined;
}

function hasMeaningfulVisualContent(canvas: HTMLCanvasElement): boolean {
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return true;

  const { width, height } = canvas;
  if (width === 0 || height === 0) return false;

  const data = ctx.getImageData(0, 0, width, height).data;
  const baseR = data[0] ?? 255;
  const baseG = data[1] ?? 255;
  const baseB = data[2] ?? 255;

  const stepX = Math.max(1, Math.floor(width / 24));
  const stepY = Math.max(1, Math.floor(height / 32));
  let totalSamples = 0;
  let differing = 0;

  for (let y = 0; y < height; y += stepY) {
    for (let x = 0; x < width; x += stepX) {
      const idx = (y * width + x) * 4;
      const r = data[idx] ?? baseR;
      const g = data[idx + 1] ?? baseG;
      const b = data[idx + 2] ?? baseB;
      totalSamples += 1;

      if (
        Math.abs(r - baseR) + Math.abs(g - baseG) + Math.abs(b - baseB) >
        14
      ) {
        differing += 1;
      }
    }
  }

  return totalSamples > 0 && differing / totalSamples >= 0.006;
}

/**
 * Extracts PDF metadata, page count, and bounded page-1 WebP thumbnail via pdfjs-dist
 * with hardened parser options (no XFA, no embedded font faces, bounded pixels & timeout).
 */
export async function extractPdfMetadataAndCover(
  pdfBytes: Uint8Array,
): Promise<ExtractedDocumentMeta> {
  const loadingTask = pdfjsLib.getDocument({
    data: pdfBytes.slice(),
    maxImageSize: MAX_PDF_IMAGE_PIXELS,
    disableFontFace: true,
    enableXfa: false,
  });
  const canvas = document.createElement('canvas');
  let pdf: pdfjsLib.PDFDocumentProxy | null = null;
  let page: pdfjsLib.PDFPageProxy | null = null;

  try {
    pdf = await loadingTask.promise;
    const [metaResult, firstPage] = await Promise.all([
      pdf.getMetadata().catch(() => null),
      pdf.numPages > 0 ? pdf.getPage(1) : Promise.resolve(null),
    ]);
    page = firstPage;

    const title = metaResult
      ? cleanPdfMetaString(readInfoField(metaResult.info, 'Title'), 512, true)
      : null;
    const author = metaResult
      ? cleanPdfMetaString(readInfoField(metaResult.info, 'Author'), 256, false)
      : null;

    let coverWebpBytes: Uint8Array | null = null;

    if (page) {
      const baseViewport = page.getViewport({ scale: 1 });
      if (
        Number.isFinite(baseViewport.width) &&
        Number.isFinite(baseViewport.height) &&
        baseViewport.width > 0 &&
        baseViewport.height > 0
      ) {
        // Strictly cap both width and height (no lower scale floor that allows huge MediaBox OOMs).
        const scale = Math.min(
          2,
          COVER_TARGET_WIDTH / baseViewport.width,
          MAX_COVER_HEIGHT / baseViewport.height,
        );
        if (scale > 0) {
          const viewport = page.getViewport({ scale });
          canvas.width = Math.max(1, Math.min(COVER_TARGET_WIDTH, Math.round(viewport.width)));
          canvas.height = Math.max(1, Math.min(MAX_COVER_HEIGHT, Math.round(viewport.height)));

          const renderTask = page.render({ canvas, viewport });
          let timeoutId: number | null = null;
          try {
            await Promise.race([
              renderTask.promise,
              new Promise<never>((_, reject) => {
                timeoutId = window.setTimeout(() => {
                  renderTask.cancel();
                  reject(new Error('Tiempo agotado renderizando portada PDF.'));
                }, PDF_COVER_RENDER_TIMEOUT_MS);
              }),
            ]);
          } finally {
            if (timeoutId !== null) {
              window.clearTimeout(timeoutId);
            }
          }

          if (hasMeaningfulVisualContent(canvas)) {
            coverWebpBytes = await canvasToWebpBytes(canvas);
          }
        }
      }
    }

    return {
      title,
      author,
      pageCount: pdf.numPages,
      coverWebpBytes,
    };
  } finally {
    page?.cleanup();
    canvas.width = 0;
    canvas.height = 0;
    await pdf?.cleanup();
    await loadingTask.destroy();
  }
}
