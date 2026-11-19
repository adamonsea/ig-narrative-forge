import { createFileRoute } from "@tanstack/react-router";
import ExplorePile from "@/pages/ExplorePile";

export const Route = createFileRoute("/explore/$slug")({
  component: ExplorePile,
});
