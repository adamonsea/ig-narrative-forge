// Platform outage watchdog.
// Designed to be called by an EXTERNAL uptime monitor (cron-job.org, UptimeRobot, etc.)
// because pg_cron cannot fire when the database itself is unreachable.
//
// GET /platform-outage-alert?key=<OUTAGE_ALERT_TOKEN>
// Returns 200 {ok:true} when the data API responds, 503 + sends an email when it does not.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const ALERT_TO = "adamonsea@gmail.com";
const PROBE_TIMEOUT_MS = 12000;
const PROJECT_REF = "fpoywkjgdapgjtdeooak";
const RESTART_URL = `https://supabase.com/dashboard/project/${PROJECT_REF}/settings/general`;
const HEALTH_URL = `https://supabase.com/dashboard/project/${PROJECT_REF}/reports/database`;
const STATUS_URL = "https://status.supabase.com";

async function probeDataApi(): Promise<{ ok: boolean; status?: number; latencyMs: number; error?: string }> {
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const started = Date.now();

  if (!url || !key) {
    return { ok: false, latencyMs: 0, error: "Missing Supabase environment configuration" };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);

  try {
    const res = await fetch(`${url}/rest/v1/topics?select=id&limit=1`, {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
      signal: controller.signal,
    });
    await res.text();
    const latencyMs = Date.now() - started;
    return { ok: res.ok, status: res.status, latencyMs, error: res.ok ? undefined : `HTTP ${res.status}` };
  } catch (err) {
    return {
      ok: false,
      latencyMs: Date.now() - started,
      error: err instanceof Error ? err.message : String(err),
    };
  } finally {
    clearTimeout(timer);
  }
}

async function sendAlertEmail(subject: string, body: string, html: string): Promise<boolean> {
  const resendKey = Deno.env.get("RESEND_API_KEY");
  if (!resendKey) {
    console.error("[platform-outage-alert] RESEND_API_KEY missing — cannot email");
    return false;
  }

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${resendKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: "Curatr Alerts <alerts@curatr.pro>",
      to: [ALERT_TO],
      subject,
      text: body,
      html,
    }),
  });

  if (!res.ok) {
    console.error(`[platform-outage-alert] Resend failed [${res.status}]: ${await res.text()}`);
    return false;
  }
  return true;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const expected = Deno.env.get("OUTAGE_ALERT_TOKEN");
  const provided = new URL(req.url).searchParams.get("key") ??
    req.headers.get("x-outage-token") ?? "";

  if (!expected || provided !== expected) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const probe = await probeDataApi();
  const checkedAt = new Date().toISOString();

  if (probe.ok && probe.latencyMs < 5000) {
    return new Response(
      JSON.stringify({ ok: true, latencyMs: probe.latencyMs, checkedAt }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  const degradedOnly = probe.ok;
  const subject = degradedOnly
    ? `⚠️ Curatr: database slow (${probe.latencyMs}ms)`
    : "🔴 Curatr: database unreachable — site is down";

  const body = [
    subject,
    "",
    `Checked at:  ${checkedAt}`,
    `Data API:    ${probe.ok ? "responding" : "FAILED"}`,
    `HTTP status: ${probe.status ?? "n/a"}`,
    `Latency:     ${probe.latencyMs}ms`,
    `Error:       ${probe.error ?? "none"}`,
    "",
    "FIRST ACTION — restart the project (no data loss, ~1-2 min):",
    `${RESTART_URL}   → scroll to "Restart project"`,
    "",
    `Database health/load: ${HEALTH_URL}`,
    `Supabase status page: ${STATUS_URL}`,
  ].join("\n");

  const html = `
    <div style="font:15px/1.6 -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#111">
      <h2 style="margin:0 0 12px;font-size:18px">${subject}</h2>
      <p style="margin:0 0 16px">
        <a href="${RESTART_URL}"
           style="display:inline-block;background:#111;color:#fff;text-decoration:none;padding:12px 20px;border-radius:8px;font-weight:600">
          Restart the Supabase project →
        </a>
      </p>
      <p style="margin:0 0 20px;font-size:13px;color:#555">
        On that page scroll to <strong>Restart project</strong>. It bounces Postgres and the
        connection pooler, clears stuck connections, and does not lose any data (~1–2 minutes).
      </p>
      <pre style="font:13px/1.6 ui-monospace,monospace;white-space:pre-wrap;background:#f6f6f4;padding:14px;border-radius:8px;margin:0 0 16px">Checked at:  ${checkedAt}
Data API:    ${probe.ok ? "responding" : "FAILED"}
HTTP status: ${probe.status ?? "n/a"}
Latency:     ${probe.latencyMs}ms
Error:       ${probe.error ?? "none"}</pre>
      <p style="margin:0;font-size:13px">
        <a href="${HEALTH_URL}">Database health &amp; load</a> ·
        <a href="${STATUS_URL}">Supabase status page</a>
      </p>
    </div>`;

  const emailed = await sendAlertEmail(subject, body, html);
  console.error(`[platform-outage-alert] ${subject} (emailed=${emailed})`);

  return new Response(
    JSON.stringify({ ok: false, degradedOnly, emailed, ...probe, checkedAt }),
    { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});
