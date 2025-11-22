import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ChevronDown, ChevronRight, CheckCircle, Eye, Trash2, ExternalLink, RotateCcw, Loader2, FileText, ChevronLeft, ChevronRightIcon, Edit3 } from "lucide-react";

import { StyleTooltip } from "@/components/ui/style-tooltip";
import { useToast } from "@/hooks/use-toast";
import { useCredits } from "@/hooks/useCredits";
import { CreditService } from "@/lib/creditService";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { ImageModelSelector, ImageModel } from "@/components/ImageModelSelector";
import { MultiTenantStory } from "@/hooks/useMultiTenantTopicPipeline";
import SlideEditor from "@/components/SlideEditor";

interface MultiTenantStoriesListProps {
  stories: MultiTenantStory[];
  expandedStories: Set<string>;
  processingApproval: Set<string>;
  processingRejection: Set<string>;
  deletingStories: Set<string>;
  publishingStories: Set<string>;
  animatingStories: Set<string>;
  onToggleExpanded: (storyId: string) => void;
  onApprove: (storyId: string) => void;
  onReject: (storyId: string) => void;
  onDelete: (storyId: string, storyTitle: string) => void;
  onReturnToReview: (storyId: string) => void;
  onEditSlide: (slide: any) => void;
  onViewStory: (story: MultiTenantStory) => void;
  onRefresh?: () => void;
  topicId?: string;
}

