import React, { useState } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate, useParams } from "react-router-dom";
import { AuthProvider } from "@/hooks/useAuth";
import { SystemErrorBoundary } from "@/components/SystemErrorBoundary";
import Index from "./pages/Index";
import Auth from "./pages/Auth";
import NotFound from "./pages/NotFound";

import AdminPanel from "./pages/AdminPanel";
import Dashboard from "./pages/Dashboard";
import TopicDashboard from "./pages/TopicDashboard";
import TopicFeed from "./pages/TopicFeed";
import StoryPage from "./pages/StoryPage";
import DailyRoundupList from "./pages/DailyRoundupList";
import WeeklyRoundupList from "./pages/WeeklyRoundupList";

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

// Create QueryClient with stable configuration
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
            <Toaster />
            <Sonner />
            <BrowserRouter>
              <Routes>
                <Route path="/" element={<Index />} />
                <Route path="/auth" element={<Auth />} />
                <Route path="/dashboard" element={<Dashboard />} />
                <Route path="/dashboard/topic/:slug" element={<TopicDashboard />} />
                <Route path="/admin" element={<AdminPanel />} />
                
                {/* Redirect old URL patterns to new universal URLs */}
                <Route path="/feed/topic/:slug" element={<FeedRedirect />} />
                <Route path="/feed/topic/:slug/story/:storyId" element={<StoryRedirect />} />
                
                {/* New universal routes */}
              <Route path="/feed/:slug" element={<TopicFeed />} />
              <Route path="/feed/:slug/story/:storyId" element={<StoryPage />} />
              <Route path="/feed/:slug/daily/:date" element={<DailyRoundupList />} />
              <Route path="/feed/:slug/weekly/:weekStart" element={<WeeklyRoundupList />} />

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