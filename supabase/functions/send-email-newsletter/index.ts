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
  testEmail?: string; // For testing
}

interface EmailStory {
  id: string;
  title: string;
  thumbnail_url: string | null;
  source_name: string;
  story_url: string;
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
    const { topicId, notificationType, testEmail }: SendEmailRequest = await req.json();

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

    // Determine date range based on notification type
    const now = new Date();
    let dateStart: Date;
    let dateEnd = now;
    
    if (notificationType === 'daily') {
      dateStart = new Date(now);
      dateStart.setHours(0, 0, 0, 0);
    } else {
      // Weekly: last 7 days
      dateStart = new Date(now);
      dateStart.setDate(dateStart.getDate() - 7);
    }

    // Fetch top stories directly from stories table
    const storyLimit = notificationType === 'daily' ? 5 : 10;
    
    const { data: storiesData, error: storiesError } = await supabase
      .from('stories')
      .select(`
        id,
        title,
        cover_illustration_url,
        topic_article:topic_articles!topic_article_id (
          topic_id,
          source:content_sources (
            source_name
          ),
          shared_content:shared_article_content (
            source_domain
          )
        )
      `)
      .eq('topic_article.topic_id', topicId)
      .eq('status', 'published')
      .order('quality_score', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false })
      .limit(storyLimit);

    if (storiesError) {
      console.error('Error fetching stories:', storiesError);
      throw new Error(`Failed to fetch stories: ${storiesError.message}`);
    }

    console.log(`📰 Found ${storiesData?.length || 0} stories for newsletter`);

    // Transform stories for email template
    const stories: EmailStory[] = (storiesData || []).map(story => {
      // Get source name from nested structure
      const topicArticle = story.topic_article;
      const sourceName = topicArticle?.source?.source_name 
        || topicArticle?.shared_content?.source_domain 
        || topic.name;
      
      return {
        id: story.id,
        title: story.title,
        thumbnail_url: story.cover_illustration_url,
        source_name: sourceName,
        story_url: `${BASE_URL}/feed/${topic.slug}/story/${story.id}`
      };
    });

    // Get subscribers (or use test email)
    let recipients: { email: string }[] = [];
    
    if (testEmail) {
      recipients = [{ email: testEmail }];
      console.log(`🧪 Test mode: sending to ${testEmail}`);
    } else {
      const { data: subscribers, error: subError } = await supabase
        .from('topic_newsletter_signups')
        .select('email')
        .eq('topic_id', topicId)
        .eq('is_active', true)
        .eq('notification_type', notificationType)
        .not('email', 'is', null);

      if (subError) {
        throw new Error(`Failed to fetch subscribers: ${subError.message}`);
      }

      recipients = (subscribers || []).filter(s => s.email);
    }

    if (recipients.length === 0) {
      console.log('📭 No email recipients');
      return new Response(JSON.stringify({
        success: true,
        message: 'No email subscribers',
        emails_sent: 0
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`📬 Sending to ${recipients.length} recipients`);

    // Generate email HTML
    let emailHtml: string;
    const date = now.toLocaleDateString('en-GB', { 
      weekday: 'long', 
      day: 'numeric', 
      month: 'long' 
    });
    
    if (notificationType === 'daily') {
      emailHtml = await renderAsync(
        React.createElement(DailyRoundupEmail, {
          topicName: topic.name,
          topicSlug: topic.slug,
          date,
          stories,
          baseUrl: BASE_URL
        })
      );
    } else {
      const weekStart = dateStart.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
      const weekEnd = now.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
      
      emailHtml = await renderAsync(
        React.createElement(WeeklyRoundupEmail, {
          topicName: topic.name,
          topicSlug: topic.slug,
          weekStart,
          weekEnd,
          stories,
          baseUrl: BASE_URL
        })
      );
    }

    // Send emails
    let sentCount = 0;
    let failedCount = 0;
    const errors: string[] = [];

    for (const recipient of recipients) {
      try {
        const subject = notificationType === 'daily'
          ? `${topic.name} Daily Briefing`
          : `${topic.name} Weekly Roundup`;

        const { error: sendError } = await resend.emails.send({
          from: `eeZee News <onboarding@resend.dev>`,
          to: [recipient.email!],
          subject,
          html: emailHtml,
        });

        if (sendError) {
          console.error(`Failed to send to ${recipient.email}:`, sendError);
          errors.push(`${recipient.email}: ${sendError.message}`);
          failedCount++;
        } else {
          sentCount++;
          console.log(`✅ Sent to ${recipient.email}`);
        }
      } catch (error) {
        console.error(`Error sending to ${recipient.email}:`, error);
        errors.push(`${recipient.email}: ${error.message}`);
        failedCount++;
      }
    }

    // Log the send operation (skip for test emails)
    if (!testEmail) {
      await supabase
        .from('system_logs')
        .insert({
          level: failedCount > 0 ? 'warn' : 'info',
          message: `Email newsletter sent for ${topic.name}`,
          context: {
            topic_id: topicId,
            topic_name: topic.name,
            notification_type: notificationType,
            total_subscribers: recipients.length,
            stories_included: stories.length,
            sent: sentCount,
            failed: failedCount,
            errors: errors.slice(0, 5)
          },
          function_name: 'send-email-newsletter'
        });
    }

    console.log(`✅ Email newsletter complete: ${sentCount} sent, ${failedCount} failed`);

    return new Response(JSON.stringify({
      success: true,
      emails_sent: sentCount,
      emails_failed: failedCount,
      stories_included: stories.length,
      total_recipients: recipients.length
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
