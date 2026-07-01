import { serve } from "https://deno.land/std@0.192.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { Resend } from "npm:resend@4.0.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const OWNER_EMAIL = "adamonsea@gmail.com";
const WINDOW_DAYS = 7;

type ReasonCode =
  | "feed_404"
  | "blocked"
  | "needs_bypass_head"
  | "age_cutoff"
  | "no_new_urls"
  | "inactive"
  | "healthy"
  | "unknown";

interface Classification {
  reason_code: ReasonCode;
  reason_detail: string;
}

// Classify why a source produced 0 articles based on the strongest available signal.
function classifyReason(source: any, latestDaily: any): Classification {
  const failure = (source.last_failure_reason || "").toString();
  const dailyErr = (latestDaily?.error_message || "").toString();
  const blob = `${failure} ${dailyErr}`.toLowerCase();

  if (/(404|not found|feed url|no feed|invalid feed|xml parse|not xml)/.test(blob)) {
    return { reason_code: "feed_404", reason_detail: failure || dailyErr || "Feed URL returns 404 / no valid feed found" };
  }
  if (/(403|forbidden|blocked|captcha|cloudflare|waf|anti-?bot|access denied)/.test(blob)) {
    return { reason_code: "blocked", reason_detail: failure || dailyErr || "Blocked by anti-bot / WAF (403)" };
  }
  if (/(head request|bypasshead|method not allowed|405)/.test(blob)) {
    return { reason_code: "needs_bypass_head", reason_detail: failure || dailyErr || "HEAD probe rejected — needs bypassHead" };
  }
  if (/(too old|age|expired|max_age|cutoff|older than)/.test(blob)) {
    return { reason_code: "age_cutoff", reason_detail: failure || dailyErr || "All articles rejected by age cutoff" };
  }
  if (latestDaily && (latestDaily.total_urls_discovered || 0) > 0 && (latestDaily.new_urls_found || 0) === 0) {
    return { reason_code: "no_new_urls", reason_detail: "URLs discovered but none new (all previously seen)" };
  }
  if (dailyErr) {
    return { reason_code: "unknown", reason_detail: dailyErr };
  }
  if (failure) {
    return { reason_code: "unknown", reason_detail: failure };
  }
  return { reason_code: "no_new_urls", reason_detail: "No articles ingested and no error recorded — likely no new content published" };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const resendApiKey = Deno.env.get("RESEND_API_KEY");
  const supabase = createClient(supabaseUrl, serviceKey);

  try {
    let sendEmail = true;
    try {
      const body = await req.json();
      if (body && body.sendEmail === false) sendEmail = false;
    } catch (_) { /* no body */ }

    const since = new Date(Date.now() - WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString();
    const sinceDate = since.split("T")[0];

    // 1. Active sources
    const { data: sources, error: sourcesError } = await supabase
      .from("content_sources")
      .select("id, source_name, canonical_domain, topic_id, is_active, last_failure_reason")
      .eq("is_active", true);
    if (sourcesError) throw sourcesError;

    // 2. Article counts per source in window
    const { data: recentArticles, error: articlesError } = await supabase
      .from("articles")
      .select("source_id")
      .gte("created_at", since)
      .not("source_id", "is", null)
      .limit(10000);
    if (articlesError) throw articlesError;

    const countBySource: Record<string, number> = {};
    for (const a of recentArticles || []) {
      if (a.source_id) countBySource[a.source_id] = (countBySource[a.source_id] || 0) + 1;
    }

    // 3. Latest daily availability per source in window (for reason signals)
    const { data: daily } = await supabase
      .from("daily_content_availability")
      .select("source_id, error_message, new_urls_found, total_urls_discovered, check_date")
      .gte("check_date", sinceDate)
      .order("check_date", { ascending: false });

    const latestDailyBySource: Record<string, any> = {};
    for (const d of daily || []) {
      if (d.source_id && !latestDailyBySource[d.source_id]) latestDailyBySource[d.source_id] = d;
    }

    const rows: any[] = [];
    const flagged: any[] = [];

    for (const s of sources || []) {
      const count = countBySource[s.id] || 0;
      let status = "healthy";
      let reason_code: ReasonCode = "healthy";
      let reason_detail = `${count} article(s) in last ${WINDOW_DAYS} days`;

      if (count === 0) {
        const classified = classifyReason(s, latestDailyBySource[s.id]);
        reason_code = classified.reason_code;
        reason_detail = classified.reason_detail;
        status = reason_code === "blocked" || reason_code === "feed_404" || reason_code === "needs_bypass_head"
          ? "failing"
          : "zero_articles";
      }

      const row = {
        source_id: s.id,
        topic_id: s.topic_id,
        source_name: s.source_name,
        canonical_domain: s.canonical_domain,
        status,
        reason_code,
        reason_detail,
        articles_last_window: count,
        window_days: WINDOW_DAYS,
        checked_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      rows.push(row);
      if (status !== "healthy") flagged.push(row);
    }

    // 4. Persist (upsert on source_id)
    if (rows.length > 0) {
      const { error: upsertError } = await supabase
        .from("source_health_checks")
        .upsert(rows, { onConflict: "source_id" });
      if (upsertError) throw upsertError;
    }

    // 5. Email the owner a summary if anything is flagged
    let emailed = false;
    if (sendEmail && flagged.length > 0 && resendApiKey) {
      const resend = new Resend(resendApiKey);
      const rowsHtml = flagged
        .sort((a, b) => a.status.localeCompare(b.status))
        .map(
          (f) => `
            <tr>
              <td style="padding:8px;border-bottom:1px solid #eee;">${f.source_name}${f.canonical_domain ? ` <span style="color:#888;">(${f.canonical_domain})</span>` : ""}</td>
              <td style="padding:8px;border-bottom:1px solid #eee;"><span style="font-weight:600;color:${f.status === "failing" ? "#c0392b" : "#b7791f"}">${f.status}</span></td>
              <td style="padding:8px;border-bottom:1px solid #eee;">${f.reason_code}</td>
              <td style="padding:8px;border-bottom:1px solid #eee;color:#555;">${f.reason_detail}</td>
            </tr>`
        )
        .join("");

      const html = `
        <div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;max-width:720px;margin:0 auto;">
          <h2 style="color:#111;">Source Health Report</h2>
          <p style="color:#555;">${flagged.length} source(s) produced <strong>0 articles</strong> in the last ${WINDOW_DAYS} days.</p>
          <table style="width:100%;border-collapse:collapse;font-size:14px;">
            <thead>
              <tr style="text-align:left;background:#fafafa;">
                <th style="padding:8px;border-bottom:2px solid #eee;">Source</th>
                <th style="padding:8px;border-bottom:2px solid #eee;">Status</th>
                <th style="padding:8px;border-bottom:2px solid #eee;">Reason</th>
                <th style="padding:8px;border-bottom:2px solid #eee;">Detail</th>
              </tr>
            </thead>
            <tbody>${rowsHtml}</tbody>
          </table>
          <p style="color:#888;font-size:12px;margin-top:24px;">Generated ${new Date().toUTCString()} · View details in the Admin panel.</p>
        </div>`;

      try {
        await resend.emails.send({
          from: "Curatr Health <noreply@curatr.pro>",
          to: [OWNER_EMAIL],
          subject: `⚠️ ${flagged.length} source(s) producing 0 articles`,
          html,
        });
        emailed = true;
      } catch (mailErr) {
        console.error("Failed to send health email:", mailErr);
      }
    }

    console.log(`[source-health-monitor] checked ${rows.length}, flagged ${flagged.length}, emailed=${emailed}`);

    return new Response(
      JSON.stringify({
        success: true,
        checked: rows.length,
        flagged: flagged.length,
        emailed,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("[source-health-monitor] error:", error);
    return new Response(
      JSON.stringify({ success: false, error: "Health check failed" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});