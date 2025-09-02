import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

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
    const { topicName, description, keywords, topicType, region } = await req.json();

    if (!DEEPSEEK_API_KEY) {
      throw new Error('DEEPSEEK_API_KEY is not configured');
    }

    // Construct the prompt for keyword suggestions
    let prompt = `You are an expert content strategist helping to optimize keyword targeting for a content curation system.

Topic: "${topicName}"
Description: "${description}"
Topic Type: ${topicType}
Current Keywords: ${keywords?.join(', ') || 'None'}`;

    if (region) {
      prompt += `\nRegion: ${region}`;
    }

    prompt += `

TASK: Suggest 10-15 highly relevant keywords that will help identify quality content for this topic. Focus on:

1. Industry-standard terminology (e.g., "medtech" not "medtec")
2. Broad enough to capture relevant content but specific enough to filter noise
3. Include both technical terms and common variations
4. Consider SEO-friendly keyword variations
5. Fix any spelling errors or improve vague terms from current keywords
6. Include synonym variations and related terms

For each keyword suggestion, provide:
- keyword: the exact keyword phrase
- confidence_score: 0.0-1.0 (how confident you are this will find relevant content)
- rationale: brief explanation of why this keyword is valuable

Respond in valid JSON format with this structure:
{
  "suggestions": [
    {
      "keyword": "example keyword",
      "confidence_score": 0.85,
      "rationale": "Industry standard term that will capture..."
    }
  ]
}

Focus on practical keywords that content writers and publishers actually use when writing about this topic.`;

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

    // Validate and clean suggestions
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
      error: error.message
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});