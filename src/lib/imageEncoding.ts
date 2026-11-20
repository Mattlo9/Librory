export const COVER_TARGET_WIDTH = 480;
export const COVER_WEBP_QUALITY = 0.84;

/**
 * Encodes an HTMLCanvasElement into WebP bytes without Base64 conversion.
 */
export async function canvasToWebpBytes(
  canvas: HTMLCanvasElement,
  quality = COVER_WEBP_QUALITY,
): Promise<Uint8Array | null> {
  const blob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob((result) => resolve(result), 'image/webp', quality);
  });

  if (!blob || blob.size === 0) {
    return null;
  }

  const buffer = await blob.arrayBuffer();
  return new Uint8Array(buffer);
}
