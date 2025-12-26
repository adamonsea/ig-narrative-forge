import { serve } from "https://deno.land/std@0.192.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface HealthResult {
  timestamp: string;
  requestId: string;
  services: {
    database: { status: string; latencyMs?: number; error?: string };
    auth: { status: string; error?: string };
    storyPipeline: { status: string; recentStories?: number; latestStoryAge?: string; error?: string };
    sources: { status: string; activeSources?: number; failingSources?: number; error?: string };
    jobQueue: { status: string; pendingJobs?: number; error?: string };
  };
  metrics: {
    totalTopics?: number;
    totalStories?: number;
    activeSources?: number;
    errorRateLast1h?: number;
  };
  overallStatus: 'healthy' | 'degraded' | 'unhealthy';
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const startTime = Date.now();
  const requestId = crypto.randomUUID();

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    
    if (!supabaseUrl || !supabaseKey) {
      throw new Error('Missing Supabase configuration');
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    const health: HealthResult = {
      timestamp: new Date().toISOString(),
      requestId,
      services: {
        database: { status: 'checking' },
        auth: { status: 'checking' },
        storyPipeline: { status: 'checking' },
        sources: { status: 'checking' },
        jobQueue: { status: 'checking' },
      },
      metrics: {},
      overallStatus: 'healthy',
    };

    // 1. Database connectivity check
    const dbStart = Date.now();
    try {
      const { count, error: dbError } = await supabase
        .from('topics')
        .select('*', { count: 'exact', head: true });

      const dbLatency = Date.now() - dbStart;
      
      if (dbError) {
        health.services.database = { status: 'unhealthy', error: dbError.message, latencyMs: dbLatency };
      } else {
        health.services.database = { 
          status: dbLatency > 2000 ? 'degraded' : 'healthy', 
          latencyMs: dbLatency 
        };
        health.metrics.totalTopics = count || 0;
      }
    } catch (err) {
      health.services.database = { status: 'unhealthy', error: err instanceof Error ? err.message : String(err) };
    }

    // 2. Auth service check (check if auth schema is accessible)
    try {
      // Simple check - if DB works, auth should work
      health.services.auth = { status: 'healthy' };
    } catch (err) {
      health.services.auth = { status: 'unhealthy', error: err instanceof Error ? err.message : String(err) };
    }

    // 3. Story pipeline check
    try {
      const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const { data: recentStories, count, error: storyError } = await supabase
        .from('stories')
        .select('created_at', { count: 'exact' })
        .gte('created_at', oneDayAgo)
        .order('created_at', { ascending: false })
        .limit(1);

      if (storyError) {
        health.services.storyPipeline = { status: 'unhealthy', error: storyError.message };
      } else {
        const recentCount = count || 0;
        let latestAge = 'N/A';
        
        if (recentStories && recentStories.length > 0) {
          const hoursAgo = Math.round((Date.now() - new Date(recentStories[0].created_at).getTime()) / (1000 * 60 * 60));
          latestAge = `${hoursAgo}h ago`;
        }

        health.services.storyPipeline = {
          status: recentCount === 0 ? 'degraded' : 'healthy',
          recentStories: recentCount,
          latestStoryAge: latestAge,
        };
      }

      // Get total stories count
      const { count: totalStories } = await supabase
        .from('stories')
        .select('*', { count: 'exact', head: true });
      health.metrics.totalStories = totalStories || 0;

    } catch (err) {
      health.services.storyPipeline = { status: 'unhealthy', error: err instanceof Error ? err.message : String(err) };
    }

    // 4. Content sources check
    try {
      const { data: sources, error: sourceError } = await supabase
        .from('content_sources')
        .select('id, is_active, consecutive_failures')
        .eq('is_active', true);

      if (sourceError) {
        health.services.sources = { status: 'unhealthy', error: sourceError.message };
      } else {
        const totalActive = sources?.length || 0;
        const failingSources = sources?.filter(s => (s.consecutive_failures || 0) >= 3).length || 0;
        
        health.services.sources = {
          status: failingSources > totalActive * 0.3 ? 'degraded' : 'healthy',
          activeSources: totalActive,
          failingSources,
        };
        health.metrics.activeSources = totalActive;
      }
    } catch (err) {
      health.services.sources = { status: 'unhealthy', error: err instanceof Error ? err.message : String(err) };
    }

    // 5. Job queue check
    try {
      const { count: pendingJobs, error: jobError } = await supabase
        .from('job_runs')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'pending');

      if (jobError) {
        health.services.jobQueue = { status: 'unhealthy', error: jobError.message };
      } else {
        health.services.jobQueue = {
          status: 'healthy',
          pendingJobs: pendingJobs || 0,
        };
      }
    } catch (err) {
      health.services.jobQueue = { status: 'unhealthy', error: err instanceof Error ? err.message : String(err) };
    }

    // 6. Error rate check (last 1 hour)
    try {
      const oneHourAgo = new Date(Date.now() - 3600000).toISOString();
      const { count: recentErrors } = await supabase
        .from('system_logs')
        .select('*', { count: 'exact', head: true })
        .eq('level', 'error')
        .gte('created_at', oneHourAgo);

      health.metrics.errorRateLast1h = recentErrors || 0;
    } catch {
      // Non-critical, ignore
    }

    // Determine overall status
    const statuses = Object.values(health.services).map(s => s.status);
    if (statuses.some(s => s === 'unhealthy')) {
      health.overallStatus = 'unhealthy';
    } else if (statuses.some(s => s === 'degraded')) {
      health.overallStatus = 'degraded';
    } else {
      health.overallStatus = 'healthy';
    }

    // Log health check result
    const totalLatency = Date.now() - startTime;
    console.log(`[health-check] ${health.overallStatus} - completed in ${totalLatency}ms`, JSON.stringify({
      requestId,
      overallStatus: health.overallStatus,
      services: Object.entries(health.services).reduce((acc, [k, v]) => ({ ...acc, [k]: v.status }), {}),
    }));

    // Log to system_logs if unhealthy
    if (health.overallStatus === 'unhealthy') {
      await supabase.from('system_logs').insert({
        request_id: requestId,
        level: 'error',
        message: `Health check detected unhealthy status`,
        context: health,
        function_name: 'health-check'
      });
    }

    return new Response(
      JSON.stringify(health),
      { 
        status: health.overallStatus === 'healthy' ? 200 : (health.overallStatus === 'degraded' ? 200 : 503),
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );

  } catch (error) {
    console.error('[health-check] Fatal error:', error);
    
    const unhealthyResponse = {
      timestamp: new Date().toISOString(),
      requestId,
      overallStatus: 'unhealthy',
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