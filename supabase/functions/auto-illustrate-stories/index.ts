import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.55.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// MVP Rate Limiting - prevents abuse while allowing legitimate operations
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

function checkRateLimit(identifier: string, maxPerHour: number = 5): boolean {
  const now = Date.now();
  const limit = rateLimitMap.get(identifier);
  
  // Reset if past hour or first call
  if (!limit || now > limit.resetAt) {
    rateLimitMap.set(identifier, { count: 1, resetAt: now + 3600000 });
    return true;
  }
  
  // Block if exceeded
  if (limit.count >= maxPerHour) {
    console.warn(`Rate limit exceeded for ${identifier}: ${limit.count}/${maxPerHour}`);
    return false;
  }
  
  // Increment and allow
  limit.count++;
  return true;
}

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
    // Rate limiting: Allow unlimited for authenticated requests, limit anonymous
    const hasAuth = req.headers.get('authorization')?.includes('Bearer');
    const clientIP = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 
                     req.headers.get('x-real-ip') || 
                     'unknown';
    
    if (!hasAuth && !checkRateLimit(clientIP, 5)) {
      console.warn(`🚫 Rate limit exceeded from IP: ${clientIP}`);
      return new Response(
        JSON.stringify({ 
          error: 'Rate limit exceeded',
          message: 'Maximum 5 requests per hour for unauthenticated calls. Please authenticate or wait.'
        }), 
        { 
          status: 429,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { topicId, storyIds, dryRun = false, maxIllustrations = 5 } = await req.json() as AutoIllustrateRequest;

    console.log('Auto-illustrate request:', { topicId, storyIds, dryRun, maxIllustrations });

    // Get topic automation settings to check threshold and holiday mode illustration setting
    let illustrationThreshold = 70; // Default
    let shouldIllustrate = true;
    if (topicId) {
      const { data: settings } = await supabase
        .from('topic_automation_settings')
        .select('illustration_quality_threshold, automation_mode, auto_illustrate_in_holiday')
        .eq('topic_id', topicId)
        .single();
      
      if (settings?.illustration_quality_threshold) {
        illustrationThreshold = settings.illustration_quality_threshold;
      }
      
      // Check if in holiday mode and if illustrations are disabled
      if (settings?.automation_mode === 'holiday' && settings?.auto_illustrate_in_holiday === false) {
        shouldIllustrate = false;
        console.log('Auto-illustration disabled in holiday mode for topic:', topicId);
      }
    }

    if (!shouldIllustrate) {
      return new Response(
        JSON.stringify({
          success: true,
          message: 'Auto-illustration disabled in holiday mode',
          skipped: true,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
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