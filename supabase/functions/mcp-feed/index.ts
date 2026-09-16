// MCP Streamable HTTP server exposing a single Curatr feed to AI assistants.
// Route: /functions/v1/mcp-feed/<topic-slug>
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, mcp-session-id, mcp-protocol-version",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
  "Access-Control-Expose-Headers": "mcp-session-id",
};

const SITE_URL = "https://curatr.pro";
const MAX_STORIES = 25;
const PROTOCOL_VERSION = "2024-11-05";

type Json = Record<string, unknown>;

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

const json = (body: Json, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const rpcResult = (id: unknown, result: Json) => json({ jsonrpc: "2.0", id, result });
const rpcError = (id: unknown, code: number, message: string, status = 200) =>
  json({ jsonrpc: "2.0", id, error: { code, message } }, status);

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

const clampLimit = (value: unknown, fallback = 10) => {
  const n = typeof value === "number" ? value : parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(MAX_STORIES, Math.max(1, Math.round(n)));
};

interface SlideRow { slide_number: number | null; content: string | null }

interface StoryRow {
  id: string;
  title: string | null;
  slug: string | null;
  author: string | null;
  publication_name: string | null;
  published_at: string | null;
  created_at: string | null;
  cover_illustration_url?: string | null;
  slides?: SlideRow[] | null;
  topic_articles?: { topic_id?: string; shared_article_content?: { url?: string | null; author?: string | null; source_domain?: string | null; image_url?: string | null } | null } | null;
}

const orderedSlides = (story: StoryRow): string[] =>
  [...(story.slides || [])]
    .sort((a, b) => (a.slide_number || 0) - (b.slide_number || 0))
    .map((s) => (s.content || "").trim())
    .filter(Boolean);

const fullText = (story: StoryRow): string => orderedSlides(story).join("\n\n");

const shapeStory = (story: StoryRow, slug: string) => {
  const parts = orderedSlides(story);
  const shared = story.topic_articles?.shared_article_content || null;
  const sourceUrl = shared?.url || null;
  let publication = story.publication_name || shared?.source_domain || null;
  if (!publication && sourceUrl) {
    try { publication = new URL(sourceUrl).hostname.replace(/^www\./, ""); } catch { publication = null; }
  }
  const illustration = story.cover_illustration_url || null;
  const sourceImage = shared?.image_url || null;
  const imageUrl = illustration || sourceImage;
  return {
    id: story.id,
    headline: story.title || parts[0] || "Untitled story",
    summary: parts[1] || parts[0] || "",
    published_at: story.published_at || story.created_at,
    publication,
    author: story.author || shared?.author || null,
    original_article_url: sourceUrl,
    curatr_url: `${SITE_URL}/feed/${slug}/story/${story.slug || story.id}`,
    image_url: imageUrl,
    image_source: imageUrl ? (illustration ? "curatr_illustration" : "original_publication") : null,
  };
};

const STORY_SELECT = `
  id,
  title,
  slug,
  author,
  publication_name,
  created_at,
  published_at,
  cover_illustration_url,
  slides ( slide_number, content ),
  topic_articles!inner (
    topic_id,
    shared_article_content ( url, author, source_domain, image_url )
  )
`;

async function fetchStories(topicId: string, limit: number, sinceIso?: string) {
  let query = supabase
    .from("stories")
    .select(STORY_SELECT)
    .eq("topic_articles.topic_id", topicId)
    .eq("status", "published")
    .eq("is_published", true)
    .order("published_at", { ascending: false, nullsFirst: false })
    .limit(limit);
  if (sinceIso) query = query.gte("published_at", sinceIso);
  const { data, error } = await query;
  if (error) throw error;
  return (data || []) as unknown as StoryRow[];
}

const TOOLS = [
  {
    name: "list_latest_stories",
    description: "List the most recently published stories in this feed, with their picture, source attribution and links.",
    inputSchema: {
      type: "object",
      properties: { limit: { type: "number", description: "How many stories to return (1-25, default 10)" } },
      additionalProperties: false,
    },
  },
  {
    name: "search_stories",
    description: "Search this feed's published stories by keyword or subject.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Words or subject to search for" },
        limit: { type: "number", description: "How many stories to return (1-25, default 10)" },
      },
      required: ["query"],
      additionalProperties: false,
    },
  },
  {
    name: "get_story",
    description: "Read one published story in full, with its picture, source attribution and link.",
    inputSchema: {
      type: "object",
      properties: { story_id: { type: "string", description: "The story id returned by the other tools" } },
      required: ["story_id"],
      additionalProperties: false,
    },
  },
  {
    name: "feed_briefing",
    description: "A short briefing of what this feed published recently.",
    inputSchema: {
      type: "object",
      properties: { period: { type: "string", enum: ["day", "week"], description: "Cover the last day or the last week (default week)" } },
      additionalProperties: false,
    },
  },
];

