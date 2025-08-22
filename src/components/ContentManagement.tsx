import { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Search, Plus, RefreshCw, Filter, Eye, Settings } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { ArticleImport } from './ArticleImport';
import { SourceManager } from './SourceManager';
// import { AdvancedSearch } from './AdvancedSearch';
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
  source_name?: string;
  source_domain?: string;
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
        .select(`
          *,
          content_sources:source_id (
            source_name,
            canonical_domain
          )
        `)
        .eq('processing_status', 'new') // Only show new articles
        .order('published_at', { ascending: false })
        .limit(50);

      if (error) throw error;
      
      // Transform the data to flatten the source information
      const transformedArticles = (data || []).map(article => ({
        ...article,
        source_name: article.content_sources?.source_name || 'Unknown Source',
        source_domain: article.content_sources?.canonical_domain || null
      }));
      
      setArticles(transformedArticles);
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
        .select(`
          *,
          content_sources:source_id (
            source_name,
            canonical_domain
          )
        `)
        .eq('processing_status', 'new') // Only search in new articles
        .textSearch('search', searchQuery)
        .order('published_at', { ascending: false })
        .limit(50);

      if (error) throw error;
      
      // Transform the data to flatten the source information
      const transformedArticles = (data || []).map(article => ({
        ...article,
        source_name: article.content_sources?.source_name || 'Unknown Source',
        source_domain: article.content_sources?.canonical_domain || null
      }));
      
      setArticles(transformedArticles);

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