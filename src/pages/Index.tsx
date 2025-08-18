import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { AlertCircle, CheckCircle, Clock, LogOut, Settings, FileText, TestTube, Sparkles, ArrowRight } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { AdminPanel } from '@/components/AdminPanel';
import { TestingSuite } from '@/components/TestingSuite';
import { EastbourneSourceManager } from '@/components/EastbourneSourceManager';
import { SlideReviewQueue } from '@/components/SlideReviewQueue';

const Index = () => {
  const { user, loading, signOut, isAdmin, isSuperAdmin, userRole } = useAuth();
  const navigate = useNavigate();
  const [showAdmin, setShowAdmin] = useState(false);
  const [showTestingSuite, setShowTestingSuite] = useState(false);
  const [articles, setArticles] = useState<any[]>([]);
  const { toast } = useToast();

  useEffect(() => {
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

  // Removed system health check for simplified UI

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
        ) : showTestingSuite ? (
          <TestingSuite />
        ) : (
          <>
            {/* Eastbourne News Pipeline Status */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
              <Card>
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground">Active Sources</p>
                      <p className="text-2xl font-bold">{articles.length > 0 ? '3' : '0'}</p>
                    </div>
                    <Badge variant="secondary">Eastbourne</Badge>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground">Articles Today</p>
                      <p className="text-2xl font-bold">
                        {articles.filter(a => 
                          new Date(a.created_at).toDateString() === new Date().toDateString()
                        ).length}
                      </p>
                    </div>
                    <FileText className="w-8 h-8 text-primary/60" />
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground">Slides Generated</p>
                      <p className="text-2xl font-bold">12</p>
                    </div>
                    <Sparkles className="w-8 h-8 text-primary/60" />
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground">Pending Review</p>
                      <p className="text-2xl font-bold">3</p>
                    </div>
                    <Clock className="w-8 h-8 text-primary/60" />
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Main Workflow */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              {/* Website Sources */}
              <div>
                <EastbourneSourceManager 
                  onSourcesChange={() => {
                    loadArticles();
                  }}
                />
              </div>

              {/* Slide Review Queue */}
              <div>
                <SlideReviewQueue />
              </div>
            </div>

            {/* Process Flow Indicator */}
            <Card className="bg-muted/30">
              <CardContent className="p-6">
                <div className="flex items-center justify-center gap-4 text-sm">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-primary"></div>
                    <span>Add Website</span>
                  </div>
                  <ArrowRight className="w-4 h-4 text-muted-foreground" />
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-primary"></div>
                    <span>Auto Scrape Articles</span>
                  </div>
                  <ArrowRight className="w-4 h-4 text-muted-foreground" />
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-primary"></div>
                    <span>Generate Slides</span>
                  </div>
                  <ArrowRight className="w-4 h-4 text-muted-foreground" />
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-primary"></div>
                    <span>Review & Approve</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </div>
  );
};

export default Index;
