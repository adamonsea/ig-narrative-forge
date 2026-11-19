import { createFileRoute } from "@tanstack/react-router";
import Mcp from "@/pages/Mcp";

export const Route = createFileRoute("/mcp")({
  component: Mcp,
});
