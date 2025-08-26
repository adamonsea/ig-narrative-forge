import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import StoryCarousel from '@/components/StoryCarousel';

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

  const createSimpleSlideElement = (story: Story, slideIndex: number): HTMLElement => {
    const slide = story.slides[slideIndex];
    const isFirstSlide = slideIndex === 0;
    
    // Create container
    const container = document.createElement('div');
    container.style.cssText = `
      position: fixed;
      left: -9999px;
      top: -9999px;
      width: 1080px;
      height: 1080px;
      background: white;
      display: flex;
      flex-direction: column;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif;
      border-radius: 8px;
      overflow: hidden;
    `;

    // Header
    const header = document.createElement('div');
    header.style.cssText = `
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 24px;
      border-bottom: 1px solid #e5e7eb;
      background: white;
    `;
    
    const badge = document.createElement('div');
    badge.textContent = 'News';
    badge.style.cssText = `
      background: #f3f4f6;
      color: #374151;
      padding: 6px 12px;
      border-radius: 4px;
      font-size: 14px;
      font-weight: 500;
    `;
    
    const counter = document.createElement('span');
    counter.textContent = `${slideIndex + 1} of ${story.slides.length}`;
    counter.style.cssText = `
      color: #6b7280;
      font-size: 14px;
    `;
    
    header.appendChild(badge);
    header.appendChild(counter);

    // Content area
    const content = document.createElement('div');
    content.style.cssText = `
      flex: 1;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 64px;
      background: white;
    `;

    const textContainer = document.createElement('div');
    textContainer.style.cssText = `
      max-width: 640px;
      width: 100%;
    `;

    const text = document.createElement('div');
    text.textContent = slide.content;
    text.style.cssText = `
      text-align: center;
      line-height: 1.4;
      color: #111827;
      font-weight: ${isFirstSlide ? '700' : '300'};
      font-size: ${isFirstSlide ? '48px' : '36px'};
      ${isFirstSlide ? 'text-transform: uppercase;' : ''}
    `;

    textContainer.appendChild(text);
    content.appendChild(textContainer);

    // Footer
    const footer = document.createElement('div');
    footer.style.cssText = `
      padding: 24px;
      text-align: center;
      background: white;
    `;

    const attribution = document.createElement('div');
    attribution.textContent = 'News';
    attribution.style.cssText = `
      color: #6b7280;
      font-size: 12px;
      font-weight: 500;
    `;

    footer.appendChild(attribution);

    // Assemble
    container.appendChild(header);
    container.appendChild(content);
    container.appendChild(footer);
    
    return container;
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
        title: 'Loading Image Generator',
        description: 'Preparing canvas generation tools...',
      });

      // Step 2: Load html2canvas with error handling
      let html2canvas;
      try {
        html2canvas = (await import('html2canvas')).default;
        console.log('✅ html2canvas loaded successfully');
      } catch (loadError) {
        console.error('❌ Failed to load html2canvas:', loadError);
        throw new Error('Failed to load image generation library');
      }

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

        let carouselContainer: HTMLElement | null = null;
        try {
          carouselContainer = createSimpleSlideElement(story, i);
          document.body.appendChild(carouselContainer);
          console.log(`📝 Simple slide element created and added to DOM`);

          // Wait for fonts to load
          await new Promise(resolve => setTimeout(resolve, 300));

          // Generate canvas with enhanced options
          const canvas = await html2canvas(carouselContainer, {
            width: 1080,
            height: 1080,
            backgroundColor: '#ffffff',
            scale: 1,
            useCORS: true,
            allowTaint: false,
            logging: false,
            foreignObjectRendering: true,
            removeContainer: false
          });

          console.log(`🖼️ Canvas generated:`, {
            width: canvas.width,
            height: canvas.height,
            dataUrl: canvas.toDataURL().substring(0, 50) + '...'
          });

          if (canvas.width === 0 || canvas.height === 0) {
            throw new Error(`Canvas has invalid dimensions: ${canvas.width}x${canvas.height}`);
          }

          // Convert to blob with error handling
          const imageBlob = await new Promise<Blob>((resolve, reject) => {
            canvas.toBlob((blob) => {
              if (blob) {
                console.log(`✅ Blob created, size: ${blob.size} bytes`);
                resolve(blob);
              } else {
                reject(new Error('Failed to create image blob from canvas'));
              }
            }, 'image/png', 0.9);
          });

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
        } finally {
          if (carouselContainer?.parentNode) {
            document.body.removeChild(carouselContainer);
            console.log(`🧹 Cleaned up carousel container ${i + 1}`);
          }
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