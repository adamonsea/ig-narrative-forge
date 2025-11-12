import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.55.0';
import { NewsquestArcClient } from '../_shared/newsquest-arc-client.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Explicit allowlist of Newsquest domains with confirmed Arc API compatibility
const NEWSQUEST_DOMAINS = {
  'sussexexpress.co.uk': {
    hostname: 'sussexexpress.co.uk',
    sectionPath: '/news/local',
    arcSite: 'express'
  },
  'theargus.co.uk': {
    hostname: 'theargus.co.uk', 
    sectionPath: '/news/local',
    arcSite: 'argus'
  }
};

interface ScrapeRequest {
  sourceId?: string;
  domain?: string;
  testMode?: boolean;
  limit?: number;
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, supabaseKey);

  try {
    const body = await req.json() as ScrapeRequest;
    const { sourceId, domain, testMode = false, limit = 20 } = body;

    console.log('🔍 Newsquest Arc Scraper invoked', { sourceId, domain, testMode, limit });

    // Fetch source if sourceId provided
    let sourceToScrape: any = null;
    if (sourceId) {
      const { data: source, error } = await supabase
        .from('content_sources')
        .select('*')
        .eq('id', sourceId)
        .single();

      if (error || !source) {
        throw new Error(`Source not found: ${sourceId}`);
      }
      sourceToScrape = source;
    } else if (domain) {
      // Find source by domain
      const { data: source, error } = await supabase
        .from('content_sources')
        .select('*')
        .eq('canonical_domain', domain)
        .single();

      if (error || !source) {
        throw new Error(`Source not found for domain: ${domain}`);
      }
      sourceToScrape = source;
    } else {
      throw new Error('Either sourceId or domain must be provided');
    }

    // Validate domain is in allowlist
    const sourceDomain = sourceToScrape.canonical_domain;
    const newsquestConfig = NEWSQUEST_DOMAINS[sourceDomain as keyof typeof NEWSQUEST_DOMAINS];
    
    if (!newsquestConfig) {
      return new Response(
        JSON.stringify({
          success: false,
          error: `Domain ${sourceDomain} is not in Newsquest Arc allowlist`,
          allowedDomains: Object.keys(NEWSQUEST_DOMAINS)
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    console.log('✅ Domain validated', { domain: sourceDomain, config: newsquestConfig });

    // Initialize Arc API client
    const arcClient = new NewsquestArcClient(
      newsquestConfig.hostname,
      newsquestConfig.sectionPath,
      newsquestConfig.arcSite
    );

    console.log('🚀 Fetching articles from Arc API...');
    const startTime = Date.now();

    // Fetch articles from Arc API
    const articles = await arcClient.fetchSectionArticles({
      size: limit,
      from: 0
    });

    const fetchTime = Date.now() - startTime;
    console.log(`📰 Arc API returned ${articles.length} articles in ${fetchTime}ms`);

    // Process and store articles if not in test mode
    let storedCount = 0;
    const errors: string[] = [];

    if (!testMode && articles.length > 0) {
      for (const article of articles) {
        try {
          // Check if article already exists
          const { data: existing } = await supabase
            .from('content_sources_articles')
            .select('id')
            .eq('source_url', article.url)
            .maybeSingle();

          if (existing) {
            console.log('⏭️ Article already exists, skipping:', article.url);
            continue;
          }

          // Calculate quality scores
          const wordCount = article.body.split(/\s+/).length;
          const contentQualityScore = Math.min(100, Math.max(0, 
            (wordCount >= 300 ? 50 : 0) +
            (article.title ? 20 : 0) +
            (article.author ? 15 : 0) +
            (article.imageUrl ? 15 : 0)
          ));

          // Insert article
          const { error: insertError } = await supabase
            .from('content_sources_articles')
            .insert({
              source_id: sourceToScrape.id,
              title: article.title,
              body: article.body,
              author: article.author,
              published_at: article.publishedAt,
              source_url: article.url,
              image_url: article.imageUrl,
              word_count: wordCount,
              content_quality_score: contentQualityScore,
              processing_status: 'new',
              import_metadata: {
                scraper: 'newsquest-arc-scraper',
                method: 'arc_api',
                arcSite: newsquestConfig.arcSite,
                sectionPath: newsquestConfig.sectionPath,
                scrapedAt: new Date().toISOString()
              }
            });

          if (insertError) {
            console.error('❌ Failed to insert article:', article.url, insertError);
            errors.push(`Failed to insert: ${article.url}`);
          } else {
            storedCount++;
            console.log('✅ Stored article:', article.title);
          }
        } catch (err) {
          console.error('❌ Error processing article:', err);
          errors.push(`Processing error: ${err.message}`);
        }
      }

      // Update source metrics
      await supabase
        .from('content_sources')
        .update({
          last_scraped: new Date().toISOString(),
          last_scrape_status: storedCount > 0 ? 'success' : 'no_new_content',
          articles_found_last_scrape: articles.length,
          last_error: errors.length > 0 ? errors.join('; ') : null
        })
        .eq('id', sourceToScrape.id);
    }

    const response = {
      success: true,
      source: {
        id: sourceToScrape.id,
        name: sourceToScrape.source_name,
        domain: sourceDomain
      },
      scraping: {
        method: 'arc_api',
        arcSite: newsquestConfig.arcSite,
        sectionPath: newsquestConfig.sectionPath,
        fetchTimeMs: fetchTime
      },
      results: {
        articlesFound: articles.length,
        articlesStored: storedCount,
        testMode,
        errors: errors.length > 0 ? errors : undefined
      },
      sample: testMode ? articles.slice(0, 3).map(a => ({
        title: a.title,
        url: a.url,
        publishedAt: a.publishedAt,
        wordCount: a.body.split(/\s+/).length,
        hasImage: !!a.imageUrl,
        author: a.author
      })) : undefined
    };

    console.log('✅ Newsquest Arc scrape complete', response.results);

    return new Response(
      JSON.stringify(response),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('❌ Newsquest Arc Scraper error:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message,
        stack: error.stack
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});
