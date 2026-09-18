// Helper chat for feed owners.
// Answers questions about running their own feed in short, plain terms, and can
// point them at the exact place in the dashboard to do the thing.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { llmFetch } from '../_shared/llm-router.ts';
import { getUser, userOwnsTopic } from '../_shared/auth.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const DESTINATIONS = `
pipeline — Arrivals waiting for review and live published stories
add-story — Add a story by hand (paste or upload)
sources — Add, check or pause the websites stories are gathered from
publish-toggle — The Live/Draft switch in the feed header
reviews — Build a public visual look-back over a period
control-overview — Editorial control overview: policy and decisions needed
news-values — How local a story must be, big-story exceptions
coverage-terms — Words that tell Curatr what belongs in the feed
exclusions — Words that keep unwanted stories out
categories — How published stories are grouped
voice — Tone, writing style, house style, example sentences
picture-references — Local places, reference photos, illustration style
automation — How much Curatr may publish without you, publishing pace
distribution — Email, RSS, widget, audio briefings, donations
ai-assistants — Connect the feed to ChatGPT or Claude
identity — Brand, colour, welcome message, About page
features — Insight cards, sentiment, community signals, local tools
your-feeds — The list of all feeds you own
public-feed — What readers see
`.trim();

const stripFences = (text: string) =>
  text.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const user = await getUser(req);
    if (!user) {
      return new Response(JSON.stringify({ error: 'Not signed in' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { topicId, messages } = await req.json();
    if (!topicId || !Array.isArray(messages)) {
      return new Response(JSON.stringify({ error: 'Missing topicId or messages' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const service = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    if (!(await userOwnsTopic(service, user.id, topicId))) {
      return new Response(JSON.stringify({ error: 'Not your feed' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: topic } = await service
      .from('topics')
      .select('name, slug, region, topic_type, keywords, landmarks, landmark_setup_state, is_public, default_tone, default_writing_style, illustration_style, locality_strength, auto_simplify_enabled, drip_feed_enabled, rss_enabled, email_subscriptions_enabled, mcp_enabled, public_widget_builder_enabled, audio_briefings_daily_enabled, audio_briefings_weekly_enabled, negative_keywords')
      .eq('id', topicId)
      .maybeSingle();

    const since = new Date(Date.now() - 7 * 86400000).toISOString();
    const [sources, arrivals, published, recent, subscribers] = await Promise.all([
      service.from('topic_sources').select('id', { count: 'exact', head: true }).eq('topic_id', topicId).eq('is_active', true),
      service.from('topic_articles').select('id', { count: 'exact', head: true }).eq('topic_id', topicId).eq('processing_status', 'new'),
      service.from('stories').select('id, topic_articles!inner(topic_id)', { count: 'exact', head: true }).eq('topic_articles.topic_id', topicId).eq('is_published', true),
      service.from('stories').select('id, topic_articles!inner(topic_id)', { count: 'exact', head: true }).eq('topic_articles.topic_id', topicId).eq('is_published', true).gte('created_at', since),
      service.from('topic_newsletter_signups').select('id', { count: 'exact', head: true }).eq('topic_id', topicId).eq('is_active', true).eq('email_verified', true),
    ]);

    const unconfirmedPlaces = (topic?.landmarks || []).filter(
      (place: string) => (topic?.landmark_setup_state as Record<string, any> | null)?.[place]?.status !== 'confirmed',
    ).length;

    const liveState = {
      feed_name: topic?.name,
      status: topic?.is_public ? 'Live (readers can see it)' : 'Draft (not visible to readers)',
      kind: topic?.topic_type,
      region: topic?.region,
      active_sources: sources.count ?? 0,
      arrivals_waiting: arrivals.count ?? 0,
      published_stories: published.count ?? 0,
      published_last_7_days: recent.count ?? 0,
      email_subscribers: subscribers.count ?? 0,
      coverage_terms: (topic?.keywords || []).length,
      exclusion_terms: (topic?.negative_keywords || []).length,
      picture_reference_places: (topic?.landmarks || []).length,
      places_waiting_for_confirmation: unconfirmedPlaces,
      tone: topic?.default_tone,
      writing_style: topic?.default_writing_style,
      illustration_style: topic?.illustration_style,
      auto_publishing: topic?.auto_simplify_enabled ? 'on' : 'off',
      publishing_pace_drip: topic?.drip_feed_enabled ? 'on' : 'off',
      channels_on: [
        topic?.email_subscriptions_enabled && 'email',
        topic?.rss_enabled && 'RSS',
        topic?.public_widget_builder_enabled && 'website widget',
        topic?.audio_briefings_daily_enabled && 'daily audio',
        topic?.audio_briefings_weekly_enabled && 'weekly audio',
        topic?.mcp_enabled && 'AI assistants',
      ].filter(Boolean),
    };

    // Things this feed has available but has never switched on or filled in.
    const notYetUsed = [
      !topic?.email_subscriptions_enabled && { name: 'Reader email edition', what: 'Send published stories to readers by email.', destination: 'distribution' },
      !topic?.rss_enabled && { name: 'RSS feed', what: 'Let readers and other apps follow the feed automatically.', destination: 'distribution' },
      !topic?.public_widget_builder_enabled && { name: 'Website widget', what: 'Put a live strip of your stories on any website.', destination: 'distribution' },
      !(topic?.audio_briefings_daily_enabled || topic?.audio_briefings_weekly_enabled) && { name: 'Audio briefings', what: 'A spoken version of the feed for listeners.', destination: 'distribution' },
      !topic?.mcp_enabled && { name: 'ChatGPT and Claude access', what: 'Readers can ask an AI assistant about your feed.', destination: 'ai-assistants' },
      !(topic?.landmarks || []).length && { name: 'Picture references', what: 'Add local places so illustrations look like the real thing.', destination: 'picture-references' },
      !(topic?.negative_keywords || []).length && { name: 'Exclusions', what: 'Words that keep unwanted stories out of arrivals.', destination: 'exclusions' },
      !topic?.auto_simplify_enabled && { name: 'Automatic publishing', what: 'Let Curatr publish clear-cut stories without you.', destination: 'automation' },
      !topic?.drip_feed_enabled && { name: 'Publishing pace', what: 'Space published stories out through the day.', destination: 'automation' },
      published.count && published.count > 20 ? { name: 'Reviews', what: 'Build a public visual look-back over a few months.', destination: 'reviews' } : null,
    ].filter(Boolean);

    const system = `You are the in-app helper for Curatr, a tool people use to run their own curated news feed.
