import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface RenderRequest {
  story: {
    id: string;
    title: string;
    author?: string | null;
    publication_name?: string | null;
    created_at: string;
    slides: Array<{
      id: string;
      slide_number: number;
      content: string;
    }>;
    article: {
      source_url: string;
      region: string;
    };
  };
  slideIndex: number;
  topicName: string;
  width?: number;
  height?: number;
  dpr?: number;
}

// Generate static HTML template for a slide
const generateSlideHTML = (story: any, slideIndex: number, topicName: string, width = 1080, height = 1080) => {
  const currentSlide = story.slides[slideIndex];
  const isFirstSlide = slideIndex === 0;
  const isLastSlide = slideIndex === story.slides.length - 1;

  // Parse content for last slide styling (same logic as React component)
  const parseContentForLastSlide = (content: string) => {
    if (!isLastSlide) return { mainContent: content, ctaContent: null, sourceUrl: null };
    
    const ctaPatterns = [
      /Like, share\./i,
      /Summarised by/i,
      /Support local journalism/i
    ];
    
    let splitIndex = -1;
    for (const pattern of ctaPatterns) {
      const match = content.search(pattern);
      if (match !== -1) {
        splitIndex = match;
        break;
      }
    }
    
    let mainContent = content;
    let ctaContent = null;
    
    if (splitIndex !== -1) {
      mainContent = content.substring(0, splitIndex).trim();
      ctaContent = content.substring(splitIndex).trim().replace(/^Comment, like, share\.\s*/i, 'Like, share. ');
    }
    
    const sourceDomain = story.article?.source_url ? 
      new URL(story.article.source_url).hostname.replace('www.', '') : 
      'source';
    
    const sourceAttribution = `Read the full story at ${sourceDomain}`;
    const finalCtaContent = ctaContent ? 
      `${ctaContent}\n\n${sourceAttribution}` : 
      sourceAttribution;
    
    return {
      mainContent,
      ctaContent: finalCtaContent,
      sourceUrl: story.article?.source_url
    };
  };

  const { mainContent, ctaContent, sourceUrl } = parseContentForLastSlide(currentSlide.content);

  // Dynamic text sizing
  const getTextSize = (content: string, isTitle: boolean) => {
    const length = content.length;
    if (isTitle) {
      if (length < 50) return "text-5xl";
      if (length < 100) return "text-4xl";
      return "text-3xl";
    } else {
      if (length < 80) return "text-3xl";
      if (length < 150) return "text-2xl";
      if (length < 250) return "text-xl";
      return "text-lg";
    }
  };

  const textSizeClass = isFirstSlide 
    ? getTextSize(currentSlide.content, true) 
    : getTextSize(isLastSlide ? mainContent : currentSlide.content, false);

  const fontWeightClass = isFirstSlide ? 'font-bold' : 'font-light';
  const transformClass = isFirstSlide ? 'uppercase' : '';

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=${width}, initial-scale=1" />
  <style>
    /* Reset and base styles */
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body {
      width: ${width}px;
      height: ${height}px;
      overflow: hidden;
      -webkit-font-smoothing: antialiased;
      text-rendering: optimizeLegibility;
      font-kerning: normal;
      image-rendering: -webkit-optimize-contrast;
    }
    
    /* Font face declarations */
    @font-face {
      font-family: 'Inter';
      font-style: normal;
      font-weight: 400;
      src: url('https://fonts.gstatic.com/s/inter/v13/UcCO3FwrK3iLTeHuS_fvQtMwCp50KnMw2boKoduKmMEVuLyfAZ9hiJ-Ek-_EeA.woff2') format('woff2');
      font-display: swap;
    }
    @font-face {
      font-family: 'Inter';
      font-style: normal;
      font-weight: 700;
      src: url('https://fonts.gstatic.com/s/inter/v13/UcCO3FwrK3iLTeHuS_fvQtMwCp50KnMw2boKoduKmMEVuFuYAZ9hiJ-Ek-_EeA.woff2') format('woff2');
      font-display: swap;
    }
    
    /* Design system variables */
    :root {
      --background: 0 0% 100%;
      --foreground: 222.2 84% 4.9%;
      --card: 0 0% 100%;
      --card-foreground: 222.2 84% 4.9%;
      --primary: 222.2 47.4% 11.2%;
      --primary-foreground: 210 40% 98%;
      --secondary: 210 40% 96%;
      --secondary-foreground: 222.2 47.4% 11.2%;
      --muted: 210 40% 96%;
      --muted-foreground: 215.4 16.3% 46.9%;
      --accent: 210 40% 96%;
      --accent-foreground: 222.2 47.4% 11.2%;
      --destructive: 0 84.2% 60.2%;
      --destructive-foreground: 210 40% 98%;
      --border: 214.3 31.8% 91.4%;
      --input: 214.3 31.8% 91.4%;
      --ring: 222.2 47.4% 11.2%;
      --radius: 0.5rem;
    }
    
    /* Layout styles */
    .slide-container {
      width: ${width}px;
      height: ${height}px;
      background: hsl(var(--background));
      color: hsl(var(--foreground));
      font-family: 'Inter', ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      display: flex;
      flex-direction: column;
      border-radius: calc(var(--radius) + 2px);
      border: 1px solid hsl(var(--border));
      overflow: hidden;
    }
    
    .header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 24px;
      border-bottom: 1px solid hsl(var(--border));
    }
    
    .badge {
      background: hsl(var(--secondary));
      color: hsl(var(--secondary-foreground));
      padding: 8px 16px;
      border-radius: var(--radius);
      font-size: 18px;
      font-weight: 500;
    }
    
    .slide-counter {
      font-size: 18px;
      color: hsl(var(--muted-foreground));
    }
    
    .content-area {
      flex: 1;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 48px;
    }
    
    .content-wrapper {
      width: 100%;
      max-width: 896px; /* max-w-4xl */
    }
    
    .slide-content {
      text-align: center;
      line-height: 1.625; /* leading-relaxed */
    }
    
    .footer {
      padding: 24px;
      border-top: 1px solid hsl(var(--border));
      text-align: center;
      font-size: 18px;
      color: hsl(var(--muted-foreground));
    }
    
    .cta-section {
      margin-top: 24px;
      padding-top: 24px;
      border-top: 1px solid hsl(var(--muted));
    }
    
    .cta-content {
      font-size: 20px;
      font-weight: 700;
      color: hsl(var(--muted-foreground));
    }
    
    .cta-link {
      color: hsl(var(--primary));
      font-weight: 800;
      text-decoration: underline;
      transition: color 0.2s;
    }
    
    .cta-link:hover {
      color: hsl(var(--primary) / 0.8);
    }
    
    /* Text size classes */
    .text-5xl { font-size: 48px; line-height: 1; }
    .text-4xl { font-size: 36px; line-height: 40px; }
    .text-3xl { font-size: 30px; line-height: 36px; }
    .text-2xl { font-size: 24px; line-height: 32px; }
    .text-xl { font-size: 20px; line-height: 28px; }
    .text-lg { font-size: 18px; line-height: 28px; }
    
    .font-bold { font-weight: 700; }
    .font-light { font-weight: 300; }
    .uppercase { text-transform: uppercase; }
  </style>
