import { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Search, Plus, RefreshCw, Filter, Eye, Settings } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import { ArticleImport } from './ArticleImport';
import { SourceManager } from './SourceManager';
import { AdvancedSearch } from './AdvancedSearch';
import { ArticleList } from './ArticleList';

interface Article {
  id: string;
  title: string;
  author: string | null;
  published_at: string | null;
  category: string | null;
  tags: string[] | null;
  word_count: number | null;
  reading_time_minutes: number | null;
  source_url: string;
  region: string | null;
  summary: string | null;
  body: string | null;
  created_at: string;
}

interface ContentSource {
  id: string;
  source_name: string;
  feed_url: string | null;
  canonical_domain: string | null;
  credibility_score: number | null;
  is_active: boolean | null;
  articles_scraped: number | null;
  success_rate: number | null;
  avg_response_time_ms: number | null;
  last_scraped_at: string | null;
  region: string | null;
  content_type: string | null;
  is_whitelisted: boolean | null;
  is_blacklisted: boolean | null;
  scrape_frequency_hours: number | null;
}

export const ContentManagement = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [articles, setArticles] = useState<Article[]>([]);
  const [sources, setSources] = useState<ContentSource[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTab, setSelectedTab] = useState('articles');

  // Load initial data
  useEffect(() => {
    if (user) {
      loadArticles();
      loadSources();
    }
  }, [user]);

  const loadArticles = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('articles')
        .select('*')
        .eq('processing_status', 'new') // Only show new articles
        .order('published_at', { ascending: false })
        .limit(50);

      if (error) throw error;
      setArticles(data || []);
    } catch (error) {
      console.error('Error loading articles:', error);
      toast({
        title: 'Error',
        description: 'Failed to load articles',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const loadSources = async () => {
    try {
      const { data, error } = await supabase
        .from('content_sources')
        .select('*')
        .order('credibility_score', { ascending: false });

      if (error) throw error;
      setSources(data || []);
    } catch (error) {
      console.error('Error loading sources:', error);
      toast({
        title: 'Error',
        description: 'Failed to load content sources',
        variant: 'destructive',
      });
    }
  };

  const handleSearch = async () => {
    if (!searchQuery.trim()) {
      loadArticles();
      return;
    }

    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('articles')
        .select('*')
        .eq('processing_status', 'new') // Only search in new articles
        .textSearch('search', searchQuery)
        .order('published_at', { ascending: false })
        .limit(50);

      if (error) throw error;
      setArticles(data || []);

      // Log search query for analytics
      await supabase
        .from('search_queries')
        .insert({
          query_text: searchQuery,
          user_id: user?.id,
          results_count: data?.length || 0,
        });
    } catch (error) {
      console.error('Search error:', error);
      toast({
        title: 'Search Error',
        description: 'Failed to search articles',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  if (!user) {
    return (
      <div className="container mx-auto p-6">
        <Card>
          <CardContent className="flex items-center justify-center p-12">
            <p className="text-muted-foreground">Please log in to access content management.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Content Management</h1>
          <p className="text-muted-foreground">
            Import, organize, and manage news articles for social media content creation
          </p>
        </div>
        
        <div className="flex gap-2">
          <Button variant="outline" onClick={loadArticles}>
            <RefreshCw className="w-4 h-4 mr-2" />
            Refresh
          </Button>
        </div>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total Articles</p>
                <p className="text-2xl font-bold">{articles.length}</p>
              </div>
              <Eye className="w-8 h-8 text-primary/60" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Active Sources</p>
                <p className="text-2xl font-bold">
                  {sources.filter(s => s.is_active).length}
                </p>
              </div>
              <Settings className="w-8 h-8 text-primary/60" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Avg Credibility</p>
                <p className="text-2xl font-bold">
                  {Math.round(sources.reduce((acc, s) => acc + (s.credibility_score || 0), 0) / sources.length || 0)}
                </p>
              </div>
              <Badge variant="secondary" className="text-xs">Score</Badge>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Today's New Articles</p>
                <p className="text-2xl font-bold">
                  {articles.filter(a => 
                    a.published_at && 
                    new Date(a.published_at).toDateString() === new Date().toDateString()
                  ).length}
                </p>
              </div>
              <Plus className="w-8 h-8 text-primary/60" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Search Bar */}
      <Card>
        <CardContent className="p-4">
          <div className="flex gap-2">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search articles by title, content, or author..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                className="pl-10"
              />
            </div>
            <Button onClick={handleSearch}>
              <Search className="w-4 h-4" />
            </Button>
            <Button variant="outline">
              <Filter className="w-4 h-4" />
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Sources Management */}
      <SourceManager sources={sources} onSourcesChange={loadSources} />

      {/* New Articles List */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-bold">New Articles</h2>
          <p className="text-sm text-muted-foreground">
            Articles ready for processing into social media content
          </p>
        </div>
        
        <ArticleList 
          articles={articles} 
          loading={loading} 
          onRefresh={loadArticles} 
        />
      </div>
    </div>
  );
};