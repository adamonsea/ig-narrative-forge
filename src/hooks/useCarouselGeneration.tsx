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
      const isLastSlide = slideIndex === story.slides.length - 1;
      
      console.log(`🎨 Generating Canvas image for slide ${slideIndex + 1}:`, {
        slideId: slide.id,
        content: slide.content?.substring(0, 50) + '...',
        contentLength: slide.content?.length,
        isFirstSlide,
        isLastSlide
      });
      
      // Create canvas
      const canvas = document.createElement('canvas');
      canvas.width = 1080;
      canvas.height = 1080;
      const ctx = canvas.getContext('2d');
      
      if (!ctx) {
        console.error('❌ Could not get canvas context');
        reject(new Error('Could not get canvas context'));
        return;
      }

      console.log('✅ Canvas context created, dimensions:', canvas.width, 'x', canvas.height);

      // Fill background with solid white
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, 1080, 1080);
      console.log('✅ White background filled');

      // Draw header area with light background
      ctx.fillStyle = '#f8fafc';
      ctx.fillRect(0, 0, 1080, 100);
      console.log('✅ Header background filled');
      
      // Draw header border
      ctx.fillStyle = '#e2e8f0';
      ctx.fillRect(0, 100, 1080, 2);
      console.log('✅ Header border drawn');

      // Header badge (News) with better visibility
      const badgeX = 32;
      const badgeY = 32;
      const badgeWidth = 80;
      const badgeHeight = 36;
      
      // Badge background with solid color
      ctx.fillStyle = '#3b82f6';
      ctx.beginPath();
      ctx.roundRect(badgeX, badgeY, badgeWidth, badgeHeight, 6);
      ctx.fill();
      
      // Badge text with white color
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 14px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('News', badgeX + badgeWidth/2, badgeY + 23);
      
      // Counter text
      ctx.fillStyle = '#64748b';
      ctx.font = '14px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
      ctx.textAlign = 'right';
      ctx.fillText(`${slideIndex + 1} of ${story.slides.length}`, 1048, 55);

      // Parse content for last slide (handle CTA content)
      let mainContent = slide.content;
      let ctaContent = null;
      
      if (isLastSlide) {
        const ctaPatterns = [
          /Like, share\./i,
          /Summarised by/i,
          /Support local journalism/i
        ];
        
        let splitIndex = -1;
        for (const pattern of ctaPatterns) {
          const match = slide.content.search(pattern);
          if (match !== -1) {
            splitIndex = match;
            break;
          }
        }
        
        if (splitIndex !== -1) {
          mainContent = slide.content.substring(0, splitIndex).trim();
          ctaContent = slide.content.substring(splitIndex).trim().replace(/^Comment, like, share\.\s*/i, 'Like, share. ');
        }
      }

      // Main content styling with better contrast
      ctx.fillStyle = '#1f2937'; // Dark gray for better readability
      ctx.textAlign = 'center';
      
      // Dynamic font size based on content length and slide type
      let fontSize;
      let fontWeight;
      const contentLength = mainContent.length;
      
      if (isFirstSlide) {
        // Title slide - bold and larger
        if (contentLength < 50) fontSize = 72;
        else if (contentLength < 100) fontSize = 60;
        else fontSize = 48;
        fontWeight = 'bold';
        // Convert to uppercase for title
        mainContent = mainContent.toUpperCase();
      } else {
        // Content slide - lighter weight
        if (contentLength < 80) fontSize = 48;
        else if (contentLength < 150) fontSize = 40;
        else if (contentLength < 250) fontSize = 32;
        else fontSize = 28;
        fontWeight = '400';
      }
      
      console.log(`📝 Text styling for slide ${slideIndex + 1}:`, {
        fontSize,
        fontWeight,
        contentLength,
        mainContent: mainContent.substring(0, 30) + '...'
      });
      
      ctx.font = `${fontWeight} ${fontSize}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
      console.log('✅ Font set:', ctx.font);

      // Enhanced word wrap function
      const wrapText = (text: string, maxWidth: number) => {
        const words = text.split(' ');
        const lines: string[] = [];
        let currentLine = words[0] || '';

        for (let i = 1; i < words.length; i++) {
          const word = words[i];
          const testLine = currentLine + " " + word;
          const metrics = ctx.measureText(testLine);
          if (metrics.width < maxWidth) {
            currentLine = testLine;
          } else {
            lines.push(currentLine);
            currentLine = word;
          }
        }
        lines.push(currentLine);
        return lines;
      };

      // Draw main content with proper spacing
      const maxWidth = 900;
      const lines = wrapText(mainContent, maxWidth);
      const lineHeight = fontSize * 1.3;
      const totalMainHeight = lines.length * lineHeight;
      
      // Calculate vertical centering
      let contentStartY;
      if (ctaContent) {
        // Leave space for CTA content below
        contentStartY = (1080 - totalMainHeight - 150) / 2 + (lineHeight / 2);
      } else {
        contentStartY = (1080 - totalMainHeight + 50) / 2 + (lineHeight / 2);
      }

      // Draw main content lines with debugging
      console.log(`📖 Drawing ${lines.length} lines of text starting at Y:${contentStartY}`);
      lines.forEach((line, index) => {
        const yPos = contentStartY + (index * lineHeight);
        console.log(`📝 Drawing line ${index + 1}: "${line}" at Y:${yPos}`);
        ctx.fillText(line, 540, yPos);
      });
      console.log('✅ Main content drawn');

      // Draw CTA content if it exists (last slide)
      if (ctaContent && isLastSlide) {
        // Separator line
        ctx.fillStyle = '#e2e8f0';
        ctx.fillRect(340, contentStartY + totalMainHeight + 30, 400, 1);
        
        // CTA text styling (50% bigger)
        ctx.fillStyle = '#64748b';
        ctx.font = 'bold 27px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
        
        const ctaLines = wrapText(ctaContent, maxWidth);
        const ctaLineHeight = 36; // Increased from 24 for bigger text
        const ctaStartY = contentStartY + totalMainHeight + 70;
        
        ctaLines.forEach((line, index) => {
          ctx.fillText(line, 540, ctaStartY + (index * ctaLineHeight));
        });
      }

      // Footer
      ctx.fillStyle = '#94a3b8';
      ctx.font = 'bold 12px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('News', 540, 1050);

      // Convert to blob with debugging
      console.log('🖼️ Converting canvas to blob...');
      canvas.toBlob((blob) => {
        if (blob) {
          console.log(`✅ Canvas converted to blob: ${blob.size} bytes, type: ${blob.type}`);
          if (blob.size < 1000) {
            console.warn(`⚠️ Suspiciously small blob: ${blob.size} bytes - image may be blank`);
          }
          resolve(blob);
        } else {
          console.error('❌ Failed to create blob from canvas');
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