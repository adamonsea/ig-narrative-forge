import { createFileRoute } from "@tanstack/react-router";
import TopicDashboard from "@/pages/TopicDashboard";

export const Route = createFileRoute("/dashboard/topic/$slug_/settings/$section")({
  head: () => ({ meta: [{ title: "Feed settings — Curatr" }, { name: "robots", content: "noindex" }] }),
  component: TopicDashboard,
});
