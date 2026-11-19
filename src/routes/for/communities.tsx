import { createFileRoute } from "@tanstack/react-router";
import ForCommunities from "@/pages/for/ForCommunities";

export const Route = createFileRoute("/for/communities")({
  component: ForCommunities,
});
