import { serve } from 'https://deno.land/std@0.192.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getUser, userOwnsTopic, isServiceRole, unauthorized, forbidden } from '../_shared/auth.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SOURCE_API = 'chamber_feed';

interface ChamberEvent {
  eventID: string;
  display_name?: string;
  start: string;
  time?: string;
  title: string;
  details?: string;
  allDay?: boolean;
}

/** Strip HTML down to a short plain-text summary. */
function toPlainText(html: string | undefined, maxLength = 400): string | null {
  if (!html) return null;
  const text = html
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<\/p>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/\s+/g, ' ')
    .trim();
  if (!text) return null;
  if (text.length <= maxLength) return text;
  const cut = text.slice(0, maxLength);
  const lastSpace = cut.lastIndexOf(' ');
  return `${(lastSpace > 100 ? cut.slice(0, lastSpace) : cut).trim()}…`;
}

/**
 * Chamber titles arrive as "\nEvent from our member\n<Member name>\n<Real title>".
 * Keep the last non-empty line as the title.
 */
function cleanTitle(raw: string): string {
  const lines = (raw || '')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  return (lines[lines.length - 1] || raw || 'Untitled event').slice(0, 300);
}

/** "Wednesday 21st May 2025 @ 09:00 - 16:00" -> "16:00:00" */
function extractEndTime(timeLabel: string | undefined): string | null {
  if (!timeLabel) return null;
  const match = timeLabel.match(/(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})/);
  if (!match) return null;
  const [h, m] = match[2].split(':');
  return `${h.padStart(2, '0')}:${m}:00`;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );

  try {
    const body = await req.json().catch(() => ({}));
    const topicId: string | undefined = body.topicId;
    const daysAhead: number = Math.min(Math.max(Number(body.daysAhead) || 120, 7), 400);

    // Authorization: cron/service-role callers pass through, users must own the topic
    const bearer = (req.headers.get('Authorization') || '').replace('Bearer ', '').trim();
    const cronToken = Deno.env.get('EVENTS_CRON_TOKEN') || '';
    const isCron = cronToken.length > 0 && bearer === cronToken;

    if (!isCron && !isServiceRole(req)) {
      const user = await getUser(req);
      if (!user) return unauthorized(corsHeaders);
      if (!topicId || !(await userOwnsTopic(supabase, user.id, topicId))) {
        return forbidden(corsHeaders);
      }
    }


    // Resolve which topics to process
    let query = supabase
      .from('topics')
      .select('id, name, event_source_url, events_enabled')
      .not('event_source_url', 'is', null);
    if (topicId) query = query.eq('id', topicId);

    const { data: topics, error: topicsError } = await query;
    if (topicsError) throw topicsError;

    const results: Array<Record<string, unknown>> = [];

    for (const topic of topics || []) {
      if (!topic.event_source_url) continue;

      try {
        const feedUrl = new URL(topic.event_source_url);
        const res = await fetch(feedUrl.toString(), {
          method: 'POST',
          headers: {
            'X-Requested-With': 'XMLHttpRequest',
            'Referer': `${feedUrl.origin.replace('members.', 'www.')}/events`,
            'Content-Type': 'application/x-www-form-urlencoded',
            'User-Agent': 'Mozilla/5.0 (compatible; CuratrEvents/1.0)',
          },
          body: 'start=&end=',
        });

        if (!res.ok) throw new Error(`Feed returned ${res.status}`);

        const raw = await res.text();
        let parsed: ChamberEvent[];
        try {
          parsed = JSON.parse(raw);
        } catch {
          throw new Error('Feed did not return valid JSON');
        }
        if (!Array.isArray(parsed)) throw new Error('Feed did not return a list');

        // The feed ignores date params and returns the full history — filter here.
        const now = new Date();
        const windowStart = new Date(now);
        windowStart.setUTCHours(0, 0, 0, 0);
        const windowEnd = new Date(windowStart);
        windowEnd.setUTCDate(windowEnd.getUTCDate() + daysAhead);

        const rows = parsed
          .filter((e) => e?.start && e?.eventID)
          .map((e) => ({ e, when: new Date(e.start) }))
          .filter(({ when }) => !isNaN(when.getTime()) && when >= windowStart && when <= windowEnd)
          .map(({ e, when }) => ({
            topic_id: topic.id,
            external_id: String(e.eventID),
            source_api: SOURCE_API,
            title: cleanTitle(e.title),
            description: toPlainText(e.details),
            start_date: e.start.slice(0, 10),
            start_time: e.allDay ? null : e.start.slice(11, 19) || null,
            end_time: e.allDay ? null : extractEndTime(e.time),
            location: null,
            event_type: 'events',
            category: 'Business & Community',
            source_url: `${feedUrl.origin.replace('members.', 'www.')}/events?id=${e.eventID}`,
            source_name: e.display_name || 'Chamber of Commerce',
            status: 'published',
            updated_at: new Date().toISOString(),
          }));

        // Work out which of these are brand new (so we can report "new since last check")
        let newCount = 0;
        if (rows.length > 0) {
          const { data: existing } = await supabase
            .from('events')
            .select('external_id')
            .eq('topic_id', topic.id)
            .eq('source_api', SOURCE_API)
            .in('external_id', rows.map((r) => r.external_id));
          const known = new Set((existing || []).map((e) => e.external_id));
          newCount = rows.filter((r) => !known.has(r.external_id)).length;

          const { error: upsertError } = await supabase
            .from('events')
            .upsert(rows, { onConflict: 'topic_id,source_api,external_id' });
          if (upsertError) throw new Error(upsertError.message);
        }


        // Remove imported events that have dropped off the feed within the window
        const keptIds = rows.map((r) => r.external_id);
        let cleanup = supabase
          .from('events')
          .delete()
          .eq('topic_id', topic.id)
          .eq('source_api', SOURCE_API)
          .gte('start_date', windowStart.toISOString().slice(0, 10));
        if (keptIds.length > 0) {
          cleanup = cleanup.not('external_id', 'in', `(${keptIds.join(',')})`);
        }
        await cleanup;

        console.log(`✅ ${topic.name}: imported ${rows.length} events`);
        results.push({ topicId: topic.id, topicName: topic.name, imported: rows.length, success: true });
      } catch (topicError) {
        const message = topicError instanceof Error ? topicError.message : JSON.stringify(topicError);
        console.error(`❌ ${topic.name}: ${message}`);
        results.push({ topicId: topic.id, topicName: topic.name, success: false, error: message });
      }
    }

    return new Response(JSON.stringify({ success: true, topicsProcessed: results.length, results }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('❌ ingest-chamber-events failed:', error);
    return new Response(JSON.stringify({ success: false, error: 'An internal error occurred' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
