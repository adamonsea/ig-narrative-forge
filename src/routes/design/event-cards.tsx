import { createFileRoute } from "@tanstack/react-router";
import { lazy, Suspense } from "react";

const EventCardsCompare = lazy(() => import("@/pages/design/EventCardsCompare"));

export const Route = createFileRoute("/design/event-cards")({
  component: () => (
    <Suspense fallback={null}>
      <EventCardsCompare />
    </Suspense>
  ),
});
