import { createFileRoute } from "@tanstack/react-router";
import Cookies from "@/pages/Cookies";

export const Route = createFileRoute("/cookies")({
  head: () => ({ meta: [
    { title: "Cookie choices | Curatr" },
    { name: "description", content: "How Curatr counts visits and reads, uses cookies and remembers your privacy choices." },
    { property: "og:title", content: "Cookie choices | Curatr" },
    { property: "og:description", content: "How Curatr counts visits and reads, uses cookies and remembers your privacy choices." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: Cookies,
});
