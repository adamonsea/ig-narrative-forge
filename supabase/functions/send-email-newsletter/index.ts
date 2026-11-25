import React from 'npm:react@18.3.1'
import { serve } from 'https://deno.land/std@0.192.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { Resend } from 'npm:resend@4.0.0';
import { renderAsync } from 'npm:@react-email/components@0.0.22';
import { DailyRoundupEmail } from './_templates/daily-roundup.tsx';
import { WeeklyRoundupEmail } from './_templates/weekly-roundup.tsx';
import { pickDailyEvents, londonToday, dailyEventsHeading, type WhatsOnRow } from './dailyEvents.ts';
import { briefingWindow, pickBriefingEvents } from '../_shared/briefingEvents.ts';
import { emailBrand, enrichEmailEvents, type EventDetails, type RichEmailEvent } from './emailEvents.ts';
import { getUser, userOwnsTopic, isServiceRole, unauthorized, forbidden, hasProAccess } from '../_shared/auth.ts';
import { dedupeByEvent, EMAIL_DUPLICATE_THRESHOLD } from '../_shared/story-similarity.ts';
import { FEATURES } from '../_shared/parked-features.ts';
import { pinLeadsEmail } from '../_shared/storyPin.ts';
import { SITE_URL, senderFor } from "../_shared/brandConfig.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const BASE_URL = SITE_URL;

interface SendEmailRequest {
  topicId: string;
  notificationType: 'daily' | 'weekly';
  testEmail?: string; // For testing
  testDate?: string; // ISO date string for testing specific dates (e.g., "2025-12-20")
  segmentId?: string; // Optional audience segment (partner site personalisation)
  previewOnly?: boolean; // Render the email HTML and return it without sending
}


interface EmailStory {
  id: string;
  title: string;
  thumbnail_url: string | null;
  source_name: string;
  story_url: string;
}

interface EmailEvent {
  id: string;
  title: string;
  date_label: string;
  time_label: string;
  location: string | null;
  url: string | null;
}


/**
 * Returns an email-safe thumbnail URL.
 *
 * Email clients (especially Gmail, Outlook, Apple Mail) have unreliable
 * WebP support and aggressively proxy/strip large images (>200KB often
 * fails to render). Our Supabase storage assets are WebP at ~400KB each,
 * which is why thumbnails were appearing broken in inboxes.
 *
 * Since this project is on the Supabase Free plan (no /render/image/
 * transformation endpoint), we route the image through wsrv.nl — a free,
 * widely-used image proxy that resizes and re-encodes to JPEG. This:
 *   - converts WebP → JPEG (universal email client support)
 *   - resizes to email-appropriate width (~320px for retina @ 160 display)
 *   - reduces file size to ~30-60KB (well under email proxy limits)
 *
 * If/when this project upgrades to Supabase Pro, switch back to the
 * /storage/v1/render/image/public/ endpoint for first-party hosting.
 */
