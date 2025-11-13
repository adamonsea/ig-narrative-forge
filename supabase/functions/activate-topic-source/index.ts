import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type ActivatePayload = {
  topicId: string;
  sourceId: string;
  feedUrl: string;
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !supabaseKey) {
      throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env vars");
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    const { topicId, sourceId, feedUrl } = (await req.json()) as ActivatePayload;

    if (!topicId || !sourceId || !feedUrl) {
      return new Response(
        JSON.stringify({ error: "topicId, sourceId and feedUrl are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Load existing topic_sources row to preserve prior config
    const { data: link, error: fetchErr } = await supabase
      .from("topic_sources")
      .select("id, source_config")
      .eq("topic_id", topicId)
      .eq("source_id", sourceId)
      .single();

    if (fetchErr) {
      throw fetchErr;
    }

    const mergedConfig = {
      ...(link?.source_config || {}),
      feed_url: feedUrl,
      updated_by: "activate-topic-source",
      updated_at: new Date().toISOString(),
    } as Record<string, unknown>;

    const { data: updated, error: updateErr } = await supabase
      .from("topic_sources")
      .update({ is_active: true, source_config: mergedConfig })
      .eq("id", link.id)
      .select("id, is_active, source_config")
      .single();

    if (updateErr) throw updateErr;

    return new Response(
      JSON.stringify({ success: true, link: updated }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("Error activating topic source:", error);
    return new Response(
      JSON.stringify({ error: error.message ?? "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