async function logUsage(slug: string, operation: string) {
  try {
    await supabase.from("api_usage").insert({ service_name: "mcp", operation, region: slug });
  } catch (_) { /* usage logging is best-effort */ }
}

const ATTRIBUTION_HINT =
  "Credit the publication named in each story and include its original_article_url. Show image_url when the user wants pictures.";

async function runTool(name: string, args: Json, topic: { id: string; slug: string; name: string; description: string | null }) {
  switch (name) {
    case "list_latest_stories": {
      const stories = await fetchStories(topic.id, clampLimit(args.limit));
      return {
        feed: topic.name,
        stories: stories.map((s) => shapeStory(s, topic.slug)),
        next_step: "Call get_story with a story_id before quoting or summarising in depth — these are headlines and summaries only.",
        attribution_note: ATTRIBUTION_HINT,
      };
    }
    case "search_stories": {
      const q = String(args.query ?? "").trim().slice(0, 200);
      if (!q) throw new Error("A search query is required");
      const limit = clampLimit(args.limit);
      const pool = await fetchStories(topic.id, 200);
      const terms = q.toLowerCase().split(/\s+/).filter(Boolean);
      const scored = pool
        .map((story) => {
          const hay = `${story.title || ""} ${fullText(story)}`.toLowerCase();
          const score = terms.reduce((acc, t) => acc + (hay.includes(t) ? 1 : 0), 0);
          return { story, score };
        })
        .filter((s) => s.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, limit);
      return {
        feed: topic.name,
        query: q,
        stories: scored.map((s) => shapeStory(s.story, topic.slug)),
        next_step: scored.length
          ? "Call get_story with a story_id for the full text before quoting."
          : "No matches. Try broader or different words, or call list_latest_stories to see what the feed covers.",
        attribution_note: ATTRIBUTION_HINT,
      };
    }
    case "get_story": {
      const storyId = String(args.story_id ?? "");
      if (!/^[0-9a-f-]{36}$/i.test(storyId)) throw new Error("A valid story id is required");
      const { data, error } = await supabase
        .from("stories")
        .select(STORY_SELECT)
        .eq("id", storyId)
        .eq("topic_articles.topic_id", topic.id)
        .eq("status", "published")
        .eq("is_published", true)
        .maybeSingle();
      if (error) throw error;
      if (!data) throw new Error("Story not found in this feed");
      const story = data as unknown as StoryRow;
      return {
        ...shapeStory(story, topic.slug),
        text: fullText(story),
        attribution_note: ATTRIBUTION_HINT,
      };
    }
    case "feed_briefing": {
      const period = args.period === "day" ? "day" : "week";
      const since = new Date(Date.now() - (period === "day" ? 1 : 7) * 86400000).toISOString();
      const stories = await fetchStories(topic.id, MAX_STORIES, since);
      return {
        feed: topic.name,
        period,
        story_count: stories.length,
        stories: stories.map((s) => shapeStory(s, topic.slug)),
        next_step: "Group the stories by theme, lead with the most significant, and call get_story for any the user wants in depth.",
        attribution_note: ATTRIBUTION_HINT,
      };
    }
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const url = new URL(req.url);
    const parts = url.pathname.split("/").filter(Boolean);
    const slug = (parts[parts.length - 1] !== "mcp-feed" ? parts[parts.length - 1] : url.searchParams.get("feed")) || "";
    if (!slug || slug.length > 120) return json({ error: "Feed not specified" }, 400);

    const { data: topic } = await supabase
      .from("topics")
      .select("id, name, slug, description, mcp_enabled, mcp_access, is_active, is_public")
      .eq("slug", slug)
      .eq("is_active", true)
      .maybeSingle();

    if (!topic || !topic.mcp_enabled) return json({ error: "This feed is not available to AI assistants" }, 404);

    if (topic.mcp_access === "key") {
      const auth = req.headers.get("authorization") || "";
      const token = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7).trim() : "";
      if (!token) return json({ error: "Unauthorized" }, 401);
      const hash = await sha256Hex(token);
      const { data: keyRow } = await supabase
        .from("topic_mcp_keys")
        .select("id, topic_id, revoked_at")
        .eq("key_hash", hash)
        .maybeSingle();
      if (!keyRow || keyRow.revoked_at || keyRow.topic_id !== topic.id) {
        return json({ error: "Unauthorized" }, 401);
      }
      await supabase.from("topic_mcp_keys").update({ last_used_at: new Date().toISOString() }).eq("id", keyRow.id);
    }

    if (req.method === "GET") {
      return json({
        name: `Curatr — ${topic.name}`,
        description: topic.description || `Curated stories from ${topic.name}`,
        protocol: "mcp",
        transport: "streamable-http",
        endpoint: `https://fpoywkjgdapgjtdeooak.supabase.co/functions/v1/mcp-feed/${topic.slug}`,
      });
    }

    if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

    let payload: Json;
    try {
      payload = await req.json();
    } catch {
      return rpcError(null, -32700, "Parse error", 400);
    }

    const id = (payload as { id?: unknown }).id ?? null;
    const method = String((payload as { method?: unknown }).method ?? "");
    const params = ((payload as { params?: Json }).params ?? {}) as Json;

    switch (method) {
      case "initialize":
        return rpcResult(id, {
          protocolVersion: PROTOCOL_VERSION,
          capabilities: { tools: {} },
          serverInfo: { name: `curatr-${topic.slug}`, version: "1.0.0" },
          instructions: `Read-only access to the Curatr feed "${topic.name}". Always credit the original publication and include its link when using a story. Each story may include an image_url you can show; illustrations are Curatr-generated, other pictures belong to the original publication.`,
        });
      case "notifications/initialized":
      case "ping":
        return rpcResult(id, {});
      case "tools/list":
        return rpcResult(id, { tools: TOOLS });
      case "resources/list":
        return rpcResult(id, { resources: [] });
      case "prompts/list":
        return rpcResult(id, { prompts: [] });
      case "tools/call": {
        const toolName = String((params as { name?: unknown }).name ?? "");
        const args = ((params as { arguments?: Json }).arguments ?? {}) as Json;
        try {
          const result = await runTool(toolName, args, topic as never);
          logUsage(topic.slug, toolName);
          return rpcResult(id, {
            content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
            isError: false,
          });
        } catch (toolError) {
          console.error("[mcp-feed] tool error", toolName, JSON.stringify(toolError));
          const message = toolError instanceof Error ? toolError.message : "Tool failed";
          return rpcResult(id, { content: [{ type: "text", text: message }], isError: true });
        }
      }
      default:
        return rpcError(id, -32601, `Method not found: ${method}`);
    }
  } catch (error) {
    console.error("[mcp-feed] error", error);
    return json({ error: "Server error" }, 500);
  }
});
