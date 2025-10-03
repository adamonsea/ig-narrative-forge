import React, { useState } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
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
                <Route path="/feed/:slug" element={<TopicFeed />} />
                <Route path="/feed/:slug/story/:storyId" element={<StoryPage />} />
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