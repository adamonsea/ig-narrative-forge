import React, { useState, useMemo, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { ExternalLink, Archive, RotateCcw, Eye, Trash2, Save, Link, ChevronLeft, ChevronRight, Loader2, Clock, Zap, XCircle, AlertCircle } from "lucide-react";
import { formatDistanceToNow, format, isFuture } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useCredits } from "@/hooks/useCredits";
import { useAuth } from "@/hooks/useAuth";
import { CreditService } from "@/lib/creditService";
import { ImageModelSelector, ImageModel } from "@/components/ImageModelSelector";
import { AnimationQualitySelector, AnimationQuality } from "@/components/topic-pipeline/AnimationQualitySelector";
import { LinkEditor } from "@/components/LinkEditor";
import { MultiTenantQueueItem } from "@/hooks/useMultiTenantTopicPipeline";

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
  animated_illustration_url?: string | null;
  is_parliamentary?: boolean;
  scheduled_publish_at?: string | null;
  source_url?: string | null;
}

interface PublishedStoriesListProps {
  stories: PublishedStory[];
  processingItems?: MultiTenantQueueItem[];
  onArchive: (storyId: string, title: string) => void;
  onReturnToReview: (storyId: string) => void;
  onDelete: (storyId: string, title: string) => void;
  onViewStory: (story: PublishedStory) => void;
  onCancelProcessing?: (queueId: string) => void;
  onRefresh: () => void;
  loading?: boolean;
  topicSlug?: string;
  topicId?: string;
}

