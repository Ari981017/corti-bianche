/**
 * Ridimensiona una foto nel browser prima del caricamento
 * (le foto del telefono pesano diversi MB). Lato lungo massimo `max` px,
 * in WebP se il browser lo supporta, altrimenti JPEG.
 */
export async function resizeImage(file: File, max = 1600, quality = 0.82) {
  const source = await decode(file);
  const w0 = source.width;
  const h0 = source.height;
  const scale = Math.min(1, max / Math.max(w0, h0));
  const w = Math.round(w0 * scale);
  const h = Math.round(h0 * scale);

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas non disponibile');
  ctx.drawImage(source, 0, 0, w, h);
  if ('close' in source) source.close();

  let blob = await toBlob(canvas, 'image/webp', quality);
  if (!blob || blob.type !== 'image/webp') blob = await toBlob(canvas, 'image/jpeg', quality);
  if (!blob) throw new Error('Impossibile convertire la foto');

  const ext = blob.type === 'image/webp' ? 'webp' : 'jpg';
  return { blob, ext, type: blob.type };
}

async function decode(file: File): Promise<ImageBitmap | HTMLImageElement> {
  try {
    return await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    const url = URL.createObjectURL(file);
    try {
      const img = new Image();
      img.src = url;
      await img.decode();
      return img;
    } finally {
      URL.revokeObjectURL(url);
    }
  }
}

const toBlob = (canvas: HTMLCanvasElement, type: string, quality: number) =>
  new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, quality));
