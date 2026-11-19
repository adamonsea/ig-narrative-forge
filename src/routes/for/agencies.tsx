import { createFileRoute } from "@tanstack/react-router";
import ForAgencies from "@/pages/for/ForAgencies";

export const Route = createFileRoute("/for/agencies")({
  component: ForAgencies,
});
