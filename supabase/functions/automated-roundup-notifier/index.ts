import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    const { notification_type } = await req.json(); // 'daily' or 'weekly'
    
    console.log(`📬 Sending ${notification_type} notifications to all topics`);

    // Get all active topics
    const { data: topics, error: topicsError } = await supabase
      .from('topics')
      .select('id, name, slug')
      .eq('is_active', true);

    if (topicsError || !topics) {
      throw new Error(`Failed to fetch topics: ${topicsError?.message}`);
    }

    const results = [];
    const today = new Date().toISOString().split('T')[0];
    const weekStart = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    for (const topic of topics) {
      try {
        const body: any = {
          topicId: topic.id,
          notificationType: notification_type
        };

        if (notification_type === 'daily') {
          body.roundupDate = today;
        } else if (notification_type === 'weekly') {
          body.weekStart = weekStart;
        }

        const response = await supabase.functions.invoke('send-story-notification', { body });
        
        results.push({
          topic: topic.name,
          success: true,
          ...response.data
        });
      } catch (error) {
        console.error(`Failed to send notification for ${topic.name}:`, error);
        results.push({
          topic: topic.name,
          success: false,
          error: error.message
        });
      }
    }

    console.log(`✅ Sent notifications to ${results.filter(r => r.success).length}/${topics.length} topics`);

    return new Response(JSON.stringify({
      success: true,
      notification_type,
      topics_processed: topics.length,
      results
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('💥 Notification dispatch error:', error);
    
    return new Response(JSON.stringify({
      success: false,
      error: error instanceof Error ? error.message : String(error)
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
