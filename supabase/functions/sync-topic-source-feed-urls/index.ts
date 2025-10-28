import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface SyncResult {
  topic_id: string;
  source_id: string;
  source_name: string;
  old_url: string;
  new_url: string;
  reason: string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const corrections: SyncResult[] = [];
    let checkedCount = 0;

    // Get all topic_sources with their content_sources
    const { data: topicSources, error: fetchError } = await supabaseClient
      .from('topic_sources')
      .select(`
        topic_id,
        source_id,
        source_config,
        is_active,
        content_sources (
          id,
          source_name,
          feed_url,
          canonical_domain
        )
      `)
      .eq('is_active', true);

    if (fetchError) {
      throw new Error(`Failed to fetch topic sources: ${fetchError.message}`);
    }

    console.log(`Checking ${topicSources?.length || 0} active topic-source relationships`);

    for (const ts of topicSources || []) {
      checkedCount++;
      const cs = ts.content_sources as any;
      const configUrl = ts.source_config?.feed_url as string | undefined;
      const authoritativeUrl = cs.feed_url as string;

      if (!authoritativeUrl) {
        // No authoritative URL in content_sources, skip
        continue;
      }

      // Check if correction is needed
      let needsCorrection = false;
      let reason = '';

      if (!configUrl) {
        // Missing feed_url in source_config
        needsCorrection = true;
        reason = 'missing_feed_url';
      } else if (configUrl !== authoritativeUrl) {
        // URLs differ - check if config URL is more specific or just wrong
        const configPath = configUrl.replace(/^https?:\/\/[^\/]+/, '');
        const authPath = authoritativeUrl.replace(/^https?:\/\/[^\/]+/, '');

        if (configPath.length < authPath.length) {
          // Config URL is less specific (e.g., root domain vs section)
          needsCorrection = true;
          reason = 'less_specific';
        } else if (configPath.includes('rss') || configPath.includes('feed')) {
          // Config URL is an RSS feed variant, keep it
          continue;
        } else if (!configPath.match(/\/(news|local|sport)/)) {
          // Config URL is suspiciously generic
          needsCorrection = true;
          reason = 'generic_path';
        }
      }

      if (needsCorrection) {
        console.log(`Correcting feed_url for ${cs.source_name}:`, {
          old: configUrl || 'null',
          new: authoritativeUrl,
          reason
        });

        // Update the feed_url in source_config
        const { error: updateError } = await supabaseClient
          .from('topic_sources')
          .update({
            source_config: {
              ...ts.source_config,
              feed_url: authoritativeUrl
            }
          })
          .eq('topic_id', ts.topic_id)
          .eq('source_id', ts.source_id);

        if (updateError) {
          console.error(`Failed to update feed_url:`, updateError);
          continue;
        }

        corrections.push({
          topic_id: ts.topic_id,
          source_id: ts.source_id,
          source_name: cs.source_name,
          old_url: configUrl || 'null',
          new_url: authoritativeUrl,
          reason
        });
      }
    }

    // Log results
    const correctionRate = checkedCount > 0 ? (corrections.length / checkedCount) * 100 : 0;
    const logLevel = correctionRate > 5 ? 'warning' : 'info';
    const message = correctionRate > 5
      ? `High feed_url drift detected: ${correctionRate.toFixed(1)}% of sources needed correction`
      : `Feed URL sync completed: ${corrections.length} corrections made`;

    await supabaseClient.from('system_logs').insert({
      level: logLevel,
      message,
      context: {
        checked_count: checkedCount,
        corrections_count: corrections.length,
        correction_rate: correctionRate,
        corrections: corrections.slice(0, 10) // Log first 10
      },
      function_name: 'sync-topic-source-feed-urls'
    });

    return new Response(
      JSON.stringify({
        success: true,
        checked: checkedCount,
        corrected: corrections.length,
        correction_rate: `${correctionRate.toFixed(2)}%`,
        alert: correctionRate > 5 ? 'HIGH_DRIFT_RATE' : null,
        corrections
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in sync-topic-source-feed-urls:', error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});
