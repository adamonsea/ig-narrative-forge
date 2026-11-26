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
import { loadGoogleAnalyticsIfAllowed } from "@/lib/googleAnalyticsLoader";
import { onReaderConsentChange } from "@/lib/readerConsent";
import NotFound from "@/pages/NotFound";
import appCss from "../styles.css?url";

const SITE_TITLE = "Curatr - News feeds that credit every source";
const SITE_DESCRIPTION = "Local and niche news feeds. Every story credited to the people who reported it.";
const SITE_IMAGE = "https://storage.googleapis.com/gpt-engineer-file-uploads/87LSF84r5Je8FzK2lSkFOrSp7fI3/social-images/social-1781172040122-Curatr_header_2x.webp";

// Google Consent Mode defaults (cookie-consent skill script, unchanged) plus a one-time copy of the old
// single answer ({ analytics: boolean }) into the per-purpose answer. Google Analytics itself is loaded
// only by src/lib/googleAnalyticsLoader.ts when the reader's counting mode is 'full'.
const CONSENT_DEFAULTS = `(function () {
  try {
    if (localStorage.getItem("cookie_consent_analytics") === null) {
      var old = JSON.parse(localStorage.getItem("cookie_consent") || "null");
      if (old && typeof old.analytics === "boolean") {
        localStorage.setItem("cookie_consent_analytics", JSON.stringify({ choice: old.analytics ? "granted" : "denied", at: typeof old.timestamp === "number" ? old.timestamp : Date.now() }));
      }
    }
  } catch (e) {}
})();
window.dataLayer = window.dataLayer || [];
function gtag() {
  dataLayer.push(arguments);
}
gtag("consent", "default", {
  analytics_storage: "granted",
  ad_storage: "granted",
  ad_user_data: "granted",
  ad_personalization: "granted",
});
gtag("consent", "default", {
  analytics_storage: "denied",
  ad_storage: "denied",
  ad_user_data: "denied",
  ad_personalization: "denied",
  wait_for_update: 500,
  region:
    "AT,BE,BG,HR,CY,CZ,DK,EE,FI,FR,DE,GR,HU,IE,IT,LV,LT,LU,MT,NL,PL,PT,RO,SK,SI,ES,SE,IS,LI,NO,GB,CH,RE,GP,MQ,GF,YT,MF,AX,CA-QC".split(
      ",",
    ),
});
(function () {
  var signals = {
    analytics: ["analytics_storage"],
    advertising: ["ad_storage", "ad_user_data", "ad_personalization"],
  };
  for (var purpose in signals) {
    var choice = null;
    try {
      var saved = JSON.parse(localStorage.getItem("cookie_consent_" + purpose) || "null");
      if (
        saved &&
        (saved.choice === "denied" || (saved.choice === "granted" && Date.now() - saved.at < 365 * 86400000))
      ) {
        choice = saved.choice;
      }
    } catch (e) {}
    if (navigator.globalPrivacyControl === true) choice = "denied";
    if (!choice) continue;
    var update = {};
    signals[purpose].forEach(function (signal) {
      update[signal] = choice;
    });
    gtag("consent", "update", update);
  }
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
    scripts: [{ children: CONSENT_DEFAULTS }],
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
  useEffect(() => {
    loadGoogleAnalyticsIfAllowed();
    return onReaderConsentChange(loadGoogleAnalyticsIfAllowed);
  }, []);
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
