import { useEffect } from "react";
import { Spinner } from '@/components/ui/spinner';
import { TopicManager } from "@/components/TopicManager";
import { AppLayout } from "@/components/AppLayout";
import { useAuth } from "@/hooks/useAuth";
import { useNavigate } from "react-router-dom";
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
      <div className="min-h-screen bg-background">
        <div className="container mx-auto px-4 py-8">
          <div className="flex justify-center items-center min-h-[60vh]">
            <Spinner size="lg" />
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
      <div className="min-h-screen bg-background">
        <div className="container mx-auto px-4 py-8">
          {/* Header */}
          <div className="mb-8">
            <h1 className="text-4xl font-bold text-foreground">
              Your topics
            </h1>
          </div>

          <TopicManager />
      </div>
      </div>
    </AppLayout>
  );
};

export default Dashboard;