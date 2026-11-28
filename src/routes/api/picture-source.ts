/**
 * Owner-only: the bytes of one story's picture, so the Desk's "Edit picture"
 * can reframe it in the browser. Publisher photos live on other sites that
 * don't let the browser read their pixels, so this fetches that story's own
 * picture (never an address from the caller) and hands it back.
 */
import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";

const MAX_BYTES = 15 * 1024 * 1024;
const UA = "Mozilla/5.0 (compatible; CuratrBot/1.0; +https://curatr.pro)";
const FRAMED = /\/topic-assets\/[0-9a-f-]{36}\/stories\/[0-9a-f-]{36}\/(?:publisher|cover)-\d+\.(?:webp|jpg)(?:\?|$)/i;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const fail = (status: number, error: string) =>
  Response.json({ error }, { status, headers: { "Cache-Control": "no-store" } });

function safeUrl(raw: string | null | undefined): URL | null {
  try {
    const u = new URL(raw || "");
    if (u.protocol !== "https:" && u.protocol !== "http:") return null;
    const h = u.hostname.toLowerCase();
    if (h === "localhost" || h.endsWith(".local") || h.endsWith(".internal") || h.startsWith("[") ||
      /^(127|10|0)\./.test(h) || /^192\.168\./.test(h) || /^169\.254\./.test(h) || /^172\.(1[6-9]|2\d|3[01])\./.test(h)) return null;
    return u;
  } catch { return null; }
}

function userClient(token: string) {
  const url = process.env["SUPABASE_URL"]!;
  const key = process.env["SUPABASE_PUBLISHABLE_KEY"]!;
  return createClient(url, key, {
    global: {
      headers: { Authorization: `Bearer ${token}` },
      fetch: ((input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
        const h = new Headers(init?.headers);
        h.set("apikey", key);
        return fetch(input, { ...init, headers: h });
      }) as unknown as typeof fetch,
    },
    auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
  });
}

export const Route = createFileRoute("/api/picture-source")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const auth = request.headers.get("authorization") || "";
        const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
        if (token.split(".").length !== 3) return fail(401, "Unauthorized");
        const body = (await request.json().catch(() => ({}))) as { storyId?: unknown };
        const storyId = typeof body.storyId === "string" && UUID.test(body.storyId) ? body.storyId : null;
        if (!storyId) return fail(400, "Missing story");

        const supabase = userClient(token);
        const { data: claims } = await supabase.auth.getClaims(token);
        if (!claims?.claims?.sub) return fail(401, "Unauthorized");

        const { data: storyRow } = await supabase.from("stories")
          .select("cover_illustration_url, cover_original_url, topic_article_id, article_id")
          .eq("id", storyId).maybeSingle();
        const story = storyRow as { cover_illustration_url: string | null; cover_original_url: string | null; topic_article_id: string | null; article_id: string | null } | null;
        if (!story) return fail(404, "Not found");
        let topicId: string | null = null;
        if (story.topic_article_id) {
          const { data } = await supabase.from("topic_articles").select("topic_id").eq("id", story.topic_article_id).maybeSingle();
          topicId = (data as { topic_id?: string } | null)?.topic_id ?? null;
        }
        if (!topicId && story.article_id) {
          const { data } = await supabase.from("articles").select("topic_id").eq("id", story.article_id).maybeSingle();
          topicId = (data as { topic_id?: string } | null)?.topic_id ?? null;
        }
        if (!topicId) return fail(403, "Forbidden");
        // can_manage_topic is revoked from browser roles: owner of the feed, or admin.
        const sub = String(claims.claims.sub);
        const { data: topicRow } = await supabase.from("topics").select("created_by").eq("id", topicId).maybeSingle();
        let allowed = (topicRow as { created_by?: string } | null)?.created_by === sub;
        if (!allowed) {
          for (const role of ["admin", "superadmin"]) {
            const { data: hasRole } = await supabase.rpc("has_role", { _user_id: sub, _role: role } as never);
            if ((hasRole as unknown) === true) { allowed = true; break; }
          }
        }
        if (!allowed) return fail(403, "Forbidden");

        const cover = story.cover_illustration_url;
        const source = cover && FRAMED.test(cover) && story.cover_original_url ? story.cover_original_url : cover;
        const url = safeUrl(source);
        if (!url) return fail(404, "No picture");
        try {
          const res = await fetch(url, { headers: { "User-Agent": UA, Accept: "image/jpeg,image/png,image/webp,image/*" }, redirect: "follow", signal: AbortSignal.timeout(15_000) });
          const type = (res.headers.get("content-type") || "").split(";")[0]!.trim();
          if (!res.ok || !type.startsWith("image/") || Number(res.headers.get("content-length") || 0) > MAX_BYTES) {
            await res.body?.cancel();
            return fail(502, "Picture unavailable");
          }
          const bytes = await res.arrayBuffer();
          if (bytes.byteLength > MAX_BYTES) return fail(502, "Picture too large");
          return new Response(bytes, { headers: { "Content-Type": type, "Cache-Control": "no-store" } });
        } catch (e) {
          console.error("picture-source fetch failed", e);
          return fail(502, "Picture unavailable");
        }
      },
    },
  },
});
