import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { resolveRenamedFeed } from "@/lib/shareMeta";

// Old handles keep working: a renamed feed's old slug redirects to its current one, same page and query.
export const Route = createFileRoute("/feed/$slug")({
  beforeLoad: async ({ params, location }) => {
    const current = await resolveRenamedFeed(params.slug);
    if (current && current !== params.slug) {
      const rest = location.pathname.replace(/^\/feed\/[^/]+/, "");
      throw redirect({ href: `/@${current}${rest}${location.searchStr ?? ""}`, statusCode: 301 });
    }
  },
  component: Outlet,
});
