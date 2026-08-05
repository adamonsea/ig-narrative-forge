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

async function sendAlertEmail(subject: string, body: string): Promise<boolean> {
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
      html: `<pre style="font:14px/1.5 ui-monospace,monospace;white-space:pre-wrap">${body}</pre>`,
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
    "Supabase status page: https://status.supabase.com",
    "Project dashboard:    https://supabase.com/dashboard/project/fpoywkjgdapgjtdeooak",
  ].join("\n");

  const emailed = await sendAlertEmail(subject, body);
  console.error(`[platform-outage-alert] ${subject} (emailed=${emailed})`);

  return new Response(
    JSON.stringify({ ok: false, degradedOnly, emailed, ...probe, checkedAt }),
    { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});
