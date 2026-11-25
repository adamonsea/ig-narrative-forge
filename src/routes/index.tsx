import { createFileRoute } from "@tanstack/react-router";
import Index from "@/pages/Index";

export const Route = createFileRoute("/")({
  head: () => ({ meta: [
    { title: "Curatr | From everywhere to everyone" },
    { name: "description", content: "Curate news and events from trusted sources into one feed for your audience." },
    { property: "og:title", content: "Curatr | From everywhere to everyone" },
    { property: "og:description", content: "Curate news and events from trusted sources into one feed for your audience." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: Index,
});
