import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";
import { handleToInternal, internalToHandle } from "./lib/feedHandle";

export const getRouter = () => {
  // One client per request: a module-level QueryClient leaks cached data between SSR requests.
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { staleTime: 1000 * 60 * 5, retry: 1, refetchOnWindowFocus: false },
    },
  });

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    // Lets Query own freshness; set caching defaults on the QueryClient, not the router.
    defaultPreloadStaleTime: 0,
    // curatr.pro/@slug/... is the public face of the /feed/$slug/... routes.
    rewrite: {
      input: ({ url }) => {
        const p = handleToInternal(url.pathname);
        if (!p) return undefined;
        url.pathname = p;
        return url;
      },
      output: ({ url }) => {
        const p = internalToHandle(url.pathname);
        if (!p) return undefined;
        url.pathname = p;
        return url;
      },
    },
  });

  return router;
};
