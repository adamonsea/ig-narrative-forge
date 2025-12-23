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

const BASE_URL = 'https://curatr.pro';

interface SendEmailRequest {
  topicId: string;
  notificationType: 'daily' | 'weekly';
  testEmail?: string; // For testing
  testDate?: string; // ISO date string for testing specific dates (e.g., "2025-12-20")
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
    const { topicId, notificationType, testEmail, testDate }: SendEmailRequest = await req.json();

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
      .select('id, name, slug, branding_config')
      .eq('id', topicId)
      .single();

    if (topicError || !topic) {
      throw new Error(`Topic not found: ${topicError?.message}`);
    }

    const topicLogoUrl = topic.branding_config?.logo_url || topic.branding_config?.icon_url;

    // Determine date range based on notification type
    // Daily briefings cover YESTERDAY's news (sent in the morning)
    // Weekly briefings cover the last 7 days
    let dateStart: Date;
    let dateEnd: Date;
    
    if (testDate) {
      // For test dates, use the specified date boundaries in UTC
      dateStart = new Date(testDate + 'T00:00:00.000Z');
      dateEnd = new Date(testDate + 'T23:59:59.999Z');
      
      if (notificationType === 'weekly') {
        // For weekly, go back 7 days from the test date
        dateStart = new Date(dateEnd);
        dateStart.setUTCDate(dateStart.getUTCDate() - 7);
        dateStart.setUTCHours(0, 0, 0, 0);
      }
    } else {
      const now = new Date();
      if (notificationType === 'daily') {
        // Daily briefing: yesterday's stories (the previous day)
        dateEnd = new Date(now);
        dateEnd.setUTCHours(0, 0, 0, 0); // End at midnight today (exclusive)
        dateEnd.setUTCMilliseconds(-1); // Last moment of yesterday
        
        dateStart = new Date(dateEnd);
        dateStart.setUTCHours(0, 0, 0, 0); // Start of yesterday
      } else {
        // Weekly: last 7 days ending yesterday
        dateEnd = new Date(now);
        dateEnd.setUTCHours(0, 0, 0, 0);
        dateEnd.setUTCMilliseconds(-1); // End of yesterday
        
        dateStart = new Date(dateEnd);
        dateStart.setUTCDate(dateStart.getUTCDate() - 6); // 7 days total
        dateStart.setUTCHours(0, 0, 0, 0);
      }
    }

    console.log(`📅 Date range: ${dateStart.toISOString()} to ${dateEnd.toISOString()}`);

    // Fetch top stories
    const storyLimit = notificationType === 'daily' ? 5 : 10;
    const minStoriesForFullEmail = 2; // Minimum stories before showing fallback

