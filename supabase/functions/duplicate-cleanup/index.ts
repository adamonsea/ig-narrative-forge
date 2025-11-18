import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.192.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// MVP Rate Limiting - prevents unauthorized cleanup operations
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

function checkRateLimit(identifier: string, maxPerHour: number = 3): boolean {
  const now = Date.now();
  const limit = rateLimitMap.get(identifier);
  
  if (!limit || now > limit.resetAt) {
    rateLimitMap.set(identifier, { count: 1, resetAt: now + 3600000 });
    return true;
  }
  
  if (limit.count >= maxPerHour) {
    console.warn(`Rate limit exceeded for ${identifier}: ${limit.count}/${maxPerHour}`);
    return false;
  }
  
  limit.count++;
  return true;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Rate limiting: Very strict (3/hour) - cleanup operations are sensitive
    const hasAuth = req.headers.get('authorization')?.includes('Bearer');
    const clientIP = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 
                     req.headers.get('x-real-ip') || 
                     'unknown';
    
    if (!hasAuth && !checkRateLimit(clientIP, 3)) {
      console.warn(`🚫 Duplicate cleanup rate limit exceeded from IP: ${clientIP}`);
      return new Response(
        JSON.stringify({ 
          error: 'Rate limit exceeded',
          message: 'Maximum 3 cleanup operations per hour. Please authenticate for unlimited access.'
        }), 
        { 
          status: 429,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    
    if (!supabaseUrl || !supabaseKey) {
      throw new Error('Missing required environment variables');
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    console.log('🧹 Starting duplicate cleanup process...');

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