import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useCredits } from '@/hooks/useCredits';
import { useAuth } from '@/hooks/useAuth';
import { CreditService } from '@/lib/creditService';
import { ImageModelSelector, ImageModel } from '@/components/ImageModelSelector';
import { AnimationQualitySelector } from '@/components/topic-pipeline/AnimationQualitySelector';
import { AnimationInstructionsModal } from '@/components/topic-pipeline/AnimationInstructionsModal';
import { CarouselExportButton } from '@/components/CarouselExportButton';
import { useCarouselExport } from '@/hooks/useCarouselExport';
import { ExportableSlideRenderer } from '@/components/ExportableSlideRenderer';
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
  BookOpen,
  Trash2,
  ImageIcon,
  Loader2,
  ExternalLink
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
  cover_illustration_url?: string | null;
  cover_illustration_prompt?: string | null;
  illustration_generated_at?: string | null;
  animated_illustration_url?: string | null;
  animation_suggestions?: string[] | null;
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

interface ApprovedStoriesPanelProps {
  selectedTopicId?: string | null;
}

export const ApprovedStoriesPanel = ({ selectedTopicId }: ApprovedStoriesPanelProps) => {
  const [approvedStories, setApprovedStories] = useState<Story[]>([]);
  const [loadingApproved, setLoadingApproved] = useState(true);
  const [expandedStories, setExpandedStories] = useState<Set<string>>(new Set());
  const [carouselStatuses, setCarouselStatuses] = useState<Record<string, CarouselStatus>>({});
  const [deletingStories, setDeletingStories] = useState<Set<string>>(new Set());
  const [generatingIllustrations, setGeneratingIllustrations] = useState<Set<string>>(new Set());
  const [illustrationStyle, setIllustrationStyle] = useState<string>('editorial_illustrative');
  const [coverSelectionModal, setCoverSelectionModal] = useState<{
    isOpen: boolean; 
    storyId?: string; 
    storyTitle?: string;
    coverOptions?: any[];
    selectedCoverId?: string;
  }>({ isOpen: false });
  const [animationModalStory, setAnimationModalStory] = useState<Story | null>(null);
  
  const { toast } = useToast();
  const { credits } = useCredits();
  const { isSuperAdmin } = useAuth();
  const { exportStory, isExporting, exportingStoryId, progress } = useCarouselExport();

  useEffect(() => {
    loadApprovedStories();
  }, [selectedTopicId]);

  // Fetch illustration style when selectedTopicId changes
  useEffect(() => {
    if (selectedTopicId) {
      const fetchIllustrationStyle = async () => {
        const { data, error } = await supabase
          .from('topics')
          .select('illustration_style')
          .eq('id', selectedTopicId)
          .single();
        
        if (data && !error) {
          setIllustrationStyle(data.illustration_style || 'editorial_illustrative');
        }
      };
      fetchIllustrationStyle();
    }
  }, [selectedTopicId]);

  const loadApprovedStories = async () => {
    setLoadingApproved(true);
    try {
      console.log('🔍 Loading approved stories for topic:', selectedTopicId);
      
      if (!selectedTopicId) {
        console.log('❌ No topic selected, showing empty stories');
        setApprovedStories([]);
        return;
      }

      // ID-first strategy: Get article IDs for this topic, then get stories
      const [legacyArticlesRes, mtArticlesRes] = await Promise.all([
        // Get legacy article IDs for this topic
        supabase
          .from('articles')
          .select('id')
          .eq('topic_id', selectedTopicId),
        // Get multi-tenant article IDs for this topic  
        supabase
          .from('topic_articles')
          .select('id')
          .eq('topic_id', selectedTopicId)
      ]);

      const legacyArticleIds = (legacyArticlesRes.data || []).map(a => a.id);
      const mtTopicArticleIds = (mtArticlesRes.data || []).map(a => a.id);

      console.log('📊 ApprovedStories: Found article IDs', { 
        legacy: legacyArticleIds.length, 
        multiTenant: mtTopicArticleIds.length 
      });

      // Now get stories using these article IDs, requiring slides
      let allStories: any[] = [];

      if (legacyArticleIds.length > 0) {
        const { data, error } = await supabase
          .from('stories')
          .select(`
            *,
            slides!inner:slides(*),
            article:articles(
              id,
              title,
              author,
              source_url,
              region,
              published_at,
              word_count
            )
          `)
          .eq('status', 'published')
          .in('article_id', legacyArticleIds)
          .order('created_at', { ascending: false });

        if (!error && data) {
          allStories.push(...data);
        }
      }

      if (mtTopicArticleIds.length > 0) {
        const { data, error } = await supabase
          .from('stories')
          .select(`
            *,
            slides!inner(*),
            topic_articles!inner(
              id,
              shared_content:shared_article_content(
                url,
                title,
                author,
                published_at
              )
            )
          `)
          .eq('status', 'published')
          .in('topic_article_id', mtTopicArticleIds)
          .order('created_at', { ascending: false });

        if (!error && data) {
          // Transform multi-tenant stories to match legacy format
          const transformed = data.map((story: any) => ({
            ...story,
            article: {
              id: story.topic_article_id,
              title: story.topic_articles?.shared_content?.title || story.title,
              author: story.topic_articles?.shared_content?.author || story.author,  
              source_url: story.topic_articles?.shared_content?.url || '',
              region: 'Multi-tenant',
              published_at: story.topic_articles?.shared_content?.published_at,
              word_count: null
            }
          }));
          allStories.push(...transformed);
        }
      }

      // Remove duplicates and sort
      const uniqueStories = allStories.filter((story, index, arr) => 
        arr.findIndex(s => s.id === story.id) === index
      ).sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      
      console.log('✅ Topic-scoped stories with slides:', uniqueStories.length);
      setApprovedStories(uniqueStories);

      // Load carousel statuses for all approved stories
      if (uniqueStories.length > 0) {
        console.log('🎠 Loading carousel statuses for stories:', uniqueStories.map(s => s.id));
        await loadCarouselStatuses(uniqueStories.map(s => s.id));
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

  const handleGenerateIllustration = async (story: Story, model: ImageModel) => {
    if (generatingIllustrations.has(story.id)) return;

    // Check credits
    if (!credits || credits.credits_balance < model.credits) {
      toast({
        title: 'Insufficient Credits',
        description: `You need ${model.credits} credits to generate with ${model.name}.`,
        variant: 'destructive',
      });
      return;
    }

    setGeneratingIllustrations(prev => new Set(prev.add(story.id)));

    try {
      const result = await CreditService.generateStoryIllustration(story.id, model.id);
      
      if (!result.success) {
        toast({
          title: 'Generation Failed',
          description: result.error || 'Failed to generate illustration',
          variant: 'destructive',
        });
        return;
      }

      // Warn user if fallback was used
      if (result.used_fallback) {
        toast({
          title: 'Image Generated with Fallback',
          description: `${result.fallback_reason} (Used: ${result.fallback_model})`,
          variant: 'default',
          duration: 8000,
        });
      } else {
        toast({
          title: 'Illustration Generated Successfully',
          description: `Used ${result.credits_used} credits with ${model.name}. Balance: ${result.new_balance}`,
        });
      }

      await loadApprovedStories();
    } catch (error) {
      console.error('Error generating illustration:', error);
      toast({
        title: 'Error',
        description: 'Failed to generate story illustration',
        variant: 'destructive',
      });
    } finally {
      setGeneratingIllustrations(prev => {
        const next = new Set(prev);
        next.delete(story.id);
        return next;
      });
    }
  };

  const handleAnimateIllustration = async (story: Story, quality: 'standard' | 'fast' = 'standard', customPrompt?: string) => {
    const creditCost = quality === 'fast' ? 1 : 2;
    
    // Check credits
    if (!isSuperAdmin && (!credits || credits.credits_balance < creditCost)) {
      toast({
        title: 'Insufficient Credits',
        description: `You need ${creditCost} credit${creditCost > 1 ? 's' : ''} to animate this illustration.`,
        variant: 'destructive',
      });
      return;
    }
    
    setGeneratingIllustrations(prev => new Set(prev.add(story.id)));
    
    try {
      const { data, error } = await supabase.functions.invoke('animate-illustration', {
        body: { 
          storyId: story.id, 
          staticImageUrl: story.cover_illustration_url,
          quality,
          customPrompt
        }
      });
      
      if (error) throw error;
      
      if (data?.success) {
        toast({ 
          title: 'Animation Complete!', 
          description: `${data.resolution} video created. Used ${data.credits_used} credits. New balance: ${data.new_balance}` 
        });
        await loadApprovedStories();
      } else {
        toast({ 
          title: 'Animation Failed', 
          description: data?.error || 'Failed to animate illustration', 
          variant: 'destructive' 
        });
      }
    } catch (e) {
      console.error('Animation error:', e);
      toast({ 
        title: 'Animation Error', 
        description: 'Failed to create animation', 
        variant: 'destructive' 
      });
    } finally {
      setGeneratingIllustrations(prev => {
        const next = new Set(prev);
        next.delete(story.id);
        return next;
      });
    }
  };

  const handleDeleteIllustration = async (storyId: string) => {
    try {
      const { data, error } = await supabase.functions.invoke('delete-story-illustration', {
        body: { storyId }
      });

      if (error) throw error;

      if (data?.success) {
        toast({
          title: 'All Illustrations Deleted',
          description: 'Both static image and animation have been removed.',
        });
        await loadApprovedStories();
      } else {
        throw new Error(data?.error || 'Failed to delete illustration');
      }
    } catch (error) {
      console.error('Error deleting illustration:', error);
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to delete illustration',
        variant: 'destructive',
      });
    }
  };

  const handleDeleteAnimation = async (storyId: string) => {
    try {
      const { data, error } = await supabase.functions.invoke('delete-story-animation', {
        body: { storyId }
      });

      if (error) throw error;

      if (data?.success) {
        toast({
          title: 'Animation Deleted',
          description: 'Animation removed. Static image preserved.',
        });
        await loadApprovedStories();
      } else {
        throw new Error(data?.error || 'Failed to delete animation');
      }
    } catch (error) {
      console.error('Error deleting animation:', error);
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to delete animation',
        variant: 'destructive',
      });
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

  const handleDeleteStory = async (storyId: string, storyTitle: string) => {
    if (deletingStories.has(storyId)) return;
    
    // Confirm deletion
    if (!confirm(`Are you sure you want to delete "${storyTitle}"? This will permanently remove the story, its slides, visuals, and reset the article status.`)) {
      return;
    }
    
    setDeletingStories(prev => new Set(prev.add(storyId)));
    
    try {
      const { data, error } = await supabase.rpc('delete_story_cascade', {
        p_story_id: storyId
      });

      if (error) throw error;
      
      const result = data as { success: boolean; error?: string };
      if (!result.success) {
        throw new Error(result.error || 'Failed to delete story');
      }

      toast({
        title: 'Story Deleted',
        description: `Story deleted successfully. Article reset to new status.`,
      });

      // Remove from local state and refresh
      setApprovedStories(prev => prev.filter(story => story.id !== storyId));
      setCarouselStatuses(prev => {
        const next = { ...prev };
        delete next[storyId];
        return next;
      });
      
      // Force refresh to update counters
      loadApprovedStories();
    } catch (error) {
      console.error('Error deleting story:', error);
      toast({
        title: 'Error',
        description: 'Failed to delete story. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setDeletingStories(prev => {
        const next = new Set(prev);
        next.delete(storyId);
        return next;
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


  return (
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
                          <Badge className="bg-green-500 text-white">Ready</Badge>
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
                        {/* Story Illustration Controls */}
                        <div className="flex flex-col gap-2">
                          <div className="flex items-center gap-2">
                            <ImageModelSelector
                              onModelSelect={(model) => {
                                handleGenerateIllustration(story, model);
                              }}
                              isGenerating={generatingIllustrations.has(story.id)}
                              hasExistingImage={!!story.cover_illustration_url}
                              illustrationStyle={illustrationStyle as any}
                            />
                          </div>
                        </div>
                        
                        {/* Carousel generation functionality removed */}
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
                        {/* Show cover illustration if exists */}
                        {story.cover_illustration_url && (
                          <div className="mb-3">
                              <div className="flex items-center justify-between mb-2">
                                <div className="flex items-center gap-2">
                                  <h4 className="text-sm font-medium">Cover Illustration</h4>
                                  {story.animated_illustration_url && (
                                    <Badge className="bg-green-100 text-green-800 border-green-300 text-xs">
                                      ✨ Animated
                                    </Badge>
                                  )}
                                </div>
                                <div className="flex gap-2">
                                  <ImageModelSelector
                                    onModelSelect={(model) => handleGenerateIllustration(story, model)}
                                    isGenerating={generatingIllustrations.has(story.id)}
                                    hasExistingImage={false}
                                    size="sm"
                                    illustrationStyle={illustrationStyle as any}
                                  />
                                  {story.cover_illustration_url && !story.animated_illustration_url && (
                                    <AnimationQualitySelector
                                      onAnimate={() => setAnimationModalStory(story)}
                                      isAnimating={generatingIllustrations.has(story.id)}
                                    />
                                  )}
                                  {story.animated_illustration_url && (
                                    <Button
                                      size="sm"
                                      variant="destructive"
                                      onClick={() => handleDeleteAnimation(story.id)}
                                      className="text-xs"
                                    >
                                      <Trash2 className="w-3 h-3 mr-1" />
                                      Delete Animation
                                    </Button>
                                  )}
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => handleDeleteIllustration(story.id)}
                                    className="text-xs text-red-600 hover:text-red-700 border-red-300"
                                  >
                                    <Trash2 className="w-3 h-3 mr-1" />
                                    Delete All
                                  </Button>
                                </div>
                              </div>
                            {/* Show both static and animated side by side if animation exists */}
                            <div className={story.animated_illustration_url ? "grid grid-cols-2 gap-4" : ""}>
                              <div className="space-y-2">
                                {story.animated_illustration_url && (
                                  <p className="text-xs text-muted-foreground font-medium">Static Image</p>
                                )}
                                <div className="relative w-full">
                                  <img
                                    src={story.cover_illustration_url}
                                    alt={`Cover illustration for ${story.title}`}
                                    className="w-full h-48 object-cover rounded-lg border"
                                  />
                                  <div className="mt-2 text-xs text-muted-foreground">
                                    Generated: {story.illustration_generated_at ? 
                                      new Date(story.illustration_generated_at).toLocaleString() : 
                                      'Unknown'
                                    }
                                  </div>
                                </div>
                              </div>
                              
                              {/* Show animated video if exists */}
                              {story.animated_illustration_url && (
                                <div className="space-y-2">
                                  <p className="text-xs text-muted-foreground font-medium">Animated Video</p>
                                  <div className="relative w-full">
                                    <video
                                      src={story.animated_illustration_url}
                                      poster={story.cover_illustration_url}
                                      className="w-full h-48 object-cover rounded-lg border"
                                      controls
                                      loop
                                      muted
                                      playsInline
                                    />
                                    <div className="mt-2 text-xs text-muted-foreground">
                                      3 seconds • MP4
                                    </div>
                                  </div>
                                </div>
                              )}
                            </div>
                          </div>
                        )}
                        
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
                        
                        
                        <div className="flex gap-2 pt-2 border-t flex-wrap">
                          {/* Carousel Export Button */}
                          <CarouselExportButton
                            isExporting={isExporting && exportingStoryId === story.id}
                            progress={exportingStoryId === story.id ? progress : 0}
                            onClick={() => exportStory(
                              {
                                ...story,
                                article: story.article ? {
                                  source_url: story.article.source_url,
                                  region: story.article.region,
                                  published_at: story.article.published_at
                                } : undefined
                              },
                              ExportableSlideRenderer,
                              'Local News'
                            )}
                          />
                          {/* Source Link Button */}
                          {story.article?.source_url && story.article.source_url !== '#' && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => window.open(story.article!.source_url, '_blank')}
                              className="flex items-center gap-1"
                            >
                              <ExternalLink className="w-3 h-3" />
                              Open Source
                            </Button>
                          )}
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleReturnToReview(story.id)}
                            className="flex items-center gap-1"
                          >
                            <RotateCcw className="w-3 h-3" />
                            Return to Review
                          </Button>
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={() => handleDeleteStory(story.id, story.title)}
                            disabled={deletingStories.has(story.id)}
                            className="flex items-center gap-1"
                          >
                            <Trash2 className="w-3 h-3" />
                            {deletingStories.has(story.id) ? 'Deleting...' : 'Delete Story'}
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

        {/* Animation Instructions Modal */}
        <AnimationInstructionsModal
          isOpen={!!animationModalStory}
          onClose={() => setAnimationModalStory(null)}
          story={animationModalStory ? {
            id: animationModalStory.id,
            headline: animationModalStory.title,
            cover_illustration_url: animationModalStory.cover_illustration_url,
            cover_illustration_prompt: animationModalStory.cover_illustration_prompt,
            tone: null,
            animation_suggestions: animationModalStory.animation_suggestions || null,
          } : null}
          onAnimate={async ({ quality, customPrompt }) => {
            if (animationModalStory) {
              await handleAnimateIllustration(animationModalStory, quality, customPrompt);
              setAnimationModalStory(null);
            }
          }}
          isAnimating={animationModalStory ? generatingIllustrations.has(animationModalStory.id) : false}
          creditBalance={credits?.credits_balance}
          isSuperAdmin={isSuperAdmin}
        />
      </CardContent>
    </Card>
  );
};