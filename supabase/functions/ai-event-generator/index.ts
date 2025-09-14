import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const supabase = createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
);

const openAIApiKey = Deno.env.get('OPENAI_API_KEY');

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { topicId, eventTypes, region } = await req.json();
    
    console.log('🎪 Generating events for topic:', topicId, 'region:', region, 'types:', eventTypes);

    if (!topicId || !eventTypes || eventTypes.length === 0) {
      throw new Error('Missing required parameters: topicId and eventTypes');
    }

    // Get topic details
    const { data: topic, error: topicError } = await supabase
      .from('topics')
      .select('*')
      .eq('id', topicId)
      .single();

    if (topicError || !topic) {
      throw new Error('Topic not found');
    }

    // Create AI prompt for event generation
    const eventTypesText = eventTypes.join(', ');
    const regionText = region || topic.region || 'the local area';
    
    const prompt = `You are an expert event curator for ${regionText}. Generate exactly 15 high-quality, interesting events happening in the next 7 days for the following categories: ${eventTypesText}.

IMPORTANT REQUIREMENTS:
- Only include events that are genuinely interesting and worth attending
- NO gym sessions, yoga classes, regular fitness classes, or routine activities
- Focus on: concerts, art exhibitions, comedy shows, theater performances, special cultural events, festivals, unique workshops
- Each event must include: title, description (max 100 words), date (YYYY-MM-DD format), location, and source URL if available
- Prefer real, specific venues and events
- Make descriptions engaging but factual
- If you can't find 15 quality events, generate fewer rather than including low-quality ones

Return ONLY a JSON array with this exact format:
[
  {
    "title": "Event Title",
    "description": "Brief engaging description of the event",
    "start_date": "2025-01-20",
    "location": "Venue Name, Address",
    "event_type": "music|comedy|shows|musicals|art_exhibitions|events",
    "source_url": "https://example.com/event-page",
    "source_name": "Source Website Name"
  }
]

Generate events for ${regionText} happening in the next week.`;

    // Call OpenAI API
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openAIApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: 'You are an expert event curator. Always return valid JSON arrays only.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        max_tokens: 2000,
        temperature: 0.7,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ OpenAI API error:', errorText);
      throw new Error(`OpenAI API error: ${response.status}`);
    }

    const aiData = await response.json();
    const generatedText = aiData.choices[0].message.content;
    
    console.log('🤖 AI Response:', generatedText);

    // Parse AI response
    let events;
    try {
      events = JSON.parse(generatedText);
    } catch (parseError) {
      console.error('❌ Failed to parse AI response as JSON:', parseError);
      // Try to extract JSON from the response
      const jsonMatch = generatedText.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        events = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error('Could not extract valid JSON from AI response');
      }
    }

    if (!Array.isArray(events)) {
      throw new Error('AI response is not an array');
    }

    // Clear existing events for this topic
    const { error: deleteError } = await supabase
      .from('events')
      .update({ status: 'deleted' })
      .eq('topic_id', topicId);

    if (deleteError) {
      console.error('❌ Error clearing existing events:', deleteError);
    }

    // Insert new events with ranking
    const eventsToInsert = events.slice(0, 15).map((event, index) => ({
      topic_id: topicId,
      title: event.title || 'Untitled Event',
      description: event.description || '',
      start_date: event.start_date || new Date().toISOString().split('T')[0],
      end_date: event.end_date || null,
      location: event.location || '',
      source_url: event.source_url || null,
      source_name: event.source_name || 'AI Generated',
      event_type: event.event_type || 'events',
      rank_position: index + 1, // Rank 1-15, top 5 will be shown
    }));

    const { data: insertedEvents, error: insertError } = await supabase
      .from('events')
      .insert(eventsToInsert)
      .select();

    if (insertError) {
      console.error('❌ Error inserting events:', insertError);
      throw insertError;
    }

    console.log('✅ Successfully generated and inserted', insertedEvents?.length || 0, 'events');

    return new Response(
      JSON.stringify({
        success: true,
        message: `Successfully generated ${insertedEvents?.length || 0} events`,
        events: insertedEvents?.slice(0, 5) || [], // Return top 5 for preview
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('❌ Error in ai-event-generator function:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message,
        details: error.stack
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});