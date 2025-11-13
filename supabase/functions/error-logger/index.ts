import { serve } from "https://deno.land/std@0.192.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { 
      ticketType, 
      sourceInfo, 
      errorDetails, 
      errorCode,
      stackTrace,
      contextData,
      severity = 'medium'
    } = await req.json();

    // Check for duplicate error in last 10 minutes
    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    const { data: existingTickets } = await supabase
      .from('error_tickets')
      .select('id')
      .eq('error_details', errorDetails)
      .eq('stack_trace', stackTrace)
      .gte('created_at', tenMinutesAgo)
      .limit(1);

    if (existingTickets && existingTickets.length > 0) {
      console.log('Returning existing ticket ID for duplicate error');
      return new Response(
        JSON.stringify({ success: true, ticketId: existingTickets[0].id, isDuplicate: true }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Log new error using the database function
    const { data, error } = await supabase.rpc('log_error_ticket', {
      p_ticket_type: ticketType,
      p_source_info: sourceInfo,
      p_error_details: errorDetails,
      p_error_code: errorCode,
      p_stack_trace: stackTrace,
      p_context_data: contextData,
      p_severity: severity
    });

    if (error) {
      console.error('Error logging ticket:', error);
      return new Response(
        JSON.stringify({ error: 'Failed to log error ticket' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ success: true, ticketId: data }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in error-logger function:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});