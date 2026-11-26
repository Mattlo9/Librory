export const COVER_TARGET_WIDTH = 640;
export const COVER_MAX_HEIGHT = 1280;
export const COVER_WEBP_QUALITY = 0.9;

/**
 * Downscales an image source to target dimensions using progressive 2x halving passes
 * with high-quality smoothing to prevent Canvas 2D single-pass blur and aliasing.
 */
export function drawImageHighQuality(
  source: CanvasImageSource,
  sourceWidth: number,
  sourceHeight: number,
  targetWidth: number,
  targetHeight: number,
): HTMLCanvasElement | null {
  const safeTargetW = Math.max(1, Math.round(targetWidth));
  const safeTargetH = Math.max(1, Math.round(targetHeight));

  let currentSource: CanvasImageSource = source;
  let currentW = Math.max(1, Math.round(sourceWidth));
  let currentH = Math.max(1, Math.round(sourceHeight));
  const intermediateCanvases: HTMLCanvasElement[] = [];

  try {
    while (currentW * 0.5 > safeTargetW && currentH * 0.5 > safeTargetH) {
      const nextW = Math.max(safeTargetW, Math.round(currentW * 0.5));
      const nextH = Math.max(safeTargetH, Math.round(currentH * 0.5));
      const stepCanvas = document.createElement('canvas');
      stepCanvas.width = nextW;
      stepCanvas.height = nextH;
      const stepCtx = stepCanvas.getContext('2d');
      if (!stepCtx) {
        return null;
      }
      stepCtx.imageSmoothingEnabled = true;
      stepCtx.imageSmoothingQuality = 'high';
      stepCtx.drawImage(currentSource, 0, 0, nextW, nextH);
      intermediateCanvases.push(stepCanvas);
      currentSource = stepCanvas;
      currentW = nextW;
      currentH = nextH;
    }

    const outCanvas = document.createElement('canvas');
    outCanvas.width = safeTargetW;
    outCanvas.height = safeTargetH;
    const outCtx = outCanvas.getContext('2d');
    if (!outCtx) {
      return null;
    }
    outCtx.imageSmoothingEnabled = true;
    outCtx.imageSmoothingQuality = 'high';
    outCtx.drawImage(currentSource, 0, 0, safeTargetW, safeTargetH);
    return outCanvas;
  } finally {
    for (const c of intermediateCanvases) {
      c.width = 0;
      c.height = 0;
    }
  }
}

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
