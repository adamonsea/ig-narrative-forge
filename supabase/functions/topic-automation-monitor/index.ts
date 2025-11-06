import { serve } from 'https://deno.land/std@0.192.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.55.0';

type Json = Record<string, unknown>;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface MonitorRequest {
  triggerRun?: boolean;
  topicIds?: string[];
  overdueThresholdMinutes?: number;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

  if (!supabaseUrl || !supabaseServiceKey) {
    return new Response(
      JSON.stringify({ success: false, error: 'Missing Supabase configuration' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    const { triggerRun = true, topicIds, overdueThresholdMinutes = 30 }: MonitorRequest =
      req.method === 'POST' ? await req.json() : {};

    const now = new Date();
    const overdueThreshold = new Date(now.getTime() - overdueThresholdMinutes * 60 * 1000).toISOString();

    let settingsQuery = supabase
      .from('topic_automation_settings')
      .select(
        `topic_id, scrape_frequency_hours, last_run_at, next_run_at, is_active, topics(name, slug)`
      )
      .eq('is_active', true)
      .lt('next_run_at', overdueThreshold);

    if (topicIds && topicIds.length > 0) {
      settingsQuery = settingsQuery.in('topic_id', topicIds);
    }

    const { data: overdueSettings, error: overdueError } = await settingsQuery;

    if (overdueError) {
      throw new Error(`Failed to fetch automation settings: ${overdueError.message}`);
    }

    const overdueTopics = (overdueSettings || []).map((setting) => ({
      topicId: setting.topic_id,
      topicName: setting.topics?.name,
      topicSlug: setting.topics?.slug,
      scrapeFrequencyHours: setting.scrape_frequency_hours,
      nextRunAt: setting.next_run_at,
      lastRunAt: setting.last_run_at,
    }));

    const { data: lastAutomationRun, error: lastRunError } = await supabase
      .from('job_runs')
      .select('id, status, completed_at, created_at')
      .eq('job_type', 'topic_automation')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (lastRunError) {
      throw new Error(`Failed to fetch last automation run: ${lastRunError.message}`);
    }

    const shouldTriggerAutomation = triggerRun && overdueTopics.length > 0;

    let automationResult: Json | null = null;
    let automationError: string | null = null;

    if (shouldTriggerAutomation) {
      const topicsToTrigger = topicIds && topicIds.length > 0
        ? topicIds
        : overdueTopics.map((topic) => topic.topicId);

      try {
        const { data, error } = await supabase.functions.invoke('universal-topic-automation', {
          body: {
            topicIds: topicsToTrigger,
            force: false,
            dryRun: false,
          },
        });

        if (error) {
          throw error;
        }

        automationResult = data as Json;
      } catch (automationInvokeError) {
        automationError = automationInvokeError instanceof Error
          ? automationInvokeError.message
          : String(automationInvokeError);
      }
    }

    const logContext: Json = {
      overdueTopicCount: overdueTopics.length,
      overdueTopics,
      triggeredAutomation: shouldTriggerAutomation,
      lastAutomationRun,
    };

    if (automationResult) {
      logContext.automationResult = automationResult;
    }

    if (automationError) {
      logContext.automationError = automationError;
    }

    await supabase.from('system_logs').insert({
      level: automationError ? 'error' : overdueTopics.length > 0 ? 'warn' : 'info',
      message: 'Topic automation monitor executed',
      context: logContext,
      function_name: 'topic-automation-monitor',
    });

    return new Response(
      JSON.stringify({
        success: true,
        overdueTopics,
        lastAutomationRun,
        triggeredAutomation: shouldTriggerAutomation,
        automationResult,
        automationError,
        checkedAt: now.toISOString(),
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Topic automation monitor failed:', error);

    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : String(error),
        timestamp: new Date().toISOString(),
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
