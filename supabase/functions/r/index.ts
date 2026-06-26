import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

Deno.serve(async (req) => {
  // Extract code from URL path: /r/AbCdEf
  const url = new URL(req.url);
  const pathParts = url.pathname.split("/");
  const code = pathParts[pathParts.length - 1] || url.searchParams.get("code");

  if (!code || code === "r") {
    return new Response("Not found", { status: 404 });
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  const { data, error } = await supabase
    .from("short_links")
    .select("target_url")
    .eq("code", code)
    .single();

  if (error || !data) {
    return new Response("Not found", { status: 404 });
  }

  // Validate the target is one of our trusted origins before redirecting
  let allowed = false;
  try {
    const t = new URL(data.target_url);
    const host = t.hostname.toLowerCase();
    allowed =
      t.protocol === "https:" &&
      (host === "curatr.pro" ||
        host.endsWith(".curatr.pro") ||
        host === "breefly.lovable.app" ||
        host.endsWith(".supabase.co"));
  } catch {
    allowed = false;
  }
  if (!allowed) {
    return new Response("Not found", { status: 404 });
  }

  // Increment click count (fire-and-forget, non-blocking)
  EdgeRuntime?.waitUntil?.(
    supabase.rpc("increment_short_link_clicks", { link_code: code })
  ) ?? supabase.rpc("increment_short_link_clicks", { link_code: code });

  // 301 permanent redirect — crawlers follow this to reach share-page for OG tags
  return new Response(null, {
    status: 301,
    headers: {
      "Location": data.target_url,
      "Cache-Control": "public, max-age=86400",
    },
  });
});
