import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { TopicManager } from "@/components/TopicManager";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { BarChart3, Settings, FileText, Globe, Menu, ChevronDown, LogOut } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Link } from "react-router-dom";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface DashboardStats {
  topics: number;
  articles: number;
  stories: number;
  sources: number;
}

const Dashboard = () => {
  const { user, isAdmin, signOut } = useAuth();
  const [stats, setStats] = useState<DashboardStats>({
    topics: 0,
    articles: 0,
    stories: 0,
    sources: 0
  });
  const [loading, setLoading] = useState(true);
  const [dashboardExpanded, setDashboardExpanded] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    if (user) {
      loadDashboardStats();
    }
  }, [user]);

  const loadDashboardStats = async () => {
    try {
      // First get user's topic IDs
      const { data: userTopics, error: topicsError } = await supabase
        .from('topics')
        .select('id')
        .eq('created_by', user?.id);
      
      if (topicsError) {
        throw topicsError;
      }
      
      const topicIds = userTopics?.map(t => t.id) || [];

      // Get article IDs from user's topics for stories count
      let articleIds: string[] = [];
      if (topicIds.length > 0) {
        const { data: userArticles, error: articlesError } = await supabase
          .from('articles')
          .select('id')
          .in('topic_id', topicIds);
          
        if (articlesError) {
          throw articlesError;
        }
        
        articleIds = userArticles?.map(a => a.id) || [];
      }

      const [topicsRes, articlesRes, storiesRes, sourcesRes] = await Promise.all([
        // Count topics created by current user
        supabase.from('topics').select('id', { count: 'exact' }).eq('created_by', user?.id),
        
        // Count articles from user's topics
        topicIds.length > 0 
          ? supabase.from('articles').select('id', { count: 'exact' }).in('topic_id', topicIds)
          : { count: 0, data: [], error: null },
        
        // Count stories from articles in user's topics  
        articleIds.length > 0
          ? supabase.from('stories').select('id', { count: 'exact' }).in('article_id', articleIds)
          : { count: 0, data: [], error: null },
        
        // Count content sources from user's topics
        topicIds.length > 0
          ? supabase.from('content_sources').select('id', { count: 'exact' }).in('topic_id', topicIds)
          : { count: 0, data: [], error: null }
      ]);

      // Check for errors in any of the queries
      if (topicsRes.error) throw topicsRes.error;
      if (articlesRes.error) throw articlesRes.error;
      if (storiesRes.error) throw storiesRes.error;
      if (sourcesRes.error) throw sourcesRes.error;

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
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-4xl font-bold bg-gradient-to-r from-primary to-primary/70 bg-clip-text text-transparent mb-2">
              Your topics
            </h1>
          </div>
          
          {/* User Menu */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="icon">
                <Menu className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {isAdmin && (
                <DropdownMenuItem asChild>
                  <Link to="/admin">
                    <Settings className="mr-2 h-4 w-4" />
                    Admin Panel
                  </Link>
                </DropdownMenuItem>
              )}
              <DropdownMenuItem onClick={signOut}>
                <LogOut className="mr-2 h-4 w-4" />
                Sign Out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Collapsible Dashboard Overview */}
        <Collapsible open={dashboardExpanded} onOpenChange={setDashboardExpanded} className="mb-8">
          <CollapsibleTrigger asChild>
            <Button 
              variant="outline" 
              size="sm"
              className="bg-gradient-to-br from-background/50 to-muted/50 border-border/30 hover:bg-accent"
            >
              <BarChart3 className="h-4 w-4" />
              <ChevronDown className={`h-4 w-4 ml-1 transition-transform ${dashboardExpanded ? 'rotate-180' : ''}`} />
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent className="space-y-4 mt-4">
            {/* Stats Cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
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
          </CollapsibleContent>
        </Collapsible>


        {/* Main Dashboard Content */}
        <div className="space-y-6">
          <TopicManager />
        </div>
      </div>
    </div>
  );
};

export default Dashboard;