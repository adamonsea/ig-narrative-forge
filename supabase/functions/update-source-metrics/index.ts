import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error('Missing Supabase environment variables');
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const { sourceId, backfillAll } = await req.json();

    console.log(`🔄 Starting source metrics update${backfillAll ? ' (backfill all)' : sourceId ? ` for source: ${sourceId}` : ' for all sources'}`);

    // Get sources to update
    let sourcesToUpdate = [];
    
    if (backfillAll) {
      const { data: allSources, error } = await supabase
        .from('content_sources')
        .select('id, source_name');
      
      if (error) throw error;
      sourcesToUpdate = allSources;
    } else if (sourceId) {
      const { data: source, error } = await supabase
        .from('content_sources')
        .select('id, source_name')
        .eq('id', sourceId)
        .single();
      
      if (error) throw error;
      sourcesToUpdate = [source];
    } else {
      // Update all sources with stale metrics (no update in last 24 hours)
      const { data: staleSources, error } = await supabase
        .from('content_sources')
        .select('id, source_name, last_scraped_at')
        .or(`last_scraped_at.is.null,last_scraped_at.lt.${new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()}`);
      
      if (error) throw error;
      sourcesToUpdate = staleSources;
    }

    const results = [];
    
    for (const source of sourcesToUpdate) {
      try {
        console.log(`📊 Updating metrics for: ${source.source_name}`);
        
        // Calculate articles scraped from articles table
        const { count: articlesCount, error: countError } = await supabase
          .from('articles')
          .select('*', { count: 'exact', head: true })
          .eq('source_id', source.id);
        
        if (countError && countError.code !== 'PGRST116') {
          console.error(`Error counting articles for ${source.source_name}:`, countError);
          continue;
        }
        
        // Get most recent article to update last_scraped_at
        const { data: recentArticle, error: recentError } = await supabase
          .from('articles')
          .select('created_at')
          .eq('source_id', source.id)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        
        if (recentError && recentError.code !== 'PGRST116') {
          console.error(`Error getting recent article for ${source.source_name}:`, recentError);
          continue;
        }
        
        // Calculate success metrics from system logs
        const { data: successLogs, error: successError } = await supabase
          .from('system_logs')
          .select('*')
          .eq('source_id', source.id)
          .gte('created_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()) // Last 30 days
          .in('event_type', ['info', 'success']);
        
        const { data: errorLogs, error: errorLogError } = await supabase
          .from('system_logs')
          .select('*')
          .eq('source_id', source.id)
          .gte('created_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()) // Last 30 days
          .eq('event_type', 'error');
        
        const successCount = successLogs?.length || 0;
        const failureCount = errorLogs?.length || 0;
        const totalAttempts = successCount + failureCount;
        const successRate = totalAttempts > 0 ? Math.round((successCount / totalAttempts) * 100) : null;
        
        // Update source metrics
        const updateData: any = {
          articles_scraped: articlesCount || 0,
          success_count: successCount,
          failure_count: failureCount,
          success_rate: successRate,
          updated_at: new Date().toISOString()
        };
        
        if (recentArticle) {
          updateData.last_scraped_at = recentArticle.created_at;
        }
        
        const { error: updateError } = await supabase
          .from('content_sources')
          .update(updateData)
          .eq('id', source.id);
        
        if (updateError) {
          console.error(`Failed to update ${source.source_name}:`, updateError);
          results.push({
            sourceId: source.id,
            sourceName: source.source_name,
            success: false,
            error: updateError.message
          });
        } else {
          console.log(`✅ Updated ${source.source_name}: ${articlesCount} articles, ${successRate}% success rate`);
          results.push({
            sourceId: source.id,
            sourceName: source.source_name,
            success: true,
            articlesScraped: articlesCount || 0,
            successRate: successRate,
            lastScrapedAt: recentArticle?.created_at || null
          });
        }
        
      } catch (sourceError) {
        console.error(`Error processing ${source.source_name}:`, sourceError);
        results.push({
          sourceId: source.id,
          sourceName: source.source_name,
          success: false,
          error: sourceError instanceof Error ? sourceError.message : String(sourceError)
        });
      }
    }
    
    console.log(`✅ Source metrics update complete: ${results.filter(r => r.success).length}/${results.length} updated successfully`);
    
    return new Response(JSON.stringify({
      success: true,
      totalSources: sourcesToUpdate.length,
      successfulUpdates: results.filter(r => r.success).length,
      results: results
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
    
  } catch (error) {
    console.error('❌ Source metrics update failed:', error);
    
    return new Response(JSON.stringify({
      success: false,
      error: error instanceof Error ? error.message : String(error)
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});