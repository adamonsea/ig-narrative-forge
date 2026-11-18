import { useEffect, useState } from "react";
import { Navigate, useSearchParams } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Skeleton } from "@/components/ui/skeleton";
import { InlineError } from "@/components/ui/editorial";
import StoryCarousel from "@/components/StoryCarousel";

type CompareStory = React.ComponentProps<typeof StoryCarousel>["story"];

const STORY_COUNT = 8;

/** Real published stories with pictures from one feed, shaped for the story card. */
async function loadStories(slug: string): Promise<{ stories: CompareStory[]; brandColor: string | null; name: string }> {
  const [{ data: rows, error }, { data: topic }] = await Promise.all([
    supabase.rpc("get_public_topic_feed", { topic_slug_param: slug, p_limit: 30, p_offset: 0, p_sort_by: "newest" }),
    supabase.from("topics").select("name, branding_config, illustration_primary_color").eq("slug", slug).maybeSingle(),
  ]);
  if (error) throw error;
  const byId = new Map<string, CompareStory>();
  for (const r of (rows ?? []) as any[]) {
    if (!r.story_cover_illustration_url) continue;
    let s = byId.get(r.story_id);
    if (!s) {
      s = {
        id: r.story_id, slug: r.story_slug, title: r.story_title, author: r.article_author,
        publication_name: r.source_name, created_at: r.story_created_at, updated_at: r.story_updated_at,
        cover_illustration_url: r.story_cover_illustration_url, slides: [],
        article: { source_url: r.article_url || "#", region: "", published_at: r.article_published_at },
      };
      byId.set(r.story_id, s);
    }
    if (r.slide_id && !s.slides.some((x) => x.id === r.slide_id)) {
      s.slides.push({ id: r.slide_id, slide_number: r.slide_number, content: r.slide_content });
    }
  }
  const t = topic as any;
  return {
    stories: [...byId.values()].filter((s) => s.slides.length > 0).slice(0, STORY_COUNT),
    brandColor: t?.branding_config?.primary_color || t?.illustration_primary_color || null,
    name: t?.name || slug,
  };
}

/** The compare view itself (no guard), so the page can be checked on its own. */
export function StoryCoversCompareBody() {
  const [params] = useSearchParams();
  const slug = params.get("feed") || "eastbourne";
  const [state, setState] = useState<{ stories: CompareStory[]; brandColor: string | null; name: string } | null>(null);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let live = true;
    setState(null); setError(false);
    loadStories(slug).then((r) => live && setState(r)).catch(() => live && setError(true));
    return () => { live = false; };
  }, [slug, attempt]);

  return (
    <main className="min-h-dvh bg-background text-foreground">
      <div className="mx-auto max-w-6xl space-y-8 px-4 py-12 md:px-8">
        <header className="space-y-1">
          <h1 className="text-2xl font-semibold">Story covers: split or full bleed</h1>
          {state && <p className="text-sm text-muted-foreground">{state.name}</p>}
        </header>

        {error && <InlineError message="Couldn't load stories." actionLabel="Try again" onAction={() => setAttempt((n) => n + 1)} />}

        {!state && !error && (
          <div className="flex flex-wrap gap-6">
            <Skeleton className="h-[720px] w-full rounded-xl md:w-[calc(50%-12px)]" />
            <Skeleton className="h-[720px] w-full rounded-xl md:w-[calc(50%-12px)]" />
          </div>
        )}

        {state?.stories.length === 0 && <p className="text-base text-muted-foreground">No stories with pictures.</p>}

        {state?.stories.map((story) => (
          <section key={story.id} className="space-y-3" aria-label={story.title}>
            <div className="flex flex-wrap gap-6">
              {(["split", "full-bleed"] as const).map((style) => (
                <figure key={style} className="w-full space-y-2 md:w-[calc(50%-12px)]">
                  <figcaption className="text-sm text-muted-foreground">{style === "split" ? "Split (now)" : "Full bleed"}</figcaption>
                  <StoryCarousel story={story} coverStyle={style} brandColor={state.brandColor} />
                </figure>
              ))}
            </div>
          </section>
        ))}
      </div>
    </main>
  );
}

export default function StoryCoversCompare() {
  const { user, userRole, loading, isAdmin } = useAuth();
  // The role arrives just after sign-in; wait for it so admins aren't bounced to the dashboard
  if (loading || (user && userRole === null)) return <main className="min-h-dvh bg-background p-8"><Skeleton className="h-8 w-48" /></main>;
  if (!user) return <Navigate to="/auth" replace />;
  if (!isAdmin) return <Navigate to="/dashboard" replace />;
  return <StoryCoversCompareBody />;
}
