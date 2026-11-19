import { createFileRoute } from "@tanstack/react-router";
import Promo from "@/pages/Promo";

export const Route = createFileRoute("/promo")({
  component: Promo,
});
