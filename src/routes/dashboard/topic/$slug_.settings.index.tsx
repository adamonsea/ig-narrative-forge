import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/dashboard/topic/$slug_/settings/")({
  beforeLoad: ({ params }) => {
    throw redirect({ to: "/dashboard/topic/$slug/settings/$section", params: { slug: params.slug, section: "general" } });
  },
});
