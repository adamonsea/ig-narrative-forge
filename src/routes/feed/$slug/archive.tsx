import { createFileRoute } from "@tanstack/react-router";
import TopicArchive from "@/pages/TopicArchive";
import { feedShareMeta, shareHead } from "@/lib/shareMeta";

export const Route = createFileRoute("/feed/$slug/archive")({
  loader: ({ params }) => feedShareMeta(params.slug, "/archive"),
  head: ({ loaderData }) => shareHead(loaderData),
  component: TopicArchive,
});
