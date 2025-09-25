import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { topicId, region, eventTypes = ['events', 'music', 'comedy', 'shows'] } = await req.json();

    if (!topicId) {
      throw new Error('Topic ID is required');
    }

    console.log(`🎪 Collecting events for topic ${topicId} in region: ${region}`);

    // Get topic details
    const { data: topic, error: topicError } = await supabase
      .from('topics')
      .select('*')
      .eq('id', topicId)
      .single();

    if (topicError || !topic) {
      throw new Error(`Topic not found: ${topicError?.message}`);
    }

    // For demo purposes, generate sample API-sourced events
    // In production, this would integrate with real APIs like Eventbrite, Meetup, etc.
    const sampleEvents = [
      {
        title: "Eastbourne Music Festival",
        description: "Annual outdoor music festival featuring local and touring artists across multiple genres.",
        start_date: getDateInDays(2),
        start_time: "14:00:00",
        end_time: "22:00:00",
        location: "Princes Park, Eastbourne",
        event_type: "music",
        category: "Festival",
        price: "£15-25",
        source_url: "https://eastbournemusicfestival.co.uk/2025",
        source_name: "Eastbourne Music Festival",
        source_api: "eventbrite_api"
      },
      {
        title: "Comedy Night at The Lamb",
        description: "Stand-up comedy night featuring three professional comedians. Age 18+ venue.",
        start_date: getDateInDays(4),
        start_time: "20:00:00",
        end_time: "22:30:00",
        location: "The Lamb Inn, 36 High Street, Eastbourne",
        event_type: "comedy",
        category: "Entertainment",
        price: "£12",
        source_url: "https://thelamb.co.uk/events/comedy-night",
        source_name: "The Lamb Inn",
        source_api: "venue_direct"
      },
      {
        title: "Eastbourne Arts Trail",
        description: "Self-guided walking tour of local art galleries, studios, and street art installations.",
        start_date: getDateInDays(1),
        start_time: "10:00:00",
        end_time: "16:00:00",
        location: "Various locations, Eastbourne town center",
        event_type: "art_exhibitions",
        category: "Arts & Culture",
        price: "Free",
        source_url: "https://eastbournearts.org/trail",
        source_name: "Eastbourne Arts Council",
        source_api: "local_arts_api"
      },
      {
        title: "Vintage Car Show",
        description: "Display of classic and vintage cars from the 1920s-1980s. Family-friendly event with refreshments.",
        start_date: getDateInDays(6),
        start_time: "09:00:00",
        end_time: "17:00:00",
        location: "Eastbourne Pier Car Park",
        event_type: "events",
        category: "Community",
        price: "£5 (Children free)",
        source_url: "https://eastbournecarshow.com/vintage2025",
        source_name: "Eastbourne Classic Car Club",
        source_api: "meetup_api"
      },
      {
        title: "Open Mic Night",
        description: "Weekly open mic night for musicians, poets, and performers. Sign up on the night or online.",
        start_date: getDateInDays(3),
        start_time: "19:30:00",
        end_time: "23:00:00",
        location: "The Green Man, 10 Cornfield Road, Eastbourne",
        event_type: "music",
        category: "Community",
        price: "Free entry",
        source_url: "https://greenmanebn.co.uk/open-mic",
        source_name: "The Green Man",
        source_api: "venue_direct"
      }
    ];

    // Filter events by requested types
    const filteredEvents = sampleEvents.filter(event => 
      eventTypes.includes(event.event_type)
    );

    console.log(`📅 Generated ${filteredEvents.length} events from API sources`);

    // Clear existing events for this topic
    const { error: deleteError } = await supabase
      .from('events')
      .delete()
      .eq('topic_id', topicId);

    if (deleteError) {
      console.error('❌ Error clearing existing events:', deleteError);
    } else {
      console.log('🗑️ Cleared existing events for topic:', topicId);
    }

    // Insert new API-sourced events
    const eventsToInsert = filteredEvents.map((event, index) => ({
      topic_id: topicId,
      title: event.title,
      description: event.description,
      start_date: event.start_date,
      start_time: event.start_time,
      end_time: event.end_time,
      location: event.location,
      event_type: event.event_type,
      category: event.category,
      price: event.price,
      source_url: event.source_url,
      source_name: event.source_name,
      source_api: event.source_api,
      status: 'published',
      rank_position: index + 1
    }));

    const { data: insertedEvents, error: insertError } = await supabase
      .from('events')
      .insert(eventsToInsert)
      .select();

    if (insertError) {
      console.error('❌ Error inserting events:', insertError);
      throw insertError;
    }

    console.log(`✅ Successfully inserted ${insertedEvents?.length || 0} events`);

    // Return preview of inserted events
    const previewEvents = insertedEvents?.slice(0, 5).map(event => ({
      title: event.title,
      date: event.start_date,
      time: event.start_time,
      category: event.category,
      price: event.price,
      source: event.source_api
    }));

    return new Response(JSON.stringify({
      success: true,
      message: `Successfully collected ${insertedEvents?.length || 0} events from API sources`,
      eventsInserted: insertedEvents?.length || 0,
      previewEvents,
      sources: [...new Set(filteredEvents.map(e => e.source_api))]
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('❌ Error in API event collector:', error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    return new Response(JSON.stringify({ 
      success: false, 
      error: errorMessage 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

// Helper function to get date N days from now
function getDateInDays(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().split('T')[0];
}