import { createFileRoute } from "@tanstack/react-router";
import PeriodReview from "@/pages/PeriodReview";

export const Route = createFileRoute("/feed/$slug/review/$reviewSlug")({
  component: PeriodReview,
});
