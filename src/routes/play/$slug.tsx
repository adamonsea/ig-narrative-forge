import { createFileRoute } from "@tanstack/react-router";
import SwipeMode from "@/pages/SwipeMode";

export const Route = createFileRoute("/play/$slug")({
  component: SwipeMode,
});
