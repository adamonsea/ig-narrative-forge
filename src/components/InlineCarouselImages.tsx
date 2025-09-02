import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Download } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import JSZip from 'jszip';

interface CarouselExport {
  id: string;
  story_id: string;
  status: string;
  file_paths: any;
  export_formats: any;
  error_message?: string;
  created_at: string;
  updated_at: string;
}

interface InlineCarouselImagesProps {
  storyId: string;
  storyTitle: string;
}

interface ImageData {
  url: string;
  blob: Blob;
  filename: string;
  size: number;
}

export const InlineCarouselImages: React.FC<InlineCarouselImagesProps> = ({
  storyId,
  storyTitle
}) => {
  const [carouselExport, setCarouselExport] = useState<CarouselExport | null>(null);
  const [images, setImages] = useState<ImageData[]>([]);
  const [loading, setLoading] = useState(true);
  const [downloadingAll, setDownloadingAll] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    loadCarouselImages();
  }, [storyId]);

  const loadCarouselImages = async () => {
    setLoading(true);
    try {
      // Get carousel export
      const { data: exportData, error: exportError } = await supabase
        .from('carousel_exports')
        .select('*')
        .eq('story_id', storyId)
        .eq('status', 'completed')
        .single();

      if (exportError || !exportData) {
        setCarouselExport(null);
        setImages([]);
        return;
      }

      setCarouselExport(exportData);

      // Load image data
      if (exportData.file_paths && Array.isArray(exportData.file_paths)) {
        const imageDataArray: ImageData[] = [];

        for (const filePath of exportData.file_paths) {
          try {
            // Ensure filePath is a string
            const filePathStr = String(filePath);
            
            // Get signed URL
            const { data: signedUrlData } = await supabase.storage
              .from('exports')
              .createSignedUrl(filePathStr, 3600);

            if (signedUrlData?.signedUrl) {
              // Fetch the image
              const response = await fetch(signedUrlData.signedUrl);
              if (response.ok) {
                const blob = await response.blob();
                const url = URL.createObjectURL(blob);
                const filename = filePathStr.split('/').pop() || 'slide.png';

                imageDataArray.push({
                  url,
                  blob,
                  filename,
                  size: blob.size
                });
              }
            }
          } catch (error) {
            console.error('Error loading image:', filePath, error);
          }
        }

        setImages(imageDataArray);
      }
    } catch (error) {
      console.error('Error loading carousel images:', error);
    } finally {
      setLoading(false);
    }
  };

  const downloadAsZip = async () => {
    if (images.length === 0) return;

    setDownloadingAll(true);
    try {
      const zip = new JSZip();
      
      // Add each image to the zip
      images.forEach((image, index) => {
        const filename = `${storyTitle.replace(/[^a-zA-Z0-9]/g, '_')}_slide_${index + 1}.png`;
        zip.file(filename, image.blob);
      });

      // Generate and download zip
      const zipBlob = await zip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(zipBlob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${storyTitle.replace(/[^a-zA-Z0-9]/g, '_')}_carousel.zip`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      toast({
        title: "Download Complete",
        description: `Downloaded ${images.length} carousel images`,
      });
    } catch (error) {
      console.error('Error creating zip:', error);
      toast({
        title: "Download Failed",
        description: "Failed to create zip file",
        variant: "destructive",
      });
    } finally {
      setDownloadingAll(false);
    }
  };

  // Cleanup URLs on unmount or when images change
  useEffect(() => {
    return () => {
      images.forEach(image => URL.revokeObjectURL(image.url));
    };
  }, [images]);

  if (loading) {
    return (
      <div className="border-t pt-4 mt-4">
        <div className="flex items-center justify-between mb-4">
          <h4 className="text-sm font-medium">Carousel Images</h4>
        </div>
        <div className="flex items-center justify-center py-8">
          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
        </div>
      </div>
    );
  }

  if (!carouselExport || images.length === 0) {
    return (
      <div className="border-t pt-4 mt-4">
        <div className="flex items-center justify-between mb-4">
          <h4 className="text-sm font-medium">Carousel Images</h4>
        </div>
        <div className="text-center py-8 text-muted-foreground">
          <p className="text-sm">No carousel images available</p>
        </div>
      </div>
    );
  }

  return (
    <div className="border-t pt-4 mt-4" id={`carousel-images-${storyId}`}>
      <div className="flex items-center justify-between mb-4">
        <h4 className="text-sm font-medium">Carousel Images ({images.length})</h4>
        <Button
          size="sm"
          variant="outline"
          onClick={downloadAsZip}
          disabled={downloadingAll}
          className="flex items-center gap-2"
        >
          <Download className="h-4 w-4" />
          {downloadingAll ? 'Creating Zip...' : 'Download All'}
        </Button>
      </div>
      
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {images.map((image, index) => (
          <div key={index} className="border rounded-lg overflow-hidden">
            <img
              src={image.url}
              alt={`Slide ${index + 1}`}
              className="w-full h-auto max-h-80 object-contain bg-gray-50"
              style={{ minHeight: '200px' }}
            />
            <div className="p-3 bg-gray-50 border-t">
              <p className="text-xs text-muted-foreground text-center">
                Slide {index + 1}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};