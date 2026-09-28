import { MAX_IMAGE_EDGE, scaledSize } from '../../core/domain/attachments';

/** JPEG quality for receipts: small files, still sharp enough for small print. */
const QUALITY = 0.82;

/**
 * Scales a photo down so its longest edge is at most {@link MAX_IMAGE_EDGE}
 * pixels and saves it as JPEG (ATT-02). Redrawing also drops the photo's
 * metadata, such as where it was taken, and applies its EXIF rotation. See-through
 * parts turn white. Resolves to null when this browser can't decode the file
 * (HEIC outside Safari, for one), so the caller can keep the original.
 */
export async function compressImage(file: Blob, maxEdge = MAX_IMAGE_EDGE): Promise<Blob | null> {
  if (typeof createImageBitmap !== 'function') return null;
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    return null;
  }
  try {
    const { width, height } = scaledSize(bitmap.width, bitmap.height, maxEdge);
    if (typeof OffscreenCanvas !== 'undefined') {
      const canvas = new OffscreenCanvas(width, height);
      const context = canvas.getContext('2d');
      if (!context) return null;
      draw(context, bitmap, width, height);
      return await canvas.convertToBlob({ type: 'image/jpeg', quality: QUALITY });
    }
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) return null;
    draw(context, bitmap, width, height);
    return await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', QUALITY));
  } catch {
    return null;
  } finally {
    bitmap.close();
  }
}

function draw(
  context: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  bitmap: ImageBitmap,
  width: number,
  height: number,
): void {
  context.fillStyle = '#fff';
  context.fillRect(0, 0, width, height);
  context.imageSmoothingQuality = 'high';
  context.drawImage(bitmap, 0, 0, width, height);
}
