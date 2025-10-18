import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.55.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface NotificationRequest {
  storyId?: string;
  topicId: string;
  notificationType?: 'story' | 'daily' | 'weekly';
  roundupDate?: string;
  weekStart?: string;
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

    const { 
      storyId, 
      topicId, 
      notificationType = 'story',
      roundupDate,
      weekStart 
    }: NotificationRequest = await req.json();

    console.log(`📬 Sending ${notificationType} notification for topic ${topicId}`);

    let title = '';
    let body = '';
    let url = '';

    // Fetch topic details with branding
    const { data: topic, error: topicError } = await supabase
      .from('topics')
      .select('name, slug, branding_config')
      .eq('id', topicId)
      .single();

    if (topicError || !topic) {
      throw new Error('Topic not found');
    }

    // Build notification based on type
    if (notificationType === 'story' && storyId) {
      // Story notification
      const { data: story, error: storyError } = await supabase
        .from('stories')
        .select('title')
        .eq('id', storyId)
        .single();

      if (storyError || !story) {
        throw new Error('Story not found');
      }

      title = `New from ${topic.name}`;
      body = story.title;
      url = `https://65bbd18a-918e-4c43-a124-21fdf7b60408.lovableproject.com/feed/${topic.slug}/story/${storyId}`;
    } else if (notificationType === 'daily' && roundupDate) {
      // Daily roundup notification
      title = `Today in ${topic.name}`;
      body = `Check out today's roundup`;
      url = `https://65bbd18a-918e-4c43-a124-21fdf7b60408.lovableproject.com/feed/${topic.slug}/daily/${roundupDate}`;
    } else if (notificationType === 'weekly' && weekStart) {
      // Weekly roundup notification
      title = `This Week in ${topic.name}`;
      body = `Your weekly roundup is ready`;
      url = `https://65bbd18a-918e-4c43-a124-21fdf7b60408.lovableproject.com/feed/${topic.slug}/weekly/${weekStart}`;
    } else {
      throw new Error('Invalid notification type or missing required parameters');
    }

    // Get subscriptions based on notification type
    let notificationFilter = 'instant';
    if (notificationType === 'daily') notificationFilter = 'daily';
    if (notificationType === 'weekly') notificationFilter = 'weekly';

    // Fetch all active push subscriptions for this topic - filter by notification type
    const { data: signups, error: signupsError } = await supabase
      .from('topic_newsletter_signups')
      .select('push_subscription, email')
      .eq('topic_id', topicId)
      .eq('notification_type', notificationFilter)
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

    // Prepare notification payload with icon/badge from branding
    const notificationPayload = {
      title,
      body,
      icon: topic.branding_config?.icon_url || topic.branding_config?.logo_url || '/placeholder.svg',
      badge: topic.branding_config?.icon_url || '/placeholder.svg',
      url,
      topic: topic.name,
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
      message: `${notificationType} notifications sent`,
      context: {
        story_id: storyId,
        topic_id: topicId,
        notification_type: notificationType,
        roundup_date: roundupDate,
        week_start: weekStart,
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
