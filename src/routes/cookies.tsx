import { createFileRoute } from "@tanstack/react-router";
import Cookies from "@/pages/Cookies";

export const Route = createFileRoute("/cookies")({
  component: Cookies,
});
