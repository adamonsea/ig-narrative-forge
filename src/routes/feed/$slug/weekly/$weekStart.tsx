import { createFileRoute } from "@tanstack/react-router";
import WeeklyRoundupList from "@/pages/WeeklyRoundupList";

export const Route = createFileRoute("/feed/$slug/weekly/$weekStart")({
  component: WeeklyRoundupList,
});
