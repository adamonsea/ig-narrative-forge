import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { AlertCircle, CheckCircle, Clock, LogOut, Settings, FileText, TestTube, Sparkles } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { AdminPanel } from '@/components/AdminPanel';
import { ContentManagement } from '@/components/ContentManagement';
import { TestingSuite } from '@/components/TestingSuite';
import { SlideGenerator } from '@/components/SlideGenerator';

const Index = () => {
  const { user, loading, signOut, isAdmin, isSuperAdmin, userRole } = useAuth();
  const navigate = useNavigate();
  const [systemHealth, setSystemHealth] = useState<any>(null);
  const [showAdmin, setShowAdmin] = useState(false);
  const [showContentManagement, setShowContentManagement] = useState(false);
  const [showTestingSuite, setShowTestingSuite] = useState(false);
  const [showSlideGenerator, setShowSlideGenerator] = useState(false);
  const [articles, setArticles] = useState<any[]>([]);
  const { toast } = useToast();

  useEffect(() => {
    checkSystemHealth();
    if (user) {
      loadArticles();
    }
  }, [user]);

  useEffect(() => {
    // Redirect to auth if not logged in and not loading
    if (!loading && !user) {
      navigate('/auth');
    }
  }, [user, loading, navigate]);

  const loadArticles = async () => {
    try {
      const { data, error } = await supabase
        .from('articles')
        .select('id, title, author, region, category, word_count, reading_time_minutes, summary')
        .order('created_at', { ascending: false })
        .limit(10);
      
      if (error) throw error;
      setArticles(data || []);
    } catch (error) {
      console.error('Failed to load articles:', error);
    }
  };

  const checkSystemHealth = async () => {
    try {
      const { data, error } = await supabase.functions.invoke('health-check');
      if (error) throw error;
      setSystemHealth(data);
    } catch (error) {
      console.error('Failed to fetch system health:', error);
      toast({
        title: "Health Check Failed",
        description: "Unable to fetch system status",
        variant: "destructive",
      });
    }
  };

  const handleSignOut = async () => {
    await signOut();
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
          <p>Loading...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return null; // Will redirect to auth
  }

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-7xl mx-auto space-y-8">
        <div className="flex items-center justify-between">
          <h1 className="text-4xl font-bold gradient-text">News → Social Slides</h1>
          <div className="flex items-center gap-4">
            <span className="text-sm text-muted-foreground">
              {user?.email}
              {isSuperAdmin && <Badge variant="destructive" className="ml-2">SuperAdmin</Badge>}
              {isAdmin && !isSuperAdmin && <Badge variant="secondary" className="ml-2">Admin</Badge>}
            </span>
            {isAdmin && (
              <Button 
                onClick={() => setShowAdmin(!showAdmin)} 
                variant={showAdmin ? "default" : "outline"}
                size="sm"
              >
                <Settings className="h-4 w-4 mr-2" />
                Admin
              </Button>
            )}
            <Button onClick={handleSignOut} variant="outline" size="sm">
              <LogOut className="h-4 w-4 mr-2" />
              Sign Out
            </Button>
          </div>
        </div>

        {showAdmin && isAdmin ? (
          <AdminPanel />
        ) : showContentManagement ? (
          <ContentManagement />
        ) : showTestingSuite ? (
          <TestingSuite />
        ) : showSlideGenerator ? (
          <SlideGenerator articles={articles} onRefresh={loadArticles} />
        ) : (
          <>
            {/* System Health Status */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  System Health
                  {systemHealth?.overall_status === 'healthy' ? (
                    <CheckCircle className="h-5 w-5 text-green-600" />
                  ) : (
                    <AlertCircle className="h-5 w-5 text-red-600" />
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="text-center">
                    <div className="text-2xl font-bold">
                      <Badge variant={systemHealth?.overall_status === 'healthy' ? 'default' : 'destructive'}>
                        {String(systemHealth?.overall_status || 'Checking...')}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">Overall Status</p>
                  </div>
                  
                  <div className="text-center">
                    <div className="text-2xl font-bold">
                      <Badge variant={systemHealth?.services?.database?.status === 'healthy' ? 'default' : 'destructive'}>
                        {String(systemHealth?.services?.database?.status || 'Unknown')}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">Database</p>
                  </div>
                  
                  <div className="text-center">
                    <div className="text-2xl font-bold">
                      <Badge variant={systemHealth?.services?.job_queue?.status === 'healthy' ? 'default' : 'destructive'}>
                        {String(systemHealth?.services?.job_queue?.status || 'Unknown')}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">Job Queue</p>
                  </div>
                  
                  <div className="text-center">
                    <div className="text-2xl font-bold">
                      {typeof systemHealth?.services?.job_queue?.pending_jobs === 'number' 
                        ? systemHealth.services.job_queue.pending_jobs
                        : 0
                      }
                    </div>
                    <p className="text-sm text-muted-foreground">Pending Jobs</p>
                  </div>
                </div>
                
                <div className="mt-4 pt-4 border-t">
                  <p className="text-xs text-muted-foreground">
                    Last checked: {systemHealth?.timestamp ? 
                      new Date(systemHealth.timestamp).toLocaleString() : 
                      'Never'
                    }
                  </p>
                </div>
              </CardContent>
            </Card>

            {/* Quick Actions */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <FileText className="w-5 h-5" />
                    Content Management
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground mb-4">
                    Import articles, manage sources, and organize content
                  </p>
                  <Button 
                    className="w-full" 
                    onClick={() => setShowContentManagement(true)}
                  >
                    Open Content Manager
                  </Button>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <TestTube className="w-5 h-5" />
                    Testing & Validation
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground mb-4">
                    Validate Phase 1 functionality and system health
                  </p>
                  <Button 
                    className="w-full" 
                    onClick={() => setShowTestingSuite(true)}
                  >
                    Run Tests
                  </Button>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Sparkles className="w-5 h-5" />
                    Generate Slides
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground mb-4">
                    AI-powered conversion of news into social media slide carousels
                  </p>
                  <Button 
                    className="w-full" 
                    onClick={() => setShowSlideGenerator(true)}
                  >
                    Open Slide Generator
                  </Button>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Publish Content</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground mb-4">
                    Schedule and publish to social platforms via Buffer
                  </p>
                  <Button className="w-full" disabled>
                    Coming Soon
                  </Button>
                </CardContent>
              </Card>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default Index;
