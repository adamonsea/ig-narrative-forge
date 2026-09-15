import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.192.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.55.0';
import { llmFetch } from '../_shared/llm-router.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const DEEPSEEK_API_KEY = Deno.env.get('DEEPSEEK_API_KEY');
const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;

interface RegionalElementSuggestion {
  element: string;
  type: 'landmark' | 'postcode' | 'organization';
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

  if (!topicId || typeof topicId !== 'string') {
    return { userId: null, error: 'A topic id is required' };
  }

  // Ownership is looked up with the service role so a restrictive row policy
  // can't make an owner's own topic look missing. The claims check above is
  // what authenticates the caller.
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
    // Check if user is admin
    const { data: isAdmin } = await serviceClient.rpc('has_role', { _user_id: userId, _role: 'admin' });
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
    const { 
      topicId,
      topicName, 
      region, 
      description, 
      keywords = [], 
      existingLandmarks = [], 
      existingPostcodes = [], 
      existingOrganizations = [],
      elementType, // 'landmarks', 'postcodes', 'organizations', or 'all'
      mode, // optional: 'describe' returns a visual description of one landmark
      landmark, // the landmark name to describe when mode === 'describe'
      imageUrls // optional reference photographs to describe from
    } = await req.json();

    // Verify authentication and topic ownership
    const authHeader = req.headers.get('Authorization') || '';
    const { userId, error: authError } = await verifyTopicOwnership(authHeader, topicId);
    
    if (authError) {
      console.error('🔒 Authorization failed:', authError);
      return new Response(JSON.stringify({
        success: false,
        error: authError
      }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`🔑 Authorized user ${userId} for topic ${topicId}`);

    if (!DEEPSEEK_API_KEY && !Deno.env.get('LOVABLE_API_KEY')) {
      throw new Error('DEEPSEEK_API_KEY is not configured');
    }

    if (!region) {
      throw new Error('Region is required for regional element suggestions');
    }

    // ---- Describe mode: one landmark's visual appearance, for illustration accuracy ----
    if (mode === 'describe') {
      if (!landmark || typeof landmark !== 'string') {
        throw new Error('A landmark name is required to describe it');
      }

      const describePrompt = `Describe how "${landmark}" in ${region} actually looks, for an illustrator who has never seen it.

RULES:
- One sentence, 25-45 words, plain British English.
- Only big, visible, verifiable features: overall massing and shape, roofline, number of storeys, materials and colours, window pattern, setting (seafront, high street, park).
- No history, no opinions, no atmosphere, no people, no small ornament.
- If you are not confident about this specific building, describe only what you are sure of.

Return the sentence only, with no quotes and no preamble.`;

      // If the owner has saved reference photographs, describe what is actually
      // in them rather than working from memory. Fail-open: any problem with the
      // vision call falls back to the text-only description below.
      const photoUrls: string[] = Array.isArray(imageUrls)
        ? imageUrls.filter((u: unknown) => typeof u === 'string' && /^https?:\/\//i.test(u)).slice(0, 3)
        : [];
      const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY');

      if (photoUrls.length > 0 && OPENAI_API_KEY) {
        try {
          const visionRes = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${OPENAI_API_KEY}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              model: 'gpt-4o-mini',
              messages: [
                { role: 'system', content: 'You are a precise architectural describer. Reply with one plain sentence.' },
                {
                  role: 'user',
                  content: [
                    {
                      type: 'text',
                      text: `${describePrompt}\n\nDescribe ONLY what is visible in the attached photograph(s) of "${landmark}".`,
                    },
                    ...photoUrls.map((url) => ({ type: 'image_url', image_url: { url } })),
                  ],
                },
              ],
              temperature: 0.2,
            }),
          });
          const visionData = await visionRes.json();
          if (visionRes.ok) {
            const visionDescription = (visionData.choices?.[0]?.message?.content || '')
              .replace(/^["'\s]+|["'\s]+$/g, '')
              .slice(0, 400);
            if (visionDescription) {
              return new Response(JSON.stringify({ success: true, description: visionDescription }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
              });
            }
          } else {
            console.warn('Vision description failed:', visionData?.error?.message);
          }
        } catch (visionError) {
          console.warn('Vision description error, falling back to text:', visionError);
        }
      }

      const describeRes = await llmFetch({
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${DEEPSEEK_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'deepseek-v4-flash',
          messages: [
            { role: 'system', content: 'You are a precise architectural describer. Reply with one plain sentence.' },
            { role: 'user', content: describePrompt }
          ],
          temperature: 0.2,
          max_tokens: 200
        }),
      });

      const describeData = await describeRes.json();
      if (!describeRes.ok) {
        throw new Error(`Description failed: ${describeData.error?.message || 'Unknown error'}`);
      }

      const description = (describeData.choices?.[0]?.message?.content || '')
        .replace(/^["'\s]+|["'\s]+$/g, '')
        .slice(0, 400);

      return new Response(JSON.stringify({ success: true, description }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
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
    const response = await llmFetch({
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${DEEPSEEK_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'deepseek-v4-flash',
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
