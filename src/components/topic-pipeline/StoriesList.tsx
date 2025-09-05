import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ChevronDown, ChevronRight, CheckCircle, Eye, Edit3, Trash2, ExternalLink, RotateCcw, Loader2, ImageIcon, ChevronLeft, ChevronRightIcon } from "lucide-react";
import { InlineCarouselImages } from "@/components/InlineCarouselImages";
import { StyleTooltip } from "@/components/ui/style-tooltip";
import { useToast } from "@/hooks/use-toast";
import { useCredits } from "@/hooks/useCredits";
import { CreditService } from "@/lib/creditService";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { ImageModelSelector, ImageModel } from "@/components/ImageModelSelector";

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
  id?: string;
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
  slides: Slide[];
  article?: StoryArticle;
  articles?: StoryArticle;
  is_published?: boolean;
  content_generation_queue?: Array<{
    slidetype: string;
    tone: string;
    writing_style: string;
    audience_expertise: string;
  }>;
}

interface StoriesListProps {
  stories: Story[];
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
  onEditSlide: (slide: Slide) => void;
  onViewStory: (story: Story) => void;
  onRefresh?: () => void;
  expandCarouselSection?: (storyId: string) => void;
}

export const StoriesList: React.FC<StoriesListProps> = ({
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
  expandCarouselSection
}) => {
  const [generatingIllustrations, setGeneratingIllustrations] = useState<Set<string>>(new Set());
  const { toast } = useToast();
  const { credits } = useCredits();
  const { isSuperAdmin } = useAuth();

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const storiesPerPage = 10;
  
  // Calculate pagination
  const totalPages = Math.ceil(stories.length / storiesPerPage);
  const startIndex = (currentPage - 1) * storiesPerPage;
  const endIndex = startIndex + storiesPerPage;
  const currentStories = stories.slice(startIndex, endIndex);

  const handleGenerateIllustration = async (story: Story, model: ImageModel) => {
    if (generatingIllustrations.has(story.id)) return;
    
    // For regeneration, don't check if illustration exists
    
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
      
      if (result.success) {
        toast({
          title: story.cover_illustration_url ? 'Illustration Regenerated Successfully' : 'Illustration Generated Successfully',
          description: `Used ${result.credits_used} credits with ${model.name}. New balance: ${result.new_balance}`,
        });
        
        // Refresh stories to show the new illustration
        if (onRefresh) {
          await onRefresh();
        }
      } else {
        toast({
          title: 'Generation Failed',
          description: result.error || 'Failed to generate illustration',
          variant: 'destructive',
        });
      }
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
        
        // Force refresh to update story data
        if (onRefresh) {
          setTimeout(async () => {
            await onRefresh();
          }, 500); // Small delay to ensure backend update completes
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
    if (slideNumber === 1) return "text-blue-600"; // Title slide
    if (wordCount > 25) return "text-red-600"; // Too long
    if (wordCount < 15) return "text-yellow-600"; // Potentially too short
    return "text-green-600"; // Good length
  };

  const getWordCountBadge = (wordCount: number, slideNumber: number) => {
    if (slideNumber === 1) return "Title";
    if (wordCount > 25) return "Long";
    if (wordCount < 15) return "Short";
    return "Good";
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'ready':
        return <Badge className="bg-green-100 text-green-800 border-green-300">Ready</Badge>;
      case 'draft':
        return <Badge variant="outline">Draft</Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  if (stories.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>No Stories Ready</CardTitle>
          <CardDescription>
            Generated stories will appear here for review and approval.
          </CardDescription>
        </CardHeader>
      </Card>
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
        const article = story.article || story.articles;
        const isExpanded = expandedStories.has(story.id);
        const isAnimating = animatingStories.has(story.id);

        return (
          <Card key={story.id} className={`transition-all duration-300 hover:shadow-md ${
            isAnimating ? 'animate-slide-out-left opacity-0' : 'animate-fade-in'
          }`}>
            <CardHeader className="pb-3">
              <div className="mobile-card-header justify-between items-start">
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
                    {story.content_generation_queue?.[0] && (
                      <StyleTooltip 
                        styleChoices={{
                          slidetype: story.content_generation_queue[0].slidetype || '',
                          tone: story.content_generation_queue[0].tone || '',
                          writing_style: story.content_generation_queue[0].writing_style || '',
                          audience_expertise: story.content_generation_queue[0].audience_expertise || ''
                        }}
                      />
                    )}
                  </div>
                  
                  <div className="flex items-center gap-2 sm:gap-4 mobile-text-wrap text-muted-foreground flex-wrap">
                    {getStatusBadge(story.status)}
                    <span>{story.slides?.length || 0} slides</span>
                    <span>{article?.word_count || 0} words</span>
                    <span>
                      {new Date(story.created_at).toLocaleDateString()}
                    </span>
                    {article?.author && (
                      <span>by {article.author}</span>
                    )}
                  </div>
                </div>
                
                <div className="mobile-header-actions">
                  <div className="mobile-button-group">
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
                      <Eye className="w-4 h-4 sm:mr-0" />
                      <span className="ml-2 sm:hidden">View Images</span>
                    </Button>
                    {article?.source_url && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => window.open(article.source_url, '_blank')}
                        className="w-full sm:w-auto"
                      >
                        <ExternalLink className="w-4 h-4 sm:mr-0" />
                        <span className="ml-2 sm:hidden">Source</span>
                      </Button>
                    )}
                  </div>
                  
                  <div className="mobile-button-group">
                    {story.status === 'ready' && (
                      <>
                        {/* Story Illustration Button */}
                        <ImageModelSelector
                          onModelSelect={(model) => handleGenerateIllustration(story, model)}
                          isGenerating={generatingIllustrations.has(story.id)}
                          hasExistingImage={!!story.cover_illustration_url}
                        />
                        
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => onReturnToReview(story.id)}
                          className="w-full sm:w-auto"
                        >
                          <RotateCcw className="w-4 h-4 sm:mr-0" />
                          <span className="ml-2 sm:hidden">Return</span>
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
                            <>
                              <CheckCircle className="w-4 h-4 sm:mr-0" />
                              <span className="ml-2 sm:hidden">Approve</span>
                            </>
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
                            <>
                              <Trash2 className="w-4 h-4 sm:mr-0" />
                              <span className="ml-2 sm:hidden">Reject</span>
                            </>
                          )}
                        </Button>
                      </>
                    )}
                    
                    {/* Manual carousel generation removed - using automatic generation only */}
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
                          <div className="text-xs">
                            <ImageModelSelector
                              onModelSelect={(model) => handleGenerateIllustration(story, model)}
                              isGenerating={generatingIllustrations.has(story.id)}
                              hasExistingImage={false} // Force show regeneration options
                              size="sm"
                            />
                          </div>
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
                      className="flex items-start gap-3 p-3 border rounded-lg hover:bg-muted/50 transition-colors"
                    >
                      <div className="flex-shrink-0 w-8 h-8 bg-primary text-primary-foreground rounded-full flex items-center justify-center text-sm font-medium">
                        {slide.slide_number}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm leading-relaxed mb-2">
                          {slide.content}
                        </p>
                        <div className="flex items-center gap-2">
                          <Badge 
                            variant="outline" 
                            className={getWordCountColor(slide.word_count, slide.slide_number)}
                          >
                            {getWordCountBadge(slide.word_count, slide.slide_number)} ({slide.word_count} words)
                          </Badge>
                        </div>
                      </div>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => onEditSlide(slide)}
                        className="flex-shrink-0"
                      >
                        <Edit3 className="w-4 h-4" />
                      </Button>
                    </div>
                  ))}
                </div>

              </CardContent>
            )}
          </Card>
        );
      })}
      
      {/* Bottom Pagination Controls */}
      {stories.length > storiesPerPage && (
        <div className="flex items-center justify-center gap-2 pt-4">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
            disabled={currentPage === 1}
          >
            <ChevronLeft className="w-4 h-4" />
            Previous
          </Button>
          <span className="px-4 text-sm text-muted-foreground">
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
      )}
    </div>
  );
};