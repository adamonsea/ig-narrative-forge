import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { CarouselImageGenerator } from '@/components/CarouselImageGenerator';
import { CarouselPreviewModal } from '@/components/CarouselPreviewModal';
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
  Archive
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

interface Visual {
  id: string;
  slide_id: string;
  image_url?: string;
  alt_text?: string;
  style_preset?: string;
  created_at: string;
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

interface Post {
  id: string;
  caption?: string;
  hashtags?: any;
  source_attribution?: string;
  story_id: string;
  status: string;
  published_at?: string | null;
  scheduled_at?: string | null;
}

interface CarouselExport {
  id: string;
  story_id: string;
  status: string;
  export_formats: any;
  file_paths: any; // This is JSON from Supabase, we'll parse it
  zip_url?: string | null;
  error_message?: string | null;
  created_at: string;
  updated_at: string;
}

interface Story {
  id: string;
  title: string;
  status: string;
  article_id: string;
  created_at: string;
  slides: Slide[];
  article?: StoryArticle;
  posts?: Post[];
  visuals?: Visual[];
  carousel_exports?: CarouselExport[];
}

export const ApprovedQueue = () => {
  const [stories, setStories] = useState<Story[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedStories, setExpandedStories] = useState<Set<string>>(new Set());
  const [generatingVisual, setGeneratingVisual] = useState<string | null>(null);
  const [publishing, setPublishing] = useState<string | null>(null);
  const [generatingCarousel, setGeneratingCarousel] = useState<string | null>(null);
  const [previewModalOpen, setPreviewModalOpen] = useState(false);
  const [selectedCarouselExport, setSelectedCarouselExport] = useState<CarouselExport | null>(null);
  const [selectedStoryTitle, setSelectedStoryTitle] = useState('');
  const { toast } = useToast();

  useEffect(() => {
    loadApprovedStories();
  }, []);

  const loadApprovedStories = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('stories')
        .select(`
          *,
          slides!inner(*),
          articles!inner(*),
          posts(*),
          visuals:slides(
            visuals(*)
          ),
          carousel_exports(*)
        `)
        .eq('status', 'ready')
        .order('created_at', { ascending: false });

      if (error) throw error;

      // Flatten visuals from nested structure
      const storiesWithVisuals = data.map(story => ({
        ...story,
        visuals: story.visuals?.flatMap((slide: any) => slide.visuals || []) || []
      }));

      setStories(storiesWithVisuals || []);
    } catch (error: any) {
      console.error('Error loading approved stories:', error);
      toast({
        title: "Error Loading Stories",
        description: error.message,
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const generateVisualForSlide = async (slideId: string, storyTitle: string, slideContent: string) => {
    setGeneratingVisual(slideId);
    try {
      const { data, error } = await supabase.functions.invoke('image-generator', {
        body: {
          slideId,
          prompt: `Create an editorial news illustration for: "${storyTitle}". Slide content: "${slideContent}". Style: clean, professional, news-appropriate.`,
          stylePreset: 'editorial'
        }
      });

      if (error) throw error;

      toast({
        title: "Visual Generated",
        description: "Image successfully created for slide",
      });

      // Reload to show new visual
      await loadApprovedStories();
    } catch (error: any) {
      console.error('Error generating visual:', error);
      toast({
        title: "Visual Generation Failed",
        description: error.message,
        variant: "destructive"
      });
    } finally {
      setGeneratingVisual(null);
    }
  };

  const publishStory = async (storyId: string, platform: string = 'instagram') => {
    setPublishing(storyId);
    try {
      const { data, error } = await supabase.functions.invoke('social-media-publisher', {
        body: {
          storyId,
          platform
        }
      });

      if (error) throw error;

      toast({
        title: "Story Published",
        description: `Successfully sent to ${platform}`,
      });

      // Reload to show updated status
      await loadApprovedStories();
    } catch (error: any) {
      console.error('Error publishing story:', error);
      toast({
        title: "Publishing Failed",
        description: error.message,
        variant: "destructive"
      });
    } finally {
      setPublishing(null);
    }
  };

  const generateCarouselImages = async (storyId: string) => {
    setGeneratingCarousel(storyId);
    try {
      const { data, error } = await supabase.functions.invoke('generate-carousel-images', {
        body: {
          storyId,
          formats: ['instagram-square', 'instagram-story']
        }
      });

      if (error) throw error;

      toast({
        title: "Carousel Generated",
        description: "Instagram images ready for download",
      });

      // Reload to show carousel export
      await loadApprovedStories();
    } catch (error: any) {
      console.error('Error generating carousel:', error);
      toast({
        title: "Carousel Generation Failed",
        description: error.message,
        variant: "destructive"
      });
    } finally {
      setGeneratingCarousel(null);
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

      // Reload to remove from approved queue
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

  const handleArchiveStory = async (storyId: string) => {
    try {
      const { error } = await supabase
        .from('stories')
        .update({ 
          status: 'archived',
          updated_at: new Date().toISOString()
        })
        .eq('id', storyId);

      if (error) throw error;

      toast({
        title: "Story Archived",
        description: "Story has been archived and removed from all feeds",
      });

      // Reload to remove from approved queue
      await loadApprovedStories();
    } catch (error: any) {
      console.error('Error archiving story:', error);
      toast({
        title: "Archive Failed",
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

  const getStatusBadge = (status: string) => {
    const statusConfig = {
      ready: { variant: 'default' as const, label: 'Ready to Publish' },
      queued: { variant: 'secondary' as const, label: 'Queued' },
      published: { variant: 'default' as const, label: 'Published' },
      publishing_failed: { variant: 'destructive' as const, label: 'Failed' }
    };
    
    const config = statusConfig[status as keyof typeof statusConfig] || { variant: 'outline' as const, label: status };
    return <Badge variant={config.variant}>{config.label}</Badge>;
  };

  const getPostStatus = (posts: Post[]) => {
    if (!posts || posts.length === 0) {
      return { status: 'complete', label: 'Published to Feed' };
    }
    
    const publishedPosts = posts.filter(p => p.status === 'published');
    const scheduledPosts = posts.filter(p => p.status === 'scheduled');
    
    if (publishedPosts.length > 0) {
      return { status: 'published', label: 'Published to Social' };
    }
    if (scheduledPosts.length > 0) {
      return { status: 'scheduled', label: 'Scheduled' };
    }
    
    return { status: 'complete', label: 'Published to Feed' };
  };

  const getVisualStatus = (slideId: string, visuals: Visual[]) => {
    const slideVisuals = visuals.filter(v => v.slide_id === slideId);
    return slideVisuals.length > 0 ? 'generated' : 'needed';
  };

  const getCarouselStatus = (carouselExports?: CarouselExport[]) => {
    if (!carouselExports || carouselExports.length === 0) {
      return { status: 'not_generated', label: 'Not Generated' };
    }
    
    const latestExport = carouselExports[carouselExports.length - 1];
    const statusMap = {
      pending: { status: 'pending', label: 'Pending' },
      generating: { status: 'generating', label: 'Generating...' },
      completed: { status: 'completed', label: 'Ready for Download' },
      failed: { status: 'failed', label: 'Generation Failed' }
    };
    
    return statusMap[latestExport.status as keyof typeof statusMap] || 
           { status: 'unknown', label: latestExport.status };
  };

  const openPreviewModal = (storyId: string) => {
    const story = stories.find(s => s.id === storyId);
    const carouselExport = story?.carousel_exports?.[0];
    
    if (!story || !carouselExport || carouselExport.status !== 'completed') {
      toast({
        title: "Preview Failed",
        description: "Carousel images not ready yet",
        variant: "destructive"
      });
      return;
    }

    setSelectedCarouselExport(carouselExport);
    setSelectedStoryTitle(story.title);
    setPreviewModalOpen(true);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Approved Queue</h2>
          <p className="text-muted-foreground">Published stories with completed image assets</p>
        </div>
        <Button onClick={loadApprovedStories} variant="outline" size="sm">
          <RefreshCw className="h-4 w-4 mr-2" />
          Refresh
        </Button>
      </div>

      {stories.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <CheckCircle2 className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-medium mb-2">No Published Stories</h3>
            <p className="text-muted-foreground">
              Approved stories will appear here for management and asset downloads
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {stories.map((story) => {
            const isExpanded = expandedStories.has(story.id);
            const article = story.article;
            const postStatus = getPostStatus(story.posts || []);
            const carouselStatus = getCarouselStatus(story.carousel_exports);
            const visualsNeeded = story.slides.filter(slide => 
              getVisualStatus(slide.id, story.visuals || []) === 'needed'
            ).length;


            return (
              <Card key={story.id} className="overflow-hidden">
                <CardHeader className="pb-4">
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
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
                        <CardTitle className="text-lg">{story.title}</CardTitle>
                        {getStatusBadge(story.status)}
                      </div>
                      
                      <div className="flex items-center gap-4 text-sm text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <CheckCircle2 className="h-3 w-3" />
                          {story.slides.length} slides
                        </span>
                        {visualsNeeded > 0 && (
                          <span className="flex items-center gap-1 text-orange-600">
                            <ImageIcon className="h-3 w-3" />
                            {visualsNeeded} visuals needed
                          </span>
                        )}
                        <Badge variant="outline" className={
                          postStatus.status === 'published' ? 'bg-green-50 text-green-700' :
                          postStatus.status === 'scheduled' ? 'bg-blue-50 text-blue-700' :
                          'bg-gray-50 text-gray-700'
                        }>
                          {postStatus.label}
                        </Badge>
                        <Badge variant="outline" className={
                          carouselStatus.status === 'completed' ? 'bg-blue-50 text-blue-700' :
                          carouselStatus.status === 'generating' ? 'bg-yellow-50 text-yellow-700' :
                          carouselStatus.status === 'failed' ? 'bg-red-50 text-red-700' :
                          'bg-gray-50 text-gray-700'
                        }>
                          <Package className="h-3 w-3 mr-1" />
                          {carouselStatus.label}
                        </Badge>
                      </div>

                      {article && (
                        <div className="flex items-center gap-4 text-xs text-muted-foreground mt-2">
                          <span>By {article.author || 'Unknown'}</span>
                          <span>{article.word_count || 0} words</span>
                          <span>{article.region || 'No region'}</span>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => window.open(article.source_url, '_blank')}
                            className="h-auto p-0 text-xs"
                          >
                            <ExternalLink className="h-3 w-3 mr-1" />
                            Source
                          </Button>
                        </div>
                      )}
                    </div>

                    <div className="flex items-center gap-2">
                      <Button
                        onClick={() => handleReturnToReview(story.id)}
                        variant="outline"
                        size="sm"
                      >
                        <RotateCcw className="h-4 w-4 mr-2" />
                        Return to Review
                      </Button>
                      <Button
                        onClick={() => handleArchiveStory(story.id)}
                        variant="outline"
                        size="sm"
                      >
                        <Archive className="h-4 w-4 mr-2" />
                        Archive
                      </Button>
                      {carouselStatus.status === 'completed' && (
                        <>
                          <Button
                            onClick={() => openPreviewModal(story.id)}
                            variant="outline"
                            size="sm"
                          >
                            <Eye className="h-4 w-4 mr-2" />
                            Preview Images
                          </Button>
                          <Button
                            onClick={() => openPreviewModal(story.id)}
                            variant="default"
                            size="sm"
                          >
                            <Download className="h-4 w-4 mr-2" />
                            Download Pack
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                </CardHeader>

                {isExpanded && (
                  <CardContent className="pt-0">
                    <div className="space-y-4">
                      <h4 className="font-medium text-sm text-muted-foreground">Slides</h4>
                      {story.slides.map((slide) => {
                        const hasVisual = getVisualStatus(slide.id, story.visuals || []) === 'generated';
                        const slideVisual = story.visuals?.find(v => v.slide_id === slide.id);
                        
                        return (
                          <div key={slide.id} className="border rounded-lg p-4 space-y-3">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <Badge variant="outline">Slide {slide.slide_number}</Badge>
                                <span className="text-xs text-muted-foreground">
                                  {slide.word_count} words
                                </span>
                        {hasVisual ? (
                          <Badge variant="default" className="bg-green-100 text-green-800">
                            <ImageIcon className="h-3 w-3 mr-1" />
                            Image Ready
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-orange-600">
                            <ImageIcon className="h-3 w-3 mr-1" />
                            Auto-Generated
                          </Badge>
                        )}
                              </div>
                      <div className="flex items-center gap-2">
                        
                        {!hasVisual && (
                          <Button
                            onClick={() => generateVisualForSlide(slide.id, story.title, slide.content)}
                            disabled={generatingVisual === slide.id}
                            size="sm"
                            variant="outline"
                          >
                            {generatingVisual === slide.id ? (
                              <Clock className="h-4 w-4 mr-2 animate-spin" />
                            ) : (
                              <Sparkles className="h-4 w-4 mr-2" />
                            )}
                            Generate Image
                          </Button>
                        )}
                      </div>
                            </div>
                            
                            <p className="text-sm">{slide.content}</p>
                            
                            {slideVisual && slideVisual.image_url && (
                              <div className="mt-3 p-3 bg-muted rounded">
                                <p className="text-xs text-muted-foreground mb-2">Generated Visual:</p>
                                <img 
                                  src={slideVisual.image_url} 
                                  alt={slideVisual.alt_text || 'Generated visual'}
                                  className="max-w-xs rounded border"
                                />
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </CardContent>
                )}
              </Card>
            );
          })}
        </div>
      )}

      {/* Carousel Preview Modal */}
      {selectedCarouselExport && (
        <CarouselPreviewModal
          isOpen={previewModalOpen}
          onClose={() => {
            setPreviewModalOpen(false);
            setSelectedCarouselExport(null);
            setSelectedStoryTitle('');
          }}
          storyTitle={selectedStoryTitle}
          carouselExport={selectedCarouselExport}
        />
      )}
    </div>
  );
};