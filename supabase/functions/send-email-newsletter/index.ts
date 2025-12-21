import React from 'npm:react@18.3.1'
import { serve } from 'https://deno.land/std@0.192.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { Resend } from 'npm:resend@4.0.0';
import { renderAsync } from 'npm:@react-email/components@0.0.22';
import { DailyRoundupEmail } from './_templates/daily-roundup.tsx';
import { WeeklyRoundupEmail } from './_templates/weekly-roundup.tsx';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const BASE_URL = 'https://eezeenews.com';

interface SendEmailRequest {
  topicId: string;
  notificationType: 'daily' | 'weekly';
  roundupDate?: string;
  weekStart?: string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const resendApiKey = Deno.env.get('RESEND_API_KEY');
  
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    const { topicId, notificationType, roundupDate, weekStart }: SendEmailRequest = await req.json();

    console.log(`📧 Sending ${notificationType} email newsletter for topic ${topicId}`);

    if (!resendApiKey) {
      console.warn('⚠️ RESEND_API_KEY not configured, skipping email send');
      return new Response(JSON.stringify({
        success: false,
        error: 'Email sending not configured - RESEND_API_KEY missing'
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const resend = new Resend(resendApiKey);

    // Get topic details
    const { data: topic, error: topicError } = await supabase
      .from('topics')
      .select('id, name, slug')
      .eq('id', topicId)
      .single();

    if (topicError || !topic) {
      throw new Error(`Topic not found: ${topicError?.message}`);
    }

    // Get email subscribers for this notification type
    const { data: subscribers, error: subError } = await supabase
      .from('topic_newsletter_signups')
      .select('id, email, name')
      .eq('topic_id', topicId)
      .eq('is_active', true)
      .eq('notification_type', notificationType)
      .not('email', 'is', null)
      .is('push_subscription', null); // Only email-only subscriptions

    if (subError) {
      throw new Error(`Failed to fetch subscribers: ${subError.message}`);
    }

    if (!subscribers || subscribers.length === 0) {
      console.log('📭 No email subscribers found for this topic/type');
      return new Response(JSON.stringify({
        success: true,
        message: 'No email subscribers',
        emails_sent: 0
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`📬 Found ${subscribers.length} email subscribers`);

    // Fetch roundup data
    let roundupQuery = supabase
      .from('topic_roundups')
      .select('*')
      .eq('topic_id', topicId)
      .eq('roundup_type', notificationType)
      .eq('is_published', true)
      .order('created_at', { ascending: false })
      .limit(1);

    const { data: roundups, error: roundupError } = await roundupQuery;

    if (roundupError) {
      throw new Error(`Failed to fetch roundup: ${roundupError.message}`);
    }

    const roundup = roundups?.[0];
    
    if (!roundup) {
      console.log('📭 No roundup found for this topic/type');
      return new Response(JSON.stringify({
        success: true,
        message: 'No roundup available',
        emails_sent: 0
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Parse stories from roundup slide_data
    const slideData = roundup.slide_data as any[];
    const storySlides = slideData?.filter((s: any) => s.type === 'story_preview') || [];
    const stories = storySlides.map((s: any) => ({
      id: s.story_id,
      title: s.content,
      author: s.author || s.source_metadata?.author,
      publication_name: s.publication_name || s.source_metadata?.publication
    }));

    // Get top sources from stories
    const topSources = [...new Set(stories.map(s => s.publication_name).filter(Boolean))].slice(0, 5);

    // Generate email HTML
    let emailHtml: string;
    
    if (notificationType === 'daily') {
      const dateStr = new Date(roundup.period_start).toLocaleDateString('en-GB', { 
        weekday: 'long', 
        day: 'numeric', 
        month: 'long' 
      });
      
      emailHtml = await renderAsync(
        React.createElement(DailyRoundupEmail, {
          topicName: topic.name,
          topicSlug: topic.slug,
          date: dateStr,
          storyCount: stories.length,
          stories: stories.slice(0, 5),
          baseUrl: BASE_URL
        })
      );
    } else {
      const weekStartDate = new Date(roundup.period_start);
      const weekEndDate = new Date(roundup.period_end);
      
      emailHtml = await renderAsync(
        React.createElement(WeeklyRoundupEmail, {
          topicName: topic.name,
          topicSlug: topic.slug,
          weekStart: weekStartDate.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }),
          weekEnd: weekEndDate.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }),
          storyCount: roundup.story_ids?.length || stories.length,
          stories: stories.slice(0, 7),
          topSources,
          baseUrl: BASE_URL
        })
      );
    }

    // Send emails
    let sentCount = 0;
    let failedCount = 0;
    const errors: string[] = [];

    for (const subscriber of subscribers) {
      try {
        const subject = notificationType === 'daily'
          ? `📰 ${topic.name} Daily Briefing`
          : `📰 ${topic.name} Weekly Roundup`;

        const { error: sendError } = await resend.emails.send({
          from: `${topic.name} <updates@eezeenews.com>`,
          to: [subscriber.email!],
          subject,
          html: emailHtml,
        });

        if (sendError) {
          console.error(`Failed to send to ${subscriber.email}:`, sendError);
          errors.push(`${subscriber.email}: ${sendError.message}`);
          failedCount++;
        } else {
          sentCount++;
          console.log(`✅ Sent to ${subscriber.email}`);
        }
      } catch (error) {
        console.error(`Error sending to ${subscriber.email}:`, error);
        errors.push(`${subscriber.email}: ${error.message}`);
        failedCount++;
      }
    }

    // Log the send operation
    await supabase
      .from('system_logs')
      .insert({
        level: failedCount > 0 ? 'warn' : 'info',
        message: `Email newsletter sent for ${topic.name}`,
        context: {
          topic_id: topicId,
          topic_name: topic.name,
          notification_type: notificationType,
          total_subscribers: subscribers.length,
          sent: sentCount,
          failed: failedCount,
          errors: errors.slice(0, 5) // Only log first 5 errors
        },
        function_name: 'send-email-newsletter'
      });

    console.log(`✅ Email newsletter complete: ${sentCount} sent, ${failedCount} failed`);

    return new Response(JSON.stringify({
      success: true,
      emails_sent: sentCount,
      emails_failed: failedCount,
      total_subscribers: subscribers.length
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('💥 Email newsletter error:', error);
    
    return new Response(JSON.stringify({
      success: false,
      error: error instanceof Error ? error.message : String(error)
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
