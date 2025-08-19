import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    const { feedUrl, sourceId, sourceName } = await req.json();
    console.log(`🚀 Simple scraper starting for: ${sourceName || feedUrl}`);
    
    // Fetch RSS feed with proper headers
    const response = await fetch(feedUrl, {
      headers: {
        'User-Agent': 'LocalNewsBot/1.0 (Eastbourne News Aggregator)',
        'Accept': 'application/rss+xml, application/xml, text/xml, application/atom+xml'
      }
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const content = await response.text();
    console.log(`📄 Fetched ${content.length} characters from ${feedUrl}`);

    // Simple RSS parsing
    const articles = parseRSSSimple(content);
    console.log(`📰 Parsed ${articles.length} articles`);

    if (articles.length === 0) {
      return new Response(JSON.stringify({
        success: false,
        error: 'No articles found in feed',
        articlesFound: 0,
        articlesScraped: 0
      }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Insert articles into database
    let articlesScraped = 0;
    const errors: string[] = [];

    for (const article of articles.slice(0, 5)) { // Limit to 5 articles
      try {
        // Check for existing article
        const { data: existing } = await supabase
          .from('articles')
          .select('id')
          .eq('source_url', article.source_url)
          .maybeSingle();

        if (existing) {
          console.log(`⏭️ Skipping duplicate: ${article.title}`);
          continue;
        }

        // Insert new article
        const { error: insertError } = await supabase
          .from('articles')
          .insert({
            title: article.title.substring(0, 500),
            body: article.body || article.summary || '',
            summary: article.summary?.substring(0, 500),
            author: article.author,
            source_url: article.source_url,
            published_at: article.published_at,
            region: 'Eastbourne',
            source_id: sourceId,
            processing_status: 'new',
            import_metadata: {
              imported_from: 'simple_scraper',
              scraped_at: new Date().toISOString()
            }
          });

        if (insertError) {
          console.error(`❌ Insert error for "${article.title}":`, insertError);
          errors.push(`Failed to insert "${article.title}": ${insertError.message}`);
        } else {
          articlesScraped++;
          console.log(`✅ Saved: ${article.title}`);
        }

      } catch (error) {
        console.error(`❌ Processing error for "${article.title}":`, error);
        errors.push(`Processing error: ${error.message}`);
      }
    }

    // Update source metrics
    if (sourceId) {
      await supabase
        .from('content_sources')
        .update({
          last_scraped_at: new Date().toISOString(),
          articles_scraped: articlesScraped,
          success_rate: errors.length === 0 ? 100 : Math.max(0, 100 - (errors.length * 20))
        })
        .eq('id', sourceId);
    }

    const result = {
      success: articlesScraped > 0,
      articlesFound: articles.length,
      articlesScraped,
      errors,
      method: 'simple_rss'
    };

    console.log(`🎉 Simple scraper completed:`, result);

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('❌ Simple scraper error:', error);
    return new Response(JSON.stringify({
      success: false,
      error: error.message,
      articlesFound: 0,
      articlesScraped: 0,
      errors: [error.message],
      method: 'simple_rss'
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});

// Simple RSS parser without AI dependencies
function parseRSSSimple(content: string): any[] {
  const articles: any[] = [];
  
  try {
    // Look for both <item> and <entry> tags (RSS and Atom)
    const itemRegex = /<(?:item|entry)[^>]*>([\s\S]*?)<\/(?:item|entry)>/gi;
    let match;
    
    while ((match = itemRegex.exec(content)) !== null) {
      const itemContent = match[1];
      
      const title = extractXMLContent(itemContent, 'title');
      const link = extractXMLContent(itemContent, 'link') || extractXMLContent(itemContent, 'guid');
      const description = extractXMLContent(itemContent, 'description') || 
                         extractXMLContent(itemContent, 'summary') ||
                         extractXMLContent(itemContent, 'content');
      const pubDate = extractXMLContent(itemContent, 'pubDate') || 
                     extractXMLContent(itemContent, 'published') ||
                     extractXMLContent(itemContent, 'updated');
      const author = extractXMLContent(itemContent, 'author') || 
                    extractXMLContent(itemContent, 'dc:creator') ||
                    extractXMLContent(itemContent, 'creator');
      
      if (title && link) {
        articles.push({
          title: cleanHTML(title),
          body: cleanHTML(description || ''),
          summary: description ? cleanHTML(description).substring(0, 200) + '...' : null,
          source_url: link.startsWith('http') ? link : `https://${link}`,
          published_at: parseDate(pubDate) || new Date().toISOString(),
          author: author ? cleanHTML(author) : null
        });
      }
    }
  } catch (error) {
    console.error('RSS parsing error:', error);
  }
  
  return articles.slice(0, 10); // Limit to most recent 10
}

// Extract content from XML tags
function extractXMLContent(content: string, tagName: string): string | null {
  const regex = new RegExp(`<${tagName}[^>]*>([\\s\\S]*?)<\\/${tagName}>`, 'i');
  const match = content.match(regex);
  return match ? match[1].trim() : null;
}

// Clean HTML tags and decode entities
function cleanHTML(text: string): string {
  return text
    .replace(/<[^>]*>/g, '') // Remove HTML tags
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ') // Normalize whitespace
    .trim();
}

// Parse various date formats
function parseDate(dateString: string | null): string | null {
  if (!dateString) return null;
  
  try {
    const date = new Date(dateString);
    if (isNaN(date.getTime())) {
      // Try common formats
      const formats = [
        /(\d{4})-(\d{2})-(\d{2})/,
        /(\d{2})\/(\d{2})\/(\d{4})/
      ];
      
      for (const format of formats) {
        const match = dateString.match(format);
        if (match) {
          const parsed = new Date(match[0]);
          if (!isNaN(parsed.getTime())) {
            return parsed.toISOString();
          }
        }
      }
      return new Date().toISOString(); // Fallback to now
    }
    return date.toISOString();
  } catch {
    return new Date().toISOString();
  }
}