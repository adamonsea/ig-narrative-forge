import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

/** Generate a random 6-character alphanumeric code */
function generateCode(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

/** Only allow shortening URLs that point to our own trusted origins. */
function isAllowedUrl(raw: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return false;
  }
  if (parsed.protocol !== "https:") return false;
  const host = parsed.hostname.toLowerCase();
  return (
    host === "curatr.pro" ||
    host.endsWith(".curatr.pro") ||
    host === "breefly.lovable.app" ||
    host.endsWith(".supabase.co")
  );
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { url } = await req.json();

    if (!url || typeof url !== "string") {
      return new Response(JSON.stringify({ error: "Missing url" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!isAllowedUrl(url)) {
      return new Response(JSON.stringify({ error: "URL not allowed" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    // Check if this URL already has a short link
    const { data: existing } = await supabase
      .from("short_links")
      .select("code")
      .eq("target_url", url)
      .maybeSingle();

    if (existing) {
      const shortUrl = `${supabaseUrl}/functions/v1/r/${existing.code}`;
      return new Response(JSON.stringify({ shortUrl }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Generate unique code with retry
    let code = generateCode();
    let attempts = 0;
    while (attempts < 5) {
      const { error } = await supabase
        .from("short_links")
        .insert({ code, target_url: url });

      if (!error) break;

      // Collision — try a new code
      code = generateCode();
      attempts++;
    }

    if (attempts >= 5) {
      return new Response(JSON.stringify({ error: "Failed to generate unique code" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const shortUrl = `${supabaseUrl}/functions/v1/r/${code}`;
    return new Response(JSON.stringify({ shortUrl }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("shorten-url error:", err);
    return new Response(JSON.stringify({ error: "An internal error occurred" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
