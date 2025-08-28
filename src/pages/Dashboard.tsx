import { useState, useEffect } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { TopicManager } from "@/components/TopicManager";
import { TopicAwareSourceManager } from "@/components/TopicAwareSourceManager";
import { TopicAwareContentPipeline } from "@/components/TopicAwareContentPipeline";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { BarChart3, Settings, FileText, Globe, Users, Plus } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Link } from "react-router-dom";

interface DashboardStats {
  topics: number;
  articles: number;
  stories: number;
  sources: number;
}

const Dashboard = () => {
  const { user, isAdmin } = useAuth();
  const [stats, setStats] = useState<DashboardStats>({
    topics: 0,
    articles: 0,
    stories: 0,
    sources: 0
  });
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    if (user) {
      loadDashboardStats();
    }
  }, [user]);

  const loadDashboardStats = async () => {
    try {
      const [topicsRes, articlesRes, storiesRes, sourcesRes] = await Promise.all([
        supabase.from('topics').select('id', { count: 'exact' }),
        supabase.from('articles').select('id', { count: 'exact' }),
        supabase.from('stories').select('id', { count: 'exact' }),
        supabase.from('content_sources').select('id', { count: 'exact' })
      ]);

      setStats({
        topics: topicsRes.count || 0,
        articles: articlesRes.count || 0,
        stories: storiesRes.count || 0,
        sources: sourcesRes.count || 0
      });
    } catch (error) {
      console.error('Error loading dashboard stats:', error);
      toast({
        title: "Error",
        description: "Failed to load dashboard statistics",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  if (!user) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-background to-muted/50">
        <div className="container mx-auto px-4 py-8">
          <div className="text-center space-y-4">
            <h1 className="text-4xl font-bold">Access Denied</h1>
            <p className="text-muted-foreground">
              Please log in to access the dashboard.
            </p>
            <Button asChild>
              <Link to="/auth">Sign In</Link>
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-background to-muted/50">
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold bg-gradient-to-r from-primary to-primary/70 bg-clip-text text-transparent mb-2">
            Dashboard
          </h1>
          <p className="text-muted-foreground">
            Manage your topics, content sources, and curated feeds
          </p>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Topics</CardTitle>
              <Globe className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{loading ? '...' : stats.topics}</div>
              <p className="text-xs text-muted-foreground">Active content topics</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Sources</CardTitle>
              <Settings className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{loading ? '...' : stats.sources}</div>
              <p className="text-xs text-muted-foreground">Content sources</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Articles</CardTitle>
              <FileText className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{loading ? '...' : stats.articles}</div>
              <p className="text-xs text-muted-foreground">Imported articles</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Stories</CardTitle>
              <BarChart3 className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{loading ? '...' : stats.stories}</div>
              <p className="text-xs text-muted-foreground">Generated stories</p>
            </CardContent>
          </Card>
        </div>

        {/* Legacy Eastbourne Access */}
        <Card className="mb-8 border-dashed">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Globe className="h-5 w-5 text-blue-500" />
              Legacy Eastbourne Feed
            </CardTitle>
            <CardDescription>
              Access the original Eastbourne news feed during transition period
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button variant="outline" asChild>
              <Link to="/eastbourne">
                Open Eastbourne Feed
              </Link>
            </Button>
          </CardContent>
        </Card>

        {/* Main Dashboard Content */}
        <Tabs defaultValue="topics" className="space-y-6">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="topics">Topics</TabsTrigger>
            <TabsTrigger value="content">Content Pipeline</TabsTrigger>
            <TabsTrigger value="sources">Sources</TabsTrigger>
          </TabsList>

          <TabsContent value="topics" className="space-y-6">
            <TopicManager />
          </TabsContent>

          <TabsContent value="content" className="space-y-6">
            <TopicAwareContentPipeline />
          </TabsContent>

          <TabsContent value="sources" className="space-y-6">
            <TopicAwareSourceManager onSourcesChange={loadDashboardStats} />
          </TabsContent>
        </Tabs>

        {/* Admin Section (separate from tabs) */}
        {isAdmin && (
          <Card className="mt-8">
            <CardHeader>
              <CardTitle>System Administration</CardTitle>
              <CardDescription>
                System-wide settings and management
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-medium">Global Source Management</h3>
                    <p className="text-sm text-muted-foreground">
                      Manage sources across all topics
                    </p>
                  </div>
                  <Button variant="outline" asChild>
                    <Link to="/admin">
                      Open Admin Panel
                    </Link>
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
};

export default Dashboard;