import { useMemo } from "react";
import { useNavigate } from "@tanstack/react-router";
import { CardPack } from "@/components/card-pack/CardPack";
import type { CardPackSection } from "@/components/card-pack/types";
import "@/components/card-pack/card-pack.css";
import { usePinnedStories, type PinnedStory } from "@/hooks/usePinnedStories";
import { feedBrandPalette, toCss } from "@/lib/feedBrandColor";

/**
 * The owner's pinned stories as a fanned hand of cards above the feed. Flick to browse;
 * tap the centre card to open that story's own page with all its slides.
 */
export function PinnedStoriesDeck({ topicId, topicSlug, brandColor }: { topicId: string; topicSlug?: string | null | undefined; brandColor?: string | null | undefined }) {
  const { data } = usePinnedStories(topicId);
  const navigate = useNavigate();
  const stories = data ?? [];
  const palette = feedBrandPalette(brandColor);
  const sections = useMemo<CardPackSection[]>(() => stories.map((s) => ({
    slug: s.story_id, kicker: "", title: s.title ?? "", cover: null, meta: { story: s },
  })), [stories]);
  if (!stories.length || !topicSlug) return null;

  const open = (s: PinnedStory) => {
    navigate({ to: "/feed/$slug/story/$storyId", params: { slug: topicSlug, storyId: s.story_id } });
  };

  return (
    <section aria-label="Pinned stories" className="w-full max-w-2xl">
      <div className="h-[440px]">
        <CardPack
          sections={sections}
          initialState="open"
          showCloseButton={false}
          showDots={stories.length > 1}
          edgeBehaviour={stories.length > 2 ? "wrap" : "clamp"}
          aspect={300 / 400}
          theme={{
            cardSurface: "hsl(var(--feed-card))",
            title: "hsl(var(--feed-card-foreground))",
            accent: toCss(palette.light.fill),
            accentText: toCss(palette.light.onFill),
            radius: 20,
          }}
          onActivate={(s) => open((s.meta as { story: PinnedStory }).story)}
          renderCard={(s) => <PinnedCard s={(s.meta as { story: PinnedStory }).story} fill={toCss(palette.light.fill)} />}
        />
      </div>
    </section>
  );
}

function PinnedCard({ s, fill }: { s: PinnedStory; fill: string }) {
  return (
    <div className="flex h-full flex-col overflow-hidden text-left text-[hsl(var(--feed-card-foreground))]">
      <div className="relative h-[55%] shrink-0 overflow-hidden" style={{ background: fill }}>
        {s.cover_url && <img src={s.cover_url} alt="" loading="lazy" className="h-full w-full object-cover" draggable={false} />}
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-2 p-4">
        <h3 className="line-clamp-4 font-lexend text-xl font-semibold leading-tight">{s.title}</h3>
        {s.source_name && <p className="mt-auto truncate text-sm opacity-70">{s.source_name}</p>}
      </div>
    </div>
  );
}
