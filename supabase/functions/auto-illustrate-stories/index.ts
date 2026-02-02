import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.55.0';
import { z } from 'https://deno.land/x/zod@v3.22.4/mod.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Zod schema for request validation
const requestSchema = z.object({
  topicId: z.string().uuid().optional(),
  storyIds: z.array(z.string().uuid()).max(50).optional(),
  dryRun: z.boolean().optional().default(false),
  maxIllustrations: z.number().int().min(1).max(20).optional().default(5),
});

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Parse and validate request body
    let body = {};
    try {
      body = await req.json();
    } catch {
      // Empty body is acceptable, use defaults
    }

    const validated = requestSchema.safeParse(body);
    if (!validated.success) {
      console.error('Validation error:', validated.error.errors);
      return new Response(
        JSON.stringify({ 
          error: 'Invalid request parameters',
          details: validated.error.errors.map(e => ({ path: e.path.join('.'), message: e.message }))
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { topicId, storyIds, dryRun, maxIllustrations } = validated.data;

    console.log('Auto-illustrate request:', { topicId, storyIds, dryRun, maxIllustrations });

    // Determine which topics to process
    let topicsToProcess: { topic_id: string; threshold: number }[] = [];
    
    if (topicId) {
      // Single topic mode - get its settings
      const { data: settings } = await supabase
        .from('topic_automation_settings')
        .select('illustration_quality_threshold, automation_mode, auto_illustrate_in_holiday')
        .eq('topic_id', topicId)
        .single();
      
      // Check if in holiday mode and if illustrations are disabled
      if (settings?.automation_mode === 'holiday' && settings?.auto_illustrate_in_holiday === false) {
        console.log('Auto-illustration disabled in holiday mode for topic:', topicId);
        return new Response(
          JSON.stringify({
            success: true,
            message: 'Auto-illustration disabled in holiday mode',
            skipped: true,
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      topicsToProcess.push({
        topic_id: topicId,
        threshold: settings?.illustration_quality_threshold || 70,
      });
    } else {
      // Global mode - find ALL topics with holiday mode enabled (and illustration not disabled)
      console.log('No topicId provided - scanning all Holiday Mode topics');
      
      const { data: holidayTopics, error: topicsError } = await supabase
        .from('topic_automation_settings')
        .select('topic_id, illustration_quality_threshold')
        .eq('automation_mode', 'holiday')
        .neq('auto_illustrate_in_holiday', false); // Include null (default) and true
      
      if (topicsError) {
        console.error('Error fetching holiday topics:', topicsError);
        throw topicsError;
      }
      
      if (!holidayTopics || holidayTopics.length === 0) {
        console.log('No Holiday Mode topics found');
        return new Response(
          JSON.stringify({
            success: true,
            message: 'No Holiday Mode topics to process',
            topicsProcessed: 0,
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      topicsToProcess = holidayTopics.map(t => ({
        topic_id: t.topic_id,
        threshold: t.illustration_quality_threshold || 70,
      }));
      
      console.log(`Found ${topicsToProcess.length} Holiday Mode topics to scan`);
    }

    // Extended age filter: 7 days instead of 24 hours to catch older unillustrated stories
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    
    // Build query for eligible stories across all target topics
    // Use the minimum threshold from all topics to be inclusive, then filter per-topic
    const minThreshold = Math.min(...topicsToProcess.map(t => t.threshold));
    const topicIds = topicsToProcess.map(t => t.topic_id);
    
    let query = supabase
      .from('stories')
      .select('id, title, quality_score, created_at, article_id, articles!inner(topic_id)')
      .is('cover_illustration_url', null)
      .in('status', ['ready', 'published'])
      .gte('quality_score', minThreshold)
      .gte('created_at', sevenDaysAgo)
      .in('articles.topic_id', topicIds)
      .order('quality_score', { ascending: false })
      .limit(maxIllustrations);

    if (storyIds && storyIds.length > 0) {
      query = query.in('id', storyIds);
    }

    const { data: eligibleStories, error: queryError } = await query;

    if (queryError) {
      console.error('Error querying eligible stories:', queryError);
      throw queryError;
    }

    console.log(`Found ${eligibleStories?.length || 0} eligible stories for illustration across ${topicsToProcess.length} topic(s)`);

    if (dryRun) {
      return new Response(
        JSON.stringify({
          success: true,
          dryRun: true,
          eligibleStories: eligibleStories || [],
          topicsScanned: topicsToProcess.length,
          ageFilterDays: 7,
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
          'story-illustrator',
          {
            body: {
              storyId: story.id,
              qualityTier: 'low', // 2 credits - OpenAI lowest tier
              isAutomated: true, // Flag for lifecycle tracking
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
      level: successCount > 0 ? 'info' : (failureCount > 0 ? 'warn' : 'info'),
      message: `Auto-illustration batch completed: ${successCount} success, ${failureCount} failed`,
      context: {
        topicId: topicId || 'all_holiday_topics',
        topicsScanned: topicsToProcess.length,
        eligibleStories: eligibleStories?.length || 0,
        successCount,
        failureCount,
        ageFilterDays: 7,
      },
      function_name: 'auto-illustrate-stories',
    });

    return new Response(
      JSON.stringify({
        success: true,
        topicsScanned: topicsToProcess.length,
        eligibleStories: eligibleStories?.length || 0,
        successCount,
        failureCount,
        results,
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