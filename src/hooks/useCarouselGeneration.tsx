import { useState, useEffect } from 'react';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';

// Global generating state that persists across hook instances
const globalGeneratingState = new Set<string>();
const generateStateListeners = new Set<() => void>();

// Helper functions to manage global state
const addToGenerating = (storyId: string) => {
  globalGeneratingState.add(storyId);
  generateStateListeners.forEach(listener => listener());
};

const removeFromGenerating = (storyId: string) => {
  globalGeneratingState.delete(storyId);
  generateStateListeners.forEach(listener => listener());
};

const isCurrentlyGenerating = (storyId: string) => {
  return globalGeneratingState.has(storyId);
};

interface Story {
  id: string;
  title: string;
  status: string;
  author?: string | null;
  publication_name?: string | null;
  created_at?: string;
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
    region?: string;
  };
}

// Playwright-based image generation using static HTML templates
const generateImageUsingPlaywright = async (story: Story, slideIndex: number, topicName: string): Promise<Blob> => {
  console.log(`🎨 [Playwright] Starting generation for slide ${slideIndex + 1}/${story.slides.length}`);
  
  try {
    // Call the Playwright image generator edge function
    const { data, error } = await supabase.functions.invoke('playwright-image-generator', {
      body: {
        story: {
          id: story.id,
          title: story.title,
          author: story.article?.author || story.author || null,
          publication_name: story.publication_name || null,
          created_at: story.created_at || new Date().toISOString(),
          slides: story.slides,
          article: {
            source_url: story.article?.source_url || '',
            region: story.article?.region || 'local'
          }
        },
        slideIndex,
        topicName,
        width: 1080,
        height: 1080,
        dpr: 2
      }
    });

    if (error) {
      console.error('❌ [Playwright] Edge function error:', error);
      throw new Error(`Edge function error: ${error.message}`);
    }

    // If Playwright is not available, fall back to HTML-to-image service
    if (!data.success && data.html) {
      console.log('🔄 [Playwright] Falling back to HTML-to-image service...');
      
      const { data: convertData, error: convertError } = await supabase.functions.invoke('html-to-image-converter', {
        body: {
          html: data.html,
          width: 1080,
          height: 1080,
          format: 'png'
        }
      });

      if (convertError || !convertData.success) {
        console.error('❌ [HTML-to-Image] Service error:', convertError || convertData.error);
        throw new Error(`HTML-to-image conversion failed: ${convertError?.message || convertData.error}`);
      }

      // Convert base64 to blob
      const response = await fetch(convertData.image);
      const blob = await response.blob();
      console.log(`✅ [HTML-to-Image] Generated PNG blob: ${blob.size} bytes`);
      return blob;
    }

    if (data.image) {
      // Convert base64 to blob
      const response = await fetch(data.image);
      const blob = await response.blob();
      console.log(`✅ [Playwright] Generated PNG blob: ${blob.size} bytes`);
      return blob;
    }

    throw new Error('No image data received from generation service');

  } catch (error) {
    console.error(`❌ [Playwright] Generation failed:`, error);
    throw error;
  }
};

export const useCarouselGeneration = () => {
  const [, forceUpdate] = useState({});
  const { toast } = useToast();

  // Subscribe to global state changes to trigger re-renders
  useEffect(() => {
    const listener = () => forceUpdate({});
    generateStateListeners.add(listener);
    return () => { generateStateListeners.delete(listener); };
  }, []);

  const generateCarouselImages = async (story: Story, topicName: string = 'Story'): Promise<boolean> => {
    // Check if generation is already in progress using global state
    if (isCurrentlyGenerating(story.id)) {
      console.log('⚠️ Generation already in progress for story:', story.id, 'Current generating stories:', Array.from(globalGeneratingState));
      toast({
        title: 'Already Generating',
        description: 'Carousel generation is already in progress for this story',
        variant: 'destructive',
      });
      return false;
    }

    // Validate story has slides
    if (!story?.slides?.length) {
      console.log('❌ No slides found for story:', story.id);
      toast({
        title: 'No Slides Found',
        description: 'Story has no slides to generate images for',
        variant: 'destructive',
      });
      return false;
    }

    console.log('🎨 Starting carousel generation for story:', story.id, {
      title: story.title,
      slideCount: story.slides?.length,
      slides: story.slides?.map(s => ({ id: s.id, slideNumber: s.slide_number, wordCount: s.word_count })),
      currentlyGenerating: Array.from(globalGeneratingState)
    });

    // Add to generating set and show initial toast
    addToGenerating(story.id);
    
    toast({
      title: 'Carousel Generation Started',
      description: `Generating ${story.slides.length} carousel images...`,
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
        title: 'Starting Playwright Generation',
        description: 'Rendering static HTML templates as images...',
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
          console.log(`🎨 Generating image ${i + 1}/${story.slides.length} using Playwright`);

          const imageBlob = await generateImageUsingPlaywright(story, i, topicName);
          console.log(`✅ Playwright image generated, size: ${imageBlob.size} bytes`);

          // Upload to storage with standardized naming
          const fileName = `carousel_${story.id}_instagram-square_slide_${i + 1}.png`;
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
      // Always ensure the story is removed from generating set
      const wasInSet = isCurrentlyGenerating(story.id);
      removeFromGenerating(story.id);
      console.log(`🏁 Finished carousel generation for story ${story.id}, was in set: ${wasInSet}, remaining generating: [${Array.from(globalGeneratingState).join(', ')}]`);
    }
  };

  const retryCarouselGeneration = async (storyId: string, story: Story, topicName: string = 'Story'): Promise<boolean> => {
    console.log('🔄 Retrying carousel generation for story:', storyId);
    return generateCarouselImages(story, topicName);
  };

  return {
    generateCarouselImages,
    retryCarouselGeneration,
    isGenerating: (storyId: string) => isCurrentlyGenerating(storyId)
  };
};