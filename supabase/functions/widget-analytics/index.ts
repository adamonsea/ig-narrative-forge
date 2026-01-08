import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response(
      JSON.stringify({ error: 'Method not allowed' }),
      { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  try {
    const body = await req.json();
    const { feedSlug, eventType, storyId, visitorHash, referrerUrl } = body;

    // Validate required fields
    if (!feedSlug || !eventType) {
      console.error('❌ Widget analytics: Missing required fields', { feedSlug, eventType });
      return new Response(
        JSON.stringify({ error: 'Missing required fields: feedSlug, eventType' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Validate event type
    if (!['impression', 'click'].includes(eventType)) {
      console.error('❌ Widget analytics: Invalid event type', eventType);
      return new Response(
        JSON.stringify({ error: 'Invalid eventType. Must be "impression" or "click"' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`📊 Widget ${eventType} for feed: ${feedSlug}`, { storyId, referrerUrl });

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Look up topic by slug
    const { data: topic, error: topicError } = await supabase
      .from('topics')
      .select('id')
      .eq('slug', feedSlug)
      .eq('is_public', true)
      .maybeSingle();

    if (topicError || !topic) {
      console.error('❌ Widget analytics: Topic not found', { feedSlug, topicError });
      return new Response(
        JSON.stringify({ error: 'Feed not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // For impressions, deduplicate by visitor_hash + topic_id within 24 hours
    if (eventType === 'impression' && visitorHash) {
      const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      
      const { data: existing } = await supabase
        .from('widget_analytics')
        .select('id')
        .eq('topic_id', topic.id)
        .eq('event_type', 'impression')
        .eq('visitor_hash', visitorHash)
        .gte('created_at', twentyFourHoursAgo)
        .limit(1);

      if (existing && existing.length > 0) {
        console.log('📊 Duplicate impression skipped for visitor', visitorHash.substring(0, 8));
        return new Response(
          JSON.stringify({ success: true, deduplicated: true }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    // Insert analytics event
    const { error: insertError } = await supabase
      .from('widget_analytics')
      .insert({
        topic_id: topic.id,
        event_type: eventType,
        story_id: storyId || null,
        visitor_hash: visitorHash || null,
        referrer_url: referrerUrl || null,
      });

    if (insertError) {
      console.error('❌ Widget analytics: Insert failed', insertError);
      return new Response(
        JSON.stringify({ error: 'Failed to record analytics' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`✅ Widget ${eventType} recorded for ${feedSlug}`);

    return new Response(
      JSON.stringify({ success: true }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('❌ Widget analytics error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});