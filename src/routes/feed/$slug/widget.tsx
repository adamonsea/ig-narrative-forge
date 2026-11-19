import { createFileRoute } from "@tanstack/react-router";
import PublicWidgetBuilder from "@/pages/PublicWidgetBuilder";

export const Route = createFileRoute("/feed/$slug/widget")({
  component: PublicWidgetBuilder,
});
