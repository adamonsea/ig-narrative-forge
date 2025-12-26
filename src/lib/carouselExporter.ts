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
 * Main export function - captures all slides and bundles them
 */
export const exportCarouselSlides = async (
  renderSlide: (slideIndex: number) => HTMLElement | null,
  totalSlides: number,
  storyTitle: string,
  onProgress?: ProgressCallback
): Promise<void> => {
  const images: { blob: Blob; filename: string }[] = [];
  const safeTitle = sanitizeFilename(storyTitle);
  
  try {
    onProgress?.({
      current: 0,
      total: totalSlides,
      status: 'preparing',
      message: 'Preparing slides for export...'
    });

    // Wait for fonts before starting
    await waitForFonts();

    // Capture each slide
    for (let i = 0; i < totalSlides; i++) {
      onProgress?.({
        current: i + 1,
        total: totalSlides,
        status: 'capturing',
        message: `Capturing slide ${i + 1} of ${totalSlides}...`
      });

      const element = renderSlide(i);
      if (!element) {
        throw new Error(`Failed to render slide ${i + 1}`);
      }

      // Small delay to ensure render is complete
      await new Promise(resolve => setTimeout(resolve, 50));

      const blob = await captureElementAsImage(element, {
        width: 1080,
        height: 1080,
        scale: 2,
        backgroundColor: '#ffffff'
      });

      images.push({
        blob,
        filename: `${safeTitle}-slide-${String(i + 1).padStart(2, '0')}.png`
      });
    }

    onProgress?.({
      current: totalSlides,
      total: totalSlides,
      status: 'bundling',
      message: 'Creating ZIP file...'
    });

    // Bundle into ZIP
    const zipBlob = await bundleImagesAsZip(images, `${safeTitle}-carousel.zip`);

    // Download
    downloadBlob(zipBlob, `${safeTitle}-carousel.zip`);

    onProgress?.({
      current: totalSlides,
      total: totalSlides,
      status: 'complete',
      message: `Successfully exported ${totalSlides} slides!`
    });

  } catch (error) {
    console.error('Carousel export failed:', error);
    onProgress?.({
      current: 0,
      total: totalSlides,
      status: 'error',
      message: error instanceof Error ? error.message : 'Export failed'
    });
    throw error;
  }
};
