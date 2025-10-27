import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.55.0";
import webpush from "npm:web-push@3.6.7";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const BASE_URL = Deno.env.get('PUBLIC_SITE_URL') || 'https://curatr.pro';

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
      url = `${BASE_URL}/feed/${topic.slug}/story/${storyId}`;
    } else if (notificationType === 'daily' && roundupDate) {
      // Daily roundup notification
      title = `Today in ${topic.name}`;
      body = `Check out today's roundup`;
      url = `${BASE_URL}/feed/${topic.slug}/daily/${roundupDate}`;
    } else if (notificationType === 'weekly' && weekStart) {
      // Weekly roundup notification
      title = `This Week in ${topic.name}`;
      body = `Your weekly roundup is ready`;
      url = `${BASE_URL}/feed/${topic.slug}/weekly/${weekStart}`;
    } else {
      throw new Error('Invalid notification type or missing required parameters');
    }

    // Get subscriptions based on notification type
    let notificationFilter = 'instant';
    if (notificationType === 'daily') notificationFilter = 'daily';
    if (notificationType === 'weekly') notificationFilter = 'weekly';

    // Fetch all active push subscriptions for this topic
    const { data: signups, error: signupsError } = await supabase
      .from('topic_newsletter_signups')
      .select('push_subscription, email, notification_type, frequency')
      .eq('topic_id', topicId)
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

    // Support both the new notification_type column and legacy frequency column values
    type SignupRecord = {
      push_subscription: PushSubscription | null;
      email: string | null;
      notification_type: string | null;
      frequency: string | null;
    };

    const typedSignups = signups as SignupRecord[];

    const matchedSignups = typedSignups.filter(signup => {
      const type = (signup.notification_type || signup.frequency || '').toLowerCase();

      if (notificationFilter === 'instant') {
        // Legacy rows may have stored "story" or "instant" to represent story notifications
        return type === 'instant' || type === 'story';
      }

      return type === notificationFilter;
    });

    if (matchedSignups.length === 0) {
      return new Response(
        JSON.stringify({
          success: true,
          message: `No active push subscriptions found for ${notificationFilter} notifications`,
          sent: 0,
          total: signups.length
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const vapidPublicKey = Deno.env.get('VAPID_PUBLIC_KEY');
    const vapidPrivateKey = Deno.env.get('VAPID_PRIVATE_KEY');
    const vapidSubject = Deno.env.get('VAPID_SUBJECT') || 'mailto:notifications@curatr.pro';

    if (!vapidPublicKey || !vapidPrivateKey) {
      throw new Error('VAPID keys not configured');
    }

    // Configure VAPID details for web-push
    webpush.setVapidDetails(
      vapidSubject,
      vapidPublicKey,
      vapidPrivateKey
    );

    console.log(`📬 Found ${matchedSignups.length} active ${notificationFilter} subscriptions (from ${signups.length} total push signups)`);

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
    const failedSubscriptions: string[] = [];

    // Send notifications to all subscribers using proper Web Push protocol
    for (const signup of matchedSignups) {
      try {
        const subscription = signup.push_subscription as PushSubscription;
        
        // Validate subscription format
        if (!subscription.endpoint || !subscription.keys?.p256dh || !subscription.keys?.auth) {
          console.error(`Invalid subscription format for ${signup.email}`);
          failureCount++;
          failedSubscriptions.push(signup.email || 'unknown');
          continue;
        }

        // Send push notification using web-push library with proper VAPID auth
        await webpush.sendNotification(
          subscription,
          JSON.stringify(notificationPayload),
          {
            TTL: 86400, // 24 hours
          }
        );

        successCount++;
        console.log(`✅ Notification sent successfully to ${signup.email || 'subscriber'}`);

      } catch (error: any) {
        failureCount++;
        const email = signup.email || 'unknown';
        failedSubscriptions.push(email);
        
        console.error(`❌ Failed to send to ${email}:`, error.message, `(status: ${error.statusCode || 'unknown'})`);
        
        // If subscription is expired/invalid or unauthorized (410, 404, 401, 403), mark it as inactive
        if (error.statusCode === 410 || error.statusCode === 404 || error.statusCode === 401 || error.statusCode === 403) {
          console.log(`🗑️ Marking subscription as inactive for ${email} (status: ${error.statusCode})`);
          await supabase
            .from('topic_newsletter_signups')
            .update({ is_active: false })
            .match({ 
              topic_id: topicId, 
              email: email 
            });
        }
      }
    }

    console.log(`📊 Notification summary: ${successCount} sent, ${failureCount} failed out of ${matchedSignups.length} targeted (${signups.length} total push signups)`);

    // Log notification send with detailed context
    await supabase.from('system_logs').insert({
      level: successCount > 0 ? 'info' : 'warning',
      message: `${notificationType} notifications: ${successCount} sent, ${failureCount} failed`,
      context: {
        story_id: storyId,
        topic_id: topicId,
        topic_slug: topic.slug,
        notification_type: notificationType,
        notification_filter: notificationFilter,
        roundup_date: roundupDate,
        week_start: weekStart,
        success_count: successCount,
        failure_count: failureCount,
        total_subscriptions: signups.length,
        targeted_subscriptions: matchedSignups.length,
        failed_emails: failedSubscriptions
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
