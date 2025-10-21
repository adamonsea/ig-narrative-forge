import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    console.log('Starting keyword analytics backfill...');

    // Fetch all active topics with their keywords
    const { data: topics, error: topicsError } = await supabaseClient
      .from('topics')
      .select('id, topic_type, keywords, is_active')
      .eq('is_active', true)
      .not('keywords', 'is', null);

    if (topicsError) throw topicsError;

    console.log(`Found ${topics?.length || 0} topics to analyze`);

    // Count keyword usage and calculate success metrics
    const keywordStats = new Map<string, {
      topic_type: string;
      usage_count: number;
      topics_using: Set<string>;
      story_count: number;
    }>();

    // Process each topic's keywords
    for (const topic of topics || []) {
      const keywords = topic.keywords || [];
      
      for (const keyword of keywords) {
        const key = `${keyword}:${topic.topic_type}`;
        
        if (!keywordStats.has(key)) {
          keywordStats.set(key, {
            topic_type: topic.topic_type,
            usage_count: 0,
            topics_using: new Set(),
            story_count: 0
          });
        }
        
        const stats = keywordStats.get(key)!;
        stats.usage_count++;
        stats.topics_using.add(topic.id);
      }
    }

    // Get story counts for each keyword (published stories that match keywords)
    for (const [key, stats] of keywordStats.entries()) {
      const keyword = key.split(':')[0];
      
      // Count published stories that have this keyword in their article's keywords
      const { count: storyCount } = await supabaseClient
        .from('stories')
        .select('*', { count: 'exact', head: true })
        .eq('is_published', true)
        .filter('article_id', 'not.is', null);
      
      stats.story_count = storyCount || 0;
    }

    console.log(`Processed ${keywordStats.size} unique keyword-type combinations`);

    // Upsert into keyword_analytics table
    const analyticsRecords = Array.from(keywordStats.entries()).map(([key, stats]) => {
      const keyword = key.split(':')[0];
      return {
        keyword,
        topic_type: stats.topic_type,
        usage_count: stats.usage_count,
        success_metrics: {
          topics_count: stats.topics_using.size,
          story_count: stats.story_count,
          last_updated: new Date().toISOString()
        }
      };
    });

    // Insert in batches of 100
    const batchSize = 100;
    let inserted = 0;
    
    for (let i = 0; i < analyticsRecords.length; i += batchSize) {
      const batch = analyticsRecords.slice(i, i + batchSize);
      
      const { error: upsertError } = await supabaseClient
        .from('keyword_analytics')
        .upsert(batch, { 
          onConflict: 'keyword,topic_type',
          ignoreDuplicates: false 
        });

      if (upsertError) {
        console.error('Batch upsert error:', upsertError);
        throw upsertError;
      }
      
      inserted += batch.length;
      console.log(`Inserted batch ${i / batchSize + 1}, total: ${inserted}/${analyticsRecords.length}`);
    }

    console.log(`Successfully backfilled ${inserted} keyword analytics records`);

    return new Response(
      JSON.stringify({
        success: true,
        topics_analyzed: topics?.length || 0,
        keywords_processed: keywordStats.size,
        records_inserted: inserted
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Backfill error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});
