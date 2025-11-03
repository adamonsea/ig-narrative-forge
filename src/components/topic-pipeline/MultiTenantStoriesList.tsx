import { useState } from "react";
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
import { AnimateToggle } from "@/components/AnimateToggle";

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
  onRefresh
}) => {
  const [generatingIllustrations, setGeneratingIllustrations] = useState<Set<string>>(new Set());
  const [selectedSlideId, setSelectedSlideId] = useState<string | null>(null);
  const [forcingReturn, setForcingReturn] = useState<Set<string>>(new Set());
  const { toast } = useToast();
  const { credits } = useCredits();
  const { isSuperAdmin } = useAuth();
  const [animationEnabled, setAnimationEnabled] = useState<Record<string, boolean>>({});
  const [selectedModels, setSelectedModels] = useState<Record<string, ImageModel>>({});

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
    const shouldAnimate = animationEnabled[story.id] || false;
    const animationCredits = shouldAnimate ? 12 : 0;
    const totalCredits = model.credits + animationCredits;
    
    // Check credits (bypass for super admin)
    if (!isSuperAdmin && (!credits || credits.credits_balance < totalCredits)) {
      toast({
        title: 'Insufficient Credits',
        description: `You need ${totalCredits} credits (${model.credits} for image${shouldAnimate ? ' + 12 for animation' : ''}).`,
        variant: 'destructive',
      });
      return;
    }

    setGeneratingIllustrations(prev => new Set(prev.add(story.id)));
    setSelectedModels(prev => ({ ...prev, [story.id]: model }));

    try {
      // Generate static illustration
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
        title: shouldAnimate ? 'Illustration Generated - Animating...' : 'Illustration Generated Successfully',
        description: `Used ${result.credits_used} credits with ${model.name}${shouldAnimate ? '. Creating animation...' : ''}`,
      });

      // Animate if requested
      if (shouldAnimate && result.illustration_url) {
        try {
          const { data: animateResult, error: animateError } = await supabase.functions.invoke('animate-illustration', {
            body: { storyId: story.id, staticImageUrl: result.illustration_url }
          });
          if (animateError) throw animateError;
          if (animateResult?.success) {
            toast({ title: 'Animation Complete!', description: `Used ${animateResult.credits_used} credits. Balance: ${animateResult.new_balance}` });
          } else {
            toast({ title: 'Animation Failed', description: animateResult?.error || 'Failed to animate illustration', variant: 'destructive' });
          }
        } catch (e) {
          console.error('Animate error:', e);
          toast({ title: 'Animation Error', description: 'Failed to create animation, but static image was saved', variant: 'destructive' });
        }
      }

      if (onRefresh) await onRefresh();
    } catch (error) {
      console.error('Error generating illustration:', error);
      toast({ title: 'Error', description: 'Failed to generate story illustration', variant: 'destructive' });
    } finally {
      setGeneratingIllustrations(prev => { const next = new Set(prev); next.delete(story.id); return next; });
    }
  };

  const handleDeleteIllustration = async (storyId: string) => {
    try {
      const { data, error } = await supabase.functions.invoke('delete-story-illustration', {
        body: { storyId }
      });

      if (error) {
        throw error;
      }

      if (data?.success) {
        toast({
          title: 'Illustration Deleted',
          description: 'Cover illustration has been removed successfully.',
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
                  <div className="flex gap-2">
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
                  
                  <div className="flex gap-2">
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
                        <div className="flex flex-col gap-2">
                          <ImageModelSelector
                            onModelSelect={(model) => handleGenerateIllustration(story, model)}
                            isGenerating={generatingIllustrations.has(story.id)}
                            hasExistingImage={!!story.cover_illustration_url}
                          />
                          <AnimateToggle
                            isAnimated={animationEnabled[story.id] || false}
                            onToggle={(checked) => setAnimationEnabled(prev => ({ ...prev, [story.id]: !!checked }))}
                            disabled={generatingIllustrations.has(story.id)}
                            baseCredits={selectedModels[story.id]?.credits || 0}
                          />
                        </div>
                        
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
                        <h4 className="text-sm font-medium">Cover Illustration</h4>
                        <div className="flex gap-2">
                            <ImageModelSelector
                              onModelSelect={(model) => handleGenerateIllustration(story, model)}
                              isGenerating={generatingIllustrations.has(story.id)}
                              hasExistingImage={false}
                              size="sm"
                            />
                            <AnimateToggle
                              isAnimated={animationEnabled[story.id] || false}
                              onToggle={(checked) => setAnimationEnabled(prev => ({ ...prev, [story.id]: !!checked }))}
                              disabled={generatingIllustrations.has(story.id)}
                              baseCredits={selectedModels[story.id]?.credits || 0}
                            />
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleDeleteIllustration(story.id)}
                            className="text-xs text-red-600 hover:text-red-700"
                          >
                            Delete
                          </Button>
                        </div>
                      </div>
                      <div className="relative w-full max-w-md">
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