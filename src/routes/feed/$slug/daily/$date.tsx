import { createFileRoute } from "@tanstack/react-router";
import DailyRoundupList from "@/pages/DailyRoundupList";

export const Route = createFileRoute("/feed/$slug/daily/$date")({
  component: DailyRoundupList,
});
