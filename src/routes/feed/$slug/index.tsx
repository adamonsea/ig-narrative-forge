import { createFileRoute } from "@tanstack/react-router";
import TopicFeed from "@/pages/TopicFeed";
import { feedShareMeta, shareHead } from "@/lib/shareMeta";

export const Route = createFileRoute("/feed/$slug/")({
  loader: ({ params }) => feedShareMeta(params.slug),
  head: ({ loaderData }) => shareHead(loaderData),
  component: TopicFeed,
});
