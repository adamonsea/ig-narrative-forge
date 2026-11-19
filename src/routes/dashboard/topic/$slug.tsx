import { createFileRoute } from "@tanstack/react-router";
import TopicDashboard from "@/pages/TopicDashboard";

export const Route = createFileRoute("/dashboard/topic/$slug")({
  component: TopicDashboard,
});
