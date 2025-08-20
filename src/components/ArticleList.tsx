import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/components/ui/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { 
  ExternalLink, 
  Calendar, 
  User, 
  Clock, 
  BookOpen, 
  Tag,
  Edit,
  Eye,
  MoreHorizontal,
  XCircle,
  Archive
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

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
  canonical_url?: string | null;
  region: string | null;
  summary: string | null;
  body: string | null;
  created_at: string;
  source_name?: string;
  source_domain?: string;
}

interface ArticleListProps {
  articles: Article[];
  loading: boolean;
  onRefresh: () => void;
}

export const ArticleList = ({ articles, loading, onRefresh }: ArticleListProps) => {
  const { toast } = useToast();
  const [selectedArticle, setSelectedArticle] = useState<Article | null>(null);
  const [editingArticle, setEditingArticle] = useState<Article | null>(null);
  const [updatedData, setUpdatedData] = useState<any>({});

  const handleDiscardArticle = async (articleId: string) => {
    try {
      const { error } = await supabase
        .from('articles')
        .update({ processing_status: 'discarded' })
        .eq('id', articleId);

      if (error) throw error;

      toast({
        title: 'Success',
        description: 'Article discarded',
      });

      onRefresh();
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to discard article',
        variant: 'destructive',
      });
    }
  };

  const handleArchiveArticle = async (articleId: string) => {
    try {
      const { error } = await supabase
        .from('articles')
        .update({ processing_status: 'archived' })
        .eq('id', articleId);

      if (error) throw error;

      toast({
        title: 'Success',
        description: 'Article archived',
      });

      onRefresh();
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to archive article',
        variant: 'destructive',
      });
    }
  };

  const handleUpdateArticle = async () => {
    if (!editingArticle) return;

    try {
      const { error } = await supabase
        .from('articles')
        .update({
          ...updatedData,
          tags: typeof updatedData.tags === 'string' 
            ? updatedData.tags.split(',').map((t: string) => t.trim()).filter(Boolean)
            : updatedData.tags
        })
        .eq('id', editingArticle.id);

      if (error) throw error;

      toast({
        title: 'Success',
        description: 'Article updated successfully',
      });

      setEditingArticle(null);
      setUpdatedData({});
      onRefresh();
    } catch (error: any) {
      console.error('Error updating article:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to update article',
        variant: 'destructive',
      });
    }
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return 'Unknown';
    return new Date(dateString).toLocaleDateString();
  };

  if (loading) {
    return (
      <div className="space-y-4">
        {[...Array(3)].map((_, i) => (
          <Card key={i} className="animate-pulse">
            <CardContent className="p-6">
              <div className="space-y-3">
                <div className="h-6 bg-muted rounded w-3/4"></div>
                <div className="h-4 bg-muted rounded w-1/2"></div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  if (articles.length === 0) {
    return (
      <Card>
        <CardContent className="p-12 text-center">
          <BookOpen className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
          <p className="text-muted-foreground">
            No articles found. Try importing some content.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {articles.map((article) => (
        <Card key={article.id} className="hover:shadow-md transition-shadow">
          <CardContent className="p-6">
            <div className="space-y-3">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <h3 className="text-lg font-semibold mb-2">{article.title}</h3>
                  <div className="flex items-center gap-4 text-sm text-muted-foreground mb-3">
                    {article.source_name && (
                      <Badge variant="outline" className="text-xs">
                        {article.source_name}
                      </Badge>
                    )}
                    {article.author && (
                      <span className="flex items-center gap-1">
                        <User className="w-4 h-4" />
                        {article.author}
                      </span>
                    )}
                    <span className="flex items-center gap-1">
                      <Calendar className="w-4 h-4" />
                      {formatDate(article.published_at)}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      const url = article.source_url || article.canonical_url;
                      if (url) {
                        // Clean URL by removing HTML entities and any CDATA remnants
                        const cleanUrl = url
                          .replace(/&amp;/g, '&')
                          .replace(/&lt;/g, '<')
                          .replace(/&gt;/g, '>')
                          .replace(/\]\]>/g, '')  // Remove CDATA closing
                          .replace(/<!\[CDATA\[/g, '') // Remove CDATA opening
                          .trim();
                          
                        console.log('Article ID:', article.id);
                        console.log('Raw URL:', url);
                        console.log('Clean URL:', cleanUrl);
                        
                        try {
                          // Test if URL is valid
                          new URL(cleanUrl);
                          
                          // Create link element for better compatibility
                          const link = document.createElement('a');
                          link.href = cleanUrl;
                          link.target = '_blank';
                          link.rel = 'noopener noreferrer';
                          document.body.appendChild(link);
                          link.click();
                          document.body.removeChild(link);
                          
                          toast({
                            title: "Opening article",
                            description: `Opening: ${new URL(cleanUrl).hostname}`,
                          });
                        } catch (error) {
                          console.error('Invalid URL:', cleanUrl, error);
                          toast({
                            title: "Invalid URL",
                            description: `Cannot open: ${cleanUrl}`,
                            variant: "destructive"
                          });
                        }
                      } else {
                        console.error('No valid URL found for article:', article.id);
                        toast({
                          title: "Error",
                          description: "No valid URL found for this article",
                          variant: "destructive"
                        });
                      }
                    }}
                    disabled={!article.source_url && !article.canonical_url}
                  >
                    <ExternalLink className="w-4 h-4 mr-2" />
                    View Original
                  </Button>
                  
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="outline" size="sm">
                        <MoreHorizontal className="w-4 h-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem 
                        onClick={() => handleDiscardArticle(article.id)}
                        className="text-orange-600"
                      >
                        <XCircle className="w-4 h-4 mr-2" />
                        Discard
                      </DropdownMenuItem>
                      <DropdownMenuItem 
                        onClick={() => handleArchiveArticle(article.id)}
                        className="text-blue-600"
                      >
                        <Archive className="w-4 h-4 mr-2" />
                        Archive
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                {article.region && (
                  <Badge variant="secondary">{article.region}</Badge>
                )}
                {article.category && (
                  <Badge variant="outline">{article.category}</Badge>
                )}
                {article.tags?.slice(0, 3).map(tag => (
                  <Badge key={tag} variant="secondary" className="text-xs">
                    {tag}
                  </Badge>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
};