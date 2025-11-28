import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.55.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Generic tier-1 keywords by topic type
const TIER_1_KEYWORDS = {
  regional: [
    { keyword: "crime", category: "core", confidence: 0.95, rationale: "Essential for regional news coverage", preSelected: true },
    { keyword: "council", category: "core", confidence: 0.94, rationale: "Local government news is core to regional feeds", preSelected: true },
    { keyword: "planning", category: "core", confidence: 0.92, rationale: "Development and planning applications are key local stories", preSelected: true },
    { keyword: "traffic", category: "core", confidence: 0.90, rationale: "Traffic and transport updates are highly relevant locally", preSelected: true },
    { keyword: "business", category: "core", confidence: 0.88, rationale: "Local business news drives community engagement", preSelected: true },
    { keyword: "education", category: "core", confidence: 0.87, rationale: "Schools and education are vital to local communities", preSelected: true },
    { keyword: "health", category: "core", confidence: 0.86, rationale: "Healthcare and NHS news affects local residents", preSelected: true },
    { keyword: "weather", category: "core", confidence: 0.85, rationale: "Local weather impacts daily life", preSelected: true },
  ],
  keyword: [
    { keyword: "news", category: "core", confidence: 0.90, rationale: "General news coverage", preSelected: true },
    { keyword: "updates", category: "core", confidence: 0.88, rationale: "Latest updates and developments", preSelected: true },
    { keyword: "trends", category: "niche", confidence: 0.85, rationale: "Trending topics in your area of interest", preSelected: true },
    { keyword: "analysis", category: "niche", confidence: 0.82, rationale: "In-depth analysis and insights", preSelected: true },
  ],
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { topicName, description, topicType, region } = await req.json();

    if (!topicName || !topicType) {
      return new Response(
        JSON.stringify({ error: 'topicName and topicType are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);
    const DEEPSEEK_API_KEY = Deno.env.get('DEEPSEEK_API_KEY');

    // Step 1: Return tier-1 keywords immediately
    const tier1Keywords = TIER_1_KEYWORDS[topicType as keyof typeof TIER_1_KEYWORDS] || [];
    
    // Add regional variations if it's a regional topic
    const regionalKeywords = [];
    if (topicType === 'regional' && region) {
      const regionLower = region.toLowerCase();
      regionalKeywords.push(
        { keyword: `${regionLower} news`, category: "local", confidence: 0.93, rationale: `${region}-specific news coverage`, preSelected: true },
        { keyword: `${regionLower} events`, category: "local", confidence: 0.88, rationale: `Local events in ${region}`, preSelected: true },
        { keyword: `${regionLower} community`, category: "local", confidence: 0.86, rationale: `Community stories from ${region}`, preSelected: true },
      );
    }

    const allKeywords: any[] = [...tier1Keywords, ...regionalKeywords];

    // Step 2: Fetch proven keywords from analytics (parallel)
    try {
      const { data: provenKeywords } = await supabase
        .from('keyword_analytics')
        .select('keyword, success_metrics')
        .eq('topic_type', topicType)
        .order('usage_count', { ascending: false })
        .limit(15);

      if (provenKeywords) {
        for (const kw of provenKeywords) {
          const metrics = kw.success_metrics as any;
          const confidence = Math.min(0.95, 0.7 + (metrics?.story_count || 0) * 0.01);
          
          // Avoid duplicates
          if (!allKeywords.find(k => k.keyword.toLowerCase() === kw.keyword.toLowerCase())) {
            allKeywords.push({
              keyword: kw.keyword,
              category: "discovery",
              confidence,
              rationale: `Proven keyword with ${metrics?.story_count || 0} successful stories`,
              preSelected: confidence > 0.80,
            });
          }
        }
      }
    } catch (error) {
      console.log('Failed to fetch proven keywords:', error);
    }

    // Step 3: AI-enhanced keywords (if DeepSeek available)
    if (DEEPSEEK_API_KEY) {
      try {
        const existingKeywords = allKeywords.map(k => k.keyword);
        const prompt = `You are a keyword generation expert for a news curation platform.

Topic Name: "${topicName}"
Topic Type: ${topicType}
${region ? `Region: ${region}` : ''}
${description ? `Description: ${description}` : ''}

Generate 15-20 highly relevant keywords for this topic that would help match news articles.

Existing keywords to avoid duplicating: ${existingKeywords.join(', ')}

Focus on:
${topicType === 'regional' ? `
- Local landmarks, neighborhoods, and places in ${region}
- Regional organizations and institutions
- Local government terms
- Area-specific events and activities
` : `
- Industry-specific terminology
- Related concepts and synonyms
- Trending terms in this domain
- Niche subcategories
`}

Return ONLY a valid JSON array of keyword objects with this exact structure:
[
  {
    "keyword": "string (2-30 characters)",
    "category": "local" | "niche" | "discovery",
    "confidence": number (0.70-0.95),
    "rationale": "string (10-50 words explaining relevance)"
  }
]

Ensure:
- Keywords are specific and actionable
- Confidence scores reflect actual relevance
- Rationales are concise but informative
- No duplicates with existing keywords
- Return pure JSON array, no markdown formatting`;

        const aiResponse = await fetch('https://api.deepseek.com/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${DEEPSEEK_API_KEY}`,
          },
          body: JSON.stringify({
            model: 'deepseek-chat',
            messages: [
              { role: 'system', content: 'You are a keyword generation expert. Return only valid JSON.' },
              { role: 'user', content: prompt }
            ],
            temperature: 0.7,
            max_tokens: 2000,
          }),
        });

        if (aiResponse.ok) {
          const aiData = await aiResponse.json();
          const content = aiData.choices[0]?.message?.content || '[]';
          
          // Try to extract JSON from markdown code blocks if present
          let jsonContent = content;
          const jsonMatch = content.match(/```(?:json)?\s*(\[[\s\S]*?\])\s*```/);
          if (jsonMatch) {
            jsonContent = jsonMatch[1];
          }
          
          const aiKeywords = JSON.parse(jsonContent);
          
          if (Array.isArray(aiKeywords)) {
            for (const kw of aiKeywords) {
              if (kw.keyword && !allKeywords.find(k => k.keyword.toLowerCase() === kw.keyword.toLowerCase())) {
                allKeywords.push({
                  keyword: kw.keyword,
                  category: kw.category || 'discovery',
                  confidence: kw.confidence || 0.75,
                  rationale: kw.rationale || 'AI-suggested relevant keyword',
                  preSelected: (kw.confidence || 0.75) > 0.80,
                });
              }
            }
          }
        }
      } catch (error) {
        console.log('AI keyword generation failed:', error);
      }
    }

    // Calculate metadata
    const categoryCounts = {
      core: allKeywords.filter(k => k.category === 'core').length,
      local: allKeywords.filter(k => k.category === 'local').length,
      niche: allKeywords.filter(k => k.category === 'niche').length,
      discovery: allKeywords.filter(k => k.category === 'discovery').length,
    };

    const response = {
      keywords: allKeywords,
      metadata: {
        totalGenerated: allKeywords.length,
        ...categoryCounts,
        preSelectedCount: allKeywords.filter(k => k.preSelected).length,
      },
    };

    return new Response(
      JSON.stringify(response),
      { 
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );

  } catch (error) {
    console.error('Error generating keywords:', error);
    return new Response(
      JSON.stringify({ 
        error: 'Failed to generate keywords',
        details: error instanceof Error ? error.message : 'Unknown error'
      }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});
