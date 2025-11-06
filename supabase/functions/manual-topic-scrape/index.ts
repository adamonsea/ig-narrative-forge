import { serve } from 'https://deno.land/std@0.192.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.55.0';

interface ManualScrapeRequest {
  topicId: string;
  forceRescrape?: boolean;
  dryRun?: boolean;
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response(
      JSON.stringify({ success: false, error: 'Only POST requests are supported' }),
      { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
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

  let jobRunId: string | null = null;

  try {
    const { topicId, forceRescrape = false, dryRun = false }: ManualScrapeRequest = await req.json();

    if (!topicId) {
      throw new Error('topicId is required');
    }

    const now = new Date();

    const { data: jobRun, error: jobInsertError } = await supabase
      .from('job_runs')
      .insert({
        job_type: 'topic_manual_scrape',
        status: 'pending',
        input_data: { topicId, forceRescrape, dryRun },
        scheduled_at: now.toISOString(),
      })
      .select()
      .single();

    if (jobInsertError) {
      throw new Error(`Failed to create job run: ${jobInsertError.message}`);
    }

    jobRunId = jobRun.id;

    const { data: automationSettings, error: automationSettingsError } = await supabase
      .from('topic_automation_settings')
      .select('topic_id, scrape_frequency_hours, last_run_at, next_run_at, is_active')
      .eq('topic_id', topicId)
      .maybeSingle();

    if (automationSettingsError) {
      throw new Error(`Failed to fetch automation settings: ${automationSettingsError.message}`);
    }

    await supabase
      .from('job_runs')
      .update({ status: 'processing', started_at: now.toISOString() })
      .eq('id', jobRunId);

    let scrapeResult: Record<string, unknown> | null = null;

    if (dryRun) {
      scrapeResult = { message: 'Dry run enabled, scraping not executed' };
    } else {
      const { data, error } = await supabase.functions.invoke('universal-topic-scraper', {
        body: {
          topicId,
          forceRescrape,
        },
      });

      if (error) {
        throw error;
      }

      scrapeResult = data as Record<string, unknown> | null;
    }

    if (!dryRun && automationSettings?.is_active) {
      const nextRunAt = new Date(
        now.getTime() + automationSettings.scrape_frequency_hours * 60 * 60 * 1000,
      ).toISOString();

      await supabase
        .from('topic_automation_settings')
        .update({
          last_run_at: now.toISOString(),
          next_run_at: nextRunAt,
          updated_at: now.toISOString(),
        })
        .eq('topic_id', topicId);
    }

    await supabase
      .from('job_runs')
      .update({
        status: 'completed',
        completed_at: new Date().toISOString(),
        output_data: scrapeResult,
      })
      .eq('id', jobRunId);

    await supabase.from('system_logs').insert({
      level: 'info',
      message: 'Manual topic scrape executed',
      context: {
        topicId,
        forceRescrape,
        dryRun,
        jobRunId,
        scrapeResult,
      },
      function_name: 'manual-topic-scrape',
    });

    return new Response(
      JSON.stringify({
        success: true,
        topicId,
        forceRescrape,
        dryRun,
        jobRunId,
        scrapeResult,
        executedAt: now.toISOString(),
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Manual topic scrape failed:', error);

    if (jobRunId) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      await supabase
        .from('job_runs')
        .update({
          status: 'failed',
          error_message: errorMessage,
          completed_at: new Date().toISOString(),
        })
        .eq('id', jobRunId);

      await supabase.from('system_logs').insert({
        level: 'error',
        message: 'Manual topic scrape failed',
        context: { jobRunId, error: errorMessage },
        function_name: 'manual-topic-scrape',
      });
    }

    if (error instanceof SyntaxError) {
      return new Response(
        JSON.stringify({ success: false, error: 'Invalid JSON payload' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

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
