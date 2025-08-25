import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Download, Eye, X, Loader2 } from 'lucide-react';
import JSZip from 'jszip';

interface CarouselExport {
  id: string;
  story_id: string;
  status: string;
  export_formats: any;
  file_paths: any;
  zip_url?: string | null;
  error_message?: string | null;
  created_at: string;
  updated_at: string;
}

interface CarouselPreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  storyTitle: string;
  carouselExport: CarouselExport;
}

interface ImageData {
  url: string;
  filename: string;
  blob: Blob;
}

export const CarouselPreviewModal = ({ isOpen, onClose, storyTitle, carouselExport }: CarouselPreviewModalProps) => {
  const [images, setImages] = useState<ImageData[]>([]);
  const [loading, setLoading] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    if (isOpen && carouselExport) {
      loadImages();
    }
  }, [isOpen, carouselExport]);

  const loadImages = async () => {
    setLoading(true);
    try {
      // Parse file_paths as it comes as JSON from Supabase
      const filePaths = Array.isArray(carouselExport.file_paths) 
        ? carouselExport.file_paths 
        : JSON.parse(carouselExport.file_paths || '[]');

      const imageData: ImageData[] = [];

      for (const filePath of filePaths) {
        const { data: fileData } = await supabase.storage
          .from('exports')
          .download(filePath);
        
        if (fileData) {
          const url = URL.createObjectURL(fileData);
          const filename = filePath.split('/').pop() || 'carousel_image.png';
          imageData.push({
            url,
            filename,
            blob: fileData
          });
        }
      }

      setImages(imageData);
    } catch (error: any) {
      console.error('Error loading carousel images:', error);
      toast({
        title: "Failed to Load Images",
        description: error.message,
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const downloadAsZip = async () => {
    if (images.length === 0) return;
    
    setDownloading(true);
    try {
      const zip = new JSZip();
      
      // Add each image to the zip
      images.forEach((image, index) => {
        zip.file(image.filename, image.blob);
      });

      // Generate the zip file
      const zipBlob = await zip.generateAsync({ type: 'blob' });
      
      // Download the zip
      const url = URL.createObjectURL(zipBlob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${storyTitle.replace(/[^a-zA-Z0-9]/g, '_')}_carousel_images.zip`;
      link.click();
      URL.revokeObjectURL(url);

      toast({
        title: "Download Complete",
        description: `Downloaded ${images.length} images as a zip file`,
      });
    } catch (error: any) {
      console.error('Error creating zip:', error);
      toast({
        title: "Download Failed",
        description: error.message,
        variant: "destructive"
      });
    } finally {
      setDownloading(false);
    }
  };

  const downloadSingleImage = (image: ImageData) => {
    const link = document.createElement('a');
    link.href = image.url;
    link.download = image.filename;
    link.click();
  };

  // Clean up object URLs when component unmounts or images change
  useEffect(() => {
    return () => {
      images.forEach(image => {
        URL.revokeObjectURL(image.url);
      });
    };
  }, [images]);

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[80vh] overflow-hidden">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Eye className="h-5 w-5" />
            Carousel Images Preview
          </DialogTitle>
          <DialogDescription>
            Preview and download all carousel images for "{storyTitle}"
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col space-y-4">
          {/* Actions Bar */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Badge variant="default">{images.length} Images</Badge>
              {images.length > 0 && (
                <span className="text-sm text-muted-foreground">
                  Click any image to download individually
                </span>
              )}
            </div>
            <div className="flex gap-2">
              <Button
                onClick={downloadAsZip}
                disabled={downloading || images.length === 0}
                variant="default"
                size="sm"
              >
                {downloading ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Download className="h-4 w-4 mr-2" />
                )}
                {downloading ? 'Creating Zip...' : 'Download All as Zip'}
              </Button>
              <Button onClick={onClose} variant="outline" size="sm">
                <X className="h-4 w-4 mr-2" />
                Close
              </Button>
            </div>
          </div>

          {/* Images Grid */}
          <div className="overflow-y-auto max-h-[500px]">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <div className="flex flex-col items-center gap-2">
                  <Loader2 className="h-8 w-8 animate-spin" />
                  <p className="text-sm text-muted-foreground">Loading images...</p>
                </div>
              </div>
            ) : images.length === 0 ? (
              <div className="flex items-center justify-center py-12">
                <p className="text-muted-foreground">No images found</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 p-2">
                {images.map((image, index) => (
                  <div key={index} className="relative group">
                    <div className="aspect-square overflow-hidden rounded-lg border bg-muted">
                      <img 
                        src={image.url} 
                        alt={`Slide ${index + 1}`}
                        className="w-full h-full object-cover cursor-pointer hover:opacity-80 transition-opacity"
                        onClick={() => downloadSingleImage(image)}
                      />
                    </div>
                    {/* Overlay for individual download */}
                    <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-20 transition-all flex items-center justify-center rounded-lg">
                      <div className="opacity-0 group-hover:opacity-100 transition-opacity bg-white rounded-full p-2">
                        <Download className="h-4 w-4 text-gray-700" />
                      </div>
                    </div>
                    {/* Filename label */}
                    <div className="absolute bottom-2 left-2 right-2">
                      <div className="bg-black bg-opacity-70 text-white text-xs px-2 py-1 rounded truncate">
                        {image.filename}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};