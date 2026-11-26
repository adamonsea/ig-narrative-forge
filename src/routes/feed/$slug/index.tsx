import { createFileRoute } from "@tanstack/react-router";
import TopicFeed from "@/pages/TopicFeed";
import { feedShareMeta, shareHead } from "@/lib/shareMeta";
import { feedFirstScreen } from "@/lib/feedFirstScreen";

export const Route = createFileRoute("/feed/$slug/")({
  loader: async ({ params }) => {
    const [meta, firstScreen] = await Promise.all([feedShareMeta(params.slug), feedFirstScreen(params.slug)]);
    return { meta, firstScreen };
  },
  head: ({ loaderData }) => {
    const h = shareHead(loaderData?.meta) as { meta?: any[]; links?: any[] };
    const cover = loaderData?.firstScreen?.firstCover;
    if (!cover) return h;
    // News covers: phones (2x, up to 400px) ask for exactly this size. Event photos: one address for every screen.
    const media = loaderData?.firstScreen?.firstCoverMedia;
    return { ...h, links: [...(h.links ?? []), { rel: "preload", as: "image", href: cover, fetchpriority: "high", ...(media ? { media } : {}) }] };
  },
  component: TopicFeed,
});
