import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.192.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1';
import { z } from 'https://deno.land/x/zod@v3.22.4/mod.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Optional request body validation - function accepts no required parameters
const requestSchema = z.object({
  dryRun: z.boolean().optional().default(false),
  limit: z.number().int().min(1).max(1000).optional().default(100),
}).optional();

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    
    if (!supabaseUrl || !supabaseKey) {
      throw new Error('Missing required environment variables');
    }

    // Parse and validate optional request body
    let options = { dryRun: false, limit: 100 };
    try {
      const body = await req.json();
      const validated = requestSchema.parse(body);
      if (validated) {
        options = { ...options, ...validated };
      }
    } catch (parseError) {
      // Body is optional, continue with defaults if parsing fails
      if (parseError instanceof z.ZodError) {
        return new Response(
          JSON.stringify({ 
            success: false,
            error: 'Invalid request parameters',
            details: parseError.errors
          }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      // If no body provided, that's fine - use defaults
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    console.log('🧹 Starting duplicate cleanup process...', { dryRun: options.dryRun, limit: options.limit });

    if (options.dryRun) {
      return new Response(
        JSON.stringify({ 
          success: true, 
          dryRun: true,
          message: 'Dry run - no changes made'
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Run the cleanup function
    const { data: result, error } = await supabase
      .rpc('cleanup_existing_duplicates');

    if (error) {
      console.error('❌ Error running cleanup:', error);
      throw new Error(`Cleanup failed: ${error.message}`);
    }

    console.log('✅ Cleanup completed:', result);

    return new Response(
      JSON.stringify({ 
        success: true, 
        result: result,
        message: `Cleanup completed. Processed ${result.articles_processed} articles with duplicates.`
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('❌ Error in duplicate-cleanup function:', error);
    return new Response(
      JSON.stringify({ 
        success: false,
        error: error instanceof Error ? error.message : String(error) 
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});