import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface FirecrawlRequest {
  url: string;
  sourceId?: string;
  topicId?: string;
  options?: {
    formats?: string[];
    onlyMainContent?: boolean;
    waitFor?: number;
  };
}

interface ExtractedArticle {
  title: string;
  url: string;
  content: string;
  publishedAt?: string;
  author?: string;
  wordCount: number;
}

// Extract articles from Firecrawl markdown response
function extractArticlesFromMarkdown(markdown: string, sourceUrl: string): ExtractedArticle[] {
  const articles: ExtractedArticle[] = [];
  
  // Try to extract title from first H1 or H2
  const titleMatch = markdown.match(/^#\s+(.+)$/m) || markdown.match(/^##\s+(.+)$/m);
  const title = titleMatch ? titleMatch[1].trim() : 'Untitled Article';
  
  // Clean content - remove navigation, ads, etc.
  const cleanedContent = markdown
    .replace(/^\[.*?\]\(.*?\)\s*$/gm, '') // Remove standalone links
    .replace(/^[-*]\s*\[.*?\]\(.*?\)\s*$/gm, '') // Remove link list items
    .replace(/\n{3,}/g, '\n\n') // Normalize whitespace
    .trim();
  
  const wordCount = cleanedContent.split(/\s+/).filter(w => w.length > 0).length;
  
  // Only include if substantial content
  if (wordCount >= 100) {
    articles.push({
      title,
      url: sourceUrl,
      content: cleanedContent.substring(0, 10000), // Limit content size
      wordCount,
    });
  }
  
  return articles;
}

// Track API usage for cost monitoring
async function trackUsage(
  supabase: ReturnType<typeof createClient>,
  operation: string,
  topicId?: string
): Promise<void> {
  try {
    await supabase.from('api_usage').insert({
      service_name: 'firecrawl',
      operation,
      tokens_used: 1, // 1 credit per page
      cost_usd: 0.006, // Hobby plan rate
      region: topicId,
    });
  } catch (error) {
    console.warn('Failed to track Firecrawl usage:', error);
  }
}

// Check daily budget limit
async function checkDailyBudget(
  supabase: ReturnType<typeof createClient>,
  dailyLimit: number = 100
): Promise<{ allowed: boolean; used: number }> {
  try {
    const today = new Date().toISOString().split('T')[0];
    
    const { data, error } = await supabase
      .from('api_usage')
      .select('tokens_used')
      .eq('service_name', 'firecrawl')
      .gte('created_at', `${today}T00:00:00Z`)
      .lt('created_at', `${today}T23:59:59Z`);
    
    if (error) {
      console.warn('Failed to check Firecrawl budget:', error);
      return { allowed: true, used: 0 }; // Allow on error to not block scraping
    }
    
    const used = data?.reduce((sum, row) => sum + (row.tokens_used || 0), 0) || 0;
    return { allowed: used < dailyLimit, used };
  } catch (error) {
    console.warn('Budget check error:', error);
    return { allowed: true, used: 0 };
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const startTime = Date.now();

  try {
    const { url, sourceId, topicId, options } = await req.json() as FirecrawlRequest;

    if (!url) {
      return new Response(
        JSON.stringify({ success: false, error: 'URL is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const apiKey = Deno.env.get('FIRECRAWL_API_KEY');
    if (!apiKey) {
      console.error('FIRECRAWL_API_KEY not configured');
      return new Response(
        JSON.stringify({ success: false, error: 'Firecrawl not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Initialize Supabase client for usage tracking
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Check daily budget
    const { allowed, used } = await checkDailyBudget(supabase);
    if (!allowed) {
      console.log(`Firecrawl daily budget exceeded (${used} credits used)`);
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Daily Firecrawl budget exceeded',
          creditsUsed: used 
        }),
        { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Format URL
    let formattedUrl = url.trim();
    if (!formattedUrl.startsWith('http://') && !formattedUrl.startsWith('https://')) {
      formattedUrl = `https://${formattedUrl}`;
    }

    console.log(`[Firecrawl] Scraping URL: ${formattedUrl} (source: ${sourceId}, topic: ${topicId})`);

    // Call Firecrawl API
    const response = await fetch('https://api.firecrawl.dev/v1/scrape', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        url: formattedUrl,
        formats: options?.formats || ['markdown', 'links'],
        onlyMainContent: options?.onlyMainContent ?? true,
        waitFor: options?.waitFor || 2000,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('[Firecrawl] API error:', response.status, data);
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: data.error || `Firecrawl request failed with status ${response.status}` 
        }),
        { status: response.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Track successful usage
    await trackUsage(supabase, 'scrape', topicId);

    // Extract articles from response
    const markdown = data.data?.markdown || data.markdown || '';
    const links = data.data?.links || data.links || [];
    const metadata = data.data?.metadata || data.metadata || {};

    const articles = extractArticlesFromMarkdown(markdown, formattedUrl);

    const duration = Date.now() - startTime;
    console.log(`[Firecrawl] Success: ${formattedUrl} - ${articles.length} articles, ${markdown.length} chars, ${duration}ms`);

    return new Response(
      JSON.stringify({
        success: true,
        articles,
        metadata: {
          sourceUrl: formattedUrl,
          title: metadata.title,
          description: metadata.description,
          statusCode: metadata.statusCode || 200,
          linksFound: links.length,
          markdownLength: markdown.length,
          duration,
          sourceId,
          topicId,
        },
        raw: {
          markdown: markdown.substring(0, 5000), // Include partial raw for debugging
          links: links.slice(0, 20),
        }
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    const duration = Date.now() - startTime;
    console.error('[Firecrawl] Error:', error, `(${duration}ms)`);
    
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error',
        duration 
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
