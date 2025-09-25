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
    
    // Get current date and calculate future dates
    const now = new Date();
    const today = now.toISOString().split('T')[0]; // YYYY-MM-DD format
    const nextWeek = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    const exampleDate = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]; // 3 days from now
    
    const prompt = `You are an expert event curator for ${regionText}. You excel at finding both POPULAR high-profile events AND hidden gems that locals would love to discover.

TODAY'S DATE: ${today}

Generate exactly 15 diverse, compelling events happening between ${today} and ${nextWeek.toISOString().split('T')[0]} (next 7 days) for: ${eventTypesText}.

CRITICAL REQUIREMENTS:
🗓️ DATES: ALL events MUST be ${today} to ${nextWeek.toISOString().split('T')[0]} (YYYY-MM-DD format only)
🎯 QUALITY: Mix of popular events (70%) and hidden gems (30%) - no routine classes or generic activities
💰 PRICING: Include realistic price information (Free, £5-15, £20-50, etc.)
📍 LOCATIONS: Use specific, real venue names and areas within ${regionText}

EVENT CURATION STRATEGY:
POPULAR EVENTS (70%): Well-known venues, established festivals, major performances, trending artists
HIDDEN GEMS (30%): Small galleries, indie performances, unique workshops, pop-up events, local discoveries

CATEGORIES FOCUS:
- music: Live concerts, festivals, acoustic nights, DJ sets, music venues
- comedy: Stand-up shows, comedy clubs, improv nights, comedy festivals  
- shows: Theater, cabaret, variety shows, dance performances
- musicals: Musical theater, tribute shows, opera, musical revues
- art_exhibitions: Gallery openings, art walks, sculpture displays, creative exhibitions
- events: Markets, cultural festivals, community celebrations, special occasions

Return ONLY a JSON array with this exact format:
[
  {
    "title": "Event Title",
    "description": "Engaging 50-word description highlighting what makes this event special",
    "start_date": "${exampleDate}",
    "start_time": "19:30",
    "location": "Specific Venue Name, Area/Street, ${regionText}",
    "event_type": "music|comedy|shows|musicals|art_exhibitions|events",
    "price": "Free|£8|£15-25|£35",
    "category": "popular|hidden_gem",
    "source_url": "https://venue-website.com/event-page", 
    "source_name": "Venue Name or Event Platform"
  }
]

Create a perfect mix for ${regionText} - make locals excited about both the big events they know about AND the amazing hidden gems they'd never find otherwise!`;

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

    // Validate and fix event dates
    const todayForValidation = new Date().toISOString().split('T')[0];
    const validatedEvents = events.map((event, index) => {
      let eventDate = event.start_date;
      
      // If no date or invalid date, set to future date
      if (!eventDate || eventDate < todayForValidation) {
        const futureDate = new Date();
        futureDate.setDate(futureDate.getDate() + (index % 7) + 1); // Spread across next 7 days
        eventDate = futureDate.toISOString().split('T')[0];
        console.log(`📅 Fixed event date for "${event.title}": ${event.start_date} -> ${eventDate}`);
      }
      
      return {
        ...event,
        start_date: eventDate
      };
    });

    // Clear existing events for this topic
    const { error: deleteError } = await supabase
      .from('events')
      .update({ status: 'deleted' })
      .eq('topic_id', topicId);

    if (deleteError) {
      console.error('❌ Error clearing existing events:', deleteError);
    } else {
      console.log('🗑️ Cleared existing events for topic:', topicId);
    }

    // Insert new events with ranking and enhanced data
    const eventsToInsert = validatedEvents.slice(0, 15).map((event, index) => ({
      topic_id: topicId,
      title: event.title || 'Untitled Event',
      description: event.description || '',
      start_date: event.start_date,
      end_date: event.end_date || null,
      start_time: event.start_time || null,
      end_time: event.end_time || null,
      location: event.location || '',
      source_url: event.source_url || null,
      source_name: event.source_name || 'AI Generated',
      event_type: event.event_type || 'events',
      category: event.category || 'popular',
      price: event.price || null,
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
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorStack = error instanceof Error ? error.stack : undefined;
    
    return new Response(
      JSON.stringify({
        success: false,
        error: errorMessage,
        details: errorStack
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});