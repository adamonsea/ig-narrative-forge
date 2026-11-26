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
    // Phones (2x screens up to 400px wide) ask for exactly this size, so the picture starts with the page.
    return { ...h, links: [...(h.links ?? []), { rel: "preload", as: "image", href: cover, fetchpriority: "high", media: "(max-width: 400px) and (min-resolution: 2dppx)" }] };
  },
  component: TopicFeed,
});
