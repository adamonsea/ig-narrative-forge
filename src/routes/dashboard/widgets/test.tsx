import { createFileRoute } from "@tanstack/react-router";
import WidgetTestPage from "@/pages/dashboard/WidgetTest";

export const Route = createFileRoute("/dashboard/widgets/test")({
  component: WidgetTestPage,
});