export const MultiTenantStoriesList: React.FC<MultiTenantStoriesListProps> = ({
  stories,
  expandedStories,
  processingApproval,
  processingRejection,
  deletingStories,
  publishingStories,
  animatingStories,
  onToggleExpanded,
  onApprove,
  onReject,
  onDelete,
  onReturnToReview,
  onEditSlide,
  onViewStory,
  onRefresh,
  topicId
}) => {
  const [generatingIllustrations, setGeneratingIllustrations] = useState<Set<string>>(new Set());
  const [selectedSlideId, setSelectedSlideId] = useState<string | null>(null);
  const [forcingReturn, setForcingReturn] = useState<Set<string>>(new Set());
  const [illustrationStyle, setIllustrationStyle] = useState<string>('editorial_illustrative');
  const { toast } = useToast();
  const { credits } = useCredits();
  const { isSuperAdmin } = useAuth();

  // Fetch illustration style when topicId changes
  useEffect(() => {
    if (topicId) {
      const fetchIllustrationStyle = async () => {
        const { data, error } = await supabase
          .from('topics')
          .select('illustration_style')
          .eq('id', topicId)
          .single();
        
        if (data && !error) {
          setIllustrationStyle(data.illustration_style || 'editorial_illustrative');
        }
      };
      fetchIllustrationStyle();
    }
  }, [topicId]);

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const storiesPerPage = 10;
  
  // Calculate pagination
  const totalPages = Math.ceil(stories.length / storiesPerPage);
  const startIndex = (currentPage - 1) * storiesPerPage;
  const endIndex = startIndex + storiesPerPage;
  const currentStories = stories.slice(startIndex, endIndex);

  const handleGenerateIllustration = async (story: MultiTenantStory, model: ImageModel) => {
    if (generatingIllustrations.has(story.id)) return;
    
    // Check credits (bypass for super admin)
    if (!isSuperAdmin && (!credits || credits.credits_balance < model.credits)) {
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

      toast({
        title: 'Illustration Generated Successfully',
        description: `Used ${result.credits_used} credits with ${model.name}. Balance: ${result.new_balance}`,
      });

      if (onRefresh) await onRefresh();
    } catch (error) {
      console.error('Error generating illustration:', error);
      toast({ title: 'Error', description: 'Failed to generate story illustration', variant: 'destructive' });
    } finally {
      setGeneratingIllustrations(prev => { const next = new Set(prev); next.delete(story.id); return next; });
    }
  };

  const handleAnimateIllustration = async (story: MultiTenantStory) => {
    // Check credits (2 credits for ~3-4s animation with Replicate Wan 2.2 5b)
    if (!isSuperAdmin && (!credits || credits.credits_balance < 2)) {
      toast({ title: 'Insufficient Credits', description: 'You need 2 credits to animate this illustration.', variant: 'destructive' });
      return;
    }
    
    setGeneratingIllustrations(prev => new Set(prev.add(story.id)));
    
    try {
      const { data, error } = await supabase.functions.invoke('animate-illustration', {
        body: { 
          storyId: story.id, 
          staticImageUrl: story.cover_illustration_url 
        }
      });
      
      if (error) throw error;
      
      if (data?.success) {
        toast({ 
          title: 'Animation Complete!', 
          description: `Used ${data.credits_used} credits. New balance: ${data.new_balance}` 
        });
        if (onRefresh) await onRefresh();
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
        
        if (onRefresh) {
          setTimeout(async () => {
            await onRefresh();
          }, 500);
        }
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
        
        if (onRefresh) {
          setTimeout(async () => {
            await onRefresh();
          }, 500);
        }
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

  const getWordCountColor = (wordCount: number, slideNumber: number) => {
    if (slideNumber === 1) return "text-blue-600";
    if (wordCount > 25) return "text-red-600";
    if (wordCount < 15) return "text-yellow-600";
    return "text-green-600";
  };

  const getWordCountBadge = (wordCount: number, slideNumber: number) => {
    if (slideNumber === 1) return "Title";
    if (wordCount > 25) return "Long";
    if (wordCount < 15) return "Short";
    return "Good";
  };

  const handleForceReturn = async (story: MultiTenantStory) => {
    if (forcingReturn.has(story.id)) return;
    
    setForcingReturn(prev => new Set(prev.add(story.id)));
    
    try {
      // Reset story to draft
      const { error: storyError } = await supabase
        .from('stories')
        .update({ 
          status: 'draft',
          updated_at: new Date().toISOString()
        })
        .eq('id', story.id);
      
      if (storyError) throw storyError;
      
      // Re-queue for processing
      const { error: queueError } = await supabase
        .from('content_generation_queue')
        .insert({
          article_id: story.topic_article_id || story.article_id || '',
          status: 'pending',
          created_at: new Date().toISOString()
        });
      
      if (queueError) throw queueError;
      
      toast({
        title: 'Story Returned',
        description: 'Story has been returned to the processing queue',
      });
      
      if (onRefresh) {
        await onRefresh();
      }
    } catch (error) {
      console.error('Error forcing return:', error);
      toast({
        title: 'Error',
        description: 'Failed to return story to queue',
        variant: 'destructive',
      });
    } finally {
      setForcingReturn(prev => {
        const next = new Set(prev);
        next.delete(story.id);
        return next;
      });
    }
  };

  const isStuck = (story: MultiTenantStory) => {
    if (story.status !== 'processing') return false;
    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);
    return new Date(story.updated_at) < tenMinutesAgo;
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'ready':
        return <Badge className="bg-green-100 text-green-800 border-green-300">Ready</Badge>;
      case 'draft':
        return <Badge variant="outline">Draft</Badge>;
      case 'processing':
        return <Badge className="bg-yellow-100 text-yellow-800 border-yellow-300">Processing</Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  if (stories.length === 0) {
    return (
      <div className="text-center py-12">
        <div className="text-muted-foreground mb-4">
          <FileText className="w-12 h-12 mx-auto mb-2 opacity-50" />
          <p className="text-lg font-medium">No Stories Ready</p>
          <p className="text-sm">Generated stories will appear here for review and approval</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Pagination Info */}
      {stories.length > storiesPerPage && (
        <div className="flex items-center justify-between text-sm text-muted-foreground bg-muted/50 px-4 py-2 rounded-lg">
          <span>
            Showing {startIndex + 1}-{Math.min(endIndex, stories.length)} of {stories.length} stories
          </span>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="bg-green-100 text-green-800 border-green-300">
              Active System
            </Badge>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
              disabled={currentPage === 1}
            >
              <ChevronLeft className="w-4 h-4" />
              Previous
            </Button>
            <span className="px-2">
              Page {currentPage} of {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
              disabled={currentPage === totalPages}
            >
              Next
              <ChevronRightIcon className="w-4 h-4" />
            </Button>
          </div>
        </div>
      )}
      
      {currentStories.map((story) => {
        const isExpanded = expandedStories.has(story.id);
        const isAnimating = animatingStories.has(story.id);

        return (
          <Card key={story.id} className={`transition-all duration-300 hover:shadow-md ${
            isAnimating ? 'animate-slide-out-left opacity-0' : 'animate-fade-in'
          }`}>
            <CardHeader className="pb-3">
              <div className="flex justify-between items-start">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => onToggleExpanded(story.id)}
                      className="p-1 h-auto"
                    >
                      {isExpanded ? 
                        <ChevronDown className="w-4 h-4" /> : 
                        <ChevronRight className="w-4 h-4" />
                      }
                    </Button>
                    <CardTitle className="text-base line-clamp-2">
                      {story.title}
                    </CardTitle>
                    <StyleTooltip 
                      styleChoices={{
                        slidetype: story.slidetype || '',
                        tone: story.tone || '',
                        writing_style: story.writing_style || '',
                        audience_expertise: story.audience_expertise || ''
                      }}
                    />
                  </div>
                  
                  <div className="flex items-center gap-2 sm:gap-4 text-muted-foreground flex-wrap">
                    {getStatusBadge(story.status)}
                    {isStuck(story) && (
                      <Badge variant="destructive" className="text-xs">Stuck</Badge>
                    )}
                    <span>{story.slides?.length || 0} slides</span>
                    <span>{story.word_count || 0} words</span>
                    <span>
                      {new Date(story.created_at).toLocaleDateString()}
                    </span>
                    {story.author && (
                      <span>by {story.author}</span>
                    )}
                  </div>
                </div>
                
                <div className="flex flex-col gap-2 min-w-0">
                  <div className="grid grid-cols-2 sm:flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        onToggleExpanded(story.id);
                        setTimeout(() => {
                          const carouselSection = document.getElementById(`carousel-images-${story.id}`);
                          if (carouselSection) {
                            carouselSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
                          }
                        }, 100);
                      }}
                      className="w-full sm:w-auto"
                    >
                      <Eye className="w-4 h-4" />
                    </Button>
                    {story.slides && story.slides.length > 0 && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setSelectedSlideId(story.slides[0].id)}
                        className="w-full sm:w-auto"
                        title="Preview & Edit Slides"
                      >
                        <Edit3 className="w-4 h-4" />
                      </Button>
                    )}
                    {story.url && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => window.open(story.url, '_blank')}
                        className="w-full sm:w-auto"
                      >
                        <ExternalLink className="w-4 h-4" />
                      </Button>
                    )}
                  </div>
                  
                  <div className="grid grid-cols-2 sm:flex gap-2">
                    {isStuck(story) && (
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => handleForceReturn(story)}
                        disabled={forcingReturn.has(story.id)}
                        className="w-full sm:w-auto"
                      >
                        {forcingReturn.has(story.id) ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <>Force return</>
                        )}
                      </Button>
                    )}
                    
                    {story.status === 'ready' && (
                      <>
                        <ImageModelSelector
                          onModelSelect={(model) => handleGenerateIllustration(story, model)}
                          isGenerating={generatingIllustrations.has(story.id)}
                          hasExistingImage={!!story.cover_illustration_url}
                          illustrationStyle={illustrationStyle as any}
                        />
                        
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => onReturnToReview(story.id)}
                          className="w-full sm:w-auto"
                        >
                          <RotateCcw className="w-4 h-4" />
                        </Button>
                      </>
                    )}
                    
                    {story.status === 'draft' && (
                      <>
                        <Button
                          size="sm"
                          onClick={() => onApprove(story.id)}
                          disabled={processingApproval.has(story.id)}
                          className="w-full sm:w-auto"
                        >
                          {processingApproval.has(story.id) ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <CheckCircle className="w-4 h-4" />
                          )}
                        </Button>
                        
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => onReject(story.id)}
                          disabled={processingRejection.has(story.id)}
                          className="w-full sm:w-auto"
                        >
                          {processingRejection.has(story.id) ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <Trash2 className="w-4 h-4" />
                          )}
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            </CardHeader>

            {isExpanded && story.slides && story.slides.length > 0 && (
              <CardContent className="pt-0">
                <div className="space-y-3 border-t pt-4">
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
                            illustrationStyle={illustrationStyle as any}
                            size="sm"
                          />
                          {story.cover_illustration_url && !story.animated_illustration_url && (
                            <Button
                              size="sm"
                              variant="default"
                              onClick={() => handleAnimateIllustration(story)}
                              disabled={generatingIllustrations.has(story.id)}
                              className="bg-purple-600 hover:bg-purple-700 text-xs"
                            >
                              {generatingIllustrations.has(story.id) ? (
                                <>
                                  <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                                  Animating...
                                </>
                              ) : (
                                <>
                                  🎬 Animate (2s) - 2 credits
                                </>
                              )}
                            </Button>
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
                              className="w-full h-48 object-contain bg-white rounded-lg border"
                              style={{ imageRendering: 'crisp-edges' }}
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
                                className="w-full h-48 object-contain bg-white rounded-lg border"
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
                  
                  {story.slides.map((slide) => (
                    <div
                      key={slide.id}
                      className="bg-muted/30 rounded-lg p-3 text-sm border border-muted"
                    >
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <Badge variant="secondary" className="text-xs">
                            Slide {slide.slide_number}
                          </Badge>
                          <Badge 
                            variant="outline" 
                            className={`text-xs ${getWordCountColor(slide.word_count, slide.slide_number)}`}
                          >
                            {slide.word_count} words - {getWordCountBadge(slide.word_count, slide.slide_number)}
                          </Badge>
                        </div>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setSelectedSlideId(slide.id)}
                          className="h-6 px-2"
                        >
                          <Edit3 className="w-3 h-3" />
                        </Button>
                      </div>
                      <p className="mb-2 leading-relaxed">{slide.content}</p>
                    </div>
                  ))}

                  {/* Carousel Images Section Removed */}
                </div>
              </CardContent>
            )}
          </Card>
        );
      })}

      {/* Slide Editor Dialog */}
      {selectedSlideId && (
        <SlideEditor
          slideId={selectedSlideId}
          open={!!selectedSlideId}
          onClose={() => setSelectedSlideId(null)}
        />
      )}
    </div>
  );
};