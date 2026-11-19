import { createFileRoute } from "@tanstack/react-router";
import BriefingsArchive from "@/pages/BriefingsArchive";
import { feedShareMeta, shareHead } from "@/lib/shareMeta";

export const Route = createFileRoute("/feed/$slug/briefings")({
  loader: ({ params }) => feedShareMeta(params.slug, "/briefings"),
  head: ({ loaderData }) => shareHead(loaderData),
  component: BriefingsArchive,
});
