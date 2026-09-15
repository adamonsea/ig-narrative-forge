import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.55.0';
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { z } from 'https://esm.sh/zod@3.23.8';
import {
  analyzeStoryTone,
  extractLocationDetails,
  extractSubjectMatter,
  buildIllustrativePrompt,
  buildPhotographicPrompt,
} from '../_shared/prompt-helpers.ts';

// Image model comparison bench.
// Generates the SAME production prompt for a story across several models and
// quality levels so the replacement for GPT Image 1.5 (removed from the API on
// 1 December 2026) can be chosen on evidence. Writes only to
// image_bench_results and the visuals bucket under bench/ — never to stories.

// Per-image prices at 1536x1024. Used as an estimate; the real figure is
// recalculated from reported usage where the API returns it.
const PRICES: Record<string, Record<string, number>> = {
  'gpt-image-1.5': { low: 0.013, medium: 0.05, high: 0.2 },
  'gpt-image-2': { low: 0.006, medium: 0.041, high: 0.165 },
  'gpt-image-2.5-flare': { low: 0.006, medium: 0.041, high: 0.165, xhigh: 0.25, max: 0.32 },
  'gpt-image-2.5-sunburst': { low: 0.006, medium: 0.041, high: 0.165, xhigh: 0.25, max: 0.32 },
};

// Kept small so one invocation finishes well inside the function time limit.
// The admin page loops story by story and shows progress.
const MAX_GENERATIONS_PER_RUN = 12;

