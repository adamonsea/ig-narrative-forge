// Public: saves a reader's browser-notification subscription for a public feed.
// Readers can't write signups directly (owner/service-only table), so this validates and saves.
import { serve } from 'https://deno.land/std@0.192.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.55.0';
import { parsePushRequest } from './validate.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

const sha256 = async (s: string) =>
  Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s))))
    .map((b) => b.toString(16).padStart(2, '0')).join('');

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  try {
    const parsed = parsePushRequest(await req.json().catch(() => null));
    if ('error' in parsed) return json({ error: parsed.error }, 400);
    const { topicId, notificationType, subscription } = parsed;

    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

    const { data: topic } = await supabase.from('topics').select('id, is_public, is_active').eq('id', topicId).maybeSingle();
    if (!topic || !topic.is_public || !topic.is_active) return json({ error: 'Feed not available' }, 404);

    const ip = req.headers.get('cf-connecting-ip') || req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || null;
    const endpointHash = await sha256(subscription.endpoint);
    const ipHash = ip ? (await sha256(ip)).slice(0, 16) : null;
    const { data: allowed, error: rlError } = await supabase.rpc('check_newsletter_signup_rate_limit', { p_email_hash: endpointHash, p_ip_hash: ipHash });
    if (rlError) { console.error('Rate limit check error:', rlError); return json({ error: 'Please try again' }, 500); }
    if (!allowed) return json({ error: 'Too many attempts', rateLimited: true }, 429);
    await supabase.rpc('record_newsletter_signup_attempt', { p_email_hash: endpointHash, p_ip_hash: ipHash });

    // Same browser + feed + type: refresh the row instead of adding another
    const { data: existing } = await supabase.from('topic_newsletter_signups').select('id')
      .eq('topic_id', topicId).eq('notification_type', notificationType)
      .eq('push_subscription->>endpoint', subscription.endpoint).limit(1).maybeSingle();

    const now = new Date().toISOString();
    const { error } = existing
      ? await supabase.from('topic_newsletter_signups').update({ push_subscription: subscription, is_active: true, updated_at: now }).eq('id', existing.id)
      : await supabase.from('topic_newsletter_signups').insert({
          topic_id: topicId, push_subscription: subscription, notification_type: notificationType,
          frequency: notificationType, is_active: true, consent_given_at: now, consent_ip_hash: ipHash, signup_source: 'feed',
        });
    if (error) { console.error('Save push subscription error:', error); return json({ error: 'Could not save' }, 500); }
    return json({ success: true });
  } catch (e) {
    console.error('save-push-subscription error:', e);
    return json({ error: 'Please try again' }, 500);
  }
});
