import { serve } from "https://deno.land/std@0.192.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1';

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
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    
    if (!supabaseUrl || !supabaseKey) {
      throw new Error('Missing Supabase configuration');
    }

    const supabase = createClient(supabaseUrl, supabaseKey);
    const requestId = crypto.randomUUID();

    // Check database connectivity
    const { data: dbCheck, error: dbError } = await supabase
      .from('feature_flags')
      .select('count')
      .limit(1);

    // Check job queue health
    const { data: pendingJobs, error: jobError } = await supabase
      .from('job_runs')
      .select('count')
      .eq('status', 'pending');

    // Check recent error rate
    const oneHourAgo = new Date(Date.now() - 3600000).toISOString();
    const { data: recentErrors, error: errorCheckError } = await supabase
      .from('system_logs')
      .select('count')
      .eq('level', 'error')
      .gte('created_at', oneHourAgo);

    const health = {
      timestamp: new Date().toISOString(),
      requestId,
      services: {
        database: {
          status: dbError ? 'unhealthy' : 'healthy',
          error: dbError?.message
        },
        job_queue: {
          status: jobError ? 'unhealthy' : 'healthy', 
          pending_jobs: pendingJobs?.[0]?.count || 0,
          error: jobError?.message
        },
        error_rate: {
          status: errorCheckError ? 'unknown' : 'healthy',
          recent_errors: recentErrors?.[0]?.count || 0,
          error: errorCheckError?.message
        }
      },
      overall_status: (dbError || jobError) ? 'unhealthy' : 'healthy'
    };

    // Log health check
    await supabase.from('system_logs').insert({
      request_id: requestId,
      level: health.overall_status === 'healthy' ? 'info' : 'warn',
      message: `Health check completed: ${health.overall_status}`,
      context: health,
      function_name: 'health-check'
    });

    return new Response(
      JSON.stringify(health),
      { 
        status: health.overall_status === 'healthy' ? 200 : 503,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );

  } catch (error) {
    console.error('Health check error:', error);
    
    const unhealthyResponse = {
      timestamp: new Date().toISOString(),
      overall_status: 'unhealthy',
      error: error instanceof Error ? error.message : String(error)
    };

    return new Response(
      JSON.stringify(unhealthyResponse),
      { 
        status: 503,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});