const requestSchema = z.object({
  storyIds: z.array(z.string().uuid()).min(1).max(4),
  models: z.array(z.enum([
    'gpt-image-1.5',
    'gpt-image-2',
    'gpt-image-2.5-flare',
    'gpt-image-2.5-sunburst',
  ])).min(1).max(4),
  qualities: z.array(z.enum(['low', 'medium', 'high', 'xhigh', 'max'])).min(1).max(5),
  promptOverride: z.string().max(6000).optional(),
  runId: z.string().uuid().optional(),
});

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Authorization header required' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseAuth = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { auth: { autoRefreshToken: false, persistSession: false }, global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: authError } = await supabaseAuth.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    const { data: isSuperAdmin } = await supabase.rpc('has_role', {
      _user_id: user.id,
      _role: 'superadmin',
    });
    if (isSuperAdmin !== true) {
      return new Response(JSON.stringify({ error: 'Forbidden' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const parsed = requestSchema.safeParse(await req.json());
    if (!parsed.success) {
      return new Response(
        JSON.stringify({ error: 'Invalid request', details: parsed.error.flatten().fieldErrors }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { storyIds, models, qualities, promptOverride } = parsed.data;
    const runId = parsed.data.runId ?? crypto.randomUUID();

    const planned = storyIds.length * models.length * qualities.length;
    if (planned > MAX_GENERATIONS_PER_RUN) {
      return new Response(
        JSON.stringify({
          error: `That grid would generate ${planned} images. The limit per run is ${MAX_GENERATIONS_PER_RUN} — reduce the stories, models or quality levels.`,
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY');
    if (!OPENAI_API_KEY) {
      return new Response(JSON.stringify({ error: 'OPENAI_API_KEY not configured' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const results: unknown[] = [];

    for (const storyId of storyIds) {
      // ---- Build the exact production prompt for this story ----
      const { data: story } = await supabase
        .from('stories')
        .select('id, title, article:article_id(topic_id), topic_article:topic_article_id(topic_id)')
        .eq('id', storyId)
        .single();

      if (!story) {
        results.push({ storyId, error: 'Story not found' });
        continue;
      }

      const topicId = (story as any).article?.topic_id || (story as any).topic_article?.topic_id || null;

      let illustrationStyle = 'editorial_illustrative';
      let primaryColor = '#10B981';
      let topicRegion: string | undefined;
      let topicLandmarks: string[] | undefined;

      if (topicId) {
        const { data: topicData } = await supabase
          .from('topics')
          .select('illustration_style, illustration_primary_color, region, landmarks')
          .eq('id', topicId)
          .single();
        if (topicData?.illustration_style) illustrationStyle = topicData.illustration_style;
        if (topicData?.illustration_primary_color) primaryColor = topicData.illustration_primary_color;
        if (topicData?.region) topicRegion = topicData.region;
        if (Array.isArray(topicData?.landmarks)) topicLandmarks = topicData.landmarks as string[];
      }

      const { data: slides } = await supabase
        .from('slides')
        .select('content, slide_number')
        .eq('story_id', storyId)
        .order('slide_number', { ascending: true });

      let prompt = promptOverride;
      if (!prompt) {
        const [storyTone, locationDetails] = await Promise.all([
          analyzeStoryTone(slides || [], OPENAI_API_KEY),
          extractLocationDetails(slides || [], OPENAI_API_KEY, topicLandmarks, topicRegion),
        ]);
        const subjectMatter = await extractSubjectMatter(
          slides || [],
          OPENAI_API_KEY,
          (story as any).title,
          locationDetails
        );
        prompt = illustrationStyle === 'editorial_photographic'
          ? buildPhotographicPrompt(storyTone, subjectMatter, (story as any).title, primaryColor, topicRegion, locationDetails)
          : buildIllustrativePrompt(storyTone, subjectMatter, (story as any).title, primaryColor, topicRegion, locationDetails);
      }

      // ---- Generate across the grid ----
      for (const model of models) {
        for (const quality of qualities) {
          const isTwoFive = model.startsWith('gpt-image-2.5');
          if (!isTwoFive && (quality === 'xhigh' || quality === 'max')) continue;

          const started = Date.now();
          try {
            const res = await fetch('https://api.openai.com/v1/images/generations', {
              method: 'POST',
              headers: {
                Authorization: `Bearer ${OPENAI_API_KEY}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                model,
                prompt,
                n: 1,
                size: '1536x1024',
                quality,
                output_format: 'webp',
                output_compression: 80,
              }),
            });

            if (!res.ok) {
              const text = await res.text();
              throw new Error(`${res.status}: ${text.slice(0, 300)}`);
            }

            const json = await res.json();
            const b64 = json?.data?.[0]?.b64_json;
            if (!b64) throw new Error('No image returned');

            const binary = atob(b64);
            const bytes = new Uint8Array(binary.length);
            for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);

            const fileName = `bench/${runId}/${storyId}-${model}-${quality}.webp`;
            const { error: uploadError } = await supabase.storage
              .from('visuals')
              .upload(fileName, bytes, { contentType: 'image/webp', upsert: true });
            if (uploadError) throw new Error(`Upload failed: ${uploadError.message}`);

            const imageUrl = `${Deno.env.get('SUPABASE_URL')}/storage/v1/object/public/visuals/${fileName}`;

            // Prefer the reported token usage; fall back to the per-tier estimate.
            const outputTokens = json?.usage?.output_tokens ?? null;
            const costUsd = outputTokens
              ? Number(((outputTokens / 1_000_000) * 30).toFixed(4))
              : PRICES[model]?.[quality] ?? null;

            const durationMs = Date.now() - started;

            await supabase.from('image_bench_results').insert({
              run_id: runId,
              story_id: storyId,
              topic_id: topicId,
              story_title: (story as any).title,
              model,
              quality,
              prompt,
              image_url: imageUrl,
              cost_usd: costUsd,
              duration_ms: durationMs,
              success: true,
            });

            results.push({ storyId, model, quality, imageUrl, costUsd, durationMs });
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            console.warn(`Bench failure ${model}/${quality} on ${storyId}: ${message}`);

            await supabase.from('image_bench_results').insert({
              run_id: runId,
              story_id: storyId,
              topic_id: topicId,
              story_title: (story as any).title,
              model,
              quality,
              prompt,
              success: false,
              error: message,
              duration_ms: Date.now() - started,
            });

            results.push({ storyId, model, quality, error: message });
          }

          // Small gap between generations to stay inside image rate limits.
          await new Promise((resolve) => setTimeout(resolve, 800));
        }
      }
    }

    return new Response(
      JSON.stringify({ success: true, runId, generated: results.length, results }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('image-model-bench error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : String(error) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
