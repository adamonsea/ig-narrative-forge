import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Image, Loader2, Download, Play } from 'lucide-react';
import { CarouselPreviewModal } from './CarouselPreviewModal';

interface CarouselGenerationButtonProps {
  storyId: string;
  storyTitle: string;
  onGenerate?: () => void;
}

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

export const CarouselGenerationButton = ({ storyId, storyTitle, onGenerate }: CarouselGenerationButtonProps) => {
  const [generating, setGenerating] = useState(false);
  const [carouselExport, setCarouselExport] = useState<CarouselExport | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const { toast } = useToast();

  const checkExistingCarousel = async () => {
    const { data } = await supabase
      .from('carousel_exports')
      .select('*')
      .eq('story_id', storyId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    
    return data;
  };

  const generateCarousel = async () => {
    setGenerating(true);
    try {
      const { data, error } = await supabase.functions.invoke('generate-carousel-images', {
        body: { 
          storyId,
          formats: ['instagram_story', 'instagram_post', 'facebook_post']
        }
      });

      if (error) throw error;

      toast({
        title: "Carousel Generation Started",
        description: "Images are being generated. This may take a few minutes."
      });

      // Poll for completion
      const pollInterval = setInterval(async () => {
        const export_data = await checkExistingCarousel();
        if (export_data && export_data.status === 'completed') {
          clearInterval(pollInterval);
          setCarouselExport(export_data);
          toast({
            title: "Carousel Ready",
            description: "Your carousel images are ready for download!"
          });
        } else if (export_data && export_data.status === 'failed') {
          clearInterval(pollInterval);
          toast({
            title: "Generation Failed",
            description: export_data.error_message || "Failed to generate carousel images",
            variant: "destructive"
          });
        }
      }, 2000);

      // Clear interval after 5 minutes to prevent infinite polling
      setTimeout(() => clearInterval(pollInterval), 300000);

      if (onGenerate) onGenerate();
    } catch (error: any) {
      console.error('Error generating carousel:', error);
      toast({
        title: "Generation Failed",
        description: error.message,
        variant: "destructive"
      });
    } finally {
      setGenerating(false);
    }
  };

  const handleClick = async () => {
    // Check if carousel already exists
    const existing = await checkExistingCarousel();
    if (existing && existing.status === 'completed') {
      setCarouselExport(existing);
      setShowPreview(true);
    } else {
      generateCarousel();
    }
  };

  return (
    <>
      <Button
        onClick={handleClick}
        disabled={generating}
        variant="outline"
        size="sm"
      >
        {generating ? (
          <>
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            Generating...
          </>
        ) : carouselExport ? (
          <>
            <Download className="h-4 w-4 mr-2" />
            View Images
          </>
        ) : (
          <>
            <Image className="h-4 w-4 mr-2" />
            Generate Images
          </>
        )}
      </Button>

      {carouselExport && (
        <CarouselPreviewModal
          isOpen={showPreview}
          onClose={() => setShowPreview(false)}
          storyTitle={storyTitle}
          carouselExport={carouselExport}
        />
      )}
    </>
  );
};