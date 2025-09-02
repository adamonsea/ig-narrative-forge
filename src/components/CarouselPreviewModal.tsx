import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Download, Eye, X, Loader2, Info, AlertTriangle } from 'lucide-react';
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
  createdAt: string;
  size: number;
  error?: string;
}

export const CarouselPreviewModal = ({ isOpen, onClose, storyTitle, carouselExport }: CarouselPreviewModalProps) => {
  const [images, setImages] = useState<ImageData[]>([]);
  const [loading, setLoading] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [loadingProgress, setLoadingProgress] = useState({ current: 0, total: 0 });
  const { toast } = useToast();

  // EXTREME CACHE BUSTER - FORCE RELOAD
  useEffect(() => {
    console.log('🚨🚨🚨 CACHE BUSTER v3.0 - NEW VERSION LOADED!!! 🚨🚨🚨', {
      timestamp: new Date().toISOString(),
      version: '2025.01.03.EXTREME',
      fixedImages: true,
      message: 'IF YOU SEE THIS THE NEW CODE IS RUNNING!'
    });
    
    // Force immediate alert to confirm new code
    if (isOpen) {
      setTimeout(() => {
        console.log('🔥 MODAL OPENED - NEW CODE CONFIRMED RUNNING!');
      }, 100);
    }
  }, [isOpen]);

  useEffect(() => {
    if (isOpen && carouselExport) {
      loadImages();
    }
  }, [isOpen, carouselExport]);

  const loadImages = async () => {
    setLoading(true);
    setImages([]); // Clear previous images
    try {
      console.log('📸 Loading carousel images for export:', {
        id: carouselExport.id,
        status: carouselExport.status,
        created_at: carouselExport.created_at
      });
      
      // Parse file_paths as it comes as JSON from Supabase
      const filePaths = Array.isArray(carouselExport.file_paths) 
        ? carouselExport.file_paths 
        : JSON.parse(carouselExport.file_paths || '[]');

      console.log('📁 Raw file paths:', carouselExport.file_paths);
      console.log('📁 Parsed file paths to load:', filePaths);

      if (!filePaths || filePaths.length === 0) {
        console.warn('⚠️ No file paths found in carousel export');
        toast({
          title: "No Images Found",
          description: "This carousel export has no image files.",
          variant: "destructive"
        });
        return;
      }

      setLoadingProgress({ current: 0, total: filePaths.length });
      const imageData: ImageData[] = [];
      const errors: string[] = [];

      for (let i = 0; i < filePaths.length; i++) {
        const filePath = filePaths[i];
        setLoadingProgress({ current: i + 1, total: filePaths.length });
        console.log(`🔍 Processing file ${i + 1}/${filePaths.length}: ${filePath}`);
        
        try {
          // Skip if path is empty or invalid
          if (!filePath || typeof filePath !== 'string') {
            console.warn(`⚠️ Invalid file path at index ${i}:`, filePath);
            errors.push(`Invalid file path at index ${i}`);
            continue;
          }

          // Generate signed URL for private bucket access
          const { data: signedUrlData, error: urlError } = await supabase.storage
            .from('exports')
            .createSignedUrl(filePath, 3600); // 1 hour expiry
          
          if (urlError) {
            console.error(`❌ Error creating signed URL for ${filePath}:`, urlError);
            errors.push(`Failed to create access URL: ${urlError.message}`);
            
            // Add failed image with error info
            imageData.push({
              url: '',
              filename: filePath.split('/').pop() || `image_${i + 1}.png`,
              blob: new Blob(),
              createdAt: carouselExport.created_at,
              size: 0,
              error: urlError.message
            });
            continue;
          }

          if (!signedUrlData?.signedUrl) {
            console.error(`❌ No signed URL received for ${filePath}`);
            errors.push(`No access URL received for file`);
            
            // Add failed image
            imageData.push({
              url: '',
              filename: filePath.split('/').pop() || `image_${i + 1}.png`,
              blob: new Blob(),
              createdAt: carouselExport.created_at,
              size: 0,
              error: 'No signed URL received'
            });
            continue;
          }

          console.log(`✅ Created signed URL for ${filePath}:`, signedUrlData.signedUrl.substring(0, 100) + '...');

          // Fetch the image data using the signed URL
          const response = await fetch(signedUrlData.signedUrl);
          console.log(`🌐 Fetch response for ${filePath}:`, {
            ok: response.ok,
            status: response.status,
            statusText: response.statusText,
            contentType: response.headers.get('content-type')
          });

          if (!response.ok) {
            const errorMsg = `${response.status} ${response.statusText}`;
            console.error(`❌ Failed to fetch ${filePath}:`, errorMsg);
            errors.push(`Failed to fetch image: ${errorMsg}`);
            
            // Add failed image
            imageData.push({
              url: '',
              filename: filePath.split('/').pop() || `image_${i + 1}.png`,
              blob: new Blob(),
              createdAt: carouselExport.created_at,
              size: 0,
              error: errorMsg
            });
            continue;
          }

          const blob = await response.blob();
          console.log(`📦 Blob details for ${filePath}:`, {
            size: blob.size,
            type: blob.type
          });

          if (blob.size < 100) {
            console.warn(`⚠️ Suspiciously small image: ${filePath} is only ${blob.size} bytes`);
          }

          const url = URL.createObjectURL(blob);
          const filename = filePath.split('/').pop() || `carousel_image_${i + 1}.png`;
          
          console.log(`✅ Successfully loaded ${filename} (${blob.size} bytes)`);
          imageData.push({
            url,
            filename,
            blob,
            createdAt: carouselExport.created_at,
            size: blob.size
          });
          
          // Update images immediately for progressive loading
          setImages([...imageData]);
          
        } catch (fileError: any) {
          console.error(`❌ Error processing file ${filePath}:`, fileError);
          errors.push(`Error processing file: ${fileError.message}`);
          
          // Add failed image
          imageData.push({
            url: '',
            filename: filePath.split('/').pop() || `image_${i + 1}.png`,
            blob: new Blob(),
            createdAt: carouselExport.created_at,
            size: 0,
            error: fileError.message
          });
        }
      }

      console.log(`📸 Loaded ${imageData.length}/${filePaths.length} images successfully`);
      
      if (errors.length > 0) {
        console.warn('⚠️ Some images failed to load:', errors);
        toast({
          title: `Loaded ${imageData.length} of ${filePaths.length} Images`,
          description: `${errors.length} images failed to load. Check console for details.`,
          variant: "destructive"
        });
      } else if (imageData.length > 0) {
        toast({
          title: "Images Loaded Successfully",
          description: `Loaded all ${imageData.length} carousel images`,
        });
      }

      setImages(imageData);
    } catch (error: any) {
      console.error('❌ Critical error loading carousel images:', error);
      toast({
        title: "Failed to Load Images",
        description: `Critical error: ${error.message}`,
        variant: "destructive"
      });
    } finally {
      setLoading(false);
      setLoadingProgress({ current: 0, total: 0 });
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
          <DialogTitle className="flex items-center gap-2 bg-gradient-to-r from-red-500 to-blue-500 text-white p-2 rounded">
            <Eye className="h-5 w-5" />
            🚨 EXTREME CACHE BUST v3.0 - {new Date().toLocaleTimeString()} 🚨
          </DialogTitle>
          <DialogDescription className="bg-yellow-100 p-2 rounded mt-2 text-black font-bold">
            🔥 IF YOU SEE THIS COLORFUL HEADER, THE NEW CODE IS WORKING! 🔥<br/>
            Preview: "{storyTitle}" - Images should now load properly!
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col space-y-4">
          {/* Actions Bar */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Badge variant="default">{images.length} Images ✨</Badge>
              {images.length > 0 && (
                <span className="text-sm text-muted-foreground">
                  🖱️ Click images to download • 💡 Hover info icons for details
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
                <div className="flex flex-col items-center gap-3">
                  <Loader2 className="h-8 w-8 animate-spin" />
                  <p className="text-sm text-muted-foreground">Loading images...</p>
                  {loadingProgress.total > 0 && (
                    <div className="text-xs text-muted-foreground">
                      {loadingProgress.current} of {loadingProgress.total}
                    </div>
                  )}
                </div>
              </div>
            ) : images.length === 0 ? (
              <div className="flex items-center justify-center py-12">
                <div className="text-center">
                  <AlertTriangle className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
                  <p className="text-muted-foreground">No images found</p>
                  <p className="text-xs text-muted-foreground mt-1">Check console for detailed error information</p>
                </div>
              </div>
            ) : (
              <TooltipProvider>
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 p-2">
                  {images.map((image, index) => (
                    <div key={index} className="relative group">
                      <div className="aspect-square overflow-hidden rounded-lg border bg-muted">
                        {image.error ? (
                          <div className="w-full h-full flex flex-col items-center justify-center bg-destructive/10 text-destructive">
                            <AlertTriangle className="h-8 w-8 mb-2" />
                            <p className="text-xs text-center px-2">Failed to load</p>
                          </div>
                        ) : image.url ? (
                          <img 
                            src={image.url} 
                            alt={`Slide ${index + 1}`}
                            className="w-full h-full object-cover cursor-pointer hover:opacity-80 transition-opacity"
                            onClick={() => !image.error && downloadSingleImage(image)}
                            onError={(e) => {
                              console.error(`Failed to display image ${image.filename}`);
                              (e.target as HTMLImageElement).style.display = 'none';
                            }}
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center bg-muted animate-pulse">
                            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                          </div>
                        )}
                      </div>
                      
                      {/* Download overlay for successful images */}
                      {!image.error && image.url && (
                        <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-20 transition-all flex items-center justify-center rounded-lg">
                          <div className="opacity-0 group-hover:opacity-100 transition-opacity bg-white rounded-full p-2">
                            <Download className="h-4 w-4 text-gray-700" />
                          </div>
                        </div>
                      )}
                      
                      {/* Info icon with tooltip */}
                      <div className="absolute bottom-2 right-2">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <div className="bg-black/70 hover:bg-black/90 text-white rounded-full p-1.5 cursor-help transition-colors">
                              {image.error ? (
                                <AlertTriangle className="h-3 w-3 text-red-400" />
                              ) : (
                                <Info className="h-3 w-3" />
                              )}
                            </div>
                          </TooltipTrigger>
                          <TooltipContent side="top" className="max-w-xs">
                            <div className="space-y-1 text-xs">
                              <p><strong>File:</strong> {image.filename}</p>
                              <p><strong>Created:</strong> {new Date(image.createdAt).toLocaleString()}</p>
                              {image.error ? (
                                <p className="text-red-400"><strong>Error:</strong> {image.error}</p>
                              ) : (
                                <p><strong>Size:</strong> {(image.size / 1024).toFixed(1)} KB</p>
                              )}
                            </div>
                          </TooltipContent>
                        </Tooltip>
                      </div>
                    </div>
                  ))}
                </div>
              </TooltipProvider>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};