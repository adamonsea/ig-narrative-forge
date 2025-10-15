import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.55.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { topicId, visitorId, metricType, userAgent } = await req.json();

    console.log('Tracking engagement metric:', { topicId, visitorId, metricType });

    if (!topicId || !visitorId || !metricType) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!['notification_enabled', 'pwa_installed'].includes(metricType)) {
      return new Response(
        JSON.stringify({ error: 'Invalid metric type' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Insert or update the metric (unique constraint will prevent duplicates)
    const { data, error } = await supabase
      .from('topic_engagement_metrics')
      .upsert({
        topic_id: topicId,
        visitor_id: visitorId,
        metric_type: metricType,
        user_agent: userAgent || null,
      }, {
        onConflict: 'topic_id,visitor_id,metric_type',
        ignoreDuplicates: true
      });

    if (error) {
      console.error('Error tracking engagement metric:', error);
      return new Response(
        JSON.stringify({ error: error.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Successfully tracked engagement metric');

    return new Response(
      JSON.stringify({ success: true }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error in track-engagement-metric:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
