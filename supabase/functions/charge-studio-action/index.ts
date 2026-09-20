import { serve } from 'https://deno.land/std@0.190.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getUser, isAdmin } from '../_shared/auth.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

/** Server-side rate card for client-rendered studio actions. */
const ACTION_COSTS: Record<string, { credits: number; label: string }> = {
  story_reel: { credits: 5, label: 'Story reel export (9:16 MP4)' },
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  const service = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false } }
  );

  try {
    const user = await getUser(req);
    if (!user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { action, storyId, phase, idempotencyKey } = await req.json();
    const config = ACTION_COSTS[action];
    if (!config || !idempotencyKey) {
      return new Response(JSON.stringify({ error: 'Invalid request' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (await isAdmin(service, user.id)) {
      return new Response(JSON.stringify({ success: true, credits_used: 0 }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (phase === 'settle' || phase === 'release') {
      const rpc = phase === 'settle' ? 'settle_credit_reservation' : 'release_credit_reservation';
      const { data, error } = await service.rpc(rpc, {
        p_user_id: user.id,
        p_idempotency_key: idempotencyKey,
      });
      if (error || !data?.success) {
        return new Response(JSON.stringify({ error: data?.error || error?.message || 'Could not update reservation' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data, error } = await service.rpc('reserve_user_credits', {
      p_user_id: user.id,
      p_amount: config.credits,
      p_idempotency_key: idempotencyKey,
      p_description: config.label,
      p_story_id: storyId ?? null,
    });

    if (error || !data?.success) {
      return new Response(JSON.stringify({ error: data?.error || 'Not enough credits' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ success: true, credits_used: config.credits }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('charge-studio-action error:', err);
    return new Response(JSON.stringify({ error: 'Request failed' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
