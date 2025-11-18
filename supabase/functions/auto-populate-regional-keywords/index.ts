import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Generic regional keyword patterns that work across all regions
const UNIVERSAL_PATTERNS = [
  'crime', 'police', 'community', 'council', 'planning', 'events',
  'fire', 'ambulance', 'court', 'development', 'housing', 'transport',
  'business', 'health', 'education', 'schools', 'hospital', 'traffic',
  'parking', 'shops', 'news', 'town centre', 'high street'
];

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { topicId } = await req.json();

    if (!topicId) {
      return new Response(
        JSON.stringify({ error: 'topicId required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get the topic details
    const { data: topic, error: topicError } = await supabase
      .from('topics')
      .select('id, name, region, topic_type, keywords, landmarks, postcodes, organizations')
      .eq('id', topicId)
      .single();

    if (topicError || !topic) {
      console.error('Error fetching topic:', topicError);
      return new Response(
        JSON.stringify({ error: 'Topic not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (topic.topic_type !== 'regional') {
      return new Response(
        JSON.stringify({ error: 'This feature is only for regional topics' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check if this is a test topic (Eastbourne or Kenilworth)
    const isTestTopic = ['eastbourne', 'kenilworth'].includes(topic.region?.toLowerCase() || '');
    
    if (!isTestTopic) {
      // For non-test topics, check if user has premium access
      // For now, we'll allow it but this could be gated
      console.log('Non-test topic - would require premium access in production');
    }

    const region = topic.region || topic.name;
    const existingKeywords = topic.keywords || [];

    // Step 1: Get successful keywords from keyword_analytics (regional topics only)
    const { data: analyticsData } = await supabase
      .from('keyword_analytics')
      .select('keyword, usage_count, success_metrics')
      .eq('topic_type', 'regional')
      .order('usage_count', { ascending: false })
      .limit(100);

    // Step 2: Extract proven patterns (keywords that appear across multiple topics)
    const keywordStats: Record<string, { count: number; topics: number; stories: number }> = {};
    
    if (analyticsData) {
      for (const row of analyticsData) {
        const keyword = row.keyword.toLowerCase();
        const metrics = row.success_metrics as any;
        
        if (!keywordStats[keyword]) {
          keywordStats[keyword] = { count: 0, topics: 0, stories: 0 };
        }
        
        keywordStats[keyword].count += row.usage_count || 0;
        keywordStats[keyword].topics += (metrics?.topic_count || 0);
        keywordStats[keyword].stories += (metrics?.story_count || 0);
      }
    }

    // Step 3: Generate intelligent keyword suggestions
    const suggestions: Array<{
      keyword: string;
      source: 'universal' | 'proven' | 'localized' | 'landmark' | 'organization';
      confidence: number;
      rationale: string;
    }> = [];

    // Add universal patterns
    for (const pattern of UNIVERSAL_PATTERNS) {
      if (!existingKeywords.includes(pattern)) {
        suggestions.push({
          keyword: pattern,
          source: 'universal',
          confidence: 95,
          rationale: 'Universal keyword that works across all regional topics'
        });
      }
    }

    // Add region-specific variations
    const regionLower = region.toLowerCase();
    const regionVariations = [
      `${regionLower} news`,
      `${regionLower} community`,
      `${regionLower} crime`,
      `${regionLower} council`,
      `${regionLower} events`,
      `${regionLower} planning`,
      `${regionLower} development`,
      `${regionLower} business`,
      `${regionLower} town centre`,
      `${regionLower} high street`,
      `${regionLower} transport`,
    ];

    for (const variation of regionVariations) {
      if (!existingKeywords.includes(variation)) {
        suggestions.push({
          keyword: variation,
          source: 'localized',
          confidence: 90,
          rationale: `Localized version of proven pattern for ${region}`
        });
      }
    }

    // Add proven keywords from analytics (but generalized)
    const provenKeywords = Object.entries(keywordStats)
      .filter(([keyword, stats]) => stats.topics >= 2 && stats.stories >= 5)
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, 20);

    for (const [keyword, stats] of provenKeywords) {
      if (!existingKeywords.includes(keyword) && 
          !suggestions.find(s => s.keyword === keyword)) {
        suggestions.push({
          keyword,
          source: 'proven',
          confidence: Math.min(85, 60 + (stats.topics * 5)),
          rationale: `Used successfully across ${stats.topics} regional topics, generated ${stats.stories} stories`
        });
      }
    }

    // Add landmark-based keywords
    if (topic.landmarks && topic.landmarks.length > 0) {
      for (const landmark of topic.landmarks.slice(0, 5)) {
        const landmarkKeyword = landmark.toLowerCase();
        if (!existingKeywords.includes(landmarkKeyword)) {
          suggestions.push({
            keyword: landmarkKeyword,
            source: 'landmark',
            confidence: 80,
            rationale: `Local landmark for ${region}`
          });
        }
      }
    }

    // Add organization-based keywords
    if (topic.organizations && topic.organizations.length > 0) {
      for (const org of topic.organizations.slice(0, 5)) {
        const orgKeyword = org.toLowerCase();
        if (!existingKeywords.includes(orgKeyword)) {
          suggestions.push({
            keyword: orgKeyword,
            source: 'organization',
            confidence: 75,
            rationale: `Local organization for ${region}`
          });
        }
      }
    }

    // Sort by confidence
    suggestions.sort((a, b) => b.confidence - a.confidence);

    console.log(`Generated ${suggestions.length} keyword suggestions for ${region}`);

    return new Response(
      JSON.stringify({ 
        suggestions: suggestions.slice(0, 50), // Limit to top 50
        totalGenerated: suggestions.length,
        region,
        existingCount: existingKeywords.length
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in auto-populate-regional-keywords:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
