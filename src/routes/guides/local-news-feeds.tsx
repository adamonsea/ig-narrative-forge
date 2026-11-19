import { createFileRoute } from "@tanstack/react-router";
import LocalNewsFeedsGuide from "@/pages/guides/LocalNewsFeeds";

export const Route = createFileRoute("/guides/local-news-feeds")({
  component: LocalNewsFeedsGuide,
});
