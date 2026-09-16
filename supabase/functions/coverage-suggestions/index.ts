import { serve } from "https://deno.land/std@0.192.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.55.0';
import { llmFetch } from '../_shared/llm-router.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;

interface Suggestion {
  value: string;
  count: number;
  sampleTitles: string[];
}

// Verify user is authenticated and owns the topic (same pattern as
// suggest-regional-elements).
async function verifyTopicOwnership(authHeader: string, topicId: string): Promise<{ userId: string | null; error: string | null }> {
  if (!authHeader?.startsWith('Bearer ')) {
    return { userId: null, error: 'Missing or invalid Authorization header' };
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authHeader } }
  });

  const token = authHeader.replace('Bearer ', '');
  const { data: claimsData, error: claimsError } = await supabase.auth.getClaims(token);

  if (claimsError || !claimsData?.claims) {
    return { userId: null, error: 'Invalid or expired token' };
  }

  const userId = claimsData.claims.sub as string;

  if (!topicId || typeof topicId !== 'string') {
    return { userId: null, error: 'A topic id is required' };
  }

  const serviceClient = createClient(
    supabaseUrl,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? supabaseAnonKey,
    { auth: { persistSession: false } }
  );

  const { data: topic, error: topicError } = await serviceClient
    .from('topics')
    .select('id, created_by')
    .eq('id', topicId)
    .maybeSingle();

  if (topicError) {
    console.error('Topic lookup failed:', topicError.message);
    return { userId: null, error: 'Could not verify this feed' };
  }
  if (!topic) {
    return { userId: null, error: 'Topic not found' };
  }

  if (topic.created_by !== userId) {
    const { data: isAdmin } = await serviceClient.rpc('has_role', { _user_id: userId, _role: 'admin' });
    if (!isAdmin) {
      return { userId: null, error: 'Not authorized to manage this topic' };
    }
  }

  return { userId, error: null };
}

function normalise(value: string): string {
  return value.toLowerCase().replace(/\s+/g, ' ').trim();
}

function countOccurrences(value: string, titles: string[]): { count: number; samples: string[] } {
  const needle = normalise(value);
  let count = 0;
  const samples: string[] = [];
  for (const title of titles) {
    if (normalise(title).includes(needle)) {
      count++;
      if (samples.length < 3) samples.push(title);
    }
  }
  return { count, samples };
}

// Fallback: capitalised multi-word / single proper-noun sequences, minus
// sentence-initial words and common noise. Only used when the LLM fails.
const STOP_TOKENS = new Set([
  'the', 'a', 'an', 'and', 'or', 'of', 'in', 'on', 'at', 'to', 'for', 'with', 'from', 'by', 'as', 'is', 'are', 'was', 'were', 'be', 'new', 'say', 'says', 'after', 'over', 'amid', 'before', 'during', 'warning', 'plan', 'plans', 'call', 'calls', 'news', 'update', 'report', 'live', 'best', 'top', 'how', 'why', 'what', 'when', 'uk', 'england', 'britain',
]);