function optimizeEmailThumbnail(url: string | null): string | null {
  if (!url) return null;
  return `https://wsrv.nl/?url=${encodeURIComponent(url)}&w=320&output=jpg&q=75`;
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
    const { topicId, notificationType, testEmail, testDate, segmentId, previewOnly }: SendEmailRequest = await req.json();

    console.log(`📧 ${previewOnly ? 'Previewing' : 'Sending'} ${notificationType} email newsletter for topic ${topicId}${segmentId ? ` (segment ${segmentId})` : ''}`);

    // Authorization: allow internal/cron (service role) callers, otherwise require topic owner
    if (!isServiceRole(req)) {
      const user = await getUser(req);
      if (!user) return unauthorized(corsHeaders);
      if (!topicId || !(await userOwnsTopic(supabase, user.id, topicId))) {
        return forbidden(corsHeaders);
      }
    }

    if (!resendApiKey && !previewOnly) {
      console.warn('⚠️ RESEND_API_KEY not configured, skipping email send');
      return new Response(JSON.stringify({
        success: false,
        error: 'Email sending not configured - RESEND_API_KEY missing'
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Load the audience segment, if one was requested
    let segment: {
      id: string;
      name: string;
      source_domain: string | null;
      signup_source: string | null;
      intro_heading: string | null;
      intro_text: string | null;
      include_events: boolean;
    } | null = null;

    // Parked feature: while email segments are off, every send is the plain, unsegmented one.
    if (segmentId && FEATURES.emailSegments) {
      const { data: segmentRow, error: segmentError } = await supabase
        .from('email_segments')
        .select('id, name, topic_id, source_domain, signup_source, intro_heading, intro_text, include_events')
        .eq('id', segmentId)
        .eq('topic_id', topicId)
        .maybeSingle();

      if (segmentError) console.error('Error loading segment (non-fatal):', segmentError);
      if (segmentRow) segment = segmentRow as typeof segment;
      if (!segment) console.warn(`⚠️ Segment ${segmentId} not found for topic ${topicId} — sending unsegmented`);
    }

    const resend = resendApiKey ? new Resend(resendApiKey) : null;



    // Get topic details
    const { data: topic, error: topicError } = await supabase
      .from('topics')
      .select('id, name, slug, branding_config, illustration_primary_color, event_currency, events_enabled, feed_lead, created_by, email_subscriptions_enabled, pinned_story_id, pinned_at, pinned_until, pinned_daily_led_at')
      .eq('id', topicId)
      .single();

    if (topicError || !topic) {
      throw new Error(`Topic not found: ${topicError?.message}`);
    }
    if (!topic.email_subscriptions_enabled || !(await hasProAccess(supabase, topic.created_by))) {
      return new Response(JSON.stringify({ success: false, error: 'Pro access is required to send this newsletter.' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Use optimized email variant or fallback
    const branding = topic.branding_config || {};
    const logoVariants = branding.logo_variants || {};
    const topicLogoUrl = logoVariants['email'] || logoVariants['header'] || branding.logo_url || branding.icon_url;

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

    // Headline as it will appear in the email (slide 1 wording wins)
    const withHeadline = <T extends { title: string; slides?: { content: string; slide_number: number }[] }>(story: T) => {
      const slide1 = (story.slides || []).find((s) => s.slide_number === 1);
      return { ...story, headline: slide1?.content || story.title };
    };

    // Filter stories to only those belonging to this topic
    const topicCandidates = (storiesData || [])
      .filter((story) => {
        if (!story.topic_article_id) return false;
        const ta = taMap.get(story.topic_article_id);
        return ta?.topic_id === topicId;
      })
      .map(withHeadline);

    // Strict newsletter dedupe: one event gets one slot, best-ranked wins.
    const { kept: dedupedToday, dropped: droppedToday } = dedupeByEvent(topicCandidates);
    droppedToday.forEach((d) =>
      console.log(`🚫 Duplicate held back: "${d.candidate.headline}" ≈ "${d.matched}" (${d.score.toFixed(2)})`)
    );

    let topicStories = dedupedToday.slice(0, storyLimit);

    // Pinned story leads: the weekly email while the pin lasts, the daily email once per pin.
    let pinnedLeadId: string | null = null;
    const storyPin = {
      story_id: topic.pinned_story_id,
      pinned_at: topic.pinned_at,
      pinned_until: topic.pinned_until,
      daily_led_at: topic.pinned_daily_led_at,
    };
    if (pinLeadsEmail(storyPin, notificationType)) {
      const { data: pinned } = await supabase
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
        .eq('id', topic.pinned_story_id)
        .eq('is_published', true)
        .in('status', ['published', 'ready'])
        .maybeSingle();
      if (pinned?.topic_article_id) {
        let ta = taMap.get(pinned.topic_article_id);
        if (!ta) {
          const { data: pinnedTa } = await supabase
            .from('topic_articles')
            .select('id, topic_id, source:content_sources(source_name), shared_content:shared_article_content(source_domain)')
            .eq('id', pinned.topic_article_id)
            .maybeSingle();
          if (pinnedTa) { taMap.set(pinnedTa.id, pinnedTa); ta = pinnedTa; }
        }
        if (ta?.topic_id === topicId) {
          const lead = withHeadline(pinned);
          // Repeats of the pinned story drop out, so it leads alone
          topicStories = dedupeByEvent([lead, ...dedupedToday.filter((st) => st.id !== lead.id)]).kept.slice(0, storyLimit);
          pinnedLeadId = lead.id;
          console.log(`📌 Pinned story leads the ${notificationType} email: "${lead.headline}"`);
        }
      }
    }

    console.log(`📰 Found ${topicStories.length} published stories for ${topic.name} newsletter (${droppedToday.length} duplicates removed)`);

    // Check if we need fallback stories for daily emails (slow news day)
    let fallbackStories: typeof topicStories = [];
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

        // Filter to this topic, then dedupe against today's picks and each other
        const weeklyCandidates = weeklyStoriesData
          .filter((story) => {
            if (!story.topic_article_id) return false;
            const ta = taMap.get(story.topic_article_id);
            return ta?.topic_id === topicId;
          })
          .map(withHeadline);

        const { kept: dedupedWeekly } = dedupeByEvent(
          weeklyCandidates,
          EMAIL_DUPLICATE_THRESHOLD,
          topicStories
        );

        fallbackStories = dedupedWeekly.slice(0, storyLimit - topicStories.length);
        
        console.log(`📚 Found ${fallbackStories.length} fallback stories from the week`);
      }
    }

    // Combine today's stories with fallback if needed
    const allStories = [...topicStories, ...fallbackStories];

    // Transform stories for email template
    // Some publishers block the resize proxy (e.g. 401). Check each picture once and
    // fall back to the original photo so emails never drop to no picture.
    const thumbFor = new Map<string, string | null>();
    await Promise.all(allStories.map(async (story) => {
      const original = story.cover_illustration_url as string | null;
      if (!original || thumbFor.has(original)) return;
      const proxied = optimizeEmailThumbnail(original);
      try {
        const r = await fetch(proxied!, { signal: AbortSignal.timeout(6000) });
        const ok = r.ok && (r.headers.get('content-type') || '').startsWith('image/');
        await r.body?.cancel();
        thumbFor.set(original, ok ? proxied : original);
      } catch {
        thumbFor.set(original, original);
      }
    }));

    const stories: EmailStory[] = allStories.map((story) => {
      const ta = story.topic_article_id ? taMap.get(story.topic_article_id) : undefined;
      const sourceName = ta?.source?.source_name || ta?.shared_content?.source_domain || topic.name;
      
      // Use slide 1 headline instead of original article title
      const headline = story.headline;

      return {
        id: story.id,
        title: headline,
        thumbnail_url: story.cover_illustration_url ? (thumbFor.get(story.cover_illustration_url) ?? null) : null,
        source_name: sourceName,
        story_url: `${BASE_URL}/feed/${topic.slug}/story/${story.id}`,
      };
    });

    // Get subscribers (or use test email)
    let recipients: { email: string; name?: string | null; unsubscribe_token?: string | null }[] = [];

    if (previewOnly) {
      recipients = [];
      console.log('👀 Preview mode: no recipients loaded');
    } else if (testEmail) {
      recipients = [{ email: testEmail, name: null, unsubscribe_token: null }];
      console.log(`🧪 Test mode: sending to ${testEmail}`);
    } else {
      let subQuery = supabase
        .from('topic_newsletter_signups')
        .select('email, name, unsubscribe_token, source_domain, signup_source')
        .eq('topic_id', topicId)
        .eq('is_active', true)
        .eq('email_verified', true)
        .eq('notification_type', notificationType)
        .not('email', 'is', null);

      if (segment) {
        // Segment send: only subscribers who came from this partner site / source
        if (segment.source_domain) subQuery = subQuery.eq('source_domain', segment.source_domain);
        if (segment.signup_source) subQuery = subQuery.eq('signup_source', segment.signup_source);
      }

      const { data: subscribers, error: subError } = await subQuery;

      if (subError) {
        throw new Error(`Failed to fetch subscribers: ${subError.message}`);
      }

      let list = (subscribers || []).filter((s) => s.email);

      if (!segment && FEATURES.emailSegments) {
        // Default send: exclude anyone already covered by an active segment,
        // so nobody receives two versions of the same briefing.
        const { data: otherSegments } = await supabase
          .from('email_segments')
          .select('source_domain, signup_source')
          .eq('topic_id', topicId)
          .eq('is_active', true);

        const claimed = (otherSegments || []).filter((s) => s.source_domain || s.signup_source);
        if (claimed.length > 0) {
          list = list.filter((sub) =>
            !claimed.some((seg) =>
              (!seg.source_domain || seg.source_domain === sub.source_domain) &&
              (!seg.signup_source || seg.signup_source === sub.signup_source)
            )
          );
        }
      }

      recipients = list;
    }

    if (recipients.length === 0 && !previewOnly) {
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


    // Weekly emails: "The week ahead" — next 7 days from today, same rows and rules as the
    // feed's weekly briefing (get_topic_whats_on → pickBriefingEvents).
    let upcomingEvents: EmailEvent[] = [];
    if (notificationType === 'weekly' && topic.events_enabled && (!segment || segment.include_events)) {
      const { data: weekRows, error: eventsError } = await supabase.rpc('get_topic_whats_on', { p_topic_id: topicId });
      if (eventsError) {
        console.error('Error fetching events (non-fatal):', eventsError);
      } else {
        const today = londonToday();
        upcomingEvents = pickBriefingEvents((weekRows || []) as WhatsOnRow[], briefingWindow('weekly', today, today), 6).map((e) => ({
          id: e.id,
          title: e.title,
          date_label: new Date(`${e.start_date}T12:00:00Z`).toLocaleDateString('en-GB', {
            weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC',
          }),
          time_label: e.start_time ? e.start_time.slice(0, 5) : 'All day',
          location: e.location || e.source_name || null,
          url: e.source_url || null,
        }));
      }
      console.log(`🎪 Found ${upcomingEvents.length} events in the week ahead for the weekly email`);
    }

    // Daily emails: "What's on" for today and tomorrow only (UK dates).
    // Same rows as the feed (get_topic_whats_on: published, started ones hidden, one per name).
    if (notificationType === 'daily' && topic.events_enabled && (!segment || segment.include_events)) {
      const { data: whatsOnRows, error: whatsOnError } = await supabase.rpc('get_topic_whats_on', { p_topic_id: topicId });
      if (whatsOnError) {
        console.error('Error fetching events for daily email (non-fatal):', whatsOnError);
      } else {
        upcomingEvents = pickDailyEvents((whatsOnRows || []) as WhatsOnRow[], londonToday());
      }
      console.log(`🎪 Found ${upcomingEvents.length} events today/tomorrow for the daily email`);
    }

    // Nothing to say: no stories and no events → send nothing rather than an empty email
    if (stories.length === 0 && upcomingEvents.length === 0 && !previewOnly) {
      console.log('📭 No stories or events — skipping send');
      return new Response(JSON.stringify({ success: true, message: 'Nothing to send', emails_sent: 0 }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    // Events-led feeds (or no news) put the events first
    const eventsFirst = upcomingEvents.length > 0 && ((topic as { feed_lead?: string }).feed_lead === 'events' || stories.length === 0);

    // Events-focused emails get picture-led cards: listing photo, or the category illustration in the feed's colour.
    let richEvents: RichEmailEvent[] | undefined;
    const brand = emailBrand(branding.primary_color || (topic as { illustration_primary_color?: string }).illustration_primary_color);
    if (eventsFirst) {
      const { data: details, error: detailsError } = await supabase
        .from('events')
        .select('id, description, event_type, price, is_free, image_path, image_hidden, source_name')
        .in('id', upcomingEvents.map((e) => e.id));
      if (detailsError) {
        console.error('Event details for email cards (non-fatal, plain list used):', detailsError);
      } else {
        richEvents = enrichEmailEvents(upcomingEvents, (details || []) as EventDetails[], {
          supabaseUrl, origin: BASE_URL, currency: (topic as { event_currency?: string }).event_currency,
        });
      }
    }

    // Prepare shared email template data
    const displayDate = dateEnd.toLocaleDateString('en-GB', { 
      weekday: 'long', 
      day: 'numeric', 
      month: 'long' 
    });
    
    // Date param for URL (YYYY-MM-DD format)
    const dateParam = dateEnd.toISOString().split('T')[0];
    const weekStartParam = dateStart.toISOString().split('T')[0];
    
    // Fetch roundup for audio_url and total story count
    const roundupType = notificationType === 'daily' ? 'daily' : 'weekly';
    const { data: roundup } = await supabase
      .from('topic_roundups')
      .select('audio_url, stats')
      .eq('topic_id', topicId)
      .eq('roundup_type', roundupType)
      .gte('period_start', dateStart.toISOString())
      .lte('period_start', dateEnd.toISOString())
      .order('period_start', { ascending: false })
      .limit(1)
      .maybeSingle();
    
    const audioUrl = roundup?.audio_url || undefined;
    const totalStoryCount = (roundup?.stats as { story_count?: number })?.story_count;
    
    console.log(`🎧 Audio URL: ${audioUrl ? 'found' : 'none'}, Total stories: ${totalStoryCount || 'N/A'}`);

    // Helper to build unsubscribe URL for a recipient
    const buildUnsubscribeUrl = (token: string | null | undefined): string | undefined => {
      if (!token) return undefined;
      return `${supabaseUrl}/functions/v1/unsubscribe-newsletter?token=${token}`;
    };

    // Helper to render email HTML for a specific recipient
    const renderEmailForRecipient = async (unsubscribeUrl?: string): Promise<string> => {
      if (notificationType === 'daily') {
        return await renderAsync(
          React.createElement(DailyRoundupEmail, {
            topicName: topic.name,
            topicSlug: topic.slug,
            topicLogoUrl,
            date: displayDate,
            dateParam,
            stories,
            baseUrl: BASE_URL,
            isSlowNewsDay,
            audioUrl,
            events: upcomingEvents,
            eventsFirst,
            richEvents,
            brand,
            unsubscribeUrl,
            introHeading: segment?.intro_heading || undefined,
            introText: segment?.intro_text || undefined
          })
        );
      } else {
        const weekStartDisplay = dateStart.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
        const weekEndDisplay = dateEnd.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
        
        return await renderAsync(
          React.createElement(WeeklyRoundupEmail, {
            topicName: topic.name,
            topicSlug: topic.slug,
            topicLogoUrl,
            weekStart: weekStartDisplay,
            weekEnd: weekEndDisplay,
            weekStartParam,
            stories,
            baseUrl: BASE_URL,
            audioUrl,
            totalStoryCount,
            events: upcomingEvents,
            eventsFirst,
            richEvents,
            brand,
            unsubscribeUrl,
            introHeading: segment?.intro_heading || undefined,
            introText: segment?.intro_text || undefined
          })
        );
      }
    };

    // Preview mode: render and return the HTML without sending anything
    if (previewOnly) {
      const previewHtml = await renderEmailForRecipient(undefined);
      return new Response(JSON.stringify({
        success: true,
        preview: true,
        html: previewHtml,
        segment: segment ? { id: segment.id, name: segment.name } : null,
        story_count: stories.length,
        event_count: upcomingEvents.length,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Send emails
    let sentCount = 0;
    let failedCount = 0;
    const errors: string[] = [];



    for (const recipient of recipients) {
      try {
        // Build per-recipient unsubscribe URL
        const unsubscribeUrl = buildUnsubscribeUrl(recipient.unsubscribe_token);
        
        // Render email HTML with this recipient's unsubscribe link
        const emailHtml = await renderEmailForRecipient(unsubscribeUrl);

        // Dynamic subject line with personalization
        const storyCount = stories.length;
        const firstName = recipient.name?.split(' ')[0];
        
        let subject: string;
        if (storyCount === 0) {
          // Events only: name what's coming up
          subject = notificationType === 'daily'
            ? `${dailyEventsHeading(upcomingEvents as Parameters<typeof dailyEventsHeading>[0])} · ${topic.name}`
            : `The week ahead · ${topic.name}`;
        } else if (notificationType === 'daily') {
          if (firstName) {
            subject = `Hey ${firstName}, ${storyCount} ${storyCount === 1 ? 'story' : 'stories'} from ${topic.name}`;
          } else {
            subject = `Your ${topic.name} update: ${storyCount} new ${storyCount === 1 ? 'story' : 'stories'}`;
          }
        } else {
          if (firstName) {
            subject = `${firstName}, your week in ${topic.name} (${storyCount} stories)`;
          } else {
            subject = `${topic.name} Weekly: ${storyCount} stories you might have missed`;
          }
        }

        const { error: sendError } = await resend!.emails.send({
          from: senderFor(topic.name),
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

    // A pinned story leads the daily email once: remember it led
    if (!testEmail && notificationType === 'daily' && pinnedLeadId && sentCount > 0) {
      const { error: pinError } = await supabase
        .from('topics')
        .update({ pinned_daily_led_at: new Date().toISOString() })
        .eq('id', topicId);
      if (pinError) console.error('Error recording pinned daily lead (non-fatal):', pinError);
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
