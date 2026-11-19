import { createFileRoute, redirect } from "@tanstack/react-router";

// Old story address → new universal address
export const Route = createFileRoute("/feed/topic/$slug/story/$storyId")({
  beforeLoad: ({ params }) => {
    throw redirect({ to: "/feed/$slug/story/$storyId", params: { slug: params.slug, storyId: params.storyId }, replace: true });
  },
});
