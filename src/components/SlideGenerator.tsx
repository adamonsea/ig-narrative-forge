import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Progress } from '@/components/ui/progress';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { Sparkles, Image as ImageIcon, Clock, CheckCircle, AlertCircle, Eye, Download } from 'lucide-react';

interface Article {
  id: string;
  title: string;
  author?: string;
  region?: string;
  category?: string;
  word_count?: number;
  reading_time_minutes?: number;
  summary?: string;
}

interface Slide {
  id: string;
  slide_number: number;
  content: string;
  word_count: number;
  alt_text?: string;
}

interface Story {
  id: string;
  article_id: string;
  title: string;
  status: 'draft' | 'generating' | 'ready' | 'published';
  slide_count: number;
  total_word_count: number;
  created_at: string;
  updated_at: string;
  generated_at?: string;
  slides?: Slide[];
}

interface SlideGeneratorProps {
  articles: Article[];
  onRefresh?: () => void;
}

export const SlideGenerator = ({ articles, onRefresh }: SlideGeneratorProps) => {
  const [selectedArticle, setSelectedArticle] = useState<Article | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationProgress, setGenerationProgress] = useState(0);
  const [currentStory, setCurrentStory] = useState<Story | null>(null);
  const [stories, setStories] = useState<Story[]>([]);
  const [isLoadingStories, setIsLoadingStories] = useState(false);
  const { toast } = useToast();

  const loadStories = async () => {
    setIsLoadingStories(true);
    try {
      const { data, error } = await supabase
        .from('stories')
        .select(`
          *,
          slides (
            id, slide_number, content, word_count, alt_text
          )
        `)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setStories((data as Story[]) || []);
    } catch (error: any) {
      toast({
        title: "Error Loading Stories",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setIsLoadingStories(false);
    }
  };

  const generateSlides = async (article: Article) => {
    setIsGenerating(true);
    setGenerationProgress(0);
    setCurrentStory(null);

    try {
      setGenerationProgress(25);
      
      const { data, error } = await supabase.functions.invoke('content-generator', {
        body: { articleId: article.id }
      });

      if (error) throw error;

      if (!data.success) {
        throw new Error(data.error || 'Content generation failed');
      }

      setGenerationProgress(75);
      setCurrentStory({
        id: data.storyId,
        article_id: article.id,
        title: article.title,
        status: 'ready',
        slide_count: data.slideCount,
        total_word_count: 0,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        slides: data.slides
      });

      setGenerationProgress(100);
      
      toast({
        title: "Slides Generated!",
        description: `Created ${data.slideCount} slides for "${article.title}"`,
      });

      // Refresh stories list
      await loadStories();
      onRefresh?.();

    } catch (error: any) {
      console.error('Generation error:', error);
      toast({
        title: "Generation Failed",
        description: error.message || "Failed to generate slides",
        variant: "destructive",
      });
    } finally {
      setIsGenerating(false);
      setSelectedArticle(null);
    }
  };

  const generateVisual = async (slide: Slide) => {
    try {
      const { data, error } = await supabase.functions.invoke('image-generator', {
        body: {
          slideId: slide.id,
          prompt: `Editorial illustration for: ${slide.content}`,
          stylePreset: 'editorial'
        }
      });

      if (error) throw error;

      if (data.success) {
        toast({
          title: "Visual Generated",
          description: "AI image created for slide",
        });
        await loadStories(); // Refresh to show new visual
      } else {
        throw new Error(data.error);
      }
    } catch (error: any) {
      toast({
        title: "Visual Generation Failed",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'ready':
        return <CheckCircle className="w-4 h-4 text-green-500" />;
      case 'generating':
        return <Clock className="w-4 h-4 text-blue-500" />;
      case 'published':
        return <Badge variant="outline" className="text-purple-700">Published</Badge>;
      default:
        return <AlertCircle className="w-4 h-4 text-gray-400" />;
    }
  };

  const getWordCountColor = (wordCount: number, slideNumber: number) => {
    const maxWords = slideNumber === 1 ? 15 : slideNumber <= 3 ? 25 : slideNumber <= 6 ? 35 : 40;
    if (wordCount <= maxWords) return 'text-green-600';
    if (wordCount <= maxWords + 5) return 'text-yellow-600';
    return 'text-red-600';
  };

  return (
    <div className="space-y-6">
      {/* Article Selection */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="w-5 h-5" />
            AI Slide Generator
          </CardTitle>
          <CardDescription>
            Transform news articles into engaging social media carousel slides
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!selectedArticle ? (
            <div className="space-y-4">
              <h4 className="font-medium">Select an article to transform:</h4>
              <div className="grid gap-3">
                {articles.slice(0, 5).map((article) => (
                  <div
                    key={article.id}
                    className="p-4 border rounded-lg cursor-pointer hover:bg-muted/50 transition-colors"
                    onClick={() => setSelectedArticle(article)}
                  >
                    <div className="flex justify-between items-start">
                      <div className="space-y-1 flex-1">
                        <h5 className="font-medium line-clamp-2">{article.title}</h5>
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          {article.author && <span>{article.author}</span>}
                          {article.region && (
                            <>
                              <span>•</span>
                              <Badge variant="outline" className="text-xs">{article.region}</Badge>
                            </>
                          )}
                          {article.word_count && (
                            <>
                              <span>•</span>
                              <span>{article.word_count} words</span>
                            </>
                          )}
                        </div>
                      </div>
                      <Button size="sm" variant="outline">
                        Generate Slides
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="font-medium">{selectedArticle.title}</h4>
                  <p className="text-sm text-muted-foreground">
                    {selectedArticle.author} • {selectedArticle.word_count} words
                  </p>
                </div>
                <Button
                  variant="outline"
                  onClick={() => setSelectedArticle(null)}
                  disabled={isGenerating}
                >
                  Cancel
                </Button>
              </div>
              
              {isGenerating && (
                <div className="space-y-2">
                  <Progress value={generationProgress} className="w-full" />
                  <p className="text-sm text-muted-foreground text-center">
                    Generating AI-powered slides... {generationProgress}%
                  </p>
                </div>
              )}
              
              <Button
                onClick={() => generateSlides(selectedArticle)}
                disabled={isGenerating}
                className="w-full"
              >
                {isGenerating ? "Generating..." : "Transform to Slides"}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Current Story Preview */}
      {currentStory && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Eye className="w-5 h-5" />
              Generated Slides Preview
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="font-medium">{currentStory.title}</h4>
                <p className="text-sm text-muted-foreground">
                  {currentStory.slide_count} slides • {currentStory.total_word_count} total words
                </p>
              </div>
              {getStatusIcon(currentStory.status)}
            </div>
            
            {currentStory.slides && (
              <div className="grid gap-3">
                {currentStory.slides.map((slide, index) => (
                  <div key={slide.id} className="p-3 border rounded-lg">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium">Slide {slide.slide_number}</span>
                      <div className="flex items-center gap-2">
                        <span className={`text-xs ${getWordCountColor(slide.word_count, slide.slide_number)}`}>
                          {slide.word_count} words
                        </span>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => generateVisual(slide)}
                        >
                          <ImageIcon className="w-3 h-3 mr-1" />
                          Generate Visual
                        </Button>
                      </div>
                    </div>
                    <p className="text-sm">{slide.content}</p>
                    {slide.alt_text && (
                      <p className="text-xs text-muted-foreground mt-1">
                        Alt text: {slide.alt_text}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Stories List */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Generated Stories</CardTitle>
            <Button onClick={loadStories} variant="outline" size="sm">
              Refresh
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {isLoadingStories ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
            </div>
          ) : stories.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No stories generated yet. Create your first slide carousel above!
            </div>
          ) : (
            <div className="space-y-3">
              {stories.map((story) => (
                <div key={story.id} className="p-4 border rounded-lg">
                  <div className="flex items-center justify-between">
                    <div className="space-y-1">
                      <h5 className="font-medium line-clamp-1">{story.title}</h5>
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <span>{story.slide_count} slides</span>
                        <span>•</span>
                        <span>{new Date(story.created_at).toLocaleDateString()}</span>
                        <span>•</span>
                        {getStatusIcon(story.status)}
                      </div>
                    </div>
                    <Button size="sm" variant="outline">
                      <Eye className="w-3 h-3 mr-1" />
                      View
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};