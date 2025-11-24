import { serve } from 'https://deno.land/std@0.192.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface HealthIssue {
  severity: 'critical' | 'warning' | 'info';
  topic_id: string;
  topic_name: string;
  issue_type: string;
  description: string;
  affected_sources: string[];
  metadata: Record<string, any>;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error('Missing Supabase environment variables');
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const issues: HealthIssue[] = [];

    console.log('🔍 Starting source health monitoring...');

    // Get all active topics with their sources
    const { data: topics, error: topicsError } = await supabase
      .from('topics')
      .select('id, name, slug, created_by, is_active')
      .eq('is_active', true);

    if (topicsError) throw topicsError;

    for (const topic of topics || []) {
      console.log(`📊 Checking health for topic: ${topic.name}`);

      // Get sources for this topic via junction table
      const { data: topicSources } = await supabase
        .from('topic_sources')
        .select(`
          source_id,
          content_sources (
            id,
            source_name,
            is_active,
            is_critical,
            consecutive_failures,
            last_scraped_at,
            last_failure_reason,
            last_failure_at
          )
        `)
        .eq('topic_id', topic.id)
        .eq('is_active', true);

      const sources = topicSources?.map(ts => ts.content_sources).filter(Boolean) || [];
      
      if (sources.length === 0) {
        issues.push({
          severity: 'warning',
          topic_id: topic.id,
          topic_name: topic.name,
          issue_type: 'no_sources',
          description: 'Topic has no active sources',
          affected_sources: [],
          metadata: {}
        });
        continue;
      }

      // Check 1: Critical sources inactive
      const inactiveCriticalSources = sources.filter(s => 
        s.is_critical && !s.is_active
      );

      if (inactiveCriticalSources.length > 0) {
        issues.push({
          severity: 'critical',
          topic_id: topic.id,
          topic_name: topic.name,
          issue_type: 'critical_sources_inactive',
          description: `${inactiveCriticalSources.length} critical source(s) are inactive`,
          affected_sources: inactiveCriticalSources.map(s => s.source_name),
          metadata: {
            sources: inactiveCriticalSources.map(s => ({
              name: s.source_name,
              last_failure: s.last_failure_reason
            }))
          }
        });
      }

      // Check 2: Sources with high consecutive failures
      const failingSources = sources.filter(s => 
        s.is_active && s.consecutive_failures >= 3
      );

      if (failingSources.length > 0) {
        issues.push({
          severity: 'warning',
          topic_id: topic.id,
          topic_name: topic.name,
          issue_type: 'high_failure_rate',
          description: `${failingSources.length} source(s) have 3+ consecutive failures`,
          affected_sources: failingSources.map(s => s.source_name),
          metadata: {
            sources: failingSources.map(s => ({
              name: s.source_name,
              failures: s.consecutive_failures,
              reason: s.last_failure_reason
            }))
          }
        });
      }

      // Check 3: Sources not scraped in 48+ hours
      const now = new Date();
      const staleSources = sources.filter(s => {
        if (!s.last_scraped_at || !s.is_active) return false;
        const hoursSinceLastScrape = (now.getTime() - new Date(s.last_scraped_at).getTime()) / (1000 * 60 * 60);
        return hoursSinceLastScrape > 48;
      });

      if (staleSources.length > 0) {
        issues.push({
          severity: 'info',
          topic_id: topic.id,
          topic_name: topic.name,
          issue_type: 'stale_sources',
          description: `${staleSources.length} source(s) haven't been scraped in 48+ hours`,
          affected_sources: staleSources.map(s => s.source_name),
          metadata: {
            sources: staleSources.map(s => ({
              name: s.source_name,
              last_scraped: s.last_scraped_at
            }))
          }
        });
      }

      // Check 4: Article flow anomaly (50%+ drop from previous week)
      const oneWeekAgo = new Date();
      oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
      const twoWeeksAgo = new Date();
      twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14);

      const { count: thisWeekArticles } = await supabase
        .from('topic_articles')
        .select('id', { count: 'exact', head: true })
        .eq('topic_id', topic.id)
        .gte('created_at', oneWeekAgo.toISOString());

      const { count: lastWeekArticles } = await supabase
        .from('topic_articles')
        .select('id', { count: 'exact', head: true })
        .eq('topic_id', topic.id)
        .gte('created_at', twoWeeksAgo.toISOString())
        .lt('created_at', oneWeekAgo.toISOString());

      if (lastWeekArticles && lastWeekArticles > 0) {
        const dropPercentage = ((lastWeekArticles - (thisWeekArticles || 0)) / lastWeekArticles) * 100;
        
        if (dropPercentage >= 50) {
          issues.push({
            severity: dropPercentage >= 75 ? 'critical' : 'warning',
            topic_id: topic.id,
            topic_name: topic.name,
            issue_type: 'article_flow_drop',
            description: `Article flow dropped ${Math.round(dropPercentage)}% (${lastWeekArticles} → ${thisWeekArticles || 0})`,
            affected_sources: [],
            metadata: {
              this_week: thisWeekArticles || 0,
              last_week: lastWeekArticles,
              drop_percentage: Math.round(dropPercentage)
            }
          });
        }
      }

      // Check 5: All sources inactive (zero article flow)
      const allInactive = sources.every(s => !s.is_active);
      if (allInactive && sources.length > 0) {
        issues.push({
          severity: 'critical',
          topic_id: topic.id,
          topic_name: topic.name,
          issue_type: 'all_sources_inactive',
          description: 'All sources for this topic are inactive',
          affected_sources: sources.map(s => s.source_name),
          metadata: {
            total_sources: sources.length
          }
        });
      }
    }

    // Log all issues to system_logs
    if (issues.length > 0) {
      for (const issue of issues) {
        await supabase.from('system_logs').insert({
          level: issue.severity === 'critical' ? 'error' : issue.severity === 'warning' ? 'warn' : 'info',
          message: `Source health alert: ${issue.issue_type}`,
          context: {
            topic_id: issue.topic_id,
            topic_name: issue.topic_name,
            description: issue.description,
            affected_sources: issue.affected_sources,
            metadata: issue.metadata
          },
          function_name: 'source-health-alerts'
        });
      }

      console.log(`⚠️ Found ${issues.length} health issues`);
    } else {
      console.log('✅ All topics and sources are healthy');
    }

    // Return summary
    return new Response(
      JSON.stringify({
        success: true,
        timestamp: new Date().toISOString(),
        topics_checked: topics?.length || 0,
        issues_found: issues.length,
        critical_issues: issues.filter(i => i.severity === 'critical').length,
        warnings: issues.filter(i => i.severity === 'warning').length,
        issues: issues
      }),
      { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );

  } catch (error) {
    console.error('❌ Error in source health monitoring:', error);
    return new Response(
      JSON.stringify({ 
        error: error instanceof Error ? error.message : 'Unknown error',
        success: false
      }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});