    const { data: storiesData, error: storiesError } = await supabase
      .from('stories')
      .select(`
        id,
        title,
        cover_illustration_url,
        quality_score,
        topic_article_id,
        created_at,
        slides!slides_story_id_fkey(content, slide_number)
      `)
      .eq('status', 'published')
      .gte('created_at', dateStart.toISOString())
      .lte('created_at', dateEnd.toISOString())
      .order('quality_score', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false });

    if (storiesError) {
      console.error('Error fetching stories:', storiesError);
      throw new Error(`Failed to fetch stories: ${storiesError.message}`);
    }

    // IMPORTANT: topic_articles can exceed the 1000-row query limit.
    // Instead of loading all topic articles for the topic, only load the ones referenced
    // by the stories in the current date window.
    const candidateTopicArticleIds = Array.from(
      new Set((storiesData || []).map((s) => s.topic_article_id).filter(Boolean))
    ) as string[];

    const { data: topicArticles, error: taError } = candidateTopicArticleIds.length
      ? await supabase
          .from('topic_articles')
          .select('id, topic_id, source:content_sources(source_name), shared_content:shared_article_content(source_domain)')
          .in('id', candidateTopicArticleIds)
      : { data: [], error: null };

    if (taError) {
      console.error('Error fetching topic articles:', taError);
      throw new Error(`Failed to fetch topic articles: ${taError.message}`);
    }

    const taMap = new Map((topicArticles || []).map((ta) => [ta.id, ta]));

    // Filter stories to only those belonging to this topic
    const topicStories = (storiesData || [])
      .filter((story) => {
        if (!story.topic_article_id) return false;
        const ta = taMap.get(story.topic_article_id);
        return ta?.topic_id === topicId;
      })
      .slice(0, storyLimit);

    console.log(`📰 Found ${topicStories.length} published stories for ${topic.name} newsletter`);

    // Check if we need fallback stories for daily emails (slow news day)
    let fallbackStories: typeof storiesData = [];
    let isSlowNewsDay = false;
    
    if (notificationType === 'daily' && topicStories.length < minStoriesForFullEmail) {
      isSlowNewsDay = true;
      console.log(`📉 Slow news day detected, fetching popular stories from the week`);
      
      // Fetch popular stories from the last 7 days (excluding today's stories)
      const weekAgo = new Date(dateStart);
      weekAgo.setUTCDate(weekAgo.getUTCDate() - 7);
      
      const { data: weeklyStoriesData, error: weeklyError } = await supabase
        .from('stories')
        .select(`
          id,
          title,
          cover_illustration_url,
          quality_score,
          topic_article_id,
          created_at,
          slides!slides_story_id_fkey(content, slide_number)
        `)
        .eq('status', 'published')
        .gte('created_at', weekAgo.toISOString())
        .lt('created_at', dateStart.toISOString()) // Before today
        .order('quality_score', { ascending: false, nullsFirst: false })
        .limit(20);

      if (!weeklyError && weeklyStoriesData) {
        // Get topic articles for weekly stories
        const weeklyTaIds = Array.from(
          new Set(weeklyStoriesData.map((s) => s.topic_article_id).filter(Boolean))
        ) as string[];

        const { data: weeklyTopicArticles } = weeklyTaIds.length
          ? await supabase
              .from('topic_articles')
              .select('id, topic_id, source:content_sources(source_name), shared_content:shared_article_content(source_domain)')
              .in('id', weeklyTaIds)
          : { data: [] };

        // Add to taMap
        (weeklyTopicArticles || []).forEach((ta) => taMap.set(ta.id, ta));

        // Filter to this topic
        fallbackStories = weeklyStoriesData.filter((story) => {
          if (!story.topic_article_id) return false;
          const ta = taMap.get(story.topic_article_id);
          return ta?.topic_id === topicId;
        }).slice(0, storyLimit - topicStories.length);
        
        console.log(`📚 Found ${fallbackStories.length} fallback stories from the week`);
      }
    }

    // Combine today's stories with fallback if needed
    const allStories = [...topicStories, ...fallbackStories];

    // Transform stories for email template
    const stories: EmailStory[] = allStories.map((story) => {
      const ta = story.topic_article_id ? taMap.get(story.topic_article_id) : undefined;
      const sourceName = ta?.source?.source_name || ta?.shared_content?.source_domain || topic.name;
      
      // Use slide 1 headline instead of original article title
      const slide1 = (story.slides || []).find((s: { slide_number: number }) => s.slide_number === 1);
      const headline = slide1?.content || story.title;

      return {
        id: story.id,
        title: headline,
        thumbnail_url: story.cover_illustration_url,
        source_name: sourceName,
        story_url: `${BASE_URL}/feed/${topic.slug}/story/${story.id}`,
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
    const displayDate = dateEnd.toLocaleDateString('en-GB', { 
      weekday: 'long', 
      day: 'numeric', 
      month: 'long' 
    });
    
    if (notificationType === 'daily') {
      emailHtml = await renderAsync(
        React.createElement(DailyRoundupEmail, {
          topicName: topic.name,
          topicSlug: topic.slug,
          topicLogoUrl,
          date: displayDate,
          stories,
          baseUrl: BASE_URL,
          isSlowNewsDay
        })
      );
    } else {
      const weekStartDisplay = dateStart.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
      const weekEndDisplay = dateEnd.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
      
      emailHtml = await renderAsync(
        React.createElement(WeeklyRoundupEmail, {
          topicName: topic.name,
          topicSlug: topic.slug,
          topicLogoUrl,
          weekStart: weekStartDisplay,
          weekEnd: weekEndDisplay,
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
          : `${topic.name} Weekly Briefing`;

        const { error: sendError } = await resend.emails.send({
          from: `${topic.name} <noreply@eezee.news>`,
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
