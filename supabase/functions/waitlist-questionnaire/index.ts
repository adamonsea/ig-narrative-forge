import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { z } from 'https://esm.sh/zod@3.23.8';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

const PREVIEW_PREFIX = 'preview-';

const AnswersSchema = z.object({
  feed_kind: z.array(z.string().max(60)).max(6).default([]),
  feed_name: z.string().max(160).optional().default(''),
  audience: z.string().max(60).optional().default(''),
  today: z.string().max(60).optional().default(''),
  resonated: z.array(z.string().max(60)).max(2).default([]),
  blockers: z.array(z.string().max(60)).max(6).default([]),
  blockers_detail: z.string().max(600).optional().default(''),
  price_band: z.string().max(30).optional().default(''),
  wishlist: z.string().max(1000).optional().default(''),
});

const SubmitSchema = z.object({
  token: z.string().min(6).max(120),
  answers: AnswersSchema,
  wants_early_access: z.boolean().default(false),
});

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  );

  try {
    if (req.method === 'GET') {
      const token = new URL(req.url).searchParams.get('token') ?? '';
      if (!token) return json({ error: 'Missing token' }, 400);

      if (token.startsWith(PREVIEW_PREFIX)) {
        return json({ valid: true, preview: true, email: null, completed: false });
      }

      const { data: entry } = await supabase
        .from('waitlist')
        .select('id, email')
        .eq('invite_token', token)
        .maybeSingle();

      if (!entry) return json({ error: 'This link is no longer valid' }, 404);

      const { data: existing } = await supabase
        .from('waitlist_responses')
        .select('id, completed_at')
        .eq('waitlist_id', entry.id)
        .not('completed_at', 'is', null)
        .maybeSingle();

      return json({
        valid: true,
        preview: false,
        email: entry.email,
        completed: !!existing,
      });
    }

    if (req.method === 'POST') {
      const parsed = SubmitSchema.safeParse(await req.json());
      if (!parsed.success) {
        return json({ error: 'Invalid submission', details: parsed.error.flatten().fieldErrors }, 400);
      }
      const { token, answers, wants_early_access } = parsed.data;

      if (token.startsWith(PREVIEW_PREFIX)) {
        await supabase.from('waitlist_responses').insert({
          waitlist_id: null,
          answers,
          wants_early_access,
          is_preview: true,
          completed_at: new Date().toISOString(),
        });
        return json({ success: true, preview: true });
      }

      const { data: entry } = await supabase
        .from('waitlist')
        .select('id')
        .eq('invite_token', token)
        .maybeSingle();

      if (!entry) return json({ error: 'This link is no longer valid' }, 404);

      const { error } = await supabase.from('waitlist_responses').insert({
        waitlist_id: entry.id,
        answers,
        wants_early_access,
        is_preview: false,
        completed_at: new Date().toISOString(),
      });

      if (error) {
        console.error('waitlist-questionnaire insert failed:', error);
        return json({ error: 'Could not save your answers' }, 500);
      }

      return json({ success: true });
    }

    return json({ error: 'Method not allowed' }, 405);
  } catch (err) {
    console.error('waitlist-questionnaire error:', err);
    return json({ error: 'Something went wrong' }, 500);
  }
});