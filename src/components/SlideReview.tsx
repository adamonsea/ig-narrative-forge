import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { 
  Eye, 
  ExternalLink, 
  Calendar,
  User,
  MapPin,
  FileText,
  Clock,
  CheckCircle2
} from 'lucide-react';

interface Article {
  id: string;
  title: string;
  author: string | null;
  source_url: string;
  region: string | null;
  published_at: string | null;
  word_count: number | null;
}

interface Slide {
  id: string;
  slide_number: number;
  content: string;
  visual_prompt: string | null;
  alt_text: string | null;
  word_count: number;
}

interface Story {
  id: string;
  title: string;
  status: string;
  created_at: string;
  article_id: string;
  articles: Article;
  slides: Slide[];
}

export const SlideReview = () => {
  const [stories, setStories] = useState<Story[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedStory, setExpandedStory] = useState<string | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    loadStories();
  }, []);

  const loadStories = async () => {
    try {
      setLoading(true);
      
      const { data, error } = await supabase
        .from('stories')
        .select(`
          *,
          articles (
            id,
            title,
            author,
            source_url,
            region,
            published_at,
            word_count
          ),
          slides (
            id,
            slide_number,
            content,
            visual_prompt,
            alt_text,
            word_count
          )
        `)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setStories((data as Story[]) || []);
    } catch (error: any) {
      console.error('Error loading stories:', error);
      toast({
        title: 'Error',
        description: 'Failed to load slide stories',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const getWordCountColor = (wordCount: number, slideNumber: number) => {
    const maxWords = slideNumber === 1 ? 15 : slideNumber <= 3 ? 25 : slideNumber <= 6 ? 35 : 40;
    if (wordCount <= maxWords) return 'text-green-600';
    if (wordCount <= maxWords + 5) return 'text-yellow-600';
    return 'text-red-600';
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'published':
        return <Badge className="bg-green-500">Published</Badge>;
      case 'draft':
        return <Badge variant="outline">Draft</Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center p-12">
          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5" />
            Generated Slide Stories
          </CardTitle>
          <CardDescription>
            Review and manage AI-generated slide carousels with source attribution
          </CardDescription>
        </CardHeader>
        <CardContent>
          {stories.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <FileText className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p>No slide stories generated yet</p>
              <p className="text-sm">Process articles from the validation queue to create slides</p>
            </div>
          ) : (
            <div className="space-y-4">
              {stories.map((story) => (
                <div key={story.id} className="border rounded-lg overflow-hidden">
                  <div className="p-4 bg-muted/50">
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <h3 className="font-medium">{story.title}</h3>
                          {getStatusBadge(story.status)}
                        </div>
                        
                        <div className="flex items-center gap-4 text-sm text-muted-foreground">
                          <div className="flex items-center gap-1">
                            <FileText className="w-3 h-3" />
                            <span>{story.slides?.length || 0} slides</span>
                          </div>
                          
                          <div className="flex items-center gap-1">
                            <Calendar className="w-3 h-3" />
                            <span>{new Date(story.created_at).toLocaleDateString()}</span>
                          </div>

                          {story.articles?.author && (
                            <div className="flex items-center gap-1">
                              <User className="w-3 h-3" />
                              <span>{story.articles.author}</span>
                            </div>
                          )}

                          {story.articles?.region && (
                            <div className="flex items-center gap-1">
                              <MapPin className="w-3 h-3" />
                              <span>{story.articles.region}</span>
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => window.open(story.articles?.source_url, '_blank')}
                        >
                          <ExternalLink className="w-3 h-3 mr-2" />
                          Source
                        </Button>
                        
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setExpandedStory(
                            expandedStory === story.id ? null : story.id
                          )}
                        >
                          <Eye className="w-3 h-3 mr-2" />
                          {expandedStory === story.id ? 'Hide' : 'View'} Slides
                        </Button>
                      </div>
                    </div>
                  </div>

                  {expandedStory === story.id && story.slides && (
                    <div className="p-4 space-y-3 border-t">
                      <h4 className="font-medium text-sm">Slide Content:</h4>
                      
                      {story.slides
                        .sort((a, b) => a.slide_number - b.slide_number)
                        .map((slide) => (
                          <div key={slide.id} className="p-3 bg-muted/30 rounded-lg">
                            <div className="flex items-center justify-between mb-2">
                              <span className="text-sm font-medium">
                                Slide {slide.slide_number}
                              </span>
                              <span className={`text-xs ${getWordCountColor(slide.word_count, slide.slide_number)}`}>
                                {slide.word_count} words
                              </span>
                            </div>
                            
                            <p className="text-sm mb-2">{slide.content}</p>
                            
                            {slide.visual_prompt && (
                              <div className="text-xs text-muted-foreground">
                                <strong>Visual:</strong> {slide.visual_prompt}
                              </div>
                            )}
                            
                            {slide.alt_text && (
                              <div className="text-xs text-muted-foreground">
                                <strong>Alt text:</strong> {slide.alt_text}
                              </div>
                            )}
                          </div>
                        ))}

                      <div className="pt-3 border-t">
                        <div className="text-xs text-muted-foreground">
                          <strong>Original Source:</strong> {story.articles?.title}
                          {story.articles?.published_at && (
                            <span> • Published {new Date(story.articles.published_at).toLocaleDateString()}</span>
                          )}
                          {story.articles?.word_count && (
                            <span> • {story.articles.word_count} words</span>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};