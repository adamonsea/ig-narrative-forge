import html2canvas from 'html2canvas';
import JSZip from 'jszip';

interface CaptureOptions {
  width?: number;
  height?: number;
  scale?: number;
  backgroundColor?: string;
}

interface ExportProgress {
  current: number;
  total: number;
  status: 'preparing' | 'capturing' | 'bundling' | 'complete' | 'error';
  message: string;
}

type ProgressCallback = (progress: ExportProgress) => void;

/**
 * Wait for all fonts to be loaded
 */
const waitForFonts = async (): Promise<void> => {
  if (document.fonts && document.fonts.ready) {
    await document.fonts.ready;
  }
  // Additional small delay to ensure fonts are rendered
  await new Promise(resolve => setTimeout(resolve, 100));
};

/**
 * Wait for all images in an element to load
 */
const waitForImages = (element: HTMLElement): Promise<void> => {
  const images = element.querySelectorAll('img');
  const promises = Array.from(images).map(img => {
    if (img.complete) return Promise.resolve();
    return new Promise<void>((resolve) => {
      img.onload = () => resolve();
      img.onerror = () => resolve(); // Don't block on failed images
    });
  });
  return Promise.all(promises).then(() => undefined);
};

/**
 * Capture a single DOM element as a PNG blob using html2canvas
 * with proper handling for hidden elements, fonts, and CORS
 */
export const captureElementAsImage = async (
  element: HTMLElement,
  options: CaptureOptions = {}
): Promise<Blob> => {
  const {
    width = 1080,
    height = 1080,
    scale = 2, // 2x for crisp images
    backgroundColor = '#ffffff'
  } = options;

  // Wait for fonts to be ready
  await waitForFonts();
  
  const canvas = await html2canvas(element, {
    width,
    height,
    scale,
    backgroundColor,
    useCORS: true, // Handle cross-origin images
    allowTaint: false,
    logging: false,
    // Make hidden elements visible during capture
    onclone: (clonedDoc, clonedElement) => {
      // Force visibility on the cloned element
      clonedElement.style.visibility = 'visible';
      clonedElement.style.position = 'relative';
      clonedElement.style.left = '0';
      clonedElement.style.top = '0';
      clonedElement.style.zIndex = 'auto';
      
      // Wait for images in the cloned document
      waitForImages(clonedElement);
    }
  });

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) {
          resolve(blob);
        } else {
          reject(new Error('Failed to create image blob'));
        }
      },
      'image/png',
      1.0
    );
  });
};

/**
 * Sanitize filename for safe file system use
 */
const sanitizeFilename = (name: string): string => {
  return name
    .replace(/[^a-z0-9]/gi, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase()
    .substring(0, 50);
};

/**
 * Generate a ZIP file containing all slide images
 */
export const bundleImagesAsZip = async (
  images: { blob: Blob; filename: string }[],
  zipFilename: string
): Promise<Blob> => {
  const zip = new JSZip();
  
  images.forEach(({ blob, filename }) => {
    zip.file(filename, blob);
  });

  return zip.generateAsync({ 
    type: 'blob',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 }
  });
};

/**
 * Trigger browser download of a blob
 */
export const downloadBlob = (blob: Blob, filename: string): void => {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

/**
 * Main export function - captures every slide in both social formats,
 * adds a ready-to-paste caption, and bundles everything into one ZIP.
 */
export const exportCarouselSlides = async (
  renderSlide: (slideIndex: number, aspect: 'square' | 'story') => HTMLElement | null,
  totalSlides: number,
  storyTitle: string,
  onProgress?: ProgressCallback,
  caption?: string
): Promise<void> => {
  const images: { blob: Blob; filename: string }[] = [];
  const safeTitle = sanitizeFilename(storyTitle);
  const formats: { aspect: 'square' | 'story'; width: number; height: number; folder: string }[] = [
    { aspect: 'square', width: 1080, height: 1080, folder: 'square-1080x1080' },
    { aspect: 'story', width: 1080, height: 1920, folder: 'story-1080x1920' },
  ];
  const totalCaptures = totalSlides * formats.length;

  try {
    onProgress?.({
      current: 0,
      total: totalCaptures,
      status: 'preparing',
      message: 'Preparing slides for export...'
    });

    // Wait for fonts before starting
    await waitForFonts();

    let captured = 0;

    for (const format of formats) {
      for (let i = 0; i < totalSlides; i++) {
        captured += 1;
        onProgress?.({
          current: captured,
          total: totalCaptures,
          status: 'capturing',
          message: `Capturing slide ${i + 1} of ${totalSlides} (${format.aspect})...`
        });

        const element = renderSlide(i, format.aspect);
        if (!element) {
          throw new Error(`Failed to render slide ${i + 1}`);
        }

        const blob = await captureElementAsImage(element, {
          width: format.width,
          height: format.height,
          scale: 2,
          backgroundColor: '#ffffff'
        });

        images.push({
          blob,
          filename: `${format.folder}/${safeTitle}-slide-${String(i + 1).padStart(2, '0')}.png`
        });
      }
    }

    onProgress?.({
      current: totalCaptures,
      total: totalCaptures,
      status: 'bundling',
      message: 'Creating ZIP file...'
    });

    // Bundle into ZIP (with caption if provided)
    const zip = new JSZip();
    images.forEach(({ blob, filename }) => zip.file(filename, blob));
    if (caption) {
      zip.file('caption.txt', caption);
    }
    const zipBlob = await zip.generateAsync({
      type: 'blob',
      compression: 'DEFLATE',
      compressionOptions: { level: 6 }
    });

    // Download
    downloadBlob(zipBlob, `${safeTitle}-social-pack.zip`);

    onProgress?.({
      current: totalCaptures,
      total: totalCaptures,
      status: 'complete',
      message: `Exported ${totalSlides} slides in 2 formats.`
    });

  } catch (error) {
    console.error('Carousel export failed:', error);
    onProgress?.({
      current: 0,
      total: totalCaptures,
      status: 'error',
      message: error instanceof Error ? error.message : 'Export failed'
    });
    throw error;
  }
};

