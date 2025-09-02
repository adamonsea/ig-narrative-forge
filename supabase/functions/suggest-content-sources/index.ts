import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.55.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const deepseekApiKey = Deno.env.get('DEEPSEEK_API_KEY');
const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

interface SourceSuggestion {
  url: string;
  source_name: string;
  type: 'RSS' | 'News' | 'Blog' | 'Publication' | 'Official';
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

Suggest 8-10 high-quality, regularly updated content sources that would be excellent for scraping relevant articles. Focus on sources that:

1. Are actively maintained and regularly updated
2. Have good content quality and credibility  
3. Are scrapeable via RSS feeds or standard web scraping
4. Match the topic focus precisely
5. Include a mix of RSS feeds, news websites, industry blogs, and publication sites

For each source, provide exactly this JSON format:
{
  "url": "full URL including https://",
  "source_name": "Clear, concise source name",
  "type": "RSS|News|Blog|Publication|Official",
  "confidence_score": 1-100,
  "rationale": "Brief reason why this source is relevant (max 50 characters)"
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
      suggestions: validSuggestions,
      context: { topicName, topicType, region }
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in suggest-content-sources function:', error);
    return new Response(JSON.stringify({ 
      error: error.message || 'Failed to generate source suggestions',
      suggestions: []
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});