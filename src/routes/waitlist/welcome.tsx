import { createFileRoute } from "@tanstack/react-router";
import WaitlistWelcome from "@/pages/WaitlistWelcome";

export const Route = createFileRoute("/waitlist/welcome")({
  component: WaitlistWelcome,
});
