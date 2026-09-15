import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.55.0';
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';

// Polls OpenAI Batch jobs created by auto-illustrate-stories for backlog
// stories and attaches the finished image to the story. Fail-open: a batch
// that fails or expires is retried immediately on the normal (instant) route,
// so no story is left without an image because of batching.

const MAX_JOBS_PER_RUN = 25;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  );

  const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY');

  try {
    const { data: jobs, error: jobsError } = await supabase
      .from('illustration_batch_jobs')
      .select('*')
      .in('status', ['submitted', 'in_progress'])
      .order('created_at', { ascending: true })
      .limit(MAX_JOBS_PER_RUN);

    if (jobsError) throw jobsError;

    if (!jobs || jobs.length === 0) {
      return new Response(
        JSON.stringify({ success: true, checked: 0, completed: 0, failed: 0 }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!OPENAI_API_KEY) {
      throw new Error('OPENAI_API_KEY not configured');
    }

    let completed = 0;
    let failed = 0;
    let pending = 0;

    for (const job of jobs) {
      try {
        const batchRes = await fetch(`https://api.openai.com/v1/batches/${job.batch_id}`, {
          headers: { Authorization: `Bearer ${OPENAI_API_KEY}` },
        });
        if (!batchRes.ok) {
          throw new Error(`batch lookup failed: ${batchRes.status}`);
        }
        const batch = await batchRes.json();

        if (['validating', 'in_progress', 'finalizing'].includes(batch.status)) {
          pending++;
          await supabase
            .from('illustration_batch_jobs')
            .update({ status: 'in_progress', attempts: (job.attempts ?? 0) + 1 })
            .eq('id', job.id);
          continue;
        }

        if (batch.status !== 'completed' || !batch.output_file_id) {
          throw new Error(`batch ${batch.status}`);
        }

        const fileRes = await fetch(`https://api.openai.com/v1/files/${batch.output_file_id}/content`, {
          headers: { Authorization: `Bearer ${OPENAI_API_KEY}` },
        });
        if (!fileRes.ok) throw new Error(`output download failed: ${fileRes.status}`);
        const text = await fileRes.text();

        const line = text
          .split('\n')
          .map((l) => l.trim())
          .filter(Boolean)
          .map((l) => JSON.parse(l))
          .find((l) => l.custom_id === job.custom_id) ?? null;

        const b64 = line?.response?.body?.data?.[0]?.b64_json;
        if (!b64) throw new Error('no image data in batch output');

        const binary = atob(b64);
        const imageData = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) imageData[i] = binary.charCodeAt(i);

        const fileName = `story-${job.story_id}-${Date.now()}.webp`;
        const { error: uploadError } = await supabase.storage
          .from('visuals')
          .upload(fileName, imageData, { contentType: 'image/webp', upsert: false });
        if (uploadError) throw new Error(`upload failed: ${uploadError.message}`);

        const imageUrl = `${Deno.env.get('SUPABASE_URL')}/storage/v1/object/public/visuals/${fileName}`;

        const { error: updateError } = await supabase
          .from('stories')
          .update({
            cover_illustration_url: imageUrl,
            cover_illustration_prompt: job.prompt,
            illustration_generated_at: new Date().toISOString(),
            is_auto_illustrated: true,
          })
          .eq('id', job.story_id)
          .is('cover_illustration_url', null);
        if (updateError) throw new Error(`story update failed: ${updateError.message}`);

        try {
          await supabase.from('image_generation_metrics').insert({
            story_id: job.story_id,
            topic_id: job.topic_id,
            model: job.model,
            provider: 'openai-batch',
            is_automated: true,
            used_fallback: false,
            output_bytes: imageData.length,
            credits: 0,
            // Batch route is billed at 50% of the standard per-image price.
            cost_usd: job.model === 'gpt-image-2-low' ? 0.003 : job.model === 'gpt-image-1.5-low' ? 0.0065 : null,
          });
        } catch (_metricsError) {
          // non-critical
        }

        await supabase
          .from('illustration_batch_jobs')
          .update({ status: 'completed', image_url: imageUrl, error: null })
          .eq('id', job.id);

        completed++;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.warn(`Batch job ${job.id} failed: ${message}`);
        failed++;

        await supabase
          .from('illustration_batch_jobs')
          .update({ status: 'failed', error: message })
          .eq('id', job.id);

        // Fail-open fallback: generate immediately on the normal route.
        try {
          const { data: story } = await supabase
            .from('stories')
            .select('cover_illustration_url')
            .eq('id', job.story_id)
            .maybeSingle();

          if (story && !story.cover_illustration_url) {
            await supabase.functions.invoke('story-illustrator', {
              body: { storyId: job.story_id, model: job.model, isAutomated: true },
            });
          }
        } catch (fallbackError) {
          console.error('Immediate fallback also failed:', fallbackError);
        }
      }
    }

    await supabase.from('system_logs').insert({
      level: failed > 0 ? 'warn' : 'info',
      message: `Illustration batch poll: ${completed} completed, ${failed} failed, ${pending} pending`,
      context: { checked: jobs.length, completed, failed, pending },
      function_name: 'illustration-batch-poller',
    });

    return new Response(
      JSON.stringify({ success: true, checked: jobs.length, completed, failed, pending }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Illustration batch poller error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : String(error) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
