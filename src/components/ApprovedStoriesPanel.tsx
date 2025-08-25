import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useCarouselGeneration } from '@/hooks/useCarouselGeneration';
import { CarouselPreviewModal } from '@/components/CarouselPreviewModal';
import { 
  CheckCircle2, 
  X, 
  Eye,
  RotateCcw,
  ChevronDown,
  ChevronRight,
  Download,
  RefreshCw,
  AlertTriangle,
  FileText,
  Calendar,
  User,
  BookOpen
} from 'lucide-react';

interface Slide {
  id: string;
  slide_number: number;
  content: string;
  visual_prompt?: string | null;
  alt_text: string | null;
  word_count: number;
  story_id: string;
}

interface StoryArticle {
  id: string;
  title: string;
  author?: string;
  source_url: string;
  region?: string;
  published_at?: string | null;
  word_count?: number | null;
}

interface Story {
  id: string;
  title: string;
  status: string;
  article_id: string;
  created_at: string;
  slides: Slide[];
  article?: StoryArticle;
}

interface CarouselExport {
  id: string;
  story_id: string;
  status: string;
  file_paths: any;
  export_formats: any;
  error_message?: string;
  created_at: string;
  updated_at: string;
}

interface CarouselStatus {
  status: 'none' | 'generating' | 'completed' | 'failed';
  export?: CarouselExport;
}

