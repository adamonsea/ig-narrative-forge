import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.55.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface AutoIllustrateRequest {
  topicId?: string;
  storyIds?: string[];
  dryRun?: boolean;
  maxIllustrations?: number;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { topicId, storyIds, dryRun = false, maxIllustrations = 5 } = await req.json() as AutoIllustrateRequest;

    console.log('Auto-illustrate request:', { topicId, storyIds, dryRun, maxIllustrations });

    // Get topic automation settings to check threshold
    let illustrationThreshold = 70; // Default
    if (topicId) {
      const { data: settings } = await supabase
        .from('topic_automation_settings')
        .select('illustration_quality_threshold')
        .eq('topic_id', topicId)
        .single();
      
      if (settings?.illustration_quality_threshold) {
        illustrationThreshold = settings.illustration_quality_threshold;
      }
    }

    // Build query for eligible stories
    let query = supabase
      .from('stories')
      .select('id, title, quality_score, created_at')
      .is('cover_illustration_url', null)
      .in('status', ['ready', 'published'])
      .gte('quality_score', illustrationThreshold)
      .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()) // Last 24 hours
      .order('quality_score', { ascending: false })
      .limit(maxIllustrations);

    if (topicId) {
      // Filter by topic through article relationship
      query = query.not('article_id', 'is', null);
    }

    if (storyIds && storyIds.length > 0) {
      query = query.in('id', storyIds);
    }

    const { data: eligibleStories, error: queryError } = await query;

    if (queryError) {
      console.error('Error querying eligible stories:', queryError);
      throw queryError;
    }

    console.log(`Found ${eligibleStories?.length || 0} eligible stories for illustration`);

    if (dryRun) {
      return new Response(
        JSON.stringify({
          success: true,
          dryRun: true,
          eligibleStories: eligibleStories || [],
          threshold: illustrationThreshold,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check credit balance before proceeding
    const { data: creditCheck } = await supabase.rpc('get_admin_credit_balance');
    if (creditCheck && creditCheck < 50) {
      console.warn('Insufficient credits for auto-illustration:', creditCheck);
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Insufficient credits',
          creditBalance: creditCheck,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 402 }
      );
    }

    const results = [];
    let successCount = 0;
    let failureCount = 0;

    // Generate illustrations for each eligible story
    for (const story of eligibleStories || []) {
      try {
        console.log(`Generating illustration for story ${story.id} (score: ${story.quality_score})`);

        const { data: illustrationData, error: illustrationError } = await supabase.functions.invoke(
          'gemini-image-generator',
          {
            body: {
              storyId: story.id,
              model: 'gemini-flash-image',
            },
          }
        );

        if (illustrationError) {
          console.error(`Failed to generate illustration for story ${story.id}:`, illustrationError);
          failureCount++;
          results.push({
            storyId: story.id,
            success: false,
            error: illustrationError.message,
          });
        } else {
          successCount++;
          results.push({
            storyId: story.id,
            success: true,
            illustrationUrl: illustrationData?.illustrationUrl,
          });
        }

        // Small delay between generations to avoid rate limiting
        await new Promise((resolve) => setTimeout(resolve, 1000));
      } catch (error) {
        console.error(`Exception generating illustration for story ${story.id}:`, error);
        failureCount++;
        results.push({
          storyId: story.id,
          success: false,
          error: error.message,
        });
      }
    }

    // Log the batch operation
    await supabase.from('system_logs').insert({
      level: 'info',
      message: 'Auto-illustration batch completed',
      context: {
        topicId,
        eligibleStories: eligibleStories?.length || 0,
        successCount,
        failureCount,
        threshold: illustrationThreshold,
      },
      function_name: 'auto-illustrate-stories',
    });

    return new Response(
      JSON.stringify({
        success: true,
        eligibleStories: eligibleStories?.length || 0,
        successCount,
        failureCount,
        results,
        threshold: illustrationThreshold,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Auto-illustration error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});