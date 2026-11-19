import { createFileRoute } from "@tanstack/react-router";
import StoryPage from "@/pages/StoryPage";
import { shareHead, storyShareMeta } from "@/lib/shareMeta";

export const Route = createFileRoute("/feed/$slug/story/$storyId")({
  loader: ({ params }) => storyShareMeta(params.slug, params.storyId),
  head: ({ loaderData }) => shareHead(loaderData),
  component: StoryPage,
});
