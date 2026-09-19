// Nudges homepage leads who gave an email but never built a feed.
// Runs daily on a schedule; only ever emails a lead once.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { Resend } from 'npm:resend@4.0.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const escapeHtml = (s: string) =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  );

  try {
    const cutoff = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
    const { data: leads, error } = await supabase
      .from('feed_leads')
      .select('id, email, blueprint, user_id')
      .not('email', 'is', null)
      .is('nudge_sent_at', null)
      .lt('created_at', cutoff)
      .limit(50);

    if (error) throw error;

    const resendApiKey = Deno.env.get('RESEND_API_KEY');
    if (!resendApiKey) {
      return new Response(JSON.stringify({ skipped: 'RESEND_API_KEY not configured' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const resend = new Resend(resendApiKey);

    let sent = 0;
    for (const lead of leads ?? []) {
      // Skip anyone who already built a feed.
      if (lead.user_id) {
        const { count } = await supabase
          .from('topics')
          .select('id', { count: 'exact', head: true })
          .eq('created_by', lead.user_id);
        if ((count ?? 0) > 0) {
          await supabase.from('feed_leads').update({ nudge_sent_at: new Date().toISOString() }).eq('id', lead.id);
          continue;
        }
      }

      const title = escapeHtml(lead.blueprint?.feed_title ?? 'your feed');
      const html = `
<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;background:#f5f5f3;padding:32px 16px;">
  <div style="max-width:560px;margin:0 auto;background:#fff;border:1px solid #e6e6e1;border-radius:14px;padding:28px;">
    <h1 style="margin:0 0 14px 0;font-size:22px;color:#0f172a;">${title} is still waiting</h1>
    <p style="margin:0 0 14px 0;font-size:15px;line-height:1.6;color:#334155;">
      You started building a feed on Curatr but haven't finished setting it up. It takes about a minute —
      we find the sources, gather the stories, and you decide what gets published.
    </p>
    <p style="margin:24px 0 0 0;">
      <a href="https://curatr.pro/dashboard" style="background:#0f172a;color:#fff;text-decoration:none;padding:12px 22px;border-radius:999px;font-size:15px;display:inline-block;">Finish building it</a>
    </p>
    <p style="margin:24px 0 0 0;font-size:13px;color:#94a3b8;">Curatr · curatr.pro</p>
  </div>
</div>`;

      const { error: sendError } = await resend.emails.send({
        from: 'Curatr <noreply@curatr.pro>',
        to: [lead.email as string],
        subject: `${lead.blueprint?.feed_title ?? 'Your feed'} is ready when you are`,
        html,
        text: `Your feed is still waiting on Curatr. Finish building it: https://curatr.pro/dashboard`,
      });
      if (sendError) {
        console.error('feed-lead-nudge send error', sendError);
        continue;
      }
      await supabase.from('feed_leads').update({ nudge_sent_at: new Date().toISOString() }).eq('id', lead.id);
      sent += 1;
    }

    return new Response(JSON.stringify({ success: true, sent, considered: leads?.length ?? 0 }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('feed-lead-nudge failed', err);
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : 'failed' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
