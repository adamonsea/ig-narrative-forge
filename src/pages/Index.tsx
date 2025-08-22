import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { AlertCircle, CheckCircle, Clock, LogOut, Settings, FileText, TestTube, Sparkles, ArrowRight, ExternalLink, Trash2, BarChart3 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { AdminPanel } from '@/components/AdminPanel';
import { ContentManagement } from '@/components/ContentManagement';
import { ContentPipeline } from '@/components/ContentPipeline';
import { ApprovedQueue } from '@/components/ApprovedQueue';
import IdeogramTestSuite from '@/components/IdeogramTestSuite';

// import { AnalyticsDashboard } from '@/components/AnalyticsDashboard';

const Index = () => {
  const { user, loading, signOut, isAdmin, isSuperAdmin } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  
  const [activeTab, setActiveTab] = useState<'content' | 'slides' | 'approved' | 'ideogram' | 'admin'>('content');
  const [articles, setArticles] = useState<any[]>([]);
  const [stats, setStats] = useState({
    sources: { count: 0, status: 'loading' },
    articles: { count: 0, status: 'loading' },
    slides: { count: 0, status: 'loading' },
    errors: { count: 0, status: 'success' }
  });

  useEffect(() => {
    if (user) {
      loadArticles();
      loadStats();
    }
  }, [user]);

  useEffect(() => {
    // Redirect to auth if not logged in and not loading
    if (!loading && !user) {
      navigate('/auth');
    }
  }, [user, loading, navigate]);

  const loadArticles = async () => {
    // Query for new articles only (using processing_status instead of story join)
    const { data, error } = await supabase
      .from('articles')
      .select('*')
      .eq('processing_status', 'new') // Only truly unprocessed articles
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) {
      console.error('Error loading new articles:', error);
      setStats(prev => ({
        ...prev,
        articles: { count: 0, status: 'error', error: error.message }
      }));
    } else {
      // Sort by Eastbourne relevance score (highest first), then by date
      const sortedArticles = (data || []).sort((a, b) => {
        const aMetadata = a.import_metadata as any;
        const bMetadata = b.import_metadata as any;
        const aScore = aMetadata?.eastbourne_relevance_score || 0;
        const bScore = bMetadata?.eastbourne_relevance_score || 0;
        
        if (aScore !== bScore) {
          return bScore - aScore; // Higher relevance first
        }
        
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      });
      
      setArticles(sortedArticles);
      setStats(prev => ({
        ...prev,
        articles: { count: sortedArticles.length, status: 'success' }
      }));
    }
  };

  const deleteArticle = async (articleId: string) => {
    try {
      const { error } = await supabase
        .from('articles')
        .delete()
        .eq('id', articleId);

      if (error) throw error;

      toast({
        title: "Article Deleted",
        description: "The article has been removed and won't reappear.",
      });

      await loadArticles(); // Refresh the list
    } catch (error: any) {
      toast({
        title: "Delete Failed",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const loadStats = async () => {
    // Load source count
    const { data: sources } = await supabase
      .from('content_sources')
      .select('id')
      .eq('is_active', true);
    
    setStats(prev => ({
      ...prev,
      sources: { count: sources?.length || 0, status: 'success' }
    }));

    // Load slides count
    const { data: slides } = await supabase
      .from('slides')
      .select('id');
    
    setStats(prev => ({
      ...prev,
      slides: { count: slides?.length || 0, status: 'success' }
    }));
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
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-primary">eeZee news</h1>
              <p className="text-sm text-muted-foreground">turbo hyper local</p>
            </div>
            <div className="flex items-center gap-2">
              <Button 
                variant="outline" 
                size="sm"
                onClick={() => window.open("/feed/eastbourne", "_blank")}
              >
                View Eastbourne Feed
              </Button>
            </div>
          <div className="flex items-center gap-4">
            {isAdmin && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setActiveTab('admin')}
                className="flex items-center gap-2"
              >
                <Settings className="h-4 w-4" />
                Admin
              </Button>
            )}
            <span className="text-sm text-muted-foreground">
              {user?.email}
              {isSuperAdmin && <Badge variant="destructive" className="ml-2">SuperAdmin</Badge>}
              {isAdmin && !isSuperAdmin && <Badge variant="secondary" className="ml-2">Admin</Badge>}
            </span>
            <Button onClick={handleSignOut} variant="outline" size="sm">
              <LogOut className="h-4 w-4 mr-2" />
              Sign Out
            </Button>
          </div>
        </div>
      </header>

      {/* Navigation */}
      <nav className="border-b bg-muted/50">
        <div className="max-w-7xl mx-auto px-6 py-2">
          <div className="flex gap-2">
            <Button
              variant={activeTab === 'content' ? 'default' : 'outline'}
              onClick={() => setActiveTab('content')}
              className="flex items-center gap-2"
            >
              <Settings className="w-4 h-4" />
              Get Stories
            </Button>
            <Button
              variant={activeTab === 'slides' ? 'default' : 'outline'}
              onClick={() => setActiveTab('slides')}
              className="flex items-center gap-2"
            >
              <Sparkles className="w-4 h-4" />
              Pipeline
            </Button>
            <Button
              variant={activeTab === 'approved' ? 'default' : 'outline'}
              onClick={() => setActiveTab('approved')}
              className="flex items-center gap-2"
            >
              <CheckCircle className="w-4 h-4" />
              Approved Queue
            </Button>
            <Button
              variant={activeTab === 'ideogram' ? 'default' : 'outline'}
              onClick={() => setActiveTab('ideogram')}
              className="flex items-center gap-2"
            >
              <TestTube className="w-4 h-4" />
              AI Image Test
            </Button>
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-6 py-8">
        {activeTab === 'admin' && isAdmin && (
          <div className="space-y-6">
            <AdminPanel />
          </div>
        )}

        {activeTab === 'content' && (
          <div className="space-y-6">
            <ContentManagement />
          </div>
        )}

        {activeTab === 'slides' && (
          <ContentPipeline onRefresh={loadArticles} />
        )}

        {activeTab === 'approved' && (
          <div className="space-y-6">
            <ApprovedQueue />
          </div>
        )}

        {activeTab === 'ideogram' && (
          <div className="space-y-6">
            <IdeogramTestSuite />
          </div>
        )}
      </main>
    </div>
  );
};

export default Index;