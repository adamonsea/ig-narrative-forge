import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface Story {
  id: string;
  title: string;
  status: string;
  slides: Array<{
    id: string;
    slide_number: number;
    content: string;
    visual_prompt?: string | null;
    alt_text: string | null;
    word_count: number;
    story_id: string;
  }>;
  article?: {
    title: string;
    author?: string;
    source_url: string;
  };
}

export const useCarouselGeneration = () => {
  const [isGenerating, setIsGenerating] = useState<Set<string>>(new Set());
  const { toast } = useToast();

  const generateImageUsingCanvas = (story: Story, slideIndex: number): Promise<Blob> => {
    return new Promise((resolve, reject) => {
      const slide = story.slides[slideIndex];
      const isFirstSlide = slideIndex === 0;
      
      // Create canvas
      const canvas = document.createElement('canvas');
      canvas.width = 1080;
      canvas.height = 1080;
      const ctx = canvas.getContext('2d');
      
      if (!ctx) {
        reject(new Error('Could not get canvas context'));
        return;
      }

      // Fill background
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, 1080, 1080);

      // Draw header
      ctx.fillStyle = '#f3f4f6';
      ctx.fillRect(0, 0, 1080, 80);
      
      // Draw header border
      ctx.fillStyle = '#e5e7eb';
      ctx.fillRect(0, 80, 1080, 1);

      // Header text
      ctx.fillStyle = '#374151';
      ctx.font = 'bold 16px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText('News', 32, 50);
      
      // Counter text
      ctx.textAlign = 'right';
      ctx.fillText(`${slideIndex + 1} of ${story.slides.length}`, 1048, 50);

      // Main content
      ctx.fillStyle = '#111827';
      ctx.textAlign = 'center';
      
      // Dynamic font size based on content length and slide type
      let fontSize;
      let fontWeight;
      if (isFirstSlide) {
        fontSize = slide.content.length < 50 ? 48 : slide.content.length < 100 ? 40 : 32;
        fontWeight = 'bold';
      } else {
        fontSize = slide.content.length < 80 ? 36 : slide.content.length < 150 ? 28 : slide.content.length < 250 ? 24 : 20;
        fontWeight = '300';
      }
      
      ctx.font = `${fontWeight} ${fontSize}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;

      // Word wrap function
      const wrapText = (text: string, maxWidth: number) => {
        const words = text.split(' ');
        const lines: string[] = [];
        let currentLine = words[0];

        for (let i = 1; i < words.length; i++) {
          const word = words[i];
          const width = ctx.measureText(currentLine + " " + word).width;
          if (width < maxWidth) {
            currentLine += " " + word;
          } else {
            lines.push(currentLine);
            currentLine = word;
          }
        }
        lines.push(currentLine);
        return lines;
      };

      // Draw wrapped text
      const maxWidth = 900; // Leave margins
      const lines = wrapText(slide.content, maxWidth);
      const lineHeight = fontSize * 1.4;
      const totalHeight = lines.length * lineHeight;
      const startY = (1080 - totalHeight) / 2 + (lineHeight / 2);

      lines.forEach((line, index) => {
        ctx.fillText(line, 540, startY + (index * lineHeight));
      });

      // Footer
      ctx.fillStyle = '#6b7280';
      ctx.font = '12px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
      ctx.fillText('News', 540, 1050);

      // Convert to blob
      canvas.toBlob((blob) => {
        if (blob) {
          resolve(blob);
        } else {
          reject(new Error('Failed to create blob from canvas'));
        }
      }, 'image/png', 0.9);
    });
  };

  const generateCarouselImages = async (story: Story): Promise<boolean> => {
    if (isGenerating.has(story.id)) {
      console.log('⚠️ Generation already in progress for story:', story.id);
      toast({
        title: 'Already Generating',
        description: 'Carousel generation is already in progress for this story',
        variant: 'destructive',
      });
      return false;
    }

    console.log('🎨 Starting carousel generation for story:', story.id, {
      title: story.title,
      slideCount: story.slides?.length,
      slides: story.slides?.map(s => ({ id: s.id, slideNumber: s.slide_number, wordCount: s.word_count }))
    });
    
    if (!story?.slides?.length) {
      console.log('❌ No slides found for story:', story.id);
      toast({
        title: 'No Slides Found',
        description: 'Story has no slides to generate images for',
        variant: 'destructive',
      });
      return false;
    }

    setIsGenerating(prev => new Set(prev.add(story.id)));

    // Show initial progress toast
    const progressToast = toast({
      title: 'Carousel Generation Starting',
      description: `Preparing to generate ${story.slides.length} carousel images...`,
    });

    try {
      // Step 1: Create carousel export record
      console.log('💾 Creating carousel export record for story:', story.id);
      const { data: exportRecord, error: exportError } = await supabase
        .from('carousel_exports')
        .upsert({
          story_id: story.id,
          status: 'generating',
          export_formats: { formats: ['instagram-square'] },
          file_paths: [],
          error_message: null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        }, {
          onConflict: 'story_id'
        })
        .select();

      if (exportError) {
        console.error('❌ Failed to create export record:', exportError);
        throw new Error(`Database error: ${exportError.message}`);
      }

      console.log('✅ Carousel export record created:', exportRecord);

      // Update progress
      toast({
        title: 'Starting Canvas Generation',
        description: 'Using direct canvas API for image generation...',
      });

      const filePaths: string[] = [];
      const errors: string[] = [];

      // Step 3: Generate images for each slide with individual error handling
      for (let i = 0; i < story.slides.length; i++) {
        const slide = story.slides[i];
        console.log(`🖼️ Generating image ${i + 1}/${story.slides.length} for slide:`, {
          slideId: slide.id,
          slideNumber: slide.slide_number,
          contentLength: slide.content?.length || 0
        });

        // Update progress toast
        toast({
          title: 'Generating Images',
          description: `Creating image ${i + 1} of ${story.slides.length}...`,
        });

        try {
          console.log(`🎨 Generating image ${i + 1}/${story.slides.length} using Canvas API`);

          const imageBlob = await generateImageUsingCanvas(story, i);
          console.log(`✅ Canvas image generated, size: ${imageBlob.size} bytes`);

          // Upload to storage with detailed logging
          const fileName = `carousel_${story.id}_slide_${i + 1}_${Date.now()}.png`;
          const filePath = `carousels/${story.id}/${fileName}`;

          console.log(`⬆️ Uploading ${fileName} (${imageBlob.size} bytes) to ${filePath}...`);
          
          const { data: uploadData, error: uploadError } = await supabase.storage
            .from('exports')
            .upload(filePath, imageBlob, {
              contentType: 'image/png',
              upsert: true,
              cacheControl: '3600'
            });

          if (uploadError) {
            console.error(`❌ Upload failed for ${fileName}:`, uploadError);
            throw new Error(`Upload failed: ${uploadError.message}`);
          }

          console.log(`✅ Successfully uploaded:`, uploadData);
          filePaths.push(filePath);

        } catch (slideError: any) {
          console.error(`❌ Error generating slide ${i + 1}:`, slideError);
          errors.push(`Slide ${i + 1}: ${slideError.message}`);
          // Continue with other slides rather than failing completely
        }
      }

      // Check if we generated any images successfully
      if (filePaths.length === 0) {
        throw new Error(`Failed to generate any images. Errors: ${errors.join('; ')}`);
      }

      // Step 4: Update export record with success
      console.log('✅ Updating export record with file paths:', filePaths);
      const finalStatus = filePaths.length === story.slides.length ? 'completed' : 'partial';
      const { error: updateError } = await supabase
        .from('carousel_exports')
        .update({
          status: finalStatus,
          file_paths: filePaths,
          updated_at: new Date().toISOString(),
          error_message: errors.length > 0 ? `Partial success. Errors: ${errors.join('; ')}` : null
        })
        .eq('story_id', story.id);

      if (updateError) {
        console.error('❌ Failed to update export record:', updateError);
        throw new Error(`Database update failed: ${updateError.message}`);
      } else {
        console.log(`✅ Updated carousel export status to ${finalStatus} for story ${story.id}`);
      }

      const successMessage = filePaths.length === story.slides.length 
        ? `Generated all ${filePaths.length} carousel images successfully`
        : `Generated ${filePaths.length} of ${story.slides.length} images (${errors.length} failed)`;

      toast({
        title: 'Carousel Generation Complete',
        description: successMessage,
      });

      console.log('🎉 Carousel generation completed:', {
        storyId: story.id,
        generatedImages: filePaths.length,
        totalSlides: story.slides.length,
        errors: errors.length,
        filePaths,
        finalStatus
      });

      return true;

    } catch (error: any) {
      console.error('❌ Carousel generation failed for story:', story.id, error);

      // Update export record with error
      const { error: updateError } = await supabase
        .from('carousel_exports')
        .update({
          status: 'failed',
          error_message: error.message || 'Unknown error occurred during generation',
          updated_at: new Date().toISOString()
        })
        .eq('story_id', story.id);

      if (updateError) {
        console.error('❌ Failed to update error status:', updateError);
      }

      toast({
        title: 'Generation Failed',
        description: error.message || 'Failed to generate carousel images',
        variant: 'destructive',
      });

      return false;
    } finally {
      setIsGenerating(prev => {
        const next = new Set(prev);
        next.delete(story.id);
        console.log(`🏁 Finished carousel generation for story ${story.id}, removed from generating set`);
        return next;
      });
    }
  };

  const retryCarouselGeneration = async (storyId: string, story: Story): Promise<boolean> => {
    console.log('🔄 Retrying carousel generation for story:', storyId);
    return generateCarouselImages(story);
  };

  return {
    generateCarouselImages,
    retryCarouselGeneration,
    isGenerating: (storyId: string) => isGenerating.has(storyId)
  };
};