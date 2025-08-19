import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { 
  AlertTriangle, 
  Merge, 
  X, 
  ExternalLink,
  Clock,
  CheckCircle,
  Eye
} from 'lucide-react';

interface ArticleDuplicate {
  id: string;
  original_article_id: string;
  duplicate_article_id: string;
  similarity_score: number;
  detection_method: string;
  status: string;
  created_at: string;
  original_article: {
    id: string;
    title: string;
    author: string | null;
    source_url: string;
    word_count: number | null;
    published_at: string | null;
  };
  duplicate_article: {
    id: string;
    title: string;
    author: string | null;
    source_url: string;
    word_count: number | null;
    published_at: string | null;
  };
}

export const DuplicateDetection = () => {
  const [duplicates, setDuplicates] = useState<ArticleDuplicate[]>([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState<string | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    loadPendingDuplicates();
  }, []);

  const loadPendingDuplicates = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('article_duplicates_pending')
        .select(`
          *,
          original_article:articles!article_duplicates_pending_original_article_id_fkey(
            id, title, author, source_url, word_count, published_at
          ),
          duplicate_article:articles!article_duplicates_pending_duplicate_article_id_fkey(
            id, title, author, source_url, word_count, published_at
          )
        `)
        .eq('status', 'pending')
        .order('similarity_score', { ascending: false });

      if (error) throw error;
      setDuplicates(data || []);
    } catch (error: any) {
      console.error('Error loading duplicates:', error);
      toast({
        title: 'Error',
        description: 'Failed to load duplicate articles',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const mergeArticles = async (duplicateId: string, originalId: string, duplicateArticleId: string) => {
    try {
      setProcessing(duplicateId);

      // Fetch both articles
      const { data: articles, error: fetchError } = await supabase
        .from('articles')
        .select('*')
        .in('id', [originalId, duplicateArticleId]);

      if (fetchError) throw fetchError;

      const original = articles?.find(a => a.id === originalId);
      const duplicate = articles?.find(a => a.id === duplicateArticleId);

      if (!original || !duplicate) {
        throw new Error('Articles not found');
      }

      const mergedBody = original.body && duplicate.body
        ? original.body.length > duplicate.body.length ? original.body : duplicate.body
        : original.body || duplicate.body;

      // Combine sources and metadata
      const mergedSources = [original.source_url];
      if (duplicate.source_url !== original.source_url) {
        mergedSources.push(duplicate.source_url);
      }

      // Update the original article with merged content
      const originalMetadata = (original.import_metadata || {}) as Record<string, any>;
      const { error: updateError } = await supabase
        .from('articles')
        .update({
          body: mergedBody,
          import_metadata: {
            ...originalMetadata,
            merged_sources: mergedSources,
            merged_from: duplicate.id,
            merged_at: new Date().toISOString()
          }
        })
        .eq('id', originalId);

      if (updateError) throw updateError;

      // Mark duplicate as processed
      const { error: statusError } = await supabase
        .from('articles')
        .update({ processing_status: 'merged' })
        .eq('id', duplicateArticleId);

      if (statusError) throw statusError;

      // Update duplicate detection record
      const { error: duplicateError } = await supabase
        .from('article_duplicates_pending')
        .update({
          status: 'merged',
          merged_at: new Date().toISOString(),
          merged_by: (await supabase.auth.getUser()).data.user?.id
        })
        .eq('id', duplicateId);

      if (duplicateError) throw duplicateError;

      toast({
        title: 'Articles Merged',
        description: 'Duplicate articles have been successfully merged',
      });

      // Refresh the list
      await loadPendingDuplicates();

    } catch (error: any) {
      console.error('Error merging articles:', error);
      toast({
        title: 'Merge Failed',
        description: error.message || 'Failed to merge articles',
        variant: 'destructive',
      });
    } finally {
      setProcessing(null);
    }
  };

  const ignoreDuplicate = async (duplicateId: string) => {
    try {
      setProcessing(duplicateId);

      const { error } = await supabase
        .from('article_duplicates_pending')
        .update({
          status: 'ignored'
        })
        .eq('id', duplicateId);

      if (error) throw error;

      toast({
        title: 'Duplicate Ignored',
        description: 'Articles marked as not duplicates',
      });

      await loadPendingDuplicates();

    } catch (error: any) {
      console.error('Error ignoring duplicate:', error);
      toast({
        title: 'Error',
        description: 'Failed to ignore duplicate',
        variant: 'destructive',
      });
    } finally {
      setProcessing(null);
    }
  };

  const getSimilarityColor = (score: number) => {
    if (score >= 0.9) return 'bg-red-500';
    if (score >= 0.8) return 'bg-orange-500';
    return 'bg-yellow-500';
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return 'No date';
    return new Date(dateString).toLocaleDateString();
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <AlertTriangle className="w-5 h-5" />
          Duplicate Detection
        </CardTitle>
        <CardDescription>
          Review and manage potential duplicate articles from different sources
        </CardDescription>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex items-center justify-center p-12">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
          </div>
        ) : duplicates.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <CheckCircle className="w-12 h-12 mx-auto mb-4 opacity-50" />
            <p>No duplicate articles detected</p>
            <p className="text-sm">The system automatically checks for similar content</p>
          </div>
        ) : (
          <div className="space-y-6">
            {duplicates.map((duplicate) => (
              <div key={duplicate.id} className="border rounded-lg p-4 space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Badge className={getSimilarityColor(duplicate.similarity_score)}>
                      {Math.round(duplicate.similarity_score * 100)}% Similar
                    </Badge>
                    <Badge variant="outline">
                      {duplicate.detection_method.replace('_', ' ')}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => mergeArticles(
                        duplicate.id,
                        duplicate.original_article_id,
                        duplicate.duplicate_article_id
                      )}
                      disabled={processing === duplicate.id}
                    >
                      <Merge className="w-3 h-3 mr-1" />
                      Merge Articles
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => ignoreDuplicate(duplicate.id)}
                      disabled={processing === duplicate.id}
                    >
                      <X className="w-3 h-3 mr-1" />
                      Not Duplicates
                    </Button>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Original Article */}
                  <div className="border rounded p-3 bg-green-50 dark:bg-green-950/20">
                    <div className="flex items-center gap-2 mb-2">
                      <Badge variant="secondary">Original</Badge>
                      <span className="text-xs text-muted-foreground">
                        {formatDate(duplicate.original_article.published_at)}
                      </span>
                    </div>
                    <h4 className="font-medium mb-2 line-clamp-2">
                      {duplicate.original_article.title}
                    </h4>
                    <div className="flex items-center justify-between text-sm text-muted-foreground">
                      <span>{duplicate.original_article.author || 'Unknown author'}</span>
                      <div className="flex items-center gap-2">
                        <span>{duplicate.original_article.word_count || 0} words</span>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-6 w-6 p-0"
                          onClick={() => window.open(duplicate.original_article.source_url, '_blank')}
                        >
                          <ExternalLink className="w-3 h-3" />
                        </Button>
                      </div>
                    </div>
                  </div>

                  {/* Duplicate Article */}
                  <div className="border rounded p-3 bg-orange-50 dark:bg-orange-950/20">
                    <div className="flex items-center gap-2 mb-2">
                      <Badge variant="outline">Duplicate</Badge>
                      <span className="text-xs text-muted-foreground">
                        {formatDate(duplicate.duplicate_article.published_at)}
                      </span>
                    </div>
                    <h4 className="font-medium mb-2 line-clamp-2">
                      {duplicate.duplicate_article.title}
                    </h4>
                    <div className="flex items-center justify-between text-sm text-muted-foreground">
                      <span>{duplicate.duplicate_article.author || 'Unknown author'}</span>
                      <div className="flex items-center gap-2">
                        <span>{duplicate.duplicate_article.word_count || 0} words</span>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-6 w-6 p-0"
                          onClick={() => window.open(duplicate.duplicate_article.source_url, '_blank')}
                        >
                          <ExternalLink className="w-3 h-3" />
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>

                {processing === duplicate.id && (
                  <div className="flex items-center justify-center p-4">
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary mr-2"></div>
                    <span className="text-sm text-muted-foreground">Processing...</span>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
};