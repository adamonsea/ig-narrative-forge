import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.55.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface NotificationRequest {
  storyId: string;
  topicId: string;
}

interface PushSubscription {
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { storyId, topicId }: NotificationRequest = await req.json();

    // Fetch story details
    const { data: story, error: storyError } = await supabase
      .from('stories')
      .select('title, id')
      .eq('id', storyId)
      .single();

    if (storyError || !story) {
      throw new Error('Story not found');
    }

    // Fetch topic details for branding
    const { data: topic, error: topicError } = await supabase
      .from('topics')
      .select('name, slug, logo_url, primary_color')
      .eq('id', topicId)
      .single();

    if (topicError || !topic) {
      throw new Error('Topic not found');
    }

    // Fetch all active push subscriptions for this topic - only 'instant' notifications
    const { data: signups, error: signupsError } = await supabase
      .from('topic_newsletter_signups')
      .select('push_subscription, email')
      .eq('topic_id', topicId)
      .eq('notification_type', 'instant')
      .eq('is_active', true)
      .not('push_subscription', 'is', null);

    if (signupsError) {
      throw new Error(`Failed to fetch subscriptions: ${signupsError.message}`);
    }

    if (!signups || signups.length === 0) {
      return new Response(
        JSON.stringify({ 
          success: true, 
          message: 'No active push subscriptions found',
          sent: 0 
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const vapidPublicKey = Deno.env.get('VAPID_PUBLIC_KEY');
    const vapidPrivateKey = Deno.env.get('VAPID_PRIVATE_KEY');

    if (!vapidPublicKey || !vapidPrivateKey) {
      throw new Error('VAPID keys not configured');
    }

    // Prepare notification payload with topic branding
    const notificationPayload = {
      title: `New story in ${topic.name}`,
      body: story.title,
      icon: topic.logo_url || '/favicon.ico',
      badge: topic.logo_url || '/favicon.ico',
      url: `https://fpoywkjgdapgjtdeooak.supabase.co/feed/${topic.slug}/story/${story.id}`,
      topic: topic.name,
      color: topic.primary_color || '#000000',
      timestamp: Date.now(),
      actions: [
        {
          action: 'open',
          title: 'Read Now'
        }
      ]
    };

    let successCount = 0;
    let failureCount = 0;

    // Send notifications to all subscribers
    for (const signup of signups) {
      try {
        const subscription = signup.push_subscription as PushSubscription;
        
        // Send push notification using Web Push API
        const response = await fetch(subscription.endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'TTL': '86400',
          },
          body: JSON.stringify({
            notification: notificationPayload
          }),
        });

        if (response.ok) {
          successCount++;
        } else {
          failureCount++;
          console.error(`Failed to send to ${signup.email}:`, response.status, await response.text());
          
          // If subscription is invalid (410 Gone), mark it as inactive
          if (response.status === 410) {
            await supabase
              .from('topic_newsletter_signups')
              .update({ is_active: false })
              .match({ 
                topic_id: topicId, 
                email: signup.email 
              });
          }
        }
      } catch (error) {
        failureCount++;
        console.error(`Error sending notification to ${signup.email}:`, error);
      }
    }

    // Log notification send
    await supabase.from('system_logs').insert({
      level: 'info',
      message: 'Story notifications sent',
      context: {
        story_id: storyId,
        topic_id: topicId,
        success_count: successCount,
        failure_count: failureCount
      },
      function_name: 'send-story-notification'
    });

    return new Response(
      JSON.stringify({ 
        success: true, 
        sent: successCount,
        failed: failureCount,
        total: signups.length
      }),
      { 
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );

  } catch (error) {
    console.error('Error sending notifications:', error);
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});
