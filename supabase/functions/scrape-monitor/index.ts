import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    const { action } = await req.json();
    
    switch (action) {
      case 'dashboard':
        return await getDashboardData(supabase);
      case 'attribution-issues':
        return await getAttributionIssues(supabase);
      case 'schedule-health':
        return await getScheduleHealth(supabase);
      case 'recent-jobs':
        return await getRecentJobs(supabase);
      case 'validate-attribution':
        const { attributionId, isValid, reason } = await req.json();
        return await validateAttribution(supabase, attributionId, isValid, reason);
      default:
        throw new Error('Invalid action');
    }

  } catch (error) {
    console.error('Scrape monitor error:', error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

async function getDashboardData(supabase: any) {
  console.log('📊 Fetching dashboard data...');
  
  // Get overall statistics
  const [
    schedulesResult,
    jobsResult,
    articlesResult,
    attributionResult
  ] = await Promise.all([
    // Active schedules
    supabase
      .from('scrape_schedules')
      .select('id, is_active, success_rate, run_count, next_run_at')
      .eq('is_active', true),
    
    // Recent jobs (last 24 hours)
    supabase
      .from('scrape_jobs')
      .select('id, status, created_at, completed_at, error_message')
      .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()),
    
    // Recent articles (last 7 days)
    supabase
      .from('articles')
      .select('id, created_at, source_url')
      .gte('created_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()),
    
    // Attribution issues
    supabase
      .from('source_attributions')
      .select('id, validation_status, is_valid')
      .eq('is_valid', false)
  ]);

  const schedules = schedulesResult.data || [];
  const jobs = jobsResult.data || [];
  const articles = articlesResult.data || [];
  const attributions = attributionResult.data || [];

  // Calculate metrics
  const totalSchedules = schedules.length;
  const avgSuccessRate = schedules.reduce((sum: number, s: any) => sum + (s.success_rate || 0), 0) / totalSchedules;
  
  const jobsByStatus = jobs.reduce((acc: Record<string, number>, job: any) => {
    acc[job.status] = (acc[job.status] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const articlesPerDay = articles.reduce((acc: Record<string, number>, article: any) => {
    const date = new Date(article.created_at).toDateString();
    acc[date] = (acc[date] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  // Next scheduled runs
  const { data: nextRuns } = await supabase
    .from('scrape_schedules')
    .select(`
      id,
      next_run_at,
      content_sources (source_name, feed_url)
    `)
    .eq('is_active', true)
    .order('next_run_at', { ascending: true })
    .limit(5);

  const dashboard = {
    overview: {
      active_schedules: totalSchedules,
      average_success_rate: Math.round(avgSuccessRate * 100) / 100,
      jobs_last_24h: jobs.length,
      articles_last_7d: articles.length,
      attribution_issues: attributions.length
    },
    jobs_by_status: jobsByStatus,
    articles_per_day: articlesPerDay,
    next_runs: nextRuns || [],
    health_status: avgSuccessRate > 80 ? 'healthy' : avgSuccessRate > 60 ? 'warning' : 'critical'
  };

  console.log('✅ Dashboard data compiled:', dashboard.overview);

  return new Response(JSON.stringify(dashboard), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

async function getAttributionIssues(supabase: any) {
  console.log('🔍 Fetching attribution issues...');
  
  const { data: issues, error } = await supabase
    .from('source_attributions')
    .select(`
      id,
      extracted_publication,
      source_url,
      detected_domain,
      validation_status,
      is_valid,
      created_at,
      articles (id, title)
    `)
    .eq('is_valid', false)
    .order('created_at', { ascending: false })
    .limit(50);

  if (error) {
    throw new Error(`Failed to fetch attribution issues: ${error.message}`);
  }

  return new Response(JSON.stringify({ issues: issues || [] }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

async function getScheduleHealth(supabase: any) {
  console.log('💚 Checking schedule health...');
  
  const { data: schedules, error } = await supabase
    .from('scrape_schedules')
    .select(`
      id,
      schedule_type,
      frequency_hours,
      last_run_at,
      next_run_at,
      is_active,
      run_count,
      success_rate,
      content_sources (
        source_name,
        feed_url,
        canonical_domain,
        credibility_score
      )
    `)
    .eq('is_active', true)
    .order('success_rate', { ascending: true });

  if (error) {
    throw new Error(`Failed to fetch schedule health: ${error.message}`);
  }

  const healthData = (schedules || []).map((schedule: any) => {
    const source = schedule.content_sources as any;
    const timeSinceLastRun = schedule.last_run_at 
      ? Date.now() - new Date(schedule.last_run_at).getTime()
      : null;
    
    const isOverdue = schedule.next_run_at && new Date(schedule.next_run_at) < new Date();
    const healthScore = calculateHealthScore(schedule.success_rate, timeSinceLastRun, isOverdue);
    
    return {
      ...schedule,
      source_name: source?.source_name || 'Unknown',
      health_score: healthScore,
      status: getHealthStatus(healthScore),
      overdue: isOverdue,
      hours_since_last_run: timeSinceLastRun ? Math.round(timeSinceLastRun / (1000 * 60 * 60)) : null
    };
  });

  return new Response(JSON.stringify({ schedules: healthData }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

async function getRecentJobs(supabase: any) {
  console.log('📋 Fetching recent jobs...');
  
  const { data: jobs, error } = await supabase
    .from('scrape_jobs')
    .select(`
      id,
      job_type,
      status,
      started_at,
      completed_at,
      error_message,
      retry_count,
      result_data,
      content_sources (source_name)
    `)
    .order('created_at', { ascending: false })
    .limit(100);

  if (error) {
    throw new Error(`Failed to fetch recent jobs: ${error.message}`);
  }

  return new Response(JSON.stringify({ jobs: jobs || [] }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

async function validateAttribution(supabase: any, attributionId: string, isValid: boolean, reason?: string) {
  console.log(`✅ Validating attribution ${attributionId}: ${isValid}`);
  
  const { error } = await supabase
    .from('source_attributions')
    .update({
      is_valid: isValid,
      validation_status: isValid ? 'validated' : 'rejected',
      override_reason: reason,
      updated_at: new Date().toISOString()
    })
    .eq('id', attributionId);

  if (error) {
    throw new Error(`Failed to validate attribution: ${error.message}`);
  }

  return new Response(JSON.stringify({ success: true }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function calculateHealthScore(successRate: number, timeSinceLastRun: number | null, isOverdue: boolean): number {
  let score = successRate || 0;
  
  // Penalize for being overdue
  if (isOverdue) score -= 20;
  
  // Penalize for not running recently (if it's been more than 48 hours)
  if (timeSinceLastRun && timeSinceLastRun > 48 * 60 * 60 * 1000) {
    score -= 15;
  }
  
  return Math.max(0, Math.min(100, score));
}

function getHealthStatus(score: number): string {
  if (score >= 80) return 'healthy';
  if (score >= 60) return 'warning'; 
  return 'critical';
}