</head>
<body>
  <div class="slide-container">
    <!-- Header -->
    <div class="header">
      <div class="badge">${topicName}</div>
      <div class="slide-counter">${slideIndex + 1} of ${story.slides.length}</div>
    </div>
    
    <!-- Content Area -->
    <div class="content-area">
      <div class="content-wrapper">
        <div class="slide-content ${textSizeClass} ${fontWeightClass} ${transformClass}">
          ${isLastSlide ? mainContent : currentSlide.content}
          
          ${isLastSlide && ctaContent ? `
            <div class="cta-section">
              <div class="cta-content">${ctaContent
                .replace(/visit ([^\s]+)/gi, 'visit <span class="cta-link">$1</span>')
                .replace(/call (\d{5}\s?\d{6})/gi, 'call <span class="cta-link">$1</span>')
                .replace(/Read the full story at ([^\s\n]+)/gi, sourceUrl ? 
                  `<a href="${sourceUrl}" target="_blank" rel="noopener noreferrer" class="cta-link">Read the full story at $1</a>` :
                  'Read the full story at <span class="cta-link">$1</span>')
                .replace(/\n\n/g, '<br><br>')
              }</div>
            </div>
          ` : ''}
        </div>
      </div>
    </div>
    
    <!-- Footer -->
    <div class="footer">
      ${story.author ? `Story by ${story.author}` : 'Source: Local News'}
    </div>
  </div>
  
  <script>
    // Signal when fonts are ready
    const ready = async () => {
      await document.fonts.ready;
      const imgs = Array.from(document.images || []);
      await Promise.all(imgs.map(img => img.complete ? Promise.resolve() : new Promise(res => {
        img.addEventListener('load', res, { once: true });
        img.addEventListener('error', res, { once: true });
      })));
    };
    window.__READY__ = ready();
  </script>
</body>
</html>`;
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    
    const { story, slideIndex, topicName, width = 1080, height = 1080, dpr = 2 }: RenderRequest = await req.json();

    if (!story || slideIndex === undefined || !topicName) {
      return new Response(
        JSON.stringify({ error: 'story, slideIndex, and topicName are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`🎨 Generating image for slide ${slideIndex + 1}/${story.slides.length} of story ${story.id}`);

    // Generate the HTML content
    const html = generateSlideHTML(story, slideIndex, topicName, width, height);
    
    // For now, we'll use a simpler approach since Playwright in Deno is complex
    // We could use a headless Chrome service or convert to use a different rendering approach
    
    // NOTE: This is a placeholder implementation. In production, you would:
    // 1. Use a containerized Puppeteer/Playwright service
    // 2. Or use a cloud service like Bannerbear, htmlcsstoimage.com, etc.
    // 3. Or implement with a Node.js microservice
    
    console.log('⚠️ Playwright rendering not yet implemented in Deno environment');
    console.log('📄 Generated HTML template:', html.substring(0, 500) + '...');
    
    // Return the HTML for now so the client can see what would be rendered
    return new Response(
      JSON.stringify({ 
        success: false, 
        message: 'Playwright rendering requires Node.js environment. HTML template generated.',
        html: html,
        error: 'Playwright not available in Deno Edge Functions'
      }),
      { 
        status: 501, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );

  } catch (error) {
    console.error('Error in playwright-image-generator:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});