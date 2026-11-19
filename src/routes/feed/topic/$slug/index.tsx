import { createFileRoute, redirect } from "@tanstack/react-router";

// Old feed address → new universal address
export const Route = createFileRoute("/feed/topic/$slug/")({
  beforeLoad: ({ params }) => {
    throw redirect({ to: "/feed/$slug", params: { slug: params.slug }, replace: true });
  },
});
