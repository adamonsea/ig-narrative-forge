import { useEffect, type ReactNode } from "react";
import { QueryClientProvider, type QueryClient } from "@tanstack/react-query";
import {
  HeadContent,
  Link,
  Outlet,
  Scripts,
  createRootRouteWithContext,
  useRouter,
  type ErrorComponentProps,
} from "@tanstack/react-router";
import { HelmetProvider } from "react-helmet-async";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/hooks/useAuth";
import { SystemErrorBoundary } from "@/components/SystemErrorBoundary";
import { GlobalSEO } from "@/components/seo/GlobalSEO";
import { useGoogleAnalytics } from "@/hooks/useGoogleAnalytics";
import { useSiteVisitorTracking } from "@/hooks/useSiteVisitorTracking";
import { reportLovableError } from "@/lib/lovable-error-reporting";
import NotFound from "@/pages/NotFound";
import appCss from "../styles.css?url";

const SITE_TITLE = "Curatr - AI-Curated News Feeds";
const SITE_DESCRIPTION = "Create and follow curated news feeds powered by AI. Local news, niche topics, and more from trusted sources.";
const SITE_IMAGE = "https://storage.googleapis.com/gpt-engineer-file-uploads/87LSF84r5Je8FzK2lSkFOrSp7fI3/social-images/social-1781172040122-Curatr_header_2x.webp";

// Google Analytics 4 — skipped for bots/headless browsers; loaded only once the page is actually seen
const GA_LOADER = `(function(){
var ua=navigator.userAgent||'';
try{var cc=JSON.parse(localStorage.getItem('cookie_consent')||'null');if(cc&&cc.analytics===false)return;}catch(e){}
if(navigator.webdriver||/bot|crawl|spider|slurp|headless|lighthouse|preview|facebookexternalhit|python|curl|wget|puppeteer|playwright/i.test(ua))return;
window.dataLayer=window.dataLayer||[];
window.gtag=function(){dataLayer.push(arguments);};
var loaded=false;
function load(){
if(loaded||document.visibilityState!=='visible')return;loaded=true;
var s=document.createElement('script');s.async=true;s.src='https://www.googletagmanager.com/gtag/js?id=G-C9VCW1ZPGR';document.head.appendChild(s);
gtag('js',new Date());gtag('config','G-C9VCW1ZPGR');
}
setTimeout(load,1500);
document.addEventListener('visibilitychange',function(){setTimeout(load,1500);});
})();`;

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1.0" },
      { title: SITE_TITLE },
      { name: "description", content: SITE_DESCRIPTION },
      { property: "og:type", content: "website" },
      { property: "og:title", content: SITE_TITLE },
      { property: "og:description", content: SITE_DESCRIPTION },
      { property: "og:image", content: SITE_IMAGE },
      { property: "og:url", content: "https://curatr.pro" },
      { name: "twitter:card", content: "summary" },
      { name: "twitter:title", content: SITE_TITLE },
      { name: "twitter:description", content: SITE_DESCRIPTION },
      { name: "twitter:image", content: SITE_IMAGE },
      { name: "referrer", content: "no-referrer-when-downgrade" },
      { name: "google-site-verification", content: "Qxn4bzEaXDMhbYHpvCF2-OU1IyWkz-kV_gEHf7vHZ5M" },
      { name: "mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-status-bar-style", content: "black-translucent" },
      { name: "theme-color", content: "#000000" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "apple-touch-icon", sizes: "512x512", href: "/curatr-icon.png" },
      { rel: "icon", href: "/favicon.svg", type: "image/svg+xml", sizes: "any" },
      { rel: "icon", href: "/favicon-32.png", type: "image/png", sizes: "32x32" },
      { rel: "icon", href: "/favicon.png", type: "image/png", sizes: "64x64" },
      { rel: "shortcut icon", href: "/favicon.ico", sizes: "16x16 32x32 48x48" },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=Work+Sans:wght@400;500;600&family=Inter:wght@300;400;500;600;700&family=Playfair+Display:ital,wght@0,400;0,500;0,600;0,700;1,400;1,500;1,600&family=Lexend:wght@300;400;500;600;700&display=swap",
      },
    ],
    scripts: [{ children: GA_LOADER }],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFound,
  errorComponent: RootError,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

// Site-wide analytics tracker (must be inside the router)
function SiteAnalyticsTracker() {
  useSiteVisitorTracking();
  useGoogleAnalytics();
  return null;
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();

  // ported from main.tsx: notification service worker (hand-written /sw.js, push + click handling)
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker
      .register("/sw.js")
      .then((reg) => console.log("[SW] Registered:", reg.scope))
      .catch((err) => console.error("[SW] Registration failed:", err));
  }, []);

  return (
    <HelmetProvider>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <TooltipProvider>
            <SystemErrorBoundary>
              <GlobalSEO />
              <Toaster />
              <Sonner />
              <SiteAnalyticsTracker />
              <Outlet />
            </SystemErrorBoundary>
          </TooltipProvider>
        </AuthProvider>
      </QueryClientProvider>
    </HelmetProvider>
  );
}

function RootError({ error, reset }: ErrorComponentProps) {
  const router = useRouter();
  useEffect(() => {
    console.error(error);
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-background p-6 text-center text-foreground">
      <h1 className="text-2xl font-semibold">This page didn't load</h1>
      <div className="flex gap-2">
        <button
          type="button"
          className="rounded-lg bg-primary px-4 py-2 text-primary-foreground"
          onClick={() => {
            void router.invalidate();
            reset();
          }}
        >
          Try again
        </button>
        <Link to="/" className="rounded-lg border px-4 py-2">
          Go home
        </Link>
      </div>
    </main>
  );
}
