import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.192.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.55.0';
import { llmFetch } from '../_shared/llm-router.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const deepseekApiKey = Deno.env.get('DEEPSEEK_API_KEY');
const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;

interface SourceSuggestion {
  url: string;
  source_name: string;
  type: 'RSS' | 'News' | 'Blog' | 'Publication' | 'Official';
  confidence_score: number;
  rationale: string;
  verified?: boolean;
  feed_url?: string | null;
}

const UA = 'Mozilla/5.0 (compatible; CuratrSourceFinder/1.0; +https://curatr.pro)';

async function fetchWithTimeout(url: string, ms = 6000, method: 'GET' | 'HEAD' = 'GET') {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, {
      method,
      redirect: 'follow',
      signal: ctrl.signal,
      headers: { 'User-Agent': UA, 'Accept': 'application/rss+xml, application/xml, text/xml, text/html;q=0.8' },
    });
  } finally {
    clearTimeout(t);
  }
}

function looksLikeFeed(body: string, contentType: string) {
  if (/xml|rss|atom/i.test(contentType)) {
    return /<rss[\s>]|<feed[\s>]|<rdf:RDF/i.test(body);
  }
  return /^\s*(<\?xml|<rss|<feed)/i.test(body);
}

/** Try to resolve a working RSS/Atom feed for a candidate URL. */
async function resolveFeed(rawUrl: string): Promise<{ reachable: boolean; feedUrl: string | null }> {
  let base: URL;
  try {
    base = new URL(rawUrl.startsWith('http') ? rawUrl : `https://${rawUrl}`);
  } catch {
    return { reachable: false, feedUrl: null };
  }

  // 1) The suggested URL itself
  let homepageHtml = '';
  try {
    const res = await fetchWithTimeout(base.toString());
    if (res.ok) {
      const ct = res.headers.get('content-type') || '';
      const body = (await res.text()).slice(0, 200_000);
      if (looksLikeFeed(body, ct)) return { reachable: true, feedUrl: res.url || base.toString() };
      homepageHtml = body;
    }
  } catch (_) { /* fall through */ }

  // 2) <link rel="alternate" type="application/rss+xml">
  const linkMatch = homepageHtml.match(
    /<link[^>]+type=["']application\/(?:rss|atom)\+xml["'][^>]*>/gi
  );
  const candidates: string[] = [];
  if (linkMatch) {
    for (const tag of linkMatch.slice(0, 3)) {
      const href = tag.match(/href=["']([^"']+)["']/i)?.[1];
      if (href) candidates.push(new URL(href, base).toString());
    }
  }

  // 3) Common feed paths
  const origin = base.origin;
  candidates.push(
    `${origin}/feed/`,
    `${origin}/rss`,
    `${origin}/rss.xml`,
    `${origin}/feed.xml`,
    `${origin}/atom.xml`,
    `${origin}/index.xml`,
  );

  for (const candidate of [...new Set(candidates)]) {
    try {
      const res = await fetchWithTimeout(candidate, 5000);
      if (!res.ok) continue;
      const ct = res.headers.get('content-type') || '';
      const body = (await res.text()).slice(0, 100_000);
      if (looksLikeFeed(body, ct)) return { reachable: true, feedUrl: res.url || candidate };
    } catch (_) { /* next */ }
  }

  return { reachable: homepageHtml.length > 0, feedUrl: null };
}

// Verify user is authenticated and owns the topic
async function verifyTopicOwnership(authHeader: string, topicId?: string | null): Promise<{ userId: string | null; error: string | null }> {
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

  // Discovery mode: the topic doesn't exist yet (create-feed wizard).
  // Any authenticated user may request suggestions.
  if (!topicId) {
    return { userId, error: null };
  }

  // Verify topic ownership
  const { data: topic, error: topicError } = await supabase
    .from('topics')
    .select('id, created_by')
    .eq('id', topicId)
    .single();

  if (topicError || !topic) {
    return { userId: null, error: 'Topic not found' };
  }

  if (topic.created_by !== userId) {
    // Check if user is admin
    const { data: isAdmin } = await supabase.rpc('has_role', { _user_id: userId, _role: 'admin' });
    if (!isAdmin) {
      return { userId: null, error: 'Not authorized to manage this topic' };
    }
  }

  return { userId, error: null };
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { topicId, topicName, description, keywords, topicType, region } = await req.json();

    // Verify authentication and topic ownership
    const authHeader = req.headers.get('Authorization') || '';
    const { userId, error: authError } = await verifyTopicOwnership(authHeader, topicId);
    
    if (authError) {
      console.error('🔒 Authorization failed:', authError);
      return new Response(JSON.stringify({
        success: false,
        error: authError,
        suggestions: []
      }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`🔑 Authorized user ${userId} for topic ${topicId}`);
    console.log('🔍 Generating source suggestions for:', { topicName, topicType, region });

    if (!deepseekApiKey) {
      throw new Error('DeepSeek API key not configured');
    }

    // Build context for DeepSeek
    const context = `
Topic: ${topicName}
Description: ${description || 'No description provided'}
Keywords: ${keywords || 'No keywords provided'}
Type: ${topicType}
${region ? `Region: ${region}` : ''}
    `.trim();

    const prompt = `Based on this content topic information:

${context}

Suggest 8-10 high-quality, RELIABLE content sources that would be excellent for gathering relevant articles. 

CRITICAL: Web scraping is unreliable - RSS feeds are the gold standard!

PRIORITIZE (in order):
1. **RSS FEEDS FIRST** - Always look for /rss, /feed, /rss.xml endpoints
2. WordPress sites (built-in RSS at /feed/)
3. Substack newsletters (built-in RSS feeds)
4. Official .gov and .org sites with RSS
5. Major news organizations with RSS (BBC, Reuters, AP)
6. Well-maintained local newspapers with RSS feeds

WHY RSS MATTERS:
- Structured, predictable content format
- No anti-scraping blocks
- Updated timestamps for freshness
- Consistent article structure

AVOID suggesting:
- Sites without RSS (web scraping is hit-and-miss)
- Facebook, Twitter, Instagram (blocked)
- Small independent sites
- Sites known to block scrapers
- Paywalled content

SUGGEST RSS URLs directly when possible (e.g., example.com/feed/ rather than just example.com)

For each source, provide exactly this JSON format:
{
  "url": "full RSS feed URL when possible (https://...)",
  "source_name": "Clear, concise source name",
  "type": "RSS|News|Blog|Publication|Official|WordPress|Substack",
  "confidence_score": 1-100,
  "rationale": "Brief reason - mention RSS if available (max 50 characters)"
}

Return ONLY a valid JSON array of suggestions, no other text or formatting.`;

    const response = await llmFetch({
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${deepseekApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'deepseek-v4-flash',
        messages: [
          {
            role: 'system',
            content: 'You are a content sourcing expert. Return only valid JSON arrays with no additional text or markdown formatting.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.7,
        max_tokens: 2000,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('DeepSeek API error:', response.status, errorText);
      throw new Error(`DeepSeek API error: ${response.status} ${errorText}`);
    }

    const data = await response.json();
    const aiResponse = data.choices[0].message.content;
    
    console.log('🤖 DeepSeek raw response:', aiResponse);

    // Parse the AI response as JSON
    let suggestions: SourceSuggestion[];
    try {
      // Clean the response in case there's markdown formatting
      const cleanedResponse = aiResponse.replace(/```json\n?/, '').replace(/```\n?$/, '');
      suggestions = JSON.parse(cleanedResponse);
    } catch (parseError) {
      console.error('Failed to parse AI response as JSON:', parseError, aiResponse);
      throw new Error('Invalid JSON response from AI');
    }

    // Validate and clean suggestions
    const validSuggestions = suggestions
      .filter(s => s.url && s.source_name && s.type && s.confidence_score)
      .map(s => ({
        ...s,
        confidence_score: Math.min(100, Math.max(1, s.confidence_score)),
        rationale: s.rationale?.substring(0, 50) || 'Relevant source'
      }))
      .slice(0, 10); // Limit to 10 suggestions

    console.log(`✅ Generated ${validSuggestions.length} source suggestions`);

    return new Response(JSON.stringify({ 
      success: true,
      suggestions: validSuggestions,
      context: { topicName, topicType, region }
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200
    });

  } catch (error) {
    console.error('Error in suggest-content-sources function:', error);
    return new Response(JSON.stringify({ 
      success: false,
      error: (error instanceof Error ? error.message : String(error)) || 'Failed to generate source suggestions',
      suggestions: []
    }), {
      status: 200, // Changed from 500 to avoid CORS issues
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
