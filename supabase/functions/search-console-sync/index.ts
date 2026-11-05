// Daily: pull Google Search Console figures for curatr.pro feed/story pages into search_daily.
// Internal only (service role). Needs secret GSC_SERVICE_ACCOUNT_JSON.
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const b64url = (buf: ArrayBuffer | Uint8Array | string) => {
  const bytes = typeof buf === "string" ? new TextEncoder().encode(buf) : new Uint8Array(buf as ArrayBuffer);
  let s = ""; bytes.forEach((b) => (s += String.fromCharCode(b)));
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};

async function googleToken(sa: { client_email: string; private_key: string }) {
  const now = Math.floor(Date.now() / 1000);
  const head = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claim = b64url(JSON.stringify({
    iss: sa.client_email, scope: "https://www.googleapis.com/auth/webmasters.readonly",
    aud: "https://oauth2.googleapis.com/token", iat: now, exp: now + 3600,
  }));
  const pem = sa.private_key.replace(/-----[^-]+-----/g, "").replace(/\s+/g, "");
  const der = Uint8Array.from(atob(pem), (c) => c.charCodeAt(0));
  const key = await crypto.subtle.importKey("pkcs8", der, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(`${head}.${claim}`));
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: `${head}.${claim}.${b64url(sig)}` }),
  });
  if (!res.ok) throw new Error(`Google token failed [${res.status}]: ${await res.text()}`);
  return (await res.json()).access_token as string;
}

const iso = (d: Date) => d.toISOString().slice(0, 10);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
  const auth = req.headers.get("Authorization")?.replace("Bearer ", "") ?? req.headers.get("apikey") ?? "";
  if (auth !== serviceKey && auth !== anonKey) return json({ error: "Unauthorized" }, 401);

  const raw = Deno.env.get("GSC_SERVICE_ACCOUNT_JSON");
  if (!raw) return json({ skipped: "GSC_SERVICE_ACCOUNT_JSON not set" });

  try {
    const sa = JSON.parse(raw);
    const token = await googleToken(sa);
    const gh = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };

    // Pick the verified property covering curatr.pro (prefer domain property).
    const sitesRes = await fetch("https://www.googleapis.com/webmasters/v3/sites", { headers: gh });
    if (!sitesRes.ok) throw new Error(`List properties failed [${sitesRes.status}]: ${await sitesRes.text()}`);
    const sites = ((await sitesRes.json()).siteEntry ?? []).filter((e: any) => e.permissionLevel !== "siteUnverifiedUser");
    const site = sites.find((e: any) => e.siteUrl === "sc-domain:curatr.pro") ?? sites.find((e: any) => e.siteUrl === "https://curatr.pro/");
    if (!site) return json({ error: "No verified Search Console property for curatr.pro is shared with the service account" }, 400);
    const siteUrl: string = site.siteUrl;

    // Last 5 days up to 2 days ago (Google lags 2-3 days); re-written each run so late data fills in.
    const end = new Date(Date.now() - 2 * 86400000), start = new Date(Date.now() - 6 * 86400000);
    const query = async (dimensions: string[]) => {
      const rows: any[] = [];
      for (let startRow = 0; ; startRow += 25000) {
        const r = await fetch(`https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(siteUrl)}/searchAnalytics/query`, {
          method: "POST", headers: gh,
          body: JSON.stringify({ startDate: iso(start), endDate: iso(end), dimensions, rowLimit: 25000, startRow, dataState: "all" }),
        });
        if (!r.ok) throw new Error(`Search query failed [${r.status}]: ${await r.text()}`);
        const batch = (await r.json()).rows ?? [];
        rows.push(...batch);
        if (batch.length < 25000) break;
      }
      return rows;
    };

    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, serviceKey);
    const { data: topics } = await supabase.from("topics").select("id, slug").not("slug", "is", null);
    const bySlug = new Map((topics ?? []).map((t: any) => [String(t.slug).toLowerCase(), t.id]));

    const mapPath = (url: string) => {
      let path: string;
      try { path = new URL(url).pathname; } catch { return null; }
      const m = path.match(/^\/feed\/([^/]+)(\/.*)?$/i);
      if (!m) return null;
      const topicId = bySlug.get(decodeURIComponent(m[1]).toLowerCase());
      if (!topicId) return null;
      const sm = path.match(/\/story\/([0-9a-f-]{36})/i);
      return { path: path.replace(/\/$/, "") || "/", topicId, storyId: sm ? sm[1] : null };
    };

    const agg = new Map<string, any>();
    for (const r of await query(["date", "page"])) {
      const m = mapPath(r.keys[1]); if (!m) continue;
      const k = `${r.keys[0]}|${m.path}`;
      const a = agg.get(k) ?? { day: r.keys[0], page_path: m.path, topic_id: m.topicId, story_id: m.storyId, impressions: 0, clicks: 0, posw: 0, top_query: null, tq: 0 };
      a.impressions += r.impressions; a.clicks += r.clicks; a.posw += r.position * r.impressions;
      agg.set(k, a);
    }
    // Top query per page/day where Google reveals it (never summed into totals).
    for (const r of await query(["date", "page", "query"])) {
      const m = mapPath(r.keys[1]); if (!m) continue;
      const a = agg.get(`${r.keys[0]}|${m.path}`); if (!a) continue;
      const score = r.clicks * 1000 + r.impressions;
      if (score > a.tq) { a.tq = score; a.top_query = r.keys[2]; }
    }

    const rows = [...agg.values()].map((a) => ({
      day: a.day, page_path: a.page_path, topic_id: a.topic_id, story_id: a.story_id,
      impressions: a.impressions, clicks: a.clicks,
      avg_position: a.impressions ? Math.round((a.posw / a.impressions) * 10) / 10 : null,
      top_query: a.top_query, updated_at: new Date().toISOString(),
    }));
    for (let i = 0; i < rows.length; i += 500) {
      const { error } = await supabase.from("search_daily").upsert(rows.slice(i, i + 500), { onConflict: "day,page_path" });
      if (error) throw error;
    }
    return json({ ok: true, property: siteUrl, from: iso(start), to: iso(end), rows: rows.length });
  } catch (e) {
    console.error("search-console-sync failed:", e);
    return json({ error: String((e as Error).message ?? e) }, 500);
  }
});
