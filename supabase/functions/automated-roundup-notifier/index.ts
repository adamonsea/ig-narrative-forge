import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.192.0/http/server.ts";
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
      const topicResults: any = {
        topic: topic.name,
        push: { success: false },
        email: { success: false }
      };

      // === PUSH NOTIFICATIONS ===
      try {
        const pushBody: any = {
          topicId: topic.id,
          notificationType: notification_type
        };

        if (notification_type === 'daily') {
          pushBody.roundupDate = today;
        } else if (notification_type === 'weekly') {
          pushBody.weekStart = weekStart;
        }

        console.log(`📤 Sending push notification for ${topic.name}`);
        
        const pushResponse = await supabase.functions.invoke('send-story-notification', { body: pushBody });
        
        if (pushResponse.error) {
          console.error(`❌ Push error for ${topic.name}:`, pushResponse.error);
          topicResults.push = {
            success: false,
            error: pushResponse.error.message || String(pushResponse.error)
          };
        } else {
          console.log(`✅ Push sent for ${topic.name}:`, pushResponse.data);
          topicResults.push = {
            success: true,
            ...pushResponse.data
          };
        }
      } catch (error) {
        console.error(`Push notification failed for ${topic.name}:`, error);
        topicResults.push = {
          success: false,
          error: error.message
        };
      }

      // === EMAIL NEWSLETTERS ===
      try {
        const emailBody: any = {
          topicId: topic.id,
          notificationType: notification_type
        };

        if (notification_type === 'daily') {
          emailBody.roundupDate = today;
        } else if (notification_type === 'weekly') {
          emailBody.weekStart = weekStart;
        }

        console.log(`📧 Sending email newsletter for ${topic.name}`);
        
        const emailResponse = await supabase.functions.invoke('send-email-newsletter', { body: emailBody });
        
        if (emailResponse.error) {
          console.error(`❌ Email error for ${topic.name}:`, emailResponse.error);
          topicResults.email = {
            success: false,
            error: emailResponse.error.message || String(emailResponse.error)
          };
        } else {
          console.log(`✅ Email sent for ${topic.name}:`, emailResponse.data);
          topicResults.email = {
            success: true,
            ...emailResponse.data
          };
        }
      } catch (error) {
        console.error(`Email newsletter failed for ${topic.name}:`, error);
        topicResults.email = {
          success: false,
          error: error.message
        };
      }

      results.push(topicResults);
    }

    const pushSuccessCount = results.filter(r => r.push.success).length;
    const emailSuccessCount = results.filter(r => r.email.success).length;

    console.log(`✅ Notifications complete: Push ${pushSuccessCount}/${topics.length}, Email ${emailSuccessCount}/${topics.length}`);

    // Log summary
    await supabase
      .from('system_logs')
      .insert({
        level: 'info',
        message: `Automated ${notification_type} notifications sent`,
        context: {
          notification_type,
          topics_count: topics.length,
          push_success: pushSuccessCount,
          email_success: emailSuccessCount,
          results: results.slice(0, 10) // Only log first 10 for brevity
        },
        function_name: 'automated-roundup-notifier'
      });

    return new Response(JSON.stringify({
      success: true,
      notification_type,
      topics_processed: topics.length,
      push_success: pushSuccessCount,
      email_success: emailSuccessCount,
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
