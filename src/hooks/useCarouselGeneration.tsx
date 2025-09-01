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

// Canvas-based image generation function with enhanced debugging and font loading
const generateImageUsingCanvas = async (story: Story, slideIndex: number): Promise<Blob> => {
  console.log(`🎨 [DEBUG] Starting Canvas generation for slide ${slideIndex + 1}/${story.slides.length}`);
  
  const slide = story.slides[slideIndex];
  console.log(`🎨 [DEBUG] Slide content: "${slide.content}" (${slide.content.length} chars)`);
  
  return new Promise(async (resolve, reject) => {
    try {
      // Create canvas element
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d', { alpha: false });
      
      if (!ctx) {
        console.error('❌ [DEBUG] Failed to get canvas context');
        return reject(new Error('Failed to get canvas context'));
      }
      
      console.log(`✅ [DEBUG] Canvas 2D context created successfully`);
      
      // Set canvas dimensions for Instagram square format
      canvas.width = 1080;
      canvas.height = 1080;
      
      console.log(`✅ [DEBUG] Canvas dimensions set: ${canvas.width}x${canvas.height}`);
      
      // Wait for fonts to load
      await document.fonts.ready;
      console.log(`✅ [DEBUG] Fonts loaded and ready`);
      
      // Clear and set solid background
      ctx.save();
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      console.log(`✅ [DEBUG] Canvas background filled with solid white`);
      
      // Verify background was drawn
      const imageData = ctx.getImageData(0, 0, 100, 100);
      const isWhite = imageData.data[0] === 255 && imageData.data[1] === 255 && imageData.data[2] === 255;
      console.log(`✅ [DEBUG] Background verification: ${isWhite ? 'WHITE' : 'NOT WHITE'}`);
      
      // Add a border for visual confirmation
      ctx.strokeStyle = '#e5e7eb';
      ctx.lineWidth = 4;
      ctx.strokeRect(2, 2, canvas.width - 4, canvas.height - 4);
      console.log(`✅ [DEBUG] Border drawn`);
      
      // Header section with slide number
      const headerHeight = 140;
      ctx.fillStyle = '#1e293b';
      ctx.fillRect(0, 0, canvas.width, headerHeight);
      console.log(`✅ [DEBUG] Header background drawn (dark blue)`);
      
      // Slide number badge
      const badgeSize = 80;
      const badgeX = canvas.width - badgeSize - 30;
      const badgeY = 30;
      
      // Badge background
      ctx.fillStyle = '#3b82f6';
      ctx.beginPath();
      ctx.roundRect(badgeX, badgeY, badgeSize, badgeSize, 40);
      ctx.fill();
      console.log(`✅ [DEBUG] Slide badge background drawn`);
      
      // Badge text with explicit font
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 32px "Arial", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const badgeText = (slideIndex + 1).toString();
      ctx.fillText(badgeText, badgeX + badgeSize / 2, badgeY + badgeSize / 2);
      console.log(`✅ [DEBUG] Badge text drawn: "${badgeText}"`);
      
      // Story title in header (first slide only) or slide indicator
      ctx.fillStyle = '#ffffff';
      if (slideIndex === 0) {
        ctx.font = 'bold 28px "Arial", sans-serif';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        
        const titleText = story.title.length > 50 ? 
          story.title.substring(0, 47) + '...' : 
          story.title;
        
        ctx.fillText(titleText, 40, headerHeight / 2);
        console.log(`✅ [DEBUG] Story title drawn: "${titleText}"`);
      } else {
        ctx.font = '24px "Arial", sans-serif';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText(`Slide ${slideIndex + 1} of ${story.slides.length}`, 40, headerHeight / 2);
        console.log(`✅ [DEBUG] Slide indicator drawn`);
      }
      
      // Main content area with improved text rendering
      const contentY = headerHeight + 60;
      const maxWidth = canvas.width - 100;
      const lineHeight = 50;
      
      ctx.fillStyle = '#1e293b';
      ctx.font = '34px "Arial", sans-serif';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      
      console.log(`🎨 [DEBUG] Starting text wrapping for: "${slide.content}"`);
      console.log(`🎨 [DEBUG] Max width: ${maxWidth}, Line height: ${lineHeight}`);
      
      // Enhanced word wrapping with better measurement
      const wrapText = (text: string, maxWidth: number): string[] => {
        const words = text.split(' ');
        const lines: string[] = [];
        let currentLine = '';
        
        for (const word of words) {
          const testLine = currentLine + (currentLine ? ' ' : '') + word;
          
          // Measure the text width
          ctx.save();
          ctx.font = '34px "Arial", sans-serif';
          const metrics = ctx.measureText(testLine);
          ctx.restore();
          
          console.log(`🎨 [DEBUG] Measuring "${testLine}": ${metrics.width}px (max: ${maxWidth}px)`);
          
          if (metrics.width > maxWidth && currentLine) {
            lines.push(currentLine);
            console.log(`🎨 [DEBUG] Line break! Added: "${currentLine}"`);
            currentLine = word;
          } else {
            currentLine = testLine;
          }
        }
        
        if (currentLine) {
          lines.push(currentLine);
          console.log(`🎨 [DEBUG] Final line: "${currentLine}"`);
        }
        
        return lines;
      };
      
      const lines = wrapText(slide.content, maxWidth);
      console.log(`✅ [DEBUG] Text wrapped into ${lines.length} lines:`, lines);
      
      // Draw each line with verification
      let currentY = contentY;
      lines.forEach((line, index) => {
        console.log(`🎨 [DEBUG] Drawing line ${index + 1}: "${line}" at Y: ${currentY}`);
        
        // Set text properties each time to ensure consistency
        ctx.fillStyle = '#1e293b';
        ctx.font = '34px "Arial", sans-serif';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        
        // Draw the text
        ctx.fillText(line, 50, currentY);
        
        // Verify text was drawn by sampling pixel
        const sampleData = ctx.getImageData(50, currentY + 10, 1, 1);
        const isTextDrawn = sampleData.data[0] === 30; // Should be dark (30, 41, 59)
        console.log(`✅ [DEBUG] Line ${index + 1} drawn verification: ${isTextDrawn ? 'SUCCESS' : 'FAILED'}`);
        
        currentY += lineHeight;
      });
      
      // Footer with source attribution
      const footerY = canvas.height - 80;
      ctx.fillStyle = '#64748b';
      ctx.font = '22px "Arial", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      
      const attribution = story.article?.author 
        ? `Story by ${story.article.author}` 
        : 'Source: Local News';
      
      ctx.fillText(attribution, canvas.width / 2, footerY);
      console.log(`✅ [DEBUG] Footer attribution drawn: "${attribution}"`);
      
      // Final verification - check if canvas has content
      const finalData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const hasContent = Array.from(finalData.data).some((value, index) => {
        // Skip alpha channel, check if any pixel is not white
        if (index % 4 === 3) return false;
        return value !== 255;
      });
      
      console.log(`🎨 [DEBUG] Final canvas content check: ${hasContent ? 'HAS CONTENT' : 'IS BLANK'}`);
      
      ctx.restore();
      
      // Convert canvas to blob with high quality
      console.log(`🎨 [DEBUG] Converting canvas to blob...`);
      canvas.toBlob((blob) => {
        if (blob) {
          console.log(`✅ [DEBUG] Canvas converted to blob successfully. Size: ${blob.size} bytes`);
          console.log(`✅ [DEBUG] Expected size range: 30,000-100,000 bytes for meaningful content`);
          
          if (blob.size < 10000) {
            console.error(`❌ [DEBUG] CRITICAL: Blob size too small: ${blob.size} bytes - likely blank image!`);
            const canvas2 = document.createElement('canvas');
            const ctx2 = canvas2.getContext('2d');
            if (ctx2) {
              canvas2.width = 1080;
              canvas2.height = 1080;
              ctx2.fillStyle = '#ff0000';
              ctx2.fillRect(0, 0, canvas2.width, canvas2.height);
              ctx2.fillStyle = '#ffffff';
              ctx2.font = 'bold 48px Arial';
              ctx2.textAlign = 'center';
              ctx2.fillText('ERROR: BLANK IMAGE', canvas2.width/2, canvas2.height/2);
              canvas2.toBlob((errorBlob) => {
                resolve(errorBlob || blob);
              }, 'image/png', 1.0);
            } else {
              resolve(blob);
            }
          } else {
            console.log(`✅ [DEBUG] Blob size looks good: ${blob.size} bytes`);
            resolve(blob);
          }
        } else {
          console.error(`❌ [DEBUG] Failed to convert canvas to blob`);
          reject(new Error('Failed to convert canvas to blob'));
        }
      }, 'image/png', 1.0);
      
    } catch (error) {
      console.error(`❌ [DEBUG] Error during canvas drawing:`, error);
      reject(error);
    }
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