You are talking to the owner of the feed "${topic?.name}". You help them run it — you do not write stories.

HOW TO ANSWER
- Short and plain. No jargon: never say backend, component, database, route, RLS, API, endpoint.
- Lead with the answer in one sentence, then steps only if the task needs them.
- Steps: at most 5, each one short instruction, in order.
- Always offer the buttons that take them to the right place rather than describing where to click.
- If the live state below already answers them, say the actual number.
- If something is off or empty and that is why it isn't working, say so directly.
- Never invent features. If you don't know, say so and suggest the nearest place to look.

PLACES YOU CAN SEND THEM (use the exact id):
${DESTINATIONS}

LIVE STATE OF THIS FEED (facts, use them):
${JSON.stringify(liveState, null, 2)}

THINGS THIS FEED HAS NOT TURNED ON OR FILLED IN YET:
${JSON.stringify(notYetUsed, null, 2)}

NUDGES
- When one of the unused things above genuinely relates to what they just asked, add a single short nudge: what it does for them in one sentence, plus its destination.
- Only one nudge, only when it clearly helps. Leave it out otherwise — never nudge twice about the same thing in a conversation, and never nudge just to fill the field.

Reply as JSON only:
{
  "answer": "one or two short sentences",
  "steps": ["short step", "short step"],
  "actions": [{"label": "Open Picture references", "destination": "picture-references"}],
  "nudge": {"title": "Audio briefings", "body": "one short sentence on why it would help them", "destination": "distribution"},
  "suggestions": ["short follow-up question the owner might ask next", "another"]
}
steps, actions and suggestions may be empty arrays and nudge may be null. Give 1-3 actions when a place is relevant, and always 2-3 suggestions.`;

    const response = await llmFetch(
      {
        body: {
          model: 'deepseek-v4-flash',
          messages: [
            { role: 'system', content: system },
            ...messages.slice(-10).map((m: any) => ({
              role: m.role === 'assistant' ? 'assistant' : 'user',
              content: String(m.content ?? '').slice(0, 2000),
            })),
          ],
          temperature: 0.3,
          max_tokens: 800,
          response_format: { type: 'json_object' },
        },
      },
      { context: 'owner-assistant' },
    );

    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      console.error('owner-assistant provider error', response.status, detail.slice(0, 300));
      return new Response(JSON.stringify({ error: 'The helper is unavailable right now. Please try again shortly.' }), {
        status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const payload = await response.json();
    const raw = stripFences(payload?.choices?.[0]?.message?.content ?? '');

    let parsed: any;
    try {
      parsed = JSON.parse(raw);
    } catch {
      parsed = { answer: raw || "Sorry, I couldn't work that one out. Try asking it a different way.", steps: [], actions: [], suggestions: [] };
    }

    const result = {
      answer: String(parsed.answer ?? '').slice(0, 1200),
      steps: Array.isArray(parsed.steps) ? parsed.steps.slice(0, 5).map((s: any) => String(s).slice(0, 220)) : [],
      actions: Array.isArray(parsed.actions)
        ? parsed.actions.slice(0, 3).map((a: any) => ({
            label: String(a?.label ?? '').slice(0, 60),
            destination: String(a?.destination ?? ''),
          })).filter((a: any) => a.label && a.destination)
        : [],
      suggestions: Array.isArray(parsed.suggestions)
        ? parsed.suggestions.slice(0, 3).map((s: any) => String(s).slice(0, 90))
        : [],
    };

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('owner-assistant error', error);
    return new Response(JSON.stringify({ error: 'Something went wrong. Please try again.' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