export const PublishedStoriesList: React.FC<PublishedStoriesListProps> = ({
  stories,
  processingItems = [],
  onArchive,
  onReturnToReview,
  onDelete,
  onViewStory,
  onCancelProcessing,
  onRefresh,
  loading = false,
  topicSlug,
  topicId
}) => {
  const { toast } = useToast();
  const { credits } = useCredits();
  const { isSuperAdmin } = useAuth();
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<Set<string>>(new Set());
  const [generatingIllustrations, setGeneratingIllustrations] = useState<Set<string>>(new Set());
  const [publishingNow, setPublishingNow] = useState<Set<string>>(new Set());
  const [cancellingQueue, setCancellingQueue] = useState<Set<string>>(new Set());
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
  const [illustrationStyle, setIllustrationStyle] = useState<string>('editorial_illustrative');

  const handleCancelQueueItem = async (queueId: string) => {
    if (!onCancelProcessing) return;
    setCancellingQueue(prev => new Set(prev.add(queueId)));
    try {
      await onCancelProcessing(queueId);
    } finally {
      setCancellingQueue(prev => {
        const next = new Set(prev);
        next.delete(queueId);
        return next;
      });
    }
  };

  const handlePublishNow = async (storyId: string, title: string) => {
    setPublishingNow(prev => new Set(prev.add(storyId)));
    try {
      const { error } = await supabase
        .from('stories')
        .update({ 
          scheduled_publish_at: null,
          status: 'published',
          is_published: true
        })
        .eq('id', storyId);
      
      if (error) throw error;
      
      toast({ 
        title: 'Published Immediately', 
        description: `"${title}" is now live.` 
      });
      
      onRefresh();
    } catch (e) {
      console.error('Error publishing story:', e);
      toast({ 
        title: 'Publish failed', 
        description: 'Could not publish story', 
        variant: 'destructive' 
      });
    } finally {
      setPublishingNow(prev => { const n = new Set(prev); n.delete(storyId); return n; });
    }
  };

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
            title: story.cover_illustration_url ? 'Illustration Regenerated Successfully' : 'Illustration Generated Successfully',
            description: `Used ${result.credits_used} credits with ${model.name}. New balance: ${result.new_balance}`,
          });
        }
        
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

  const handleAnimateIllustration = async (story: PublishedStory, quality: 'standard' | 'fast' = 'standard') => {
    const creditCost = quality === 'fast' ? 1 : 2;
    
    // Check credits based on quality tier
    if (!isSuperAdmin && (!credits || credits.credits_balance < creditCost)) {
      toast({ title: 'Insufficient Credits', description: `You need ${creditCost} credit${creditCost > 1 ? 's' : ''} to animate this illustration.`, variant: 'destructive' });
      return;
    }
    
    setGeneratingIllustrations(prev => new Set(prev.add(story.id)));
    
    try {
      const { data, error } = await supabase.functions.invoke('animate-illustration', {
        body: { 
          storyId: story.id, 
          staticImageUrl: story.cover_illustration_url,
          quality
        }
      });
      
      if (error) throw error;
      
      if (data?.success) {
        toast({ 
          title: 'Animation Complete!', 
          description: `${data.resolution} video created. Used ${data.credits_used} credit${data.credits_used > 1 ? 's' : ''}. New balance: ${data.new_balance}` 
        });
        onRefresh();
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

      if (error) {
        throw error;
      }

      if (data?.success) {
        toast({
          title: 'All Illustrations Deleted',
          description: 'Both static image and animation have been removed.',
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

  const handleDeleteAnimation = async (storyId: string) => {
    try {
      const { data, error } = await supabase.functions.invoke('delete-story-animation', {
        body: { storyId }
      });

      if (error) {
        throw error;
      }

      if (data?.success) {
        toast({
          title: 'Animation Deleted',
          description: 'Animation removed. Static image preserved.',
        });
        
        setTimeout(() => {
          onRefresh();
        }, 500);
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

  if (stories.length === 0 && processingItems.length === 0 && !loading) {
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
    <div className="space-y-3 sm:space-y-4">
      {/* Mobile-optimized header */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between border-b pb-3">
        {/* Filter pills - horizontal scroll on mobile */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0 -mx-1 px-1">
          <Button
            variant={storyFilter === 'all' ? 'default' : 'outline'}
            size="sm"
            onClick={() => { setStoryFilter('all'); setCurrentPage(1); }}
            className="h-7 text-xs shrink-0"
          >
            All ({stories.length})
          </Button>
          <Button
            variant={storyFilter === 'regular' ? 'default' : 'outline'}
            size="sm"
            onClick={() => { setStoryFilter('regular'); setCurrentPage(1); }}
            className="h-7 text-xs shrink-0"
          >
            Regular ({regularCount})
          </Button>
          {parliamentaryCount > 0 && (
            <Button
              variant={storyFilter === 'parliamentary' ? 'default' : 'outline'}
              size="sm"
              onClick={() => { setStoryFilter('parliamentary'); setCurrentPage(1); }}
              className="h-7 text-xs shrink-0"
            >
              Parliamentary ({parliamentaryCount})
            </Button>
          )}
        </div>
        
        {/* Right side: count + refresh */}
        <div className="flex items-center justify-between sm:justify-end gap-2">
          <span className="text-xs text-muted-foreground">
            {totalPages > 1 && `Page ${currentPage}/${totalPages}`}
          </span>
          <Button variant="ghost" size="sm" onClick={onRefresh} className="h-7 w-7 p-0">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
          </Button>
        </div>
      </div>

      {/* Processing items - grey cards at top */}
      {processingItems.length > 0 && (
        <div className="space-y-2">
          {processingItems.map((item) => (
            <Card key={item.id} className="border-muted bg-muted/30">
              <CardHeader className="py-3 px-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    {item.status === 'processing' ? (
                      <Loader2 className="h-4 w-4 text-muted-foreground animate-spin shrink-0" />
                    ) : item.status === 'failed' ? (
                      <AlertCircle className="h-4 w-4 text-destructive shrink-0" />
                    ) : (
                      <Clock className="h-4 w-4 text-muted-foreground shrink-0" />
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-muted-foreground truncate">
                        {item.article_title || item.title || 'Processing...'}
                      </p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <Badge variant="outline" className="text-[10px] h-4 px-1.5 bg-muted text-muted-foreground">
                          {item.status === 'processing' ? 'Generating' : item.status === 'failed' ? 'Failed' : 'Queued'}
                        </Badge>
                        <span className="text-[10px] text-muted-foreground">
                          {item.slidetype} • Attempt {item.attempts}/{item.max_attempts}
                        </span>
                      </div>
                      {item.error_message && (
                        <p className="text-[10px] text-destructive mt-1 line-clamp-1">
                          {item.error_message}
                        </p>
                      )}
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                    onClick={() => handleCancelQueueItem(item.id)}
                    disabled={cancellingQueue.has(item.id)}
                    title="Cancel"
                  >
                    {cancellingQueue.has(item.id) ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <XCircle className="h-4 w-4" />
                    )}
                  </Button>
                </div>
              </CardHeader>
            </Card>
          ))}
          {stories.length > 0 && <Separator className="my-3" />}
        </div>
      )}

      {/* Story cards */}
      {paginatedStories.map((story) => {
        const isScheduled = story.scheduled_publish_at && isFuture(new Date(story.scheduled_publish_at));
        const isLive = story.status === 'published';
        const isReady = story.status === 'ready' && !isScheduled;
        
        return (
        <Card key={story.id} className={`relative ${isScheduled ? 'border-amber-300 dark:border-amber-700' : isReady ? 'border-blue-300 dark:border-blue-700' : ''}`}>
          {/* Scheduled indicator bar */}
          {isScheduled && (
            <div className="bg-amber-50 dark:bg-amber-950/30 border-b border-amber-200 dark:border-amber-800 px-3 py-1.5 sm:px-4 rounded-t-lg">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-amber-700 dark:text-amber-400">
                  <Clock className="h-3 w-3 shrink-0" />
                  <span className="text-xs">
                    {format(new Date(story.scheduled_publish_at!), 'MMM d, h:mm a')}
                  </span>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-5 text-[10px] text-amber-700 dark:text-amber-400 hover:bg-amber-100 dark:hover:bg-amber-900/50 px-1.5"
                  onClick={() => handlePublishNow(story.id, story.title || story.headline || 'Untitled')}
                  disabled={publishingNow.has(story.id)}
                >
                  {publishingNow.has(story.id) ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <>
                      <Zap className="h-2.5 w-2.5 mr-0.5" />
                      Now
                    </>
                  )}
                </Button>
              </div>
            </div>
          )}
          
          {/* Ready/queued indicator bar - awaiting schedule assignment */}
          {isReady && (
            <div className="bg-blue-50 dark:bg-blue-950/30 border-b border-blue-200 dark:border-blue-800 px-3 py-1.5 sm:px-4 rounded-t-lg">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-blue-700 dark:text-blue-400">
                  <Loader2 className="h-3 w-3 animate-spin shrink-0" />
                  <span className="text-xs">
                    Awaiting schedule assignment
                  </span>
                </div>
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-5 text-[10px] text-blue-700 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-900/50 px-1.5"
                    onClick={async () => {
                      if (!topicId) return;
                      try {
                        await supabase.functions.invoke('drip-feed-scheduler', {
                          body: { topic_id: topicId }
                        });
                        toast({ title: 'Scheduler triggered', description: 'Schedule times are being assigned.' });
                        setTimeout(onRefresh, 1500);
                      } catch (e) {
                        console.error('Error triggering scheduler:', e);
                      }
                    }}
                    title="Trigger scheduler to assign a publish time"
                  >
                    <Clock className="h-2.5 w-2.5 mr-0.5" />
                    Assign Time
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-5 text-[10px] text-blue-700 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-900/50 px-1.5"
                    onClick={() => handlePublishNow(story.id, story.title || story.headline || 'Untitled')}
                    disabled={publishingNow.has(story.id)}
                  >
                    {publishingNow.has(story.id) ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <>
                        <Zap className="h-2.5 w-2.5 mr-0.5" />
                        Publish Now
                      </>
                    )}
                  </Button>
                </div>
              </div>
            </div>
          )}
          
          <CardHeader className={`pb-2 ${(isScheduled || isReady) ? 'pt-2' : ''}`}>
            <div className="flex items-start gap-3">
              {/* Status indicator dot */}
              <div className={`mt-1.5 h-2.5 w-2.5 rounded-full shrink-0 ${
                isLive ? 'bg-green-500' : 
                isScheduled ? 'bg-amber-500' : 
                'bg-blue-500'
              }`} />
              
              <div className="flex-1 min-w-0">
                <CardTitle className="text-sm sm:text-base font-medium leading-snug mb-1.5">
                  {story.title || story.headline}
                </CardTitle>
                <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                  {isLive && (
                    <Badge variant="default" className="h-5 text-[10px] bg-green-600">Live</Badge>
                  )}
                  {story.is_parliamentary && (
                    <Badge variant="secondary" className="h-5 text-[10px]">Parliament</Badge>
                  )}
                  {story.author && <span className="truncate max-w-[100px]">{story.author}</span>}
                  <span>•</span>
                  <span>{formatDistanceToNow(new Date(story.created_at), { addSuffix: true })}</span>
                </div>
              </div>

              {/* Thumbnail - desktop only */}
              {story.cover_illustration_url && (
                <div className="hidden sm:block shrink-0">
                  <img 
                    src={story.cover_illustration_url} 
                    alt="" 
                    className="w-16 h-16 object-cover rounded-md"
                  />
                </div>
              )}
            </div>
          </CardHeader>

          <CardContent className="pt-0 pb-3">
            {story.summary && (
              <p className="text-xs sm:text-sm text-muted-foreground mb-3 line-clamp-2 pl-5">
                {story.summary}
              </p>
            )}

            {/* Action buttons - mobile optimized */}
            <div className="flex items-center gap-1.5 flex-wrap pl-5">
              <Button
                variant={expanded.has(story.id) ? "default" : "outline"}
                size="sm"
                onClick={() => toggleExpanded(story.id)}
                className="h-7 text-xs px-2"
              >
                <Eye className="h-3 w-3 sm:mr-1" />
                <span className="hidden sm:inline">{expanded.has(story.id) ? 'Hide Slides' : 'Preview & Edit'}</span>
                <span className="sm:hidden">{expanded.has(story.id) ? 'Hide' : 'Preview'}</span>
              </Button>

              <ImageModelSelector
                onModelSelect={(model) => handleGenerateIllustration(story, model)}
                isGenerating={generatingIllustrations.has(story.id)}
                hasExistingImage={!!story.cover_illustration_url}
                illustrationStyle={illustrationStyle as any}
                size="sm"
              />

              <Button
                variant="outline"
                size="sm"
                onClick={() => onReturnToReview(story.id)}
                className="h-7 text-xs px-2"
                title="Return to review"
              >
                <RotateCcw className="h-3 w-3 sm:mr-1" />
                <span className="hidden sm:inline">Unpublish</span>
              </Button>

              {/* Source URL link */}
              {story.source_url && (
                <Button
                  variant="ghost"
                  size="sm"
                  asChild
                  className="h-7 w-7 p-0 ml-auto"
                  title="View source article"
                >
                  <a href={story.source_url} target="_blank" rel="noopener noreferrer">
                    <Link className="h-3.5 w-3.5" />
                  </a>
                </Button>
              )}

              {/* Story page link */}
              {topicSlug && isLive && (
                <Button
                  variant="ghost"
                  size="sm"
                  asChild
                  className="h-7 w-7 p-0"
                  title="View story"
                >
                  <a href={`/feed/${topicSlug}/story/${story.id}`} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="h-3.5 w-3.5" />
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
                          <AnimationQualitySelector
                            onAnimate={(quality) => handleAnimateIllustration(story, quality)}
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
      )
      })}

      {/* Pagination Controls */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-1 sm:gap-2 mt-6 px-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
            disabled={currentPage === 1}
            className="px-2 sm:px-3"
          >
            <ChevronLeft className="h-4 w-4" />
            <span className="hidden sm:inline ml-1">Previous</span>
          </Button>
          
          <div className="flex items-center gap-1">
            {/* Smart pagination: show first, last, current, and neighbors */}
            {(() => {
              const pages: (number | 'ellipsis')[] = [];
              const showPages = new Set<number>();
              
              // Always show first and last
              showPages.add(1);
              showPages.add(totalPages);
              
              // Show current and neighbors
              for (let i = Math.max(1, currentPage - 1); i <= Math.min(totalPages, currentPage + 1); i++) {
                showPages.add(i);
              }
              
              const sortedPages = Array.from(showPages).sort((a, b) => a - b);
              
              sortedPages.forEach((page, idx) => {
                if (idx > 0 && page - sortedPages[idx - 1] > 1) {
                  pages.push('ellipsis');
                }
                pages.push(page);
              });
              
              return pages.map((item, idx) => 
                item === 'ellipsis' ? (
                  <span key={`ellipsis-${idx}`} className="px-1 text-muted-foreground">…</span>
                ) : (
                  <Button
                    key={item}
                    variant={item === currentPage ? "default" : "outline"}
                    size="sm"
                    onClick={() => setCurrentPage(item)}
                    className="w-8 h-8 p-0"
                  >
                    {item}
                  </Button>
                )
              );
            })()}
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
            disabled={currentPage === totalPages}
            className="px-2 sm:px-3"
          >
            <span className="hidden sm:inline mr-1">Next</span>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      )}
    </div>
  );
};