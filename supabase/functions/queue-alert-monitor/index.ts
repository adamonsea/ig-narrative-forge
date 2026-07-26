import { serve } from "https://deno.land/std@0.192.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { Resend } from "npm:resend@4.0.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const OWNER_EMAIL = "adamonsea@gmail.com";
// A job is "stuck" if it has been processing longer than this
const STUCK_PROCESSING_MINUTES = 15;
// A job is "stalled" if pending / retrying for longer than this without moving
const STALLED_PENDING_MINUTES = 45;
// Don't re-notify the same alert key more often than this
const DEDUP_WINDOW_HOURS = 6;

interface QueueJob {
  id: string;
  status: string;
  attempts: number;
  max_attempts: number;
  error_message: string | null;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
  slidetype: string | null;
  article_id: string | null;
  topic_article_id: string | null;
  ai_provider: string | null;
  result_data: any;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function classify(job: QueueJob): { category: string; ageMinutes: number } {
  const now = Date.now();
  if (job.status === "failed" && (job.attempts || 0) >= (job.max_attempts || 3)) {
    const t = job.completed_at || job.started_at || job.created_at;
    return { category: "repeatedly_failed", ageMinutes: Math.round((now - Date.parse(t)) / 60000) };
  }
  if (job.status === "processing" && job.started_at) {
    const mins = (now - Date.parse(job.started_at)) / 60000;
    if (mins >= STUCK_PROCESSING_MINUTES) {
      return { category: "stuck_processing", ageMinutes: Math.round(mins) };
    }
  }
  if (job.status === "pending" && job.attempts >= 1) {
    const t = job.started_at || job.created_at;
    const mins = (now - Date.parse(t)) / 60000;
    if (mins >= STALLED_PENDING_MINUTES) {
      return { category: "stalled_pending", ageMinutes: Math.round(mins) };
    }
  }
  return { category: "", ageMinutes: 0 };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const resendApiKey = Deno.env.get("RESEND_API_KEY");
  const supabase = createClient(supabaseUrl, serviceKey);

  try {
    let force = false;
    try {
      const body = await req.json();
      if (body && body.force === true) force = true;
    } catch (_) { /* no body */ }

    // Widen the fetch window so we catch both failed and stuck items
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { data: jobs, error } = await supabase
      .from("content_generation_queue")
      .select("id,status,attempts,max_attempts,error_message,created_at,started_at,completed_at,slidetype,article_id,topic_article_id,ai_provider,result_data")
      .in("status", ["failed", "processing", "pending"])
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(500);
    if (error) throw error;

    const flagged: Array<{ job: QueueJob; category: string; ageMinutes: number; alertKey: string }> = [];
    for (const job of (jobs || []) as QueueJob[]) {
      const { category, ageMinutes } = classify(job);
      if (!category) continue;
      // Alert key: one alert per job per category (dedup regardless of retries)
      const alertKey = `${job.id}:${category}`;
      flagged.push({ job, category, ageMinutes, alertKey });
    }

    if (flagged.length === 0) {
      return new Response(JSON.stringify({ success: true, flagged: 0, emailed: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Deduplicate against recent notifications
    const keys = flagged.map((f) => f.alertKey);
    const cutoff = new Date(Date.now() - DEDUP_WINDOW_HOURS * 60 * 60 * 1000).toISOString();
    const { data: recentLogs } = await supabase
      .from("queue_alert_log")
      .select("alert_key,last_notified_at")
      .in("alert_key", keys)
      .gte("last_notified_at", cutoff);
    const alreadyNotified = new Set((recentLogs || []).map((r: any) => r.alert_key));

    const toNotify = force ? flagged : flagged.filter((f) => !alreadyNotified.has(f.alertKey));

    if (toNotify.length === 0) {
      return new Response(JSON.stringify({ success: true, flagged: flagged.length, emailed: 0, skipped_deduped: flagged.length }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let emailed = false;
    if (resendApiKey) {
      const resend = new Resend(resendApiKey);
      const rowsHtml = toNotify
        .sort((a, b) => a.category.localeCompare(b.category))
        .map(({ job, category, ageMinutes }) => {
          const errRaw = job.error_message || (job.result_data && (job.result_data.error || job.result_data.message)) || "(no error message captured)";
          const err = escapeHtml(String(errRaw)).slice(0, 2000);
          const colour = category === "repeatedly_failed" ? "#c0392b" : category === "stuck_processing" ? "#b7791f" : "#7d5fff";
          return `
            <tr>
              <td style="padding:8px;border-bottom:1px solid #eee;font-family:monospace;font-size:12px;">${job.id.slice(0, 8)}…</td>
              <td style="padding:8px;border-bottom:1px solid #eee;"><span style="font-weight:600;color:${colour}">${category}</span></td>
              <td style="padding:8px;border-bottom:1px solid #eee;">${escapeHtml(job.slidetype || "-")}</td>
              <td style="padding:8px;border-bottom:1px solid #eee;">${job.attempts}/${job.max_attempts}</td>
              <td style="padding:8px;border-bottom:1px solid #eee;">${ageMinutes}m</td>
              <td style="padding:8px;border-bottom:1px solid #eee;color:#555;"><pre style="white-space:pre-wrap;margin:0;font-size:12px;">${err}</pre></td>
            </tr>`;
        })
        .join("");

      const summary = {
        repeatedly_failed: toNotify.filter((f) => f.category === "repeatedly_failed").length,
        stuck_processing: toNotify.filter((f) => f.category === "stuck_processing").length,
        stalled_pending: toNotify.filter((f) => f.category === "stalled_pending").length,
      };

      const html = `
        <div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;max-width:920px;margin:0 auto;">
          <h2 style="color:#111;">Queue Alert — ${toNotify.length} job(s) need attention</h2>
          <p style="color:#555;">
            Repeatedly failed: <strong>${summary.repeatedly_failed}</strong> ·
            Stuck processing (&gt;${STUCK_PROCESSING_MINUTES}m): <strong>${summary.stuck_processing}</strong> ·
            Stalled pending (&gt;${STALLED_PENDING_MINUTES}m): <strong>${summary.stalled_pending}</strong>
          </p>
          <table style="width:100%;border-collapse:collapse;font-size:13px;">
            <thead>
              <tr style="text-align:left;background:#fafafa;">
                <th style="padding:8px;border-bottom:2px solid #eee;">Job</th>
                <th style="padding:8px;border-bottom:2px solid #eee;">Category</th>
                <th style="padding:8px;border-bottom:2px solid #eee;">Slide</th>
                <th style="padding:8px;border-bottom:2px solid #eee;">Attempts</th>
                <th style="padding:8px;border-bottom:2px solid #eee;">Age</th>
                <th style="padding:8px;border-bottom:2px solid #eee;">Last error / HTTP payload</th>
              </tr>
            </thead>
            <tbody>${rowsHtml}</tbody>
          </table>
          <p style="color:#888;font-size:12px;margin-top:24px;">Generated ${new Date().toUTCString()} · Use Admin → Queue Manager → Retrigger to reset.</p>
        </div>`;

      try {
        await resend.emails.send({
          from: "Curatr Queue <noreply@curatr.pro>",
          to: [OWNER_EMAIL],
          subject: `⚠️ Queue: ${toNotify.length} job(s) failed or stuck`,
          html,
        });
        emailed = true;
      } catch (mailErr) {
        console.error("[queue-alert-monitor] email failed:", mailErr);
      }
    } else {
      console.warn("[queue-alert-monitor] RESEND_API_KEY not configured; skipping email");
    }

    // Record dedup entries (upsert) even if email failed to avoid tight loops
    if (toNotify.length > 0) {
      const now = new Date().toISOString();
      await supabase
        .from("queue_alert_log")
        .upsert(
          toNotify.map((f) => ({ alert_key: f.alertKey, job_id: f.job.id, last_notified_at: now })),
          { onConflict: "alert_key" }
        );
    }

    return new Response(
      JSON.stringify({ success: true, flagged: flagged.length, notified: toNotify.length, emailed }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("[queue-alert-monitor] error:", err);
    return new Response(JSON.stringify({ success: false, error: "Queue alert check failed" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});