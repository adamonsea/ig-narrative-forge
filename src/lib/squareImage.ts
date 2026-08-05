/**
 * Pads a raster image onto a transparent square canvas so favicons / PWA icons
 * are never stretched by browsers (which force icons into a square box).
 * SVGs and already-square images are returned untouched.
 */
export async function padImageToSquare(file: File, maxSize = 512): Promise<File> {
  if (file.type === 'image/svg+xml') return file;

  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image();
    el.onload = () => resolve(el);
    el.onerror = reject;
    el.src = dataUrl;
  });

  const { naturalWidth: w, naturalHeight: h } = img;
  if (!w || !h) return file;
  if (w === h && w <= maxSize) return file;

  const size = Math.min(maxSize, Math.max(w, h));
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return file;

  // contain: preserve aspect ratio, centre on a transparent square
  const scale = Math.min(size / w, size / h);
  const dw = Math.round(w * scale);
  const dh = Math.round(h * scale);
  ctx.drawImage(img, Math.round((size - dw) / 2), Math.round((size - dh) / 2), dw, dh);

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
  if (!blob) return file;

  return new File([blob], file.name.replace(/\.[^.]+$/, '') + '.png', { type: 'image/png' });
}
