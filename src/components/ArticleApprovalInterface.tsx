import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { CheckCircle, XCircle, Eye, Clock } from 'lucide-react';

interface Article {
  id: string;
  title: string;
  body: string;
  author?: string;
  source_url: string;
  processing_status: string;
  regional_relevance_score: number;
  content_quality_score: number;
  word_count: number;
  created_at: string;
  region?: string;
}

export default function ArticleApprovalInterface() {
  const [articles, setArticles] = useState<Article[]>([]);
  const [loading, setLoading] = useState(true);
  const [approving, setApproving] = useState<string | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    loadPendingArticles();
  }, []);

  const loadPendingArticles = async () => {
    try {
      const { data, error } = await supabase
        .from('articles')
        .select('*')
        .in('processing_status', ['new', 'processed'])
        .order('created_at', { ascending: false })
        .limit(20);

      if (error) throw error;
      setArticles(data || []);
    } catch (error) {
      console.error('Error loading articles:', error);
      toast({
        title: "Error",
        description: "Failed to load articles",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const approveArticle = async (articleId: string) => {
    setApproving(articleId);
    try {
      const { data, error } = await supabase.rpc('approve_article_for_generation', {
        article_uuid: articleId
      });

      if (error) throw error;

      if (data) {
        toast({
          title: "Success",
          description: "Article approved and added to content generation queue",
        });
        // Remove the approved article from the list
        setArticles(prev => prev.filter(article => article.id !== articleId));
      } else {
        toast({
          title: "Warning",
          description: "Article could not be approved (may already be in queue)",
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error('Error approving article:', error);
      toast({
        title: "Error",
        description: "Failed to approve article",
        variant: "destructive",
      });
    } finally {
      setApproving(null);
    }
  };

  const discardArticle = async (articleId: string) => {
    try {
      const { error } = await supabase
        .from('articles')
        .update({ processing_status: 'discarded' })
        .eq('id', articleId);

      if (error) throw error;

      toast({
        title: "Success",
        description: "Article discarded",
      });
      // Remove the discarded article from the list
      setArticles(prev => prev.filter(article => article.id !== articleId));
    } catch (error) {
      console.error('Error discarding article:', error);
      toast({
        title: "Error",
        description: "Failed to discard article",
        variant: "destructive",
      });
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'new': return 'bg-blue-500';
      case 'processed': return 'bg-green-500';
      case 'processing': return 'bg-yellow-500';
      case 'discarded': return 'bg-red-500';
      default: return 'bg-gray-500';
    }
  };

  const getQualityColor = (score: number) => {
    if (score >= 70) return 'text-green-600';
    if (score >= 50) return 'text-yellow-600';
    return 'text-red-600';
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5" />
            Loading Articles...
          </CardTitle>
        </CardHeader>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Eye className="h-5 w-5" />
            Article Approval Queue ({articles.length} pending)
          </CardTitle>
        </CardHeader>
      </Card>

      {articles.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            No articles pending approval
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {articles.map((article) => (
            <Card key={article.id}>
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <CardTitle className="text-lg mb-2">{article.title}</CardTitle>
                    <div className="flex flex-wrap gap-2 mb-2">
                      <Badge className={getStatusColor(article.processing_status)}>
                        {article.processing_status}
                      </Badge>
                      <Badge variant="outline">
                        {article.word_count} words
                      </Badge>
                      <Badge variant="outline">
                        Quality: <span className={getQualityColor(article.content_quality_score)}>
                          {article.content_quality_score}
                        </span>
                      </Badge>
                      <Badge variant="outline">
                        Relevance: <span className={getQualityColor(article.regional_relevance_score)}>
                          {article.regional_relevance_score}
                        </span>
                      </Badge>
                      {article.region && (
                        <Badge variant="outline">{article.region}</Badge>
                      )}
                    </div>
                    {article.author && (
                      <p className="text-sm text-muted-foreground mb-2">
                        By {article.author}
                      </p>
                    )}
                    <p className="text-sm text-muted-foreground">
                      Source: {new URL(article.source_url).hostname}
                    </p>
                  </div>
                  <div className="flex gap-2 ml-4">
                    <Button
                      variant="default"
                      size="sm"
                      onClick={() => approveArticle(article.id)}
                      disabled={approving === article.id}
                      className="flex items-center gap-1"
                    >
                      <CheckCircle className="h-4 w-4" />
                      {approving === article.id ? 'Approving...' : 'Approve'}
                    </Button>
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => discardArticle(article.id)}
                      disabled={approving === article.id}
                      className="flex items-center gap-1"
                    >
                      <XCircle className="h-4 w-4" />
                      Discard
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-32 w-full rounded border p-3">
                  <div className="text-sm text-muted-foreground whitespace-pre-wrap">
                    {article.body?.substring(0, 500)}
                    {article.body && article.body.length > 500 && '...'}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}