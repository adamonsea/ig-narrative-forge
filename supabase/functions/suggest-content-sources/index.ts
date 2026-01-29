import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.192.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.55.0';

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
}

// Verify user is authenticated and owns the topic
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

  // Verify topic ownership
  const { data: topic, error: topicError } = await supabase
    .from('topics')
    .select('id, owner_id')
    .eq('id', topicId)
    .single();

  if (topicError || !topic) {
    return { userId: null, error: 'Topic not found' };
  }

  if (topic.owner_id !== userId) {
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

    const response = await fetch('https://api.deepseek.com/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${deepseekApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
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
