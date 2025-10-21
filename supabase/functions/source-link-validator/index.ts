import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.192.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { action, eventId, topicId } = await req.json();

    if (action === 'validate_single' && eventId) {
      console.log(`🔗 Validating single event: ${eventId}`);
      
      const { data: event, error: fetchError } = await supabaseClient
        .from('events')
        .select('id, source_url, title')
        .eq('id', eventId)
        .single();

      if (fetchError || !event) {
        throw new Error('Event not found');
      }

      const validationResult = await validateUrl(event.source_url);
      
      // Update event with validation status
      await supabaseClient
        .from('events')
        .update({
          validation_status: validationResult.status,
          last_validated_at: new Date().toISOString(),
          validation_error: validationResult.error
        })
        .eq('id', eventId);

      return new Response(JSON.stringify({
        success: true,
        event: event,
        validation: validationResult
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    if (action === 'validate_topic' && topicId) {
      console.log(`🔗 Validating all events for topic: ${topicId}`);
      
      const { data: events, error: fetchError } = await supabaseClient
        .from('events')
        .select('id, source_url, title')
        .eq('topic_id', topicId)
        .eq('status', 'published');

      if (fetchError) throw fetchError;

      const results = [];
      for (const event of events || []) {
        const validationResult = await validateUrl(event.source_url);
        
        // Update event with validation status
        await supabaseClient
          .from('events')
          .update({
            validation_status: validationResult.status,
            last_validated_at: new Date().toISOString(),
            validation_error: validationResult.error
          })
          .eq('id', event.id);

        results.push({
          eventId: event.id,
          title: event.title,
          url: event.source_url,
          validation: validationResult
        });

        // Add delay to avoid overwhelming servers
        await new Promise(resolve => setTimeout(resolve, 100));
      }

      return new Response(JSON.stringify({
        success: true,
        results: results,
        summary: {
          total: results.length,
          valid: results.filter(r => r.validation.status === 'valid').length,
          broken: results.filter(r => r.validation.status === 'broken').length,
          timeout: results.filter(r => r.validation.status === 'timeout').length
        }
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    return new Response(JSON.stringify({
      success: false,
      error: 'Invalid action or missing parameters'
    }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('❌ Error in source-link-validator:', error);
    return new Response(JSON.stringify({
      success: false,
      error: error instanceof Error ? error.message : String(error)
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});

async function validateUrl(url: string): Promise<{status: 'valid' | 'broken' | 'timeout', statusCode?: number, error?: string}> {
  if (!url) {
    return { status: 'broken', error: 'No URL provided' };
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout

    const response = await fetch(url, {
      method: 'HEAD', // Use HEAD to avoid downloading content
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; EventValidator/1.0)'
      }
    });

    clearTimeout(timeoutId);

    if (response.ok) {
      return { status: 'valid', statusCode: response.status };
    } else {
      return { 
        status: 'broken', 
        statusCode: response.status, 
        error: `HTTP ${response.status}` 
      };
    }
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      return { status: 'timeout', error: 'Request timeout' };
    }
    return { 
      status: 'broken', 
      error: (error instanceof Error ? error.message : String(error)) || 'Network error' 
    };
  }
}