import { createFileRoute } from "@tanstack/react-router";
import ForOrganisations from "@/pages/for/ForOrganisations";

export const Route = createFileRoute("/for/organisations")({
  component: ForOrganisations,
});
