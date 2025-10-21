import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.192.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const supabase = createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
);

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('🤖 Starting automated event collection scheduler...');

    // Get all active topics that have event automation enabled
    const { data: topics, error: topicsError } = await supabase
      .from('topics')
      .select(`
        id, 
        name, 
        region,
        topic_automation_settings!inner(
          is_active,
          scrape_frequency_hours,
          last_run_at,
          next_run_at
        )
      `)
      .eq('is_active', true)
      .eq('topic_automation_settings.is_active', true)
      .lte('topic_automation_settings.next_run_at', new Date().toISOString());

    if (topicsError) {
      console.error('❌ Error fetching topics:', topicsError);
      throw topicsError;
    }

    console.log(`📋 Found ${topics?.length || 0} topics ready for event collection`);

    let totalEventsGenerated = 0;
    const results = [];

    // Process each topic
    for (const topic of topics || []) {
      try {
        console.log(`🎪 Processing events for topic: ${topic.name} (${topic.id})`);

        // Default event types for automated collection
        const defaultEventTypes = ['events', 'music', 'comedy', 'shows', 'art_exhibitions', 'musicals'];

        // Call AI event generator for this topic
        const { data: eventData, error: eventError } = await supabase.functions.invoke('ai-event-generator', {
          body: {
            topicId: topic.id,
            region: topic.region || topic.name,
            eventTypes: defaultEventTypes
          }
        });

        if (eventError) {
          console.error(`❌ Error generating events for topic ${topic.name}:`, eventError);
          results.push({
            topicId: topic.id,
            topicName: topic.name,
            success: false,
            error: eventError.message,
            eventsGenerated: 0
          });
          continue;
        }

        const eventsCount = eventData?.events?.length || 0;
        totalEventsGenerated += eventsCount;

        console.log(`✅ Generated ${eventsCount} events for topic: ${topic.name}`);

        // Update automation settings - set next run time
        const nextRun = new Date();
        nextRun.setHours(nextRun.getHours() + (topic.topic_automation_settings.scrape_frequency_hours || 84)); // Default 3.5 days (twice weekly)

        await supabase
          .from('topic_automation_settings')
          .update({
            last_run_at: new Date().toISOString(),
            next_run_at: nextRun.toISOString()
          })
          .eq('topic_id', topic.id);

        results.push({
          topicId: topic.id,
          topicName: topic.name,
          success: true,
          eventsGenerated: eventsCount,
          nextRun: nextRun.toISOString()
        });

        // Add delay between topics to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 2000));

      } catch (topicError) {
        console.error(`❌ Error processing topic ${topic.name}:`, topicError);
        const topicErrorMessage = topicError instanceof Error ? topicError.message : String(topicError);
        results.push({
          topicId: topic.id,
          topicName: topic.name,
          success: false,
          error: topicErrorMessage,
          eventsGenerated: 0
        });
      }
    }

    // Log the automation run
    console.log(`🎉 Automated event collection completed! Generated ${totalEventsGenerated} total events across ${results.length} topics`);

    return new Response(
      JSON.stringify({
        success: true,
        message: `Automated event collection completed successfully`,
        totalEventsGenerated,
        topicsProcessed: results.length,
        results: results
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('❌ Error in automated-event-scheduler:', error);
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