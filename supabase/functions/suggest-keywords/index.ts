import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.192.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const DEEPSEEK_API_KEY = Deno.env.get('DEEPSEEK_API_KEY');

interface KeywordSuggestion {
  keyword: string;
  confidence_score: number;
  rationale: string;
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { topicId, topicName, description, keywords, topicType, region, existingKeywords = [], publishedStories = [], topicSources = [] } = await req.json();

    if (!DEEPSEEK_API_KEY) {
      throw new Error('DEEPSEEK_API_KEY is not configured');
    }

    // Construct context from published stories and sources
    let publishedContext = '';
    if (publishedStories.length > 0) {
      const storyKeywords = publishedStories
        .flatMap((story: any) => story.keywords || [])
        .filter(Boolean);
      const storyTitles = publishedStories.map((story: any) => story.title).join(', ');
      
      publishedContext = `
Published Story Context (Topic-Specific):
- Recent story titles: ${storyTitles}
- Keywords from published stories: ${storyKeywords.join(', ')}`;
    }

    // Add source context when no published stories available
    let sourceContext = '';
    if (publishedStories.length === 0 && topicSources.length > 0) {
      const sourceNames = topicSources
        .map((ts: any) => ts.content_sources?.source_name || ts.content_sources?.canonical_domain)
        .filter(Boolean);
      
      sourceContext = `
Topic Sources Context:
- Content sources: ${sourceNames.join(', ')}
- Use these sources to understand what type of content this topic focuses on`;
    }

    // Construct the prompt for keyword suggestions
    let prompt = `You are an expert content strategist helping to optimize keyword targeting for a content curation system.

Topic: "${topicName}"
Description: "${description}"
Topic Type: ${topicType}
Current Keywords: ${keywords?.join(', ') || 'None'}
Already Added Keywords: ${existingKeywords.join(', ') || 'None'}`;

    if (region) {
      prompt += `\nRegion: ${region}`;
    }

    if (publishedContext) {
      prompt += publishedContext;
    }

    if (sourceContext) {
      prompt += sourceContext;
    }

    prompt += `

CRITICAL: DO NOT suggest any keywords that are already in "Current Keywords" or "Already Added Keywords" lists above.

TASK: Suggest 10-15 highly relevant keywords that will help identify quality content for this topic. Focus on:

1. **Learn from existing keywords**: Look at the patterns in already added keywords (e.g., if "st leonards on sea" is added, suggest related coastal terms, neighboring areas, local landmarks)
2. **Build on published content**: Use insights from recent successful stories to suggest complementary keywords
3. **Industry-standard terminology**: Use proper spellings and standard terms
4. **Contextual expansion**: If regional keywords exist, suggest related places, local terms, and geographic variations
5. **Semantic relationships**: Find synonyms, related concepts, and natural language variations
6. **NO DUPLICATES**: Never suggest keywords that already exist in any form

For each keyword suggestion, provide:
- keyword: the exact keyword phrase
- confidence_score: 0.0-1.0 (how confident you are this will find relevant content)
- rationale: brief explanation of why this keyword is valuable and how it relates to existing keywords

Respond in valid JSON format with this structure:
{
  "suggestions": [
    {
      "keyword": "example keyword",
      "confidence_score": 0.85,
      "rationale": "Complements existing 'st leonards on sea' keyword by targeting nearby coastal area..."
    }
  ]
}

Focus on expanding and building upon what has already been successful rather than repeating existing terms.`;

    // Call DeepSeek API
    const response = await fetch('https://api.deepseek.com/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${DEEPSEEK_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages: [
          {
            role: 'system',
            content: 'You are an expert content strategist and keyword research specialist. Always respond with valid JSON only.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.3,
        max_tokens: 2000
      }),
    });

    const data = await response.json();
    
    if (!response.ok) {
      throw new Error(`DeepSeek API error: ${data.error?.message || 'Unknown error'}`);
    }

    const content = data.choices[0].message.content;
    
    // Parse the JSON response
    let parsedResponse;
    try {
      // Clean the response in case there are markdown code blocks
      const cleanedContent = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      parsedResponse = JSON.parse(cleanedContent);
    } catch (parseError) {
      console.error('Failed to parse DeepSeek response:', content);
      throw new Error('Failed to parse AI response as JSON');
    }

    // Normalize existing keywords for comparison
    const allExistingKeywords = [
      ...(keywords || []),
      ...(existingKeywords || [])
    ].map(k => k.toLowerCase().trim());

    // Validate and clean suggestions, filtering out duplicates
    const suggestions: KeywordSuggestion[] = (parsedResponse.suggestions || [])
      .filter((suggestion: any) => 
        suggestion.keyword && 
        typeof suggestion.confidence_score === 'number' &&
        suggestion.rationale
      )
      .map((suggestion: any) => ({
        keyword: suggestion.keyword.toLowerCase().trim(),
        confidence_score: Math.min(1.0, Math.max(0.0, suggestion.confidence_score)),
        rationale: suggestion.rationale
      }))
      .filter((suggestion: KeywordSuggestion) => 
        // Remove duplicates by checking against all existing keywords
        !allExistingKeywords.includes(suggestion.keyword.toLowerCase().trim())
      )
      .slice(0, 15); // Limit to 15 suggestions

    return new Response(JSON.stringify({
      success: true,
      suggestions,
      context: {
        topicName,
        topicType,
        originalKeywordCount: keywords?.length || 0
      }
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in suggest-keywords function:', error);
    return new Response(JSON.stringify({
      success: false,
      error: error instanceof Error ? error.message : String(error)
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});