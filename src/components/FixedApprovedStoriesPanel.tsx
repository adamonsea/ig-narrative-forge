import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useCarouselGeneration } from '@/hooks/useCarouselGeneration';
import { InlineCarouselImages } from '@/components/InlineCarouselImages';
import { 
  CheckCircle2, 
  Clock, 
  ExternalLink,
  Sparkles,
  Eye,
  ChevronDown,
  ChevronRight,
  Image as ImageIcon,
  RefreshCw,
  Download,
  Package,
  RotateCcw,
  XCircle,
  Archive
} from 'lucide-react';

import { StyleTooltip } from '@/components/ui/style-tooltip';

// Types
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

interface CarouselExport {
  id: string;
  story_id: string;
  status: string;
  export_formats: any;
  file_paths: any;
  zip_url?: string | null;
  error_message?: string | null;
  created_at: string;
  updated_at: string;
}

interface CarouselStatus {
  status: 'none' | 'generating' | 'completed' | 'failed';
  export?: CarouselExport;
}

interface Story {
  id: string;
  title: string;
  status: string;
  article_id: string;
  author?: string;
  publication_name?: string;
  created_at: string;
  slides: Slide[];
  article?: StoryArticle;
  content_generation_queue?: any;
}

export const FixedApprovedStoriesPanel = () => {
  const [approvedStories, setApprovedStories] = useState<Story[]>([]);
  const [loadingApproved, setLoadingApproved] = useState(true);
  const [expandedStories, setExpandedStories] = useState<Set<string>>(new Set());
  const [carouselStatuses, setCarouselStatuses] = useState<Record<string, CarouselStatus>>({});

  const { toast } = useToast();
  const { generateCarouselImages, retryCarouselGeneration, isGenerating } = useCarouselGeneration();

  useEffect(() => {
    loadApprovedStories();

    // Set up real-time subscription for stories changes
    const channel = supabase
      .channel('approved-stories-panel')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'stories'
        },
        (payload) => {
          console.log('🔄 Story status change detected:', payload);
          const oldRecord = payload.old as any;
          const newRecord = payload.new as any;
          
          // Refresh if a story moves to/from ready status
          if (oldRecord?.status !== newRecord?.status && 
              (oldRecord?.status === 'ready' || newRecord?.status === 'ready')) {
            loadApprovedStories();
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const loadApprovedStories = async () => {
    setLoadingApproved(true);
    try {
      console.log('🔍 Loading approved stories...');
      const { data: stories, error } = await supabase
        .from('stories')
        .select(`
          *,
          slides!inner(*),
          articles!inner(
            id,
            title,
            author,
            source_url,
            region,
            published_at,
            word_count
          )
        `)
        .eq('status', 'ready')
        .order('created_at', { ascending: false });

      if (error) throw error;
      
      console.log('📊 Raw stories data:', stories);
      
      const storiesWithSlides = (stories || []).filter(story => 
        story.slides && story.slides.length > 0
      );
      
      // Map the data to include article info directly in story
      const enrichedStories = storiesWithSlides.map(story => ({
        ...story,
        article: story.articles,
        author: story.articles?.author,
        publication_name: story.articles?.title
      }));
      
      console.log('✅ Stories with slides:', enrichedStories.length, enrichedStories);
      setApprovedStories(enrichedStories);

      // Load carousel statuses for all approved stories
      if (enrichedStories.length > 0) {
        console.log('🎠 Loading carousel statuses for stories:', enrichedStories.map(s => s.id));
        await loadCarouselStatuses(enrichedStories.map(s => s.id));
      } else {
        console.log('❌ No stories with slides found');
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
      console.log('🎠 Fetching carousel exports for story IDs:', storyIds);
      const { data: exports, error } = await supabase
        .from('carousel_exports')
        .select('*')
        .in('story_id', storyIds);

      if (error) throw error;

      console.log('📦 Carousel exports data:', exports);

      const statusMap: Record<string, CarouselStatus> = {};
      
      storyIds.forEach(storyId => {
        const exportRecord = exports?.find(exp => exp.story_id === storyId);
        if (exportRecord) {
          console.log(`✅ Found export for story ${storyId}:`, exportRecord);
          statusMap[storyId] = {
            status: exportRecord.status as 'generating' | 'completed' | 'failed',
            export: exportRecord
          };
        } else {
          console.log(`❌ No export found for story ${storyId}, setting status to 'none'`);
          statusMap[storyId] = { status: 'none' };
        }
      });

      console.log('🎯 Final status map:', statusMap);
      setCarouselStatuses(statusMap);
    } catch (error) {
      console.error('Error loading carousel statuses:', error);
    }
  };

  const handleGenerateCarousel = async (story: Story) => {
    console.log('🚀 Generating carousel for story:', story.id, story.title);
    
    // Update local state immediately for UI feedback
    setCarouselStatuses(prev => ({
      ...prev,
      [story.id]: { status: 'generating' }
    }));

    try {
      const success = await generateCarouselImages(story, 'News');
      console.log('✅ Carousel generation result:', success);
      if (success) {
        // Refresh carousel statuses
        console.log('🔄 Refreshing carousel statuses...');
        await loadCarouselStatuses([story.id]);
      }
    } catch (error) {
      console.error('❌ Error in handleGenerateCarousel:', error);
      // Reset status on error
      setCarouselStatuses(prev => ({
        ...prev,
        [story.id]: { status: 'none' }
      }));
      toast({
        title: "Error",
        description: "Failed to generate carousel images",
        variant: "destructive",
      });
    }
  };

  const handleRetryGeneration = async (storyId: string, story: Story) => {
    console.log('🔄 Retrying generation for story:', storyId);
    
    setCarouselStatuses(prev => ({
      ...prev,
      [storyId]: { status: 'generating' }
    }));

    try {
      const success = await retryCarouselGeneration(storyId, story);
      if (success) {
        await loadCarouselStatuses([storyId]);
      }
    } catch (error) {
      console.error('❌ Error in retry generation:', error);
      setCarouselStatuses(prev => ({
        ...prev,
        [storyId]: { status: 'failed' }
      }));
    }
  };

  const handleReturnToReview = async (storyId: string) => {
    try {
      const { error } = await supabase
        .from('stories')
        .update({ 
          status: 'draft',
          updated_at: new Date().toISOString()
        })
        .eq('id', storyId);

      if (error) throw error;

      toast({
        title: "Story Returned",
        description: "Story returned to review queue",
      });

      await loadApprovedStories();
    } catch (error: any) {
      console.error('Error returning story to review:', error);
      toast({
        title: "Return Failed",
        description: error.message,
        variant: "destructive"
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

  const getWordCountColor = (wordCount: number) => {
    if (wordCount < 50) return 'text-red-600';
    if (wordCount < 100) return 'text-yellow-600';
    return 'text-green-600';
  };

  const getWordCountBadge = (wordCount: number) => {
    const colorClass = getWordCountColor(wordCount);
    return (
      <Badge variant="outline" className={`text-xs ${colorClass}`}>
        {wordCount} words
      </Badge>
    );
  };

  const renderCarouselActions = (story: Story) => {
    const status = carouselStatuses[story.id];
    const generating = isGenerating(story.id);

    console.log(`🎬 Rendering carousel actions for story ${story.id}:`, {
      status: status?.status,
      generating,
      hasExport: !!status?.export,
      fullStatus: status
    });

    if (generating) {
      return (
        <div className="flex items-center gap-2">
          <Badge variant="secondary" className="animate-pulse bg-blue-100 text-blue-800">
            <RefreshCw className="h-3 w-3 mr-1 animate-spin" />
            Generating Images...
          </Badge>
          <Button size="sm" variant="outline" disabled>
            <Clock className="h-4 w-4 mr-2" />
            Please Wait
          </Button>
        </div>
      );
    }

    switch (status?.status) {
      case 'completed':
        return (
          <div className="flex items-center gap-2">
            <Badge variant="default" className="bg-green-100 text-green-800">
              <Package className="h-3 w-3 mr-1" />
              Images Ready
            </Badge>
            <Button
              onClick={() => toggleStoryExpanded(story.id)}
              size="sm"
              variant="outline"
              className="text-blue-600 border-blue-200 hover:bg-blue-50"
            >
              <Eye className="h-4 w-4 mr-1" />
              View Images
            </Button>
          </div>
        );

      case 'failed':
        return (
          <div className="flex items-center gap-2">
            <Badge variant="destructive" className="bg-red-100 text-red-800">
              <XCircle className="h-3 w-3 mr-1" />
              Generation Failed
            </Badge>
            <Button
              onClick={() => handleRetryGeneration(story.id, story)}
              size="sm"
              variant="outline"
              className="text-orange-600 border-orange-200 hover:bg-orange-50"
            >
              <RefreshCw className="h-4 w-4 mr-1" />
              Retry Generation
            </Button>
          </div>
        );

      case 'generating':
        return (
          <div className="flex items-center gap-2">
            <Badge variant="secondary" className="animate-pulse bg-blue-100 text-blue-800">
              <RefreshCw className="h-3 w-3 mr-1 animate-spin" />
              Processing...
            </Badge>
          </div>
        );

      default:
        return (
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="bg-blue-50 text-blue-700">
              <ImageIcon className="h-3 w-3 mr-1" />
              Auto-Generated Images
            </Badge>
            <Button
              onClick={() => handleGenerateCarousel(story)}
              size="sm"
              variant="outline"
              className="text-orange-600 border-orange-200 hover:bg-orange-50"
            >
              <RefreshCw className="h-4 w-4 mr-1" />
              Retry Generation
            </Button>
          </div>
        );
    }
  };

  if (loadingApproved) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5" />
            Approved Queue
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5" />
              Approved Queue
            </CardTitle>
            <CardDescription>
              Stories ready for publishing with auto-generated carousels
            </CardDescription>
          </div>
          <Button 
            onClick={loadApprovedStories}
            variant="outline" 
            size="sm"
          >
            <RefreshCw className="w-4 h-4 mr-2" />
            Refresh
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {approvedStories.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <CheckCircle2 className="w-12 h-12 mx-auto mb-2 opacity-50" />
            <p>No approved stories found</p>
          </div>
        ) : (
          <div className="space-y-4">
            {approvedStories.map((story) => {
              const isExpanded = expandedStories.has(story.id);
              const article = story.article;

              return (
                <Card key={story.id} className="overflow-hidden">
                  <CardContent className="p-4">
                    <div className="flex justify-between items-start mb-3">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => toggleStoryExpanded(story.id)}
                            className="p-0 h-auto"
                          >
                            {isExpanded ? (
                              <ChevronDown className="h-4 w-4" />
                            ) : (
                              <ChevronRight className="h-4 w-4" />
                            )}
                          </Button>
                          <Badge variant="outline" className="bg-green-50 text-green-700">Ready</Badge>
                          <Badge variant="outline" className="text-xs">
                            {story.slides.length} slides
                          </Badge>
                        </div>
                        <h3 className="font-medium text-sm mb-1 line-clamp-2">{story.title}</h3>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground mb-2">
                          <span>{story.author || article?.author || 'Unknown Author'}</span>
                          <span>•</span>
                          <span>{new Date(story.created_at).toLocaleDateString()}</span>
                          {article?.region && (
                            <>
                              <span>•</span>
                              <Badge variant="outline" className="text-xs">{article.region}</Badge>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                    
                    {/* Carousel Actions */}
                    <div className="mb-3">
                      {renderCarouselActions(story)}
                    </div>

                    {/* Action buttons */}
                    <div className="flex justify-between items-center">
                      <div className="flex gap-2">
                        <Button
                          onClick={() => handleReturnToReview(story.id)}
                          size="sm"
                          variant="outline"
                          className="text-xs"
                        >
                          <RotateCcw className="w-3 h-3 mr-1" />
                          Return to Review
                        </Button>
                      </div>
                      {article?.source_url && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => window.open(article.source_url, '_blank')}
                        >
                          <ExternalLink className="w-3 h-3 mr-1" />
                          View Original
                        </Button>
                      )}
                    </div>

                    {/* Expanded content */}
                    {isExpanded && (
                      <div className="mt-4 pt-4 border-t space-y-3">
                        <h4 className="font-medium text-sm text-muted-foreground">Slides</h4>
                        {story.slides.map((slide) => (
                          <div key={slide.id} className="border rounded-lg p-3 space-y-2">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <Badge variant="outline">Slide {slide.slide_number}</Badge>
                                {getWordCountBadge(slide.word_count)}
                              </div>
                            </div>
                            <p className="text-sm">{slide.content}</p>
                          </div>
                        ))}

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
  );
};