function extractProperNouns(titles: string[]): string[] {
  const freq = new Map<string, number>();
  for (const title of titles) {
    const words = title.split(/[^A-Za-z0-9'’\-]+/).filter(Boolean);
    let i = 0;
    while (i < words.length) {
      const chunk: string[] = [];
      while (i < words.length && /^[A-Z][a-z'’\-]/.test(words[i])) {
        chunk.push(words[i]);
        i++;
      }
      if (chunk.length >= 1) {
        const phrase = chunk.join(' ');
        const first = chunk[0].toLowerCase();
        const atSentenceStart = title.startsWith(chunk[0]);
        const meaningful = chunk.length > 1 || (!STOP_TOKENS.has(first) && !atSentenceStart);
        if (meaningful && phrase.length > 2) {
          freq.set(phrase, (freq.get(phrase) || 0) + 1);
        }
      }
      if (chunk.length === 0) i++;
    }
  }
  return [...freq.entries()].filter(([, n]) => n >= 2).sort((a, b) => b[1] - a[1]).slice(0, 40).map(([phrase]) => phrase);
}

async function mineCandidates(titles: string[], topicName: string, region: string): Promise<{ places: string[]; organisations: string[]; terms: string[] } | null> {
  const sample = titles.slice(0, 200);
  if (sample.length === 0) return { places: [], organisations: [], terms: [] };

  const prompt = `You are helping the owner of a hyperlocal news feed about "${topicName}" (region: ${region}). Below are recent story headlines from their feed.

Extract candidates that keep recurring in these headlines but are NOT generic words:
- "places": named physical places, landmarks, venues, streets, neighbourhoods (e.g. "Towner Art Gallery", "Eastbourne Pier", "Sovereign Harbour")
- "organisations": named organisations, institutions, councils, clubs, companies, schools, charities (e.g. "Eastbourne Borough Council", "Congress Theatre")
- "terms": recurring topic words or phrases that define what this feed covers (e.g. "seafront regeneration", "parking charges")

Rules:
- Only return things that appear in the headlines (do not invent).
- Prefer multi-word proper names.
- No dates, people's names, or single generic words like "council" alone.
- Return JSON only: {"places": [], "organisations": [], "terms": []} with at most 15 items each.

HEADLINES:
${sample.join('\n')}`;

  try {
    const response = await llmFetch({
      body: {
        model: 'deepseek-v4-flash',
        messages: [
          { role: 'system', content: 'You extract recurring entities from news headlines. Always reply with valid JSON only.' },
          { role: 'user', content: prompt },
        ],
        temperature: 0.2,
        max_tokens: 1200,
      },
    }, { context: 'coverage-suggestions' });

    if (!response.ok) throw new Error(`LLM error ${response.status}`);
    const payload = await response.json();
    const text = payload?.choices?.[0]?.message?.content || '';
    const cleaned = text.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(cleaned);
    const asList = (v: unknown) => Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && x.length > 1).slice(0, 15) : [];
    return {
      places: asList(parsed.places),
      organisations: asList(parsed.organisations),
      terms: asList(parsed.terms),
    };
  } catch (error) {
    console.error('LLM mining failed, using regex fallback:', error);
    const nouns = extractProperNouns(sample);
    return { places: nouns.slice(0, 15), organisations: [], terms: [] };
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { topicId, kind = 'all' } = await req.json();

    const authHeader = req.headers.get('Authorization') || '';
    const { userId, error: authError } = await verifyTopicOwnership(authHeader, topicId);
    if (authError || !userId) {
      return new Response(JSON.stringify({ success: false, error: authError }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const serviceClient = createClient(
      supabaseUrl,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? supabaseAnonKey,
      { auth: { persistSession: false } }
    );

    const { data: topic, error: topicError } = await serviceClient
      .from('topics')
      .select('id, name, region, topic_type, keywords, landmarks, postcodes, organizations, negative_keywords, landmark_setup_state, coverage_setup_state')
      .eq('id', topicId)
      .maybeSingle();

    if (topicError || !topic) {
      return new Response(JSON.stringify({ success: false, error: 'Topic not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const cutoff = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();

    // Recent published story titles.
    const { data: recentStories, error: storiesError } = await serviceClient
      .from('stories')
      .select('title, published_at, topic_articles!inner(topic_id)')
      .eq('topic_articles.topic_id', topicId)
      .gte('published_at', cutoff)
      .order('published_at', { ascending: false })
      .limit(250);

    if (storiesError) console.error('Story fetch failed:', storiesError.message);

    // Recent arrivals (awaiting review) titles.
    const { data: recentArrivals, error: arrivalsError } = await serviceClient
      .from('topic_articles')
      .select('created_at, shared_article_content!inner(title)')
      .eq('topic_id', topicId)
      .gte('created_at', cutoff)
      .order('created_at', { ascending: false })
      .limit(250);

    if (arrivalsError) console.error('Arrivals fetch failed:', arrivalsError.message);

    const storyTitles = (recentStories || []).map((s: any) => String(s.title || '')).filter(Boolean);
    const arrivalTitles = (recentArrivals || []).map((a: any) => String(a.shared_article_content?.title || '')).filter(Boolean);
    const allTitles = [...storyTitles, ...arrivalTitles];

    const mined = await mineCandidates(allTitles, topic.name, topic.region || topic.name);
    if (!mined) {
      return new Response(JSON.stringify({ success: true, places: [], terms: [] }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const setupState = (topic.landmark_setup_state || {}) as Record<string, any>;
    const coverageState = (topic.coverage_setup_state || {}) as Record<string, any>;
    const dismissedPlaces: Record<string, true> = setupState?.dismissed || {};
    const dismissedSuggestions: Record<string, true> = coverageState?.dismissedSuggestions || {};

    const existingPlace = new Set([...(topic.landmarks || []), ...(topic.postcodes || [])].map(normalise));
    const existingTerm = new Set([
      ...(topic.keywords || []),
      ...(topic.organizations || []),
      ...(topic.negative_keywords || []),
      ...(Array.isArray(topic.postcodes) ? topic.postcodes : []),
    ].map(normalise));

    const build = (candidates: string[], exclude: Set<string>, dismissed: Record<string, true>): Suggestion[] => {
      const out: Suggestion[] = [];
      for (const raw of candidates) {
        const key = normalise(raw);
        if (!key || exclude.has(key) || dismissed[key]) continue;
        const { count, samples } = countOccurrences(raw, allTitles);
        if (count < 2) continue;
        if (out.some((s) => normalise(s.value) === key)) continue;
        out.push({ value: raw, count, sampleTitles: samples });
        if (out.length >= 8) break;
      }
      return out;
    };

    const wantPlaces = kind === 'all' || kind === 'places';
    const wantTerms = kind === 'all' || kind === 'terms';

    const places = wantPlaces && topic.topic_type === 'regional'
      ? build(mined.places, existingPlace, dismissedPlaces)
      : [];
    const terms = wantTerms
      ? [...build(mined.terms, existingTerm, dismissedSuggestions), ...build(mined.organisations, existingTerm, dismissedSuggestions)]
        .sort((a, b) => b.count - a.count)
        .slice(0, 10)
      : [];

    return new Response(JSON.stringify({ success: true, places, terms, scannedTitles: allTitles.length }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('coverage-suggestions error:', error);
    return new Response(JSON.stringify({ success: false, error: 'Could not gather suggestions' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