export const ApprovedStoriesPanel = () => {
  const [approvedStories, setApprovedStories] = useState<Story[]>([]);
  const [loadingApproved, setLoadingApproved] = useState(true);
  const [expandedStories, setExpandedStories] = useState<Set<string>>(new Set());
  const [carouselStatuses, setCarouselStatuses] = useState<Record<string, CarouselStatus>>({});
  const [previewModal, setPreviewModal] = useState<{ story: Story; export: CarouselExport } | null>(null);
  
  const { toast } = useToast();
  const { generateCarouselImages, retryCarouselGeneration, isGenerating } = useCarouselGeneration();

  useEffect(() => {
    loadApprovedStories();
  }, []);

  const loadApprovedStories = async () => {
    setLoadingApproved(true);
    try {
      const { data: stories, error } = await supabase
        .from('stories')
        .select(`
          *,
          slides:slides(*),
          article:articles!stories_article_id_fkey(
            id,
            title,
            author,
            source_url,
            region,
            published_at,
            word_count
          )
        `)
        .eq('status', 'approved')
        .order('created_at', { ascending: false });

      if (error) throw error;
      
      const storiesWithSlides = (stories || []).filter(story => 
        story.slides && story.slides.length > 0
      );
      
      setApprovedStories(storiesWithSlides);

      // Load carousel statuses for all approved stories
      if (storiesWithSlides.length > 0) {
        await loadCarouselStatuses(storiesWithSlides.map(s => s.id));
      }
    } catch (error) {
      console.error('Error loading approved stories:', error);
      toast({
        title: "Error",
        description: "Failed to load approved stories",
        variant: "destructive",
      });
    } finally {
      setLoadingApproved(false);
    }
  };

  const loadCarouselStatuses = async (storyIds: string[]) => {
    try {
      const { data: exports, error } = await supabase
        .from('carousel_exports')
        .select('*')
        .in('story_id', storyIds);

      if (error) throw error;

      const statusMap: Record<string, CarouselStatus> = {};
      
      storyIds.forEach(storyId => {
        const exportRecord = exports?.find(exp => exp.story_id === storyId);
        if (exportRecord) {
          statusMap[storyId] = {
            status: exportRecord.status as 'generating' | 'completed' | 'failed',
            export: exportRecord
          };
        } else {
          statusMap[storyId] = { status: 'none' };
        }
      });

      setCarouselStatuses(statusMap);
    } catch (error) {
      console.error('Error loading carousel statuses:', error);
    }
  };

  const handleGenerateCarousel = async (story: Story) => {
    const success = await generateCarouselImages(story);
    if (success) {
      // Refresh carousel statuses
      await loadCarouselStatuses([story.id]);
    }
  };

  const handleRetryGeneration = async (story: Story) => {
    const success = await retryCarouselGeneration(story.id, story);
    if (success) {
      await loadCarouselStatuses([story.id]);
    }
  };

  const handleReturnToReview = async (storyId: string) => {
    try {
      const { error } = await supabase
        .from('stories')
        .update({ status: 'draft' })
        .eq('id', storyId);

      if (error) throw error;

      toast({
        title: 'Story Returned to Review',
        description: 'Story status changed to draft for re-review',
      });

      loadApprovedStories();
    } catch (error) {
      console.error('Failed to return story:', error);
      toast({
        title: 'Error',
        description: 'Failed to return story to review',
        variant: 'destructive',
      });
    }
  };

  const toggleStoryExpanded = (storyId: string) => {
    const newExpanded = new Set(expandedStories);
    if (newExpanded.has(storyId)) {
      newExpanded.delete(storyId);
    } else {
      newExpanded.add(storyId);
    }
    setExpandedStories(newExpanded);
  };

  const getWordCountColor = (wordCount: number, slideNumber: number) => {
    const maxWords = slideNumber === 1 ? 15 : slideNumber <= 3 ? 25 : slideNumber <= 6 ? 35 : 40;
    if (wordCount <= maxWords) return 'text-green-600';
    if (wordCount <= maxWords + 5) return 'text-yellow-600';
    return 'text-red-600';
  };

  const getWordCountBadge = (wordCount: number) => {
    if (wordCount <= 15) return <Badge variant="default" className="text-xs">Hook</Badge>;
    if (wordCount <= 30) return <Badge variant="secondary" className="text-xs">Body</Badge>;
    return <Badge variant="outline" className="text-xs">Long</Badge>;
  };

  const renderCarouselActions = (story: Story) => {
    const status = carouselStatuses[story.id];
    const generating = isGenerating(story.id);

    if (generating) {
      return (
        <Badge variant="secondary" className="bg-blue-100 text-blue-800">
          <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse mr-1" />
          Generating...
        </Badge>
      );
    }

    switch (status?.status) {
      case 'completed':
        return (
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => setPreviewModal({ story, export: status.export! })}
              className="flex items-center gap-1"
            >
              <Eye className="w-3 h-3" />
              Preview
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setPreviewModal({ story, export: status.export! })}
              className="flex items-center gap-1"
            >
              <Download className="w-3 h-3" />
              Download
            </Button>
          </div>
        );
      case 'failed':
        return (
          <div className="flex gap-2">
            <Badge variant="destructive" className="text-xs">
              <AlertTriangle className="w-3 h-3 mr-1" />
              Failed
            </Badge>
            <Button
              size="sm"
              variant="outline"
              onClick={() => handleRetryGeneration(story)}
              className="flex items-center gap-1"
            >
              <RefreshCw className="w-3 h-3" />
              Retry
            </Button>
          </div>
        );
      case 'generating':
        return (
          <Badge variant="secondary" className="bg-yellow-100 text-yellow-800">
            <div className="w-2 h-2 bg-yellow-500 rounded-full animate-pulse mr-1" />
            Processing...
          </Badge>
        );
      default:
        return (
          <Button
            size="sm"
            variant="default"
            onClick={() => handleGenerateCarousel(story)}
            className="flex items-center gap-1"
          >
            <FileText className="w-3 h-3" />
            Generate Images
          </Button>
        );
    }
  };

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5 text-green-600" />
            Approved Queue ({approvedStories.length})
          </CardTitle>
          <CardDescription>
            Approved stories ready for carousel generation and publishing
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loadingApproved ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            </div>
          ) : approvedStories.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <CheckCircle2 className="w-12 h-12 mx-auto mb-2 opacity-50" />
              <p>No approved stories ready for publishing</p>
            </div>
          ) : (
            <div className="space-y-4">
              {approvedStories.map((story) => {
                const isExpanded = expandedStories.has(story.id);
                return (
                  <Card key={story.id} className="border-green-200 bg-green-50">
                    <CardContent className="p-4">
                      <div className="flex justify-between items-start mb-3">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-2">
                            <Badge className="bg-green-500 text-white">Approved</Badge>
                            <Badge variant="outline" className="text-xs">
                              {story.slides.length} slides
                            </Badge>
                          </div>
                          <h3 className="font-medium text-sm mb-1 line-clamp-2">{story.title}</h3>
                          <div className="flex items-center gap-2 text-xs text-muted-foreground mb-2">
                            <User className="w-3 h-3" />
                            <span>{story.article?.author || 'Unknown Author'}</span>
                            <span>•</span>
                            <Calendar className="w-3 h-3" />
                            <span>{new Date(story.created_at).toLocaleDateString()}</span>
                            {story.article?.region && (
                              <>
                                <span>•</span>
                                <Badge variant="outline" className="text-xs">{story.article.region}</Badge>
                              </>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-2 ml-4">
                          {renderCarouselActions(story)}
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => toggleStoryExpanded(story.id)}
                            className="ml-2"
                          >
                            {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                          </Button>
                        </div>
                      </div>
                      
                      {isExpanded && (
                        <div className="mt-4 space-y-3 border-t pt-3">
                          <div className="grid gap-2">
                            {story.slides.map((slide) => (
                              <div key={slide.id} className="p-3 bg-white rounded border">
                                <div className="flex items-center justify-between mb-2">
                                  <div className="flex items-center gap-2">
                                    <Badge variant="outline" className="text-xs">
                                      Slide {slide.slide_number}
                                    </Badge>
                                    {getWordCountBadge(slide.word_count)}
                                    <span className={`text-xs font-medium ${getWordCountColor(slide.word_count, slide.slide_number)}`}>
                                      {slide.word_count} words
                                    </span>
                                  </div>
                                </div>
                                <p className="text-sm text-gray-700 line-clamp-3">{slide.content}</p>
                              </div>
                            ))}
                          </div>
                          
                          <div className="flex gap-2 pt-2 border-t">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleReturnToReview(story.id)}
                              className="flex items-center gap-1"
                            >
                              <RotateCcw className="w-3 h-3" />
                              Return to Review
                            </Button>
                          </div>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {previewModal && (
        <CarouselPreviewModal
          isOpen={true}
          onClose={() => setPreviewModal(null)}
          storyTitle={previewModal.story.title}
          carouselExport={previewModal.export}
        />
      )}
    </>
  );
};