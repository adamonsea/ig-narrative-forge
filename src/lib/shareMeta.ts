/**
 * Per-feed and per-story link previews (WhatsApp, Slack, iMessage, social).
 * Route loaders call these on the server, so the first HTML a link-preview
 * bot receives already carries the feed's own title, description and picture.
 * Reads only public topic/story fields with the publishable key.
 */
const SUPABASE_URL = "https://fpoywkjgdapgjtdeooak.supabase.co";
const SUPABASE_PUBLISHABLE_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZwb3l3a2pnZGFwZ2p0ZGVvb2FrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTU1MTUzNDksImV4cCI6MjA3MTA5MTM0OX0.DHpoCA8Pn6YGy5JJBaRby937OikqvcB826H8gZXUtcI";
export const SITE_URL = "https://curatr.pro";

export interface ShareMeta {
  title: string;
  description: string;
  image: string | null;
  url: string;
}

async function rest<T>(path: string): Promise<T | null> {
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
      headers: { apikey: SUPABASE_PUBLISHABLE_KEY, Authorization: `Bearer ${SUPABASE_PUBLISHABLE_KEY}` },
      signal: AbortSignal.timeout(2500),
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

interface TopicRow {
  name: string | null;
  description: string | null;
  branding_config: { logo_url?: string | undefined; icon_url?: string | undefined; subheader?: string | undefined } | null;
}

const clip = (s: string, n = 200) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s);

async function topicBySlug(slug: string): Promise<TopicRow | null> {
  const rows = await rest<TopicRow[]>(
    `topics?slug=eq.${encodeURIComponent(slug)}&select=name,description,branding_config&limit=1`,
  );
  return rows?.[0] ?? null;
}

/** Preview for a feed page: its name, its description, its logo. */
export async function feedShareMeta(slug: string, path = ""): Promise<ShareMeta | null> {
  const t = await topicBySlug(slug);
  if (!t?.name) return null;
  return {
    title: t.name,
    description: clip(t.description || t.branding_config?.subheader || `The latest from ${t.name}, curated on Curatr.`),
    image: t.branding_config?.logo_url || t.branding_config?.icon_url || null,
    url: `${SITE_URL}/feed/${slug}${path}`,
  };
}

/** Preview for a story page: its headline and picture, under the feed's name. */
export async function storyShareMeta(slug: string, storyId: string): Promise<ShareMeta | null> {
  const isUuid = /^[0-9a-f-]{36}$/i.test(storyId);
  const [t, rows] = await Promise.all([
    topicBySlug(slug),
    isUuid
      ? rest<{ title: string | null; cover_illustration_url: string | null }[]>(
          `stories?id=eq.${storyId}&is_published=eq.true&select=title,cover_illustration_url&limit=1`,
        )
      : Promise.resolve(null),
  ]);
  const story = rows?.[0];
  if (!t?.name && !story?.title) return null;
  return {
    title: story?.title ? `${story.title} | ${t?.name ?? "Curatr"}` : (t?.name ?? "Curatr"),
    description: clip(t?.description || `More from ${t?.name ?? "this feed"} on Curatr.`),
    image: story?.cover_illustration_url || t?.branding_config?.logo_url || null,
    url: `${SITE_URL}/feed/${slug}/story/${storyId}`,
  };
}

/** Head tags for a preview; feeds keep the root's site-wide tags when null. */
export function shareHead(meta: ShareMeta | null | undefined) {
  if (!meta) return {};
  const tags: Array<Record<string, string>> = [
    { title: meta.title },
    { name: "description", content: meta.description },
    { property: "og:title", content: meta.title },
    { property: "og:description", content: meta.description },
    { property: "og:url", content: meta.url },
    { name: "twitter:title", content: meta.title },
    { name: "twitter:description", content: meta.description },
  ];
  if (meta.image) {
    tags.push({ property: "og:image", content: meta.image }, { name: "twitter:image", content: meta.image });
  }
  return { meta: tags, links: [{ rel: "canonical", href: meta.url }] };
}
