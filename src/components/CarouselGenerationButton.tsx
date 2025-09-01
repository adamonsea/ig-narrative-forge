import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Image, Loader2, Download, Play } from 'lucide-react';
import { CarouselPreviewModal } from './CarouselPreviewModal';
import { useCarouselGeneration } from '@/hooks/useCarouselGeneration';

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
  const [carouselExport, setCarouselExport] = useState<CarouselExport | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const { toast } = useToast();
  const { generateCarouselImages, isGenerating } = useCarouselGeneration();

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
    try {
      // Get story data for generation
      const { data: story, error: storyError } = await supabase
        .from('stories')
        .select(`
          *,
          slides(*)
        `)
        .eq('id', storyId)
        .single();

      if (storyError || !story) {
        throw new Error(`Failed to fetch story: ${storyError?.message}`);
      }

      const success = await generateCarouselImages(story);
      
      if (success) {
        // Check for the generated carousel
        const export_data = await checkExistingCarousel();
        if (export_data) {
          setCarouselExport(export_data);
        }
        if (onGenerate) onGenerate();
      }
    } catch (error: any) {
      console.error('Error generating carousel:', error);
      toast({
        title: "Generation Failed",
        description: error.message,
        variant: "destructive"
      });
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
        disabled={isGenerating(storyId)}
        variant="outline"
        size="sm"
      >
        {isGenerating(storyId) ? (
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