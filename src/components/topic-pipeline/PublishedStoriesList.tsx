import React, { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { ExternalLink, Archive, RotateCcw, Eye, Trash2, Save, Link, ChevronLeft, ChevronRight } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useCredits } from "@/hooks/useCredits";
import { useAuth } from "@/hooks/useAuth";
import { CreditService } from "@/lib/creditService";
import { ImageModelSelector, ImageModel } from "@/components/ImageModelSelector";
import { LinkEditor } from "@/components/LinkEditor";
import { AnimateToggle } from "@/components/AnimateToggle";

interface Link {
  start: number;
  end: number;
  url: string;
  text: string;
}

interface Slide {
  id: string;
  slide_number: number;
  content: string;
  word_count?: number;
  alt_text?: string;
  visual_prompt?: string;
  links?: Link[];
}

interface PublishedStory {
  id: string;
  title?: string; // Make optional to match MultiTenantStory
  headline?: string; // Keep headline for compatibility  
  summary?: string;
  author?: string;
  status: string;
  is_published: boolean;
  created_at: string;
  updated_at: string;
  slides: Slide[];
  article_id?: string;
  topic_article_id?: string;
  story_type?: 'legacy' | 'multi_tenant';
  cover_illustration_url?: string | null;
  cover_illustration_prompt?: string | null;
  illustration_generated_at?: string | null;
  is_parliamentary?: boolean;
}

interface PublishedStoriesListProps {
  stories: PublishedStory[];
  onArchive: (storyId: string, title: string) => void;
  onReturnToReview: (storyId: string) => void;
  onDelete: (storyId: string, title: string) => void;
  onViewStory: (story: PublishedStory) => void;
  onRefresh: () => void;
  loading?: boolean;
  topicSlug?: string;
}

