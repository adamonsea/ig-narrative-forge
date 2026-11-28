import { createFileRoute } from "@tanstack/react-router";
import TopicDashboard from "@/pages/TopicDashboard";

export const Route = createFileRoute("/dashboard/topic/$slug_/settings/$section")({
  head: ({ params }) => {
    const section = params.section.charAt(0).toUpperCase() + params.section.slice(1);
    const title = `${section} settings | Curatr`;
    const description = `Control your feed's ${params.section} settings. Your choices, your voice.`;
    return { meta: [{ title }, { name: "description", content: description }, { property: "og:title", content: title }, { property: "og:description", content: description }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }, { name: "robots", content: "noindex" }] };
  },
  component: TopicDashboard,
});
