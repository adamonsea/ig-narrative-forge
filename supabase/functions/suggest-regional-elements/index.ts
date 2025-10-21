import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.192.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const DEEPSEEK_API_KEY = Deno.env.get('DEEPSEEK_API_KEY');

interface RegionalElementSuggestion {
  element: string;
  type: 'landmark' | 'postcode' | 'organization';
  confidence_score: number;
  rationale: string;
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { 
      topicName, 
      region, 
      description, 
      keywords = [], 
      existingLandmarks = [], 
      existingPostcodes = [], 
      existingOrganizations = [],
      elementType // 'landmarks', 'postcodes', 'organizations', or 'all'
    } = await req.json();

    if (!DEEPSEEK_API_KEY) {
      throw new Error('DEEPSEEK_API_KEY is not configured');
    }

    if (!region) {
      throw new Error('Region is required for regional element suggestions');
    }

    // Construct the prompt based on element type
    let prompt = `You are an expert local knowledge specialist helping to identify relevant regional elements for content curation in ${region}.

Topic: "${topicName}"
Region: ${region}
Description: "${description || 'No description provided'}"
Content Keywords: ${keywords.join(', ') || 'None'}

Current Elements:
- Landmarks: ${existingLandmarks.join(', ') || 'None'}
- Postcodes: ${existingPostcodes.join(', ') || 'None'} 
- Organizations: ${existingOrganizations.join(', ') || 'None'}

CRITICAL: DO NOT suggest any elements that are already in the current lists above.

TASK: Suggest ${elementType === 'all' ? '8-12' : '5-8'} highly relevant regional elements that will help identify local content for this topic. Focus on:`;

    if (elementType === 'landmarks' || elementType === 'all') {
      prompt += `

**LANDMARKS & PLACES:**
1. **Local landmarks**: Parks, beaches, piers, historic buildings, monuments
2. **Geographic features**: Hills, rivers, roads, districts, neighborhoods  
3. **Transport hubs**: Railway stations, bus stations, car parks
4. **Popular venues**: Shopping centers, markets, sports facilities, churches
5. **Natural features**: Nature reserves, woodland areas, clifftops
6. **Infrastructure**: Bridges, roundabouts, notable buildings`;
    }

    if (elementType === 'postcodes' || elementType === 'all') {
      prompt += `

**POSTCODES:**
1. **Primary postcodes**: Main postcode areas covering the region
2. **District codes**: Specific district identifiers (e.g., TN38, BN21)
3. **Sector codes**: More specific area codes if relevant
4. **Neighboring areas**: Adjacent postcodes that might have relevant content`;
    }

    if (elementType === 'organizations' || elementType === 'all') {
      prompt += `

**ORGANIZATIONS & INSTITUTIONS:**
1. **Local government**: Council, borough offices, civic centers
2. **Healthcare**: Hospitals, GP practices, health centers, care homes
3. **Education**: Schools, colleges, universities, libraries
4. **Emergency services**: Fire stations, police stations
5. **Business & commerce**: Major employers, local businesses, chambers of commerce
6. **Community groups**: Charities, clubs, associations, volunteer groups
7. **Religious institutions**: Churches, mosques, temples, community centers`;
    }

    prompt += `

For each suggestion, provide:
- element: the exact name/identifier
- type: "landmark", "postcode", or "organization" 
- confidence_score: 0.0-1.0 (how likely this will help find relevant local content)
- rationale: brief explanation of why this element is valuable for content discovery

Focus on elements that are:
- Frequently mentioned in local news and community content
- Well-known to local residents
- Likely to appear in articles about ${region}
- Specific enough to filter content effectively

Respond in valid JSON format:
{
  "suggestions": [
    {
      "element": "Eastbourne Pier",
      "type": "landmark",
      "confidence_score": 0.95,
      "rationale": "Iconic landmark frequently mentioned in local news and tourism content"
    }
  ]
}`;

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
            content: 'You are a local knowledge expert specializing in regional content identification. Always respond with valid JSON only.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.3,
        max_tokens: 2500
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
      const cleanedContent = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      parsedResponse = JSON.parse(cleanedContent);
    } catch (parseError) {
      console.error('Failed to parse DeepSeek response:', content);
      throw new Error('Failed to parse AI response as JSON');
    }

    // Normalize existing elements for comparison
    const allExistingElements = [
      ...existingLandmarks,
      ...existingPostcodes,
      ...existingOrganizations
    ].map(e => e.toLowerCase().trim());

    // Validate and clean suggestions, filtering out duplicates
    const suggestions: RegionalElementSuggestion[] = (parsedResponse.suggestions || [])
      .filter((suggestion: any) => 
        suggestion.element && 
        suggestion.type &&
        ['landmark', 'postcode', 'organization'].includes(suggestion.type) &&
        typeof suggestion.confidence_score === 'number' &&
        suggestion.rationale
      )
      .map((suggestion: any) => ({
        element: suggestion.element.trim(),
        type: suggestion.type,
        confidence_score: Math.min(1.0, Math.max(0.0, suggestion.confidence_score)),
        rationale: suggestion.rationale
      }))
      .filter((suggestion: RegionalElementSuggestion) => 
        // Remove duplicates by checking against all existing elements
        !allExistingElements.includes(suggestion.element.toLowerCase().trim())
      )
      .slice(0, 12); // Limit to 12 suggestions

    return new Response(JSON.stringify({
      success: true,
      suggestions,
      context: {
        topicName,
        region,
        elementType,
        totalSuggestions: suggestions.length
      }
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in suggest-regional-elements function:', error);
    return new Response(JSON.stringify({
      success: false,
      error: error instanceof Error ? error.message : String(error)
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});