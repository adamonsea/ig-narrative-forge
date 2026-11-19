import { createFileRoute } from "@tanstack/react-router";
import { lazy, Suspense } from "react";

const StoryCoversCompare = lazy(() => import("@/pages/design/StoryCoversCompare"));

export const Route = createFileRoute("/design/story-covers")({
  component: () => (
    <Suspense fallback={null}>
      <StoryCoversCompare />
    </Suspense>
  ),
});
