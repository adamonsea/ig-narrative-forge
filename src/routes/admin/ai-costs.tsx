import { createFileRoute } from "@tanstack/react-router";
import AICostDashboardPage from "@/pages/AICostDashboard";

export const Route = createFileRoute("/admin/ai-costs")({
  component: AICostDashboardPage,
});
