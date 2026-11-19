import { createFileRoute } from "@tanstack/react-router";
import WidgetsPage from "@/pages/dashboard/Widgets";

export const Route = createFileRoute("/dashboard/widgets/")({
  component: WidgetsPage,
});
