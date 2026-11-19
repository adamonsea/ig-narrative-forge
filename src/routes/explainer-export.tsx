import { createFileRoute } from "@tanstack/react-router";
import ExplainerExport from "@/pages/ExplainerExport";

export const Route = createFileRoute("/explainer-export")({
  component: ExplainerExport,
});
