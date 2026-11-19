import { createFileRoute } from "@tanstack/react-router";
import VerifySubscription from "@/pages/VerifySubscription";

export const Route = createFileRoute("/verify-subscription")({
  component: VerifySubscription,
});
