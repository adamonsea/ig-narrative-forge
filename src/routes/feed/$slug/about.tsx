import { createFileRoute } from "@tanstack/react-router";
import AboutFeed from "@/pages/AboutFeed";
import { feedShareMeta, shareHead } from "@/lib/shareMeta";

export const Route = createFileRoute("/feed/$slug/about")({
  loader: ({ params }) => feedShareMeta(params.slug, "/about"),
  head: ({ loaderData }) => shareHead(loaderData),
  component: AboutFeed,
});
