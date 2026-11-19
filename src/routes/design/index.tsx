import { createFileRoute } from "@tanstack/react-router";
import { lazy, Suspense } from "react";

const DesignSystem = lazy(() => import("@/pages/design/DesignSystem"));

export const Route = createFileRoute("/design/")({
  component: () => (
    <Suspense fallback={null}>
      <DesignSystem />
    </Suspense>
  ),
});
