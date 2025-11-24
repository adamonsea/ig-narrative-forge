import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.55.0';
import { z } from 'https://deno.land/x/zod@v3.22.4/mod.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const requestSchema = z.object({
  topicId: z.string().uuid(),
  visitorId: z.string().max(200),
  metricType: z.enum([
    'notification_enabled',
    'pwa_installed',
    'pwa_install_clicked',
    'pwa_ios_instructions_viewed',
    'pwa_dismissed'
  ]),
  userAgent: z.string().max(500).optional()
});

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const validated = requestSchema.parse(body);
    const { topicId, visitorId, metricType, userAgent } = validated;

    console.log('Tracking engagement metric:', { topicId, visitorId, metricType });

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
