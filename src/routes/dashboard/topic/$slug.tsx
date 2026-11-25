import { createFileRoute } from "@tanstack/react-router";
import TopicDashboard from "@/pages/TopicDashboard";

export const Route = createFileRoute("/dashboard/topic/$slug")({
  head: () => ({ meta: [
    { title: "Feed Desk | Curatr" },
    { name: "description", content: "Manage stories, events and your live Curatr feed." },
    { property: "og:title", content: "Feed Desk | Curatr" },
    { property: "og:description", content: "Manage stories, events and your live Curatr feed." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: TopicDashboard,
});
