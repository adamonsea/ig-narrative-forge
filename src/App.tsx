import React, { useState } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate, useParams } from "react-router-dom";
import { AuthProvider } from "@/hooks/useAuth";
import { SystemErrorBoundary } from "@/components/SystemErrorBoundary";
import { GlobalSEO } from "@/components/seo/GlobalSEO";
import { useGoogleAnalytics } from "@/hooks/useGoogleAnalytics";
import Index from "./pages/Index";
import Auth from "./pages/Auth";
import NotFound from "./pages/NotFound";
import Terms from "./pages/Terms";
import Privacy from "./pages/Privacy";
import Cookies from "./pages/Cookies";

import AdminPanel from "./pages/AdminPanel";
import AICostDashboardPage from "./pages/AICostDashboard";
import Dashboard from "./pages/Dashboard";
import TopicDashboard from "./pages/TopicDashboard";
import TopicFeed from "./pages/TopicFeed";
import StoryPage from "./pages/StoryPage";
import TopicArchive from "./pages/TopicArchive";
import DailyRoundupList from "./pages/DailyRoundupList";
import WeeklyRoundupList from "./pages/WeeklyRoundupList";
import BriefingsArchive from "./pages/BriefingsArchive";
import SwipeMode from "./pages/SwipeMode";
import Pricing from "./pages/Pricing";
import AboutFeed from "./pages/AboutFeed";
import ExplorePile from "./pages/ExplorePile";
import PublicWidgetBuilder from "./pages/PublicWidgetBuilder";
import VerifySubscription from "./pages/VerifySubscription";
import WidgetsPage from "./pages/dashboard/Widgets";
import WidgetTestPage from "./pages/dashboard/WidgetTest";
import Health from "./pages/Health";

// Redirect component for old feed URLs
const FeedRedirect = () => {
  const { slug } = useParams<{ slug: string }>();
  return <Navigate to={`/feed/${slug}`} replace />;
};

// Redirect component for old story URLs
const StoryRedirect = () => {
  const { slug, storyId } = useParams<{ slug: string; storyId: string }>();
  return <Navigate to={`/feed/${slug}/story/${storyId}`} replace />;
};

// Google Analytics tracker component (must be inside BrowserRouter)
const GoogleAnalyticsTracker = () => {
  useGoogleAnalytics();
  return null;
};
const createQueryClient = () => new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // 5 minutes
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

const App = () => {
  const [queryClient] = useState(() => createQueryClient());

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <TooltipProvider>
          <SystemErrorBoundary>
            <GlobalSEO />
            <Toaster />
            <Sonner />
            <BrowserRouter>
              <GoogleAnalyticsTracker />
              <Routes>
                <Route path="/" element={<Index />} />
                <Route path="/pricing" element={<Pricing />} />
                <Route path="/terms" element={<Terms />} />
                <Route path="/privacy" element={<Privacy />} />
                <Route path="/cookies" element={<Cookies />} />
                <Route path="/health" element={<Health />} />
                <Route path="/auth" element={<Auth />} />
                <Route path="/dashboard" element={<Dashboard />} />
                <Route path="/dashboard/topic/:slug" element={<TopicDashboard />} />
                <Route path="/dashboard/widgets" element={<WidgetsPage />} />
                <Route path="/dashboard/widgets/test" element={<WidgetTestPage />} />
                <Route path="/admin" element={<AdminPanel />} />
                <Route path="/admin/ai-costs" element={<AICostDashboardPage />} />
                
                {/* Redirect old URL patterns to new universal URLs */}
                <Route path="/feed/topic/:slug" element={<FeedRedirect />} />
                <Route path="/feed/topic/:slug/story/:storyId" element={<StoryRedirect />} />
                
                {/* New universal routes */}
              <Route path="/feed/:slug" element={<TopicFeed />} />
              <Route path="/feed/:slug/archive" element={<TopicArchive />} />
              <Route path="/feed/:slug/briefings" element={<BriefingsArchive />} />
              <Route path="/feed/:slug/about" element={<AboutFeed />} />
              <Route path="/feed/:slug/widget" element={<PublicWidgetBuilder />} />
              <Route path="/feed/:slug/story/:storyId" element={<StoryPage />} />
              <Route path="/feed/:slug/daily/:date" element={<DailyRoundupList />} />
              <Route path="/feed/:slug/weekly/:weekStart" element={<WeeklyRoundupList />} />
              
              {/* Swipe Mode (isolated) */}
              <Route path="/play/:slug" element={<SwipeMode />} />
              
              {/* Explore Mode - photo pile */}
              <Route path="/explore/:slug" element={<ExplorePile />} />
              
              {/* Subscription verification */}
              <Route path="/verify-subscription" element={<VerifySubscription />} />

                {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
                <Route path="*" element={<NotFound />} />
              </Routes>
            </BrowserRouter>
          </SystemErrorBoundary>
        </TooltipProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
};

export default App;