export const PublishedStoriesList: React.FC<PublishedStoriesListProps> = ({
  stories,
  onArchive,
  onReturnToReview,
  onDelete,
  onViewStory,
  onRefresh,
  loading = false,
  topicSlug
}) => {
  const { toast } = useToast();
  const { credits } = useCredits();
  const { isSuperAdmin } = useAuth();
  const [animationEnabled, setAnimationEnabled] = useState<Record<string, boolean>>({});
  const [selectedModels, setSelectedModels] = useState<Record<string, ImageModel>>({});
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<Set<string>>(new Set());
  const [generatingIllustrations, setGeneratingIllustrations] = useState<Set<string>>(new Set());
  const [coverSelectionModal, setCoverSelectionModal] = useState<{ 
    isOpen: boolean; 
    storyId?: string; 
    storyTitle?: string;
    coverOptions?: any[];
    selectedCoverId?: string;
  }>({ isOpen: false });
  const [linkEditorSlide, setLinkEditorSlide] = useState<Slide | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [storyFilter, setStoryFilter] = useState<'all' | 'regular' | 'parliamentary'>('all');
  const pageSize = 10;

  const filteredStories = useMemo(() => {
    if (storyFilter === 'all') return stories;
    if (storyFilter === 'parliamentary') return stories.filter(s => s.is_parliamentary);
    return stories.filter(s => !s.is_parliamentary);
  }, [stories, storyFilter]);

  const paginatedStories = useMemo(() => {
    const startIndex = (currentPage - 1) * pageSize;
    const endIndex = startIndex + pageSize;
    return filteredStories.slice(startIndex, endIndex);
  }, [filteredStories, currentPage, pageSize]);

  const totalPages = Math.ceil(filteredStories.length / pageSize);

  const toggleExpanded = (id: string) => {
    setExpanded(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const saveSlide = async (slideId: string) => {
    const content = edits[slideId];
    if (content === undefined) return;
    setSaving(prev => new Set([...prev, slideId]));
    try {
      // Calculate word count
      const wordCount = content.trim().split(/\s+/).filter(word => word.length > 0).length;
      
      const { error } = await supabase
        .from('slides')
        .update({ 
          content,
          word_count: wordCount,
          updated_at: new Date().toISOString()
        })
        .eq('id', slideId);
      
      if (error) throw error;
      
      toast({ title: 'Slide saved', description: 'Changes have been saved and will appear in feeds shortly.' });
      
      // Clear edit state after successful save
      setEdits(prev => {
        const next = { ...prev };
        delete next[slideId];
        return next;
      });
      
      setSaving(prev => { const n = new Set(prev); n.delete(slideId); return n; });
      
      // Trigger a refresh after a short delay to show updated content
      setTimeout(() => {
        onRefresh();
      }, 500);
    } catch (e) {
      console.error('Error saving slide', e);
      toast({ title: 'Save failed', description: 'Could not save slide', variant: 'destructive' });
      setSaving(prev => { const n = new Set(prev); n.delete(slideId); return n; });
    }
  };


  const handleGenerateIllustration = async (story: PublishedStory, model: ImageModel) => {
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
      
      if (result.success) {
        toast({
          title: story.cover_illustration_url ? 'Illustration Regenerated Successfully' : 'Illustration Generated Successfully',
          description: `Used ${result.credits_used} credits with ${model.name}. New balance: ${result.new_balance}`,
        });
        
        // Refresh stories to show the new illustration
        onRefresh();
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
        
        setTimeout(() => {
          onRefresh();
        }, 500);
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
  const handleSaveLinks = async (slide: Slide, links: Link[]) => {
    try {
      const { error } = await supabase
        .from('slides')
        .update({ 
          links: links as any, // Cast to any for Supabase JSONB compatibility
          updated_at: new Date().toISOString()
        })
        .eq('id', slide.id);

      if (error) throw error;

      toast({ 
        title: 'Links saved', 
        description: `${links.length} links updated for slide ${slide.slide_number}` 
      });

      // Update local state
      setTimeout(() => {
        onRefresh();
      }, 500);

    } catch (error) {
      console.error('Error saving links:', error);
      toast({ 
        title: 'Error', 
        description: 'Failed to save links', 
        variant: 'destructive' 
      });
    }
  };

  const renderContentWithLinks = (content: string, links: Link[] = []) => {
    if (!links || links.length === 0) {
      return <span>{content}</span>;
    }

    const parts = [];
    let lastIndex = 0;

    // Sort links by start position
    const sortedLinks = [...links].sort((a, b) => a.start - b.start);

    sortedLinks.forEach((link, index) => {
      // Add text before link
      if (link.start > lastIndex) {
        parts.push(
          <span key={`text-${index}`}>
            {content.substring(lastIndex, link.start)}
          </span>
        );
      }

      // Add link
      parts.push(
        <a
          key={`link-${index}`}
          href={link.url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-primary hover:underline font-medium inline-flex items-center gap-1"
        >
          {link.text}
          <ExternalLink className="h-3 w-3" />
        </a>
      );

      lastIndex = link.end;
    });

    // Add remaining text
    if (lastIndex < content.length) {
      parts.push(
        <span key="text-end">
          {content.substring(lastIndex)}
        </span>
      );
    }

    return <>{parts}</>;
  };

  if (loading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="animate-pulse">
            <div className="h-32 bg-muted rounded-lg"></div>
          </div>
        ))}
      </div>
    );
  }

  if (stories.length === 0) {
    return (
      <div className="text-center py-12">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-muted">
          <Eye className="h-6 w-6 text-muted-foreground" />
        </div>
        <h3 className="mb-2 text-lg font-semibold">No Published Stories</h3>
        <p className="mb-4 text-muted-foreground">
          Published stories will appear here when approved from arrivals.
        </p>
        <Button variant="outline" onClick={onRefresh}>
          <RotateCcw className="mr-2 h-4 w-4" />
          Refresh
        </Button>
      </div>
    );
  }

  const parliamentaryCount = stories.filter(s => s.is_parliamentary).length;
  const regularCount = stories.length - parliamentaryCount;

  const getStatusColor = (story: PublishedStory) => {
    if (story.is_published && story.status === 'published') return 'default';
    if (story.status === 'ready') return 'secondary';
    return 'outline';
  };

  const getStatusLabel = (story: PublishedStory) => {
    if (story.is_published && story.status === 'published') return 'Live';
    if (story.status === 'ready') return 'Ready';
    return 'Draft';
  };

  console.log('🎬 PublishedStoriesList render debug:', {
    storiesCount: stories.length,
    storiesWithSlides: stories.filter(s => s.slides && s.slides.length > 0).length,
    expandedStories: Array.from(expanded),
    firstStory: stories[0] ? {
      id: stories[0].id,
      title: stories[0].title || stories[0].headline,
      slidesCount: stories[0].slides?.length || 0,
      hasSlides: !!(stories[0].slides && stories[0].slides.length > 0)
    } : null
  });

  return (
    <div className="space-y-4">
      {/* Filter Tabs */}
      <div className="flex items-center gap-2 border-b pb-2">
        <Button
          variant={storyFilter === 'all' ? 'default' : 'ghost'}
          size="sm"
          onClick={() => { setStoryFilter('all'); setCurrentPage(1); }}
        >
          All Stories ({stories.length})
        </Button>
        <Button
          variant={storyFilter === 'regular' ? 'default' : 'ghost'}
          size="sm"
          onClick={() => { setStoryFilter('regular'); setCurrentPage(1); }}
        >
          Regular ({regularCount})
        </Button>
        <Button
          variant={storyFilter === 'parliamentary' ? 'default' : 'ghost'}
          size="sm"
          onClick={() => { setStoryFilter('parliamentary'); setCurrentPage(1); }}
        >
          Parliamentary ({parliamentaryCount})
        </Button>
      </div>

      <div className="flex items-center justify-between">
        <div className="text-sm text-muted-foreground">
          {filteredStories.length} {storyFilter !== 'all' ? storyFilter + ' ' : ''}
          {filteredStories.length === 1 ? 'story' : 'stories'}
          {totalPages > 1 && (
            <span className="ml-2">
              • Page {currentPage} of {totalPages}
            </span>
          )}
        </div>
        <Button variant="outline" size="sm" onClick={onRefresh}>
          <RotateCcw className="mr-2 h-4 w-4" />
          Refresh
        </Button>
      </div>

      {paginatedStories.map((story) => (
        <Card key={story.id} className="relative">
          <CardHeader className="pb-3">
            <div className="flex items-start justify-between">
              <div className="flex-1 min-w-0">
                <CardTitle className="text-base font-medium leading-tight mb-2">
                  {story.title || story.headline}
                </CardTitle>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Badge variant={getStatusColor(story)} className="text-xs">
                    {getStatusLabel(story)}
                  </Badge>
                  {story.is_parliamentary && (
                    <Badge variant="default" className="text-xs bg-blue-600">
                      Parliamentary
                    </Badge>
                  )}
                  {story.author && (
                    <>
                      <span>•</span>
                      <span>{story.author}</span>
                    </>
                  )}
                  <span>•</span>
                  <span>{formatDistanceToNow(new Date(story.created_at), { addSuffix: true })}</span>
                </div>
              </div>
            </div>
          </CardHeader>

          <CardContent className="pt-0">
            {story.summary && (
              <p className="text-sm text-muted-foreground mb-4 line-clamp-2">
                {story.summary}
              </p>
            )}

            <Separator className="my-4" />

            {/* Action Buttons */}
            <div className="flex items-center gap-2 flex-wrap">
              <Button
                variant="outline"
                size="sm"
                onClick={() => toggleExpanded(story.id)}
                className="h-8"
              >
                <Eye className="mr-1 h-3 w-3" />
                {expanded.has(story.id) ? 'Hide' : 'View'}
              </Button>

              {/* Cover Generation Button */}
              <div className="flex flex-col gap-2">
                <ImageModelSelector
                  onModelSelect={(model) => handleGenerateIllustration(story, model)}
                  isGenerating={generatingIllustrations.has(story.id)}
                  hasExistingImage={!!story.cover_illustration_url}
                  size="sm"
                />
                <AnimateToggle
                  isAnimated={animationEnabled[story.id] || false}
                  onToggle={(checked) => setAnimationEnabled(prev => ({ ...prev, [story.id]: !!checked }))}
                  disabled={generatingIllustrations.has(story.id)}
                  baseCredits={selectedModels[story.id]?.credits || 0}
                />
              </div>

              <Button
                variant="outline"
                size="sm"
                onClick={() => onArchive(story.id, story.title || story.headline || 'Untitled')}
                className="h-8"
              >
                <Archive className="mr-1 h-3 w-3" />
                Archive
              </Button>

              <Button
                variant="outline"
                size="sm"
                onClick={() => onReturnToReview(story.id)}
                className="h-8"
              >
                <RotateCcw className="mr-1 h-3 w-3" />
                Return
              </Button>

              <Button
                variant="outline"
                size="sm"
                onClick={() => onDelete(story.id, story.title || story.headline || 'Untitled')}
                className="h-8 text-destructive hover:text-destructive"
              >
                <Trash2 className="mr-1 h-3 w-3" />
                Delete
              </Button>

              {topicSlug && story.is_published && (
                <Button
                  variant="outline"
                  size="sm"
                  asChild
                  className="h-8"
                >
                  <a href={`/@${topicSlug}/${story.id}`} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="mr-1 h-3 w-3" />
                    View Story
                  </a>
                </Button>
              )}

              {!topicSlug && story.is_published && (
                <Button 
                  variant="ghost"
                  size="sm"
                  asChild
                  className="h-8 ml-auto"
                >
                  <a 
                    href={topicSlug ? `/feed/${topicSlug}/story/${story.id}` : `/story/${story.id}`} 
                    target="_blank" 
                    rel="noopener noreferrer"
                  >
                    <ExternalLink className="h-3 w-3" />
                  </a>
                </Button>
              )}
            </div>

            {/* Expandable Slide Content */}
            {expanded.has(story.id) && (
              <div className="mt-4 border-t pt-4">
                {(() => {
                  console.log('🎬 Rendering expanded story:', {
                    storyId: story.id,
                    slidesCount: story.slides?.length || 0,
                    slides: story.slides
                  });
                  return null;
                })()}
                {/* Show cover illustration if exists */}
                {story.cover_illustration_url && (
                  <div className="mb-4 bg-muted/30 rounded-lg p-4">
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
                        alt={`Cover illustration for ${story.title || story.headline}`}
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
                
                <div className="space-y-4">
                  <h4 className="text-sm font-medium">Slides ({story.slides.length})</h4>
                  {story.slides.map((slide, index) => (
                    <div key={slide.id} className="border rounded-lg p-4 bg-muted/20">
                      <div className="flex justify-between items-center mb-3">
                        <span className="text-sm font-medium text-muted-foreground">
                          Slide {slide.slide_number || index + 1}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {slide.word_count || 0} words
                        </span>
                      </div>
                      
                      <div className="space-y-3">
                        <div className="bg-background rounded p-3">
                          {edits[slide.id] !== undefined ? (
                            <Textarea
                              value={edits[slide.id]}
                              onChange={(e) => setEdits(prev => ({ ...prev, [slide.id]: e.target.value }))}
                              className="min-h-[120px] border-0 bg-transparent resize-none focus-visible:ring-0"
                              placeholder="Slide content..."
                            />
                          ) : (
                            <p className="text-sm leading-relaxed">
                              {renderContentWithLinks(slide.content, slide.links)}
                            </p>
                          )}
                        </div>
                        
                        <div className="flex items-center gap-2">
                          {edits[slide.id] !== undefined ? (
                            <>
                              <Button
                                type="button"
                                size="sm"
                                onClick={() => saveSlide(slide.id)}
                                disabled={saving.has(slide.id)}
                              >
                                <Save className="mr-1 h-3 w-3" />
                                {saving.has(slide.id) ? 'Saving...' : 'Save'}
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setEdits(prev => {
                                  const next = { ...prev };
                                  delete next[slide.id];
                                  return next;
                                })}
                              >
                                Cancel
                              </Button>
                            </>
                          ) : (
                            <>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setEdits(prev => ({ ...prev, [slide.id]: slide.content }))}
                              >
                                Edit
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setLinkEditorSlide(slide)}
                              >
                                <Link className="mr-1 h-3 w-3" />
                                Links ({slide.links?.length || 0})
                              </Button>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                   ))}
                </div>
               </div>
             )}

            {/* Link Editor Dialog */}
            {linkEditorSlide && (
              <LinkEditor
                content={linkEditorSlide.content}
                existingLinks={linkEditorSlide.links || []}
                onSaveLinks={(links) => handleSaveLinks(linkEditorSlide, links)}
                open={!!linkEditorSlide}
                onClose={() => setLinkEditorSlide(null)}
              />
            )}
           </CardContent>
          </Card>
      ))}

      {/* Pagination Controls */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 mt-6">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
            disabled={currentPage === 1}
          >
            <ChevronLeft className="h-4 w-4" />
            Previous
          </Button>
          
          <div className="flex items-center gap-1">
            {Array.from({ length: totalPages }, (_, i) => i + 1).map((pageNum) => (
              <Button
                key={pageNum}
                variant={pageNum === currentPage ? "default" : "outline"}
                size="sm"
                onClick={() => setCurrentPage(pageNum)}
                className="w-8 h-8 p-0"
              >
                {pageNum}
              </Button>
            ))}
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
            disabled={currentPage === totalPages}
          >
            Next
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      )}
    </div>
  );
};