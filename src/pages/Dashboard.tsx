import { Skeleton } from "@/components/ui/skeleton";
import { useEffect } from "react";
import { Helmet } from "react-helmet-async";
import { TopicManager } from "@/components/TopicManager";
import { AppLayout } from "@/components/AppLayout";
import { PlanStatus } from "@/components/billing/PlanStatus";
import { useAuth } from "@/hooks/useAuth";
import { useNavigate } from "@/lib/router-compat";
import { usePageFavicon } from "@/hooks/usePageFavicon";

const Dashboard = () => {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  
  usePageFavicon();

  useEffect(() => {
    if (!authLoading && !user) {
      navigate('/auth', { replace: true });
    }
  }, [authLoading, user, navigate]);

  // Show loading spinner while auth initializes
  if (authLoading) {
    return (
      <div className="min-h-dvh bg-background">
        <div className="container mx-auto px-4 py-8">
          <div className="flex justify-center items-center min-h-[60vh]">
            <div className="w-full max-w-3xl space-y-4"><Skeleton className="h-8 w-48" /><Skeleton className="h-40 w-full rounded-xl" /><Skeleton className="h-40 w-full rounded-xl" /></div>
          </div>
        </div>
      </div>
    );
  }


  if (!user) {
    return null;
  }

  return (
    <AppLayout>
      <Helmet>
        <title>Your feeds | Curatr</title>
        <meta name="description" content="Manage your curated news feeds, sources, and editorial pipeline from your Curatr dashboard." />
        <link rel="canonical" href="https://curatr.pro/dashboard" />
        <meta property="og:title" content="Your feeds | Curatr" />
        <meta property="og:description" content="Manage your curated news feeds, sources, and editorial pipeline from your Curatr dashboard." />
        <meta property="og:url" content="https://curatr.pro/dashboard" />
      </Helmet>
      <div className="min-h-dvh bg-background">
        <div className="container mx-auto px-4 py-8">
          {/* Header */}
          <div className="mb-6">
            <h1 className="font-display text-[32px] leading-tight font-normal">
              Your feeds
            </h1>
          </div>

          <div className="mb-8">
            <PlanStatus />
          </div>

          <TopicManager />
      </div>
      </div>
    </AppLayout>
  );
};

export default Dashboard;