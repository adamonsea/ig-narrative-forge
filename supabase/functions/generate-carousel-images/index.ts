import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface GenerateCarouselRequest {
  storyId: string;
  formats?: string[];
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { storyId, formats = ['instagram-square'] }: GenerateCarouselRequest = await req.json();

    console.log('Generating carousel images for story:', storyId, 'formats:', formats);

    // Fetch story with slides
    const { data: story, error: storyError } = await supabase
      .from('stories')
      .select(`
        *,
        slides(*),
        articles(*)
      `)
      .eq('id', storyId)
      .single();

    if (storyError || !story) {
      throw new Error(`Failed to fetch story: ${storyError?.message}`);
    }

    console.log('Story fetched:', story.title, 'with', story.slides.length, 'slides');

    // Create or update carousel export record
    const { data: exportRecord, error: exportError } = await supabase
      .from('carousel_exports')
      .upsert({
        story_id: storyId,
        status: 'generating',
        export_formats: { formats },
        file_paths: []
      }, {
        onConflict: 'story_id'
      })
      .select()
      .single();

    if (exportError) {
      console.error('Failed to create export record:', exportError);
      throw new Error(`Failed to create export record: ${exportError.message}`);
    }

    console.log('Export record created:', exportRecord.id);

    // Generate images for each format
    const allFilePaths: string[] = [];
    const formatResults: Record<string, any> = {};

    for (const format of formats) {
      try {
        const formatConfig = getFormatConfig(format);
        const images = await generateImagesForFormat(story, format, formatConfig);
        
        // Upload images to storage
        const filePaths = await uploadImagesToStorage(supabase, storyId, format, images);
        
        allFilePaths.push(...filePaths);
        formatResults[format] = {
          count: images.length,
          paths: filePaths,
          config: formatConfig
        };

        console.log(`Generated ${images.length} images for format: ${format}`);
      } catch (formatError) {
        console.error(`Error generating format ${format}:`, formatError);
        formatResults[format] = {
          error: formatError.message
        };
      }
    }

    // Update export record with results
    const { error: updateError } = await supabase
      .from('carousel_exports')
      .update({
        status: 'completed',
        file_paths: allFilePaths,
        export_formats: formatResults,
        updated_at: new Date().toISOString()
      })
      .eq('id', exportRecord.id);

    if (updateError) {
      console.error('Failed to update export record:', updateError);
    }

    console.log('Carousel generation completed successfully');

    return new Response(
      JSON.stringify({
        success: true,
        exportId: exportRecord.id,
        formats: formatResults,
        totalImages: allFilePaths.length
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200
      }
    );

  } catch (error: any) {
    console.error('Error in generate-carousel-images:', error);

    return new Response(
      JSON.stringify({
        error: error.message,
        details: error.stack
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500
      }
    );
  }
});

function getFormatConfig(format: string) {
  const configs: Record<string, any> = {
    'instagram-square': { width: 1080, height: 1080, aspectRatio: '1:1' },
    'instagram-story': { width: 1080, height: 1920, aspectRatio: '9:16' }
  };
  
  return configs[format] || configs['instagram-square'];
}

async function generateImagesForFormat(story: any, format: string, config: any) {
  // For now, we'll return placeholder data since we're using client-side html2canvas
  // In a production system, you might use a headless browser like Puppeteer
  const images: string[] = [];
  
  for (let i = 0; i < story.slides.length; i++) {
    // Create a simple SVG placeholder for each slide
    const slide = story.slides[i];
    const svg = createSVGSlide(slide, story, config, i + 1);
    images.push(svg);
  }
  
  return images;
}

function createSVGSlide(slide: any, story: any, config: any, slideNumber: number): string {
  const fontSize = config.width === 1080 && config.height === 1920 ? 42 : 36;
  const titleFontSize = 18;
  
  return `data:image/svg+xml;base64,${btoa(`
    <svg width="${config.width}" height="${config.height}" xmlns="http://www.w3.org/2000/svg">
      <rect width="100%" height="100%" fill="#ffffff"/>
      
      <!-- Slide number -->
      <text x="${config.width - 30}" y="50" text-anchor="end" fill="#666666" font-size="16" font-family="Arial, sans-serif" font-weight="500">
        ${slideNumber}/${story.slides.length}
      </text>
      
      <!-- Main content -->
      <foreignObject x="60" y="${config.height / 2 - 100}" width="${config.width - 120}" height="200">
        <div xmlns="http://www.w3.org/1999/xhtml" style="
          display: flex;
          align-items: center;
          justify-content: center;
          height: 100%;
          text-align: center;
          font-family: Arial, sans-serif;
          font-size: ${fontSize}px;
          font-weight: 600;
          color: #1a1a1a;
          line-height: 1.2;
          word-wrap: break-word;
        ">
          ${slide.content}
        </div>
      </foreignObject>
      
      <!-- Story title -->
      <text x="${config.width / 2}" y="${config.height - 80}" text-anchor="middle" fill="#666666" font-size="${titleFontSize}" font-family="Arial, sans-serif" font-weight="400">
        ${story.title}
      </text>
      
      <!-- Author -->
      ${story.articles?.[0]?.author ? `
        <text x="${config.width / 2}" y="${config.height - 50}" text-anchor="middle" fill="#999999" font-size="14" font-family="Arial, sans-serif">
          By ${story.articles[0].author}
        </text>
      ` : ''}
    </svg>
  `)}`;
}

async function uploadImagesToStorage(supabase: any, storyId: string, format: string, images: string[]) {
  const filePaths: string[] = [];
  
  for (let i = 0; i < images.length; i++) {
    const fileName = `carousel_${storyId}_${format}_slide_${i + 1}.png`;
    const filePath = `carousels/${storyId}/${fileName}`;
    
    try {
      // Convert base64 to blob for upload
      const base64Data = images[i].split(',')[1] || images[i];
      const binaryData = Uint8Array.from(atob(base64Data), c => c.charCodeAt(0));
      
      const { error: uploadError } = await supabase.storage
        .from('exports')
        .upload(filePath, binaryData, {
          contentType: 'image/png',
          upsert: true
        });
      
      if (uploadError) {
        console.error(`Failed to upload ${fileName}:`, uploadError);
        continue;
      }
      
      filePaths.push(filePath);
      console.log(`Uploaded: ${filePath}`);
      
    } catch (uploadError) {
      console.error(`Error uploading ${fileName}:`, uploadError);
    }
  }
  
  return filePaths;
}