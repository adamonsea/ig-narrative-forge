import React, { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Download, ExternalLink, RefreshCw } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface CarouselImageViewerProps {
  storyId: string;
  storyTitle: string;
}

interface CarouselExport {
  id: string;
  status: string;
  file_paths: any; // Json type from Supabase
  export_formats: any; // Json type from Supabase
  created_at: string;
  updated_at: string;
}

export default function CarouselImageViewer({ storyId, storyTitle }: CarouselImageViewerProps) {
  const [carouselExport, setCarouselExport] = useState<CarouselExport | null>(null);
  const [signedUrls, setSignedUrls] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const { toast } = useToast();

  const loadCarouselExport = async () => {
    try {
      const { data, error } = await supabase
        .from('carousel_exports')
        .select('*')
        .eq('story_id', storyId)
        .maybeSingle();

      if (error && error.code !== 'PGRST116') { // Not found error
        throw error;
      }

      setCarouselExport(data);

      if (data?.file_paths && Array.isArray(data.file_paths) && data.file_paths.length > 0) {
        await loadSignedUrls(data.file_paths as string[]);
      }
    } catch (error) {
      console.error('Error loading carousel export:', error);
      toast({
        title: "Load Failed",
        description: "Failed to load carousel images",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const loadSignedUrls = async (filePaths: string[]) => {
    const urls: Record<string, string> = {};
    
    for (const filePath of filePaths) {
      try {
        const { data, error } = await supabase.storage
          .from('exports')
          .createSignedUrl(filePath, 3600); // 1 hour expiry

        if (error) {
          console.error(`Failed to create signed URL for ${filePath}:`, error);
          continue;
        }

        if (data?.signedUrl) {
          urls[filePath] = data.signedUrl;
        }
      } catch (error) {
        console.error(`Error creating signed URL for ${filePath}:`, error);
      }
    }

    setSignedUrls(urls);
  };

  const generateCarousel = async () => {
    try {
      setGenerating(true);
      
      const { error } = await supabase.functions.invoke('generate-carousel-images', {
        body: { storyId }
      });

      if (error) throw error;

      toast({
        title: "Generation Started",
        description: "Carousel images are being generated. This may take a few moments."
      });

      // Refresh the export data after a delay
      setTimeout(() => {
        loadCarouselExport();
      }, 3000);

    } catch (error) {
      console.error('Error generating carousel:', error);
      toast({
        title: "Generation Failed",
        description: "Failed to generate carousel images",
        variant: "destructive"
      });
    } finally {
      setGenerating(false);
    }
  };

  const downloadImage = async (filePath: string, filename: string) => {
    try {
      const signedUrl = signedUrls[filePath];
      if (!signedUrl) {
        throw new Error('No signed URL available');
      }

      const response = await fetch(signedUrl);
      if (!response.ok) throw new Error('Failed to fetch image');

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);

      toast({
        title: "Downloaded",
        description: `${filename} has been downloaded`
      });
    } catch (error) {
      console.error('Error downloading image:', error);
      toast({
        title: "Download Failed",
        description: "Failed to download image",
        variant: "destructive"
      });
    }
  };

  const openInNewTab = (filePath: string) => {
    const signedUrl = signedUrls[filePath];
    if (signedUrl) {
      window.open(signedUrl, '_blank');
    }
  };

  useEffect(() => {
    loadCarouselExport();
  }, [storyId]);

  if (loading) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="flex items-center justify-center">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
            <span className="ml-2">Loading carousel images...</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!carouselExport) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="text-center space-y-4">
            <p className="text-muted-foreground">No carousel images generated yet</p>
            <Button 
              onClick={generateCarousel} 
              disabled={generating}
              className="w-full"
            >
              {generating ? (
                <>
                  <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                  Generating...
                </>
              ) : (
                'Generate Carousel Images'
              )}
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (carouselExport.status === 'generating') {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="text-center space-y-4">
            <div className="flex items-center justify-center">
              <RefreshCw className="h-6 w-6 animate-spin text-primary mr-2" />
              <span>Generating carousel images...</span>
            </div>
            <p className="text-sm text-muted-foreground">This may take a few moments</p>
            <Button 
              variant="outline" 
              onClick={loadCarouselExport}
              size="sm"
            >
              <RefreshCw className="h-4 w-4 mr-2" />
              Refresh
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (carouselExport.status === 'failed' || !Array.isArray(carouselExport.file_paths) || carouselExport.file_paths.length === 0) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="text-center space-y-4">
            <p className="text-muted-foreground">Carousel generation failed or no images created</p>
            <Button 
              onClick={generateCarousel} 
              disabled={generating}
              variant="outline"
            >
              {generating ? (
                <>
                  <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                  Retrying...
                </>
              ) : (
                'Retry Generation'
              )}
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="p-6">
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold">Carousel Images</h3>
            <Button 
              onClick={generateCarousel} 
              disabled={generating}
              variant="outline"
              size="sm"
            >
              {generating ? (
                <>
                  <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                  Regenerating...
                </>
              ) : (
                <>
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Regenerate
                </>
              )}
            </Button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {Array.isArray(carouselExport.file_paths) && carouselExport.file_paths.map((filePath: string, index: number) => {
              const signedUrl = signedUrls[filePath];
              const filename = filePath.split('/').pop() || `slide-${index + 1}.png`;
              
              return (
                <div key={filePath} className="space-y-2">
                  <div className="aspect-square bg-muted rounded-lg overflow-hidden relative group">
                    {signedUrl ? (
                      <img 
                        src={signedUrl} 
                        alt={`Slide ${index + 1}`}
                        className="w-full h-full object-cover"
                        onError={(e) => {
                          e.currentTarget.src = '/placeholder.svg';
                        }}
                      />
                    ) : (
                      <div className="flex items-center justify-center h-full text-muted-foreground">
                        Loading...
                      </div>
                    )}
                    
                    {signedUrl && (
                      <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center space-x-2">
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => openInNewTab(filePath)}
                        >
                          <ExternalLink className="h-4 w-4" />
                        </Button>
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => downloadImage(filePath, filename)}
                        >
                          <Download className="h-4 w-4" />
                        </Button>
                      </div>
                    )}
                  </div>
                  
                  <div className="text-center">
                    <p className="text-sm font-medium">Slide {index + 1}</p>
                    <p className="text-xs text-muted-foreground">{filename}</p>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="text-xs text-muted-foreground">
            Generated: {new Date(carouselExport.updated_at).toLocaleString()}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}