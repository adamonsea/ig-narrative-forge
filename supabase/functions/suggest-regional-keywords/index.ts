import { serve } from "https://deno.land/std@0.192.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface KeywordSuggestion {
  keyword: string;
  confidence: number;
  rationale: string;
}

// Generic keywords that are auto-populated (filter these out from suggestions)
const GENERIC_KEYWORDS = [
  'crime', 'police', 'community', 'council', 'planning',
  'events', 'fire', 'ambulance', 'court', 'development',
  'housing', 'transport', 'business', 'health', 'education',
  'schools', 'hospital', 'traffic', 'parking', 'shops'
];

// Location-specific terms to filter out (should be generic)
const LOCATION_SPECIFIC_TERMS = [
  'brighton', 'eastbourne', 'worthing', 'lewes', 'seaford', 'newhaven',
  'hove', 'portslade', 'shoreham', 'peacehaven', 'telscombe', 'patcham',
  'rottingdean', 'saltdean', 'hangleton', 'falmer', 'bevendean'
];

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { topicType, region, existingKeywords = [] } = await req.json();

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? ''
    );

    console.log(`Suggesting keywords for ${topicType} topic in ${region || 'unknown region'}`);

    // Query keyword_analytics for top regional keywords
    const { data: analytics, error: analyticsError } = await supabaseClient
      .from('keyword_analytics')
      .select('keyword, usage_count, success_metrics')
      .eq('topic_type', 'regional')
      .order('usage_count', { ascending: false })
      .limit(50);

    if (analyticsError) throw analyticsError;

    console.log(`Found ${analytics?.length || 0} keyword candidates`);

    // Filter and score keywords
    const suggestions: KeywordSuggestion[] = (analytics || [])
      .filter(item => {
        const keyword = item.keyword.toLowerCase();
        
        // Filter out generic keywords (already auto-populated for regional topics)
        if (GENERIC_KEYWORDS.includes(keyword)) {
          return false;
        }
        
        // Filter out location-specific terms
        if (LOCATION_SPECIFIC_TERMS.some(term => keyword.includes(term))) {
          return false;
        }
        
        // Filter out already existing keywords
        if (existingKeywords.some((ek: string) => ek.toLowerCase() === keyword)) {
          return false;
        }
        
        return true;
      })
      .map(item => {
        const metrics = item.success_metrics as any;
        const topicsCount = metrics?.topics_count || 1;
        const storyCount = metrics?.story_count || 0;
        
        // Calculate confidence based on usage across topics and success
        const usageScore = Math.min(item.usage_count / 10, 1); // Normalize to 0-1
        const topicsScore = Math.min(topicsCount / 5, 1); // Used by 5+ topics = max score
        const successScore = storyCount > 0 ? 0.3 : 0; // Bonus if generates stories
        
        const confidence = (usageScore * 0.5) + (topicsScore * 0.3) + (successScore * 0.2);
        
        // Generate rationale
        let rationale = `Used by ${topicsCount} regional topic${topicsCount !== 1 ? 's' : ''}`;
        if (storyCount > 0) {
          rationale += `, generates content`;
        }
        if (item.usage_count >= 5) {
          rationale += `, proven high-value keyword`;
        }
        
        return {
          keyword: item.keyword,
          confidence: Math.min(confidence, 0.99), // Cap at 99%
          rationale
        };
      })
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, 25); // Return top 25

    console.log(`Returning ${suggestions.length} keyword suggestions`);

    return new Response(
      JSON.stringify({ suggestions }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Suggestion error:', error);
    return new Response(
      JSON.stringify({ 
        error: error instanceof Error ? error.message : 'Unknown error',
        suggestions: [] 
      }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});
