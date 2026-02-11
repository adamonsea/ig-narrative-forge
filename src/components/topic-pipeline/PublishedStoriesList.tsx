import React, { useState, useMemo, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ExternalLink, Archive, RotateCcw, Eye, Trash2, Save, Link, ChevronLeft, ChevronRight, Loader2, Clock, Zap, XCircle, AlertCircle, MoreHorizontal, ImageIcon, Film } from "lucide-react";
import { formatDistanceToNow, format, isFuture } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useCredits } from "@/hooks/useCredits";
import { useAuth } from "@/hooks/useAuth";
import { CreditService } from "@/lib/creditService";
import { ImageModelSelector, ImageModel } from "@/components/ImageModelSelector";
import { AnimationQualitySelector, AnimationQuality } from "@/components/topic-pipeline/AnimationQualitySelector";
import { AnimationInstructionsModal } from "@/components/topic-pipeline/AnimationInstructionsModal";
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
  title?: string;
  headline?: string;
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
  animation_suggestions?: string[] | null;
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
  const [animatingVideos, setAnimatingVideos] = useState<Set<string>>(new Set());
  const [publishingNow, setPublishingNow] = useState<Set<string>>(new Set());
  const [cancellingQueue, setCancellingQueue] = useState<Set<string>>(new Set());
  const [linkEditorSlide, setLinkEditorSlide] = useState<Slide | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [storyFilter, setStoryFilter] = useState<'all' | 'regular' | 'parliamentary'>('all');
  const pageSize = 10;
  const [illustrationStyle, setIllustrationStyle] = useState<string>('editorial_illustrative');
  const [animationModalStory, setAnimationModalStory] = useState<PublishedStory | null>(null);

  const handleCancelQueueItem = async (queueId: string) => {
    if (!onCancelProcessing) return;
    setCancellingQueue(prev => new Set(prev.add(queueId)));
    try {
      await onCancelProcessing(queueId);
    } finally {
      setCancellingQueue(prev => { const next = new Set(prev); next.delete(queueId); return next; });
    }
  };

  const handlePublishNow = async (storyId: string, title: string) => {
    setPublishingNow(prev => new Set(prev.add(storyId)));
    try {
      const { error } = await supabase
        .from('stories')
        .update({ scheduled_publish_at: null, status: 'published', is_published: true })
        .eq('id', storyId);
      if (error) throw error;
      toast({ title: 'Published Immediately', description: `"${title}" is now live.` });
      onRefresh();
    } catch (e) {
      console.error('Error publishing story:', e);
      toast({ title: 'Publish failed', description: 'Could not publish story', variant: 'destructive' });
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
    return filteredStories.slice(startIndex, startIndex + pageSize);
  }, [filteredStories, currentPage, pageSize]);

  const totalPages = Math.ceil(filteredStories.length / pageSize);

  useEffect(() => {
    if (topicId) {
      const fetchIllustrationStyle = async () => {
        const { data, error } = await supabase
          .from('topics')
          .select('illustration_style')
          .eq('id', topicId)
          .single();
        if (data && !error) setIllustrationStyle(data.illustration_style || 'editorial_illustrative');
      };
      fetchIllustrationStyle();
    }
  }, [topicId]);

  const toggleExpanded = (id: string) => {
    setExpanded(prev => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next; });
  };

  const saveSlide = async (slideId: string) => {
    const content = edits[slideId];
    if (content === undefined) return;
    setSaving(prev => new Set([...prev, slideId]));
    try {
      const wordCount = content.trim().split(/\s+/).filter(word => word.length > 0).length;
      const { error } = await supabase.from('slides').update({ content, word_count: wordCount, updated_at: new Date().toISOString() }).eq('id', slideId);
      if (error) throw error;
      toast({ title: 'Slide saved', description: 'Changes saved.' });
      setEdits(prev => { const next = { ...prev }; delete next[slideId]; return next; });
      setSaving(prev => { const n = new Set(prev); n.delete(slideId); return n; });
      setTimeout(() => onRefresh(), 500);
    } catch (e) {
      console.error('Error saving slide', e);
      toast({ title: 'Save failed', description: 'Could not save slide', variant: 'destructive' });
      setSaving(prev => { const n = new Set(prev); n.delete(slideId); return n; });
    }
  };

  const handleGenerateIllustration = async (story: PublishedStory, model: ImageModel) => {
    if (generatingIllustrations.has(story.id)) return;
    if (!isSuperAdmin && (!credits || credits.credits_balance < model.credits)) {
      toast({ title: 'Insufficient Credits', description: `You need ${model.credits} credits.`, variant: 'destructive' });
      return;
    }
    setGeneratingIllustrations(prev => new Set(prev.add(story.id)));
    try {
      const result = await CreditService.generateStoryIllustration(story.id, model.id);
      if (result.success) {
        if (result.used_fallback) {
          toast({ title: 'Image Generated with Fallback', description: `${result.fallback_reason} (Used: ${result.fallback_model})`, duration: 8000 });
        } else {
          toast({ title: 'Illustration Generated', description: `Used ${result.credits_used} credits with ${model.name}.` });
        }
        onRefresh();
      } else {
        toast({ title: 'Generation Failed', description: result.error || 'Failed to generate', variant: 'destructive' });
      }
    } catch (error) {
      console.error('Error generating illustration:', error);
      toast({ title: 'Error', description: 'Failed to generate illustration', variant: 'destructive' });
    } finally {
      setGeneratingIllustrations(prev => { const next = new Set(prev); next.delete(story.id); return next; });
    }
  };

  const handleAnimateIllustration = async (story: PublishedStory, quality: 'standard' | 'fast' = 'standard', customPrompt?: string) => {
    const creditCost = quality === 'fast' ? 1 : 2;
    if (!isSuperAdmin && (!credits || credits.credits_balance < creditCost)) {
      toast({ title: 'Insufficient Credits', description: `You need ${creditCost} credits.`, variant: 'destructive' });
      return;
    }
    setAnimatingVideos(prev => new Set(prev.add(story.id)));
    try {
      const { data, error } = await supabase.functions.invoke('animate-illustration', {
        body: { storyId: story.id, staticImageUrl: story.cover_illustration_url, quality, customPrompt }
      });
      if (error) throw error;
      if (data?.success) {
        toast({ title: 'Animation Complete!', description: `${data.resolution} video created.` });
        onRefresh();
      } else {
        toast({ title: 'Animation Failed', description: data?.error || 'Failed', variant: 'destructive' });
      }
    } catch (e) {
      console.error('Animation error:', e);
      toast({ title: 'Animation Error', description: 'Failed to create animation', variant: 'destructive' });
    } finally {
      setAnimatingVideos(prev => { const next = new Set(prev); next.delete(story.id); return next; });
    }
  };

  const handleDeleteIllustration = async (storyId: string) => {
    try {
      const { data, error } = await supabase.functions.invoke('delete-story-illustration', { body: { storyId } });
      if (error) throw error;
      if (data?.success) {
        toast({ title: 'Illustrations Deleted' });
        setTimeout(() => onRefresh(), 500);
      } else throw new Error(data?.error || 'Failed');
    } catch (error) {
      console.error('Error deleting illustration:', error);
      toast({ title: 'Error', description: error instanceof Error ? error.message : 'Failed', variant: 'destructive' });
    }
  };

  const handleDeleteAnimation = async (storyId: string) => {
    try {
      const { data, error } = await supabase.functions.invoke('delete-story-animation', { body: { storyId } });
      if (error) throw error;
      if (data?.success) {
        toast({ title: 'Animation Deleted' });
        setTimeout(() => onRefresh(), 500);
      } else throw new Error(data?.error || 'Failed');
    } catch (error) {
      console.error('Error deleting animation:', error);
      toast({ title: 'Error', description: error instanceof Error ? error.message : 'Failed', variant: 'destructive' });
    }
  };

  const handleSaveLinks = async (slide: Slide, links: Link[]) => {
    try {
      const { error } = await supabase.from('slides').update({ links: links as any, updated_at: new Date().toISOString() }).eq('id', slide.id);
      if (error) throw error;
      toast({ title: 'Links saved', description: `${links.length} links updated` });
      setTimeout(() => onRefresh(), 500);
    } catch (error) {
      console.error('Error saving links:', error);
      toast({ title: 'Error', description: 'Failed to save links', variant: 'destructive' });
    }
  };

  const renderContentWithLinks = (content: string, links: Link[] = []) => {
    if (!links || links.length === 0) return <span>{content}</span>;
    const parts: React.ReactNode[] = [];
    let lastIndex = 0;
    const sortedLinks = [...links].sort((a, b) => a.start - b.start);
    sortedLinks.forEach((link, index) => {
      if (link.start > lastIndex) parts.push(<span key={`text-${index}`}>{content.substring(lastIndex, link.start)}</span>);
      parts.push(
        <a key={`link-${index}`} href={link.url} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline font-medium inline-flex items-center gap-1">
          {link.text}<ExternalLink className="h-3 w-3" />
        </a>
      );
      lastIndex = link.end;
    });
    if (lastIndex < content.length) parts.push(<span key="text-end">{content.substring(lastIndex)}</span>);
    return <>{parts}</>;
  };

  if (stories.length === 0 && processingItems.length === 0 && !loading) {
    return (
      <div className="text-center py-12">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-muted">
          <Eye className="h-6 w-6 text-muted-foreground" />
        </div>
        <h3 className="mb-2 text-lg font-semibold">No Published Stories</h3>
        <p className="mb-4 text-muted-foreground">Published stories will appear here when approved.</p>
        <Button variant="outline" onClick={onRefresh}>
          <RotateCcw className="mr-2 h-4 w-4" />
          Refresh
        </Button>
      </div>
    );
  }

  const parliamentaryCount = stories.filter(s => s.is_parliamentary).length;
  const regularCount = stories.length - parliamentaryCount;

  const getStatusLabel = (story: PublishedStory) => {
    if (story.is_published && story.status === 'published') return 'Live';
    if (story.status === 'ready') return 'Ready';
    return 'Draft';
  };

  const totalWordCount = (slides: Slide[]) => slides.reduce((sum, s) => sum + (s.word_count || 0), 0);

  return (
    <div className="space-y-3">
      {/* Header with filter pills */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between border-b pb-3">
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
          <Button variant={storyFilter === 'all' ? 'default' : 'outline'} size="sm" onClick={() => { setStoryFilter('all'); setCurrentPage(1); }} className="h-7 text-xs shrink-0">
            All ({stories.length})
          </Button>
          <Button variant={storyFilter === 'regular' ? 'default' : 'outline'} size="sm" onClick={() => { setStoryFilter('regular'); setCurrentPage(1); }} className="h-7 text-xs shrink-0">
            Regular ({regularCount})
          </Button>
          {parliamentaryCount > 0 && (
            <Button variant={storyFilter === 'parliamentary' ? 'default' : 'outline'} size="sm" onClick={() => { setStoryFilter('parliamentary'); setCurrentPage(1); }} className="h-7 text-xs shrink-0">
              Parliamentary ({parliamentaryCount})
            </Button>
          )}
        </div>
        <div className="flex items-center justify-between sm:justify-end gap-2">
          <span className="text-xs text-muted-foreground">{totalPages > 1 && `Page ${currentPage}/${totalPages}`}</span>
          <Button variant="ghost" size="sm" onClick={onRefresh} className="h-7 w-7 p-0">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
          </Button>
        </div>
      </div>

      {/* Processing items */}
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
                        <p className="text-[10px] text-destructive mt-1 line-clamp-1">{item.error_message}</p>
                      )}
                    </div>
                  </div>
                  <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive" onClick={() => handleCancelQueueItem(item.id)} disabled={cancellingQueue.has(item.id)} title="Cancel">
                    {cancellingQueue.has(item.id) ? <Loader2 className="h-4 w-4 animate-spin" /> : <XCircle className="h-4 w-4" />}
                  </Button>
                </div>
              </CardHeader>
            </Card>
          ))}
          {stories.length > 0 && <Separator className="my-3" />}
        </div>
      )}

      {/* Story cards - heroic redesign */}
      {paginatedStories.map((story) => {
        const isScheduled = story.scheduled_publish_at && isFuture(new Date(story.scheduled_publish_at));
        const isLive = story.status === 'published';
        const isReady = story.status === 'ready' && !isScheduled;
        const storyTitle = story.title || story.headline || 'Untitled';
        
        return (
          <Card key={story.id} className="transition-all duration-200 hover:shadow-md">
            <div className="p-4 space-y-2.5">
              {/* Status line + overflow menu */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  {isLive && <Badge variant="default" className="h-5 text-[10px] bg-green-600">Live</Badge>}
                  {isScheduled && (
                    <Badge variant="outline" className="h-5 text-[10px] border-amber-300 text-amber-700 bg-amber-50">
                      <Clock className="w-2.5 h-2.5 mr-0.5" />
                      {format(new Date(story.scheduled_publish_at!), 'MMM d, h:mm a')}
                    </Badge>
                  )}
                  {isReady && (
                    <Badge variant="outline" className="h-5 text-[10px] border-blue-300 text-blue-700 bg-blue-50">
                      Ready
                    </Badge>
                  )}
                  {story.is_parliamentary && <Badge variant="secondary" className="h-5 text-[10px]">Parliament</Badge>}
                  <span>{formatDistanceToNow(new Date(story.created_at), { addSuffix: true })}</span>
                </div>

                {/* Overflow menu */}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="sm" className="h-7 w-7 p-0">
                      <MoreHorizontal className="w-4 h-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => onReturnToReview(story.id)}>
                      <RotateCcw className="w-3.5 h-3.5 mr-2" />
                      Unpublish
                    </DropdownMenuItem>
                    {story.source_url && (
                      <DropdownMenuItem onClick={() => window.open(story.source_url!, '_blank')}>
                        <Link className="w-3.5 h-3.5 mr-2" />
                        Source Article
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuSeparator />
                    {story.cover_illustration_url && !story.animated_illustration_url && (
                      <DropdownMenuItem onClick={() => setAnimationModalStory(story)}>
                        <Film className="w-3.5 h-3.5 mr-2" />
                        Animate
                      </DropdownMenuItem>
                    )}
                    {story.animated_illustration_url && (
                      <DropdownMenuItem onClick={() => handleDeleteAnimation(story.id)} className="text-destructive">
                        <Film className="w-3.5 h-3.5 mr-2" />
                        Delete Animation
                      </DropdownMenuItem>
                    )}
                    {story.cover_illustration_url && (
                      <DropdownMenuItem onClick={() => handleDeleteIllustration(story.id)} className="text-destructive">
                        <ImageIcon className="w-3.5 h-3.5 mr-2" />
                        Delete Illustration
                      </DropdownMenuItem>
                    )}
                    {isScheduled && (
                      <>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={() => handlePublishNow(story.id, storyTitle)}>
                          <Zap className="w-3.5 h-3.5 mr-2" />
                          Publish Now
                        </DropdownMenuItem>
                      </>
                    )}
                    {isReady && (
                      <>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={() => handlePublishNow(story.id, storyTitle)}>
                          <Zap className="w-3.5 h-3.5 mr-2" />
                          Publish Now
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={async () => {
                          if (!topicId) return;
                          try {
                            await supabase.functions.invoke('drip-feed-scheduler', { body: { topic_id: topicId } });
                            toast({ title: 'Scheduler triggered' });
                            setTimeout(onRefresh, 1500);
                          } catch (e) { console.error(e); }
                        }}>
                          <Clock className="w-3.5 h-3.5 mr-2" />
                          Assign Time
                        </DropdownMenuItem>
                      </>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>

              {/* Content row: thumbnail + title */}
              <div className="flex items-start gap-3">
                {story.cover_illustration_url && (
                  <img 
                    src={story.cover_illustration_url} 
                    alt="" 
                    className="w-20 h-20 object-cover rounded-md shrink-0"
                  />
                )}
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-base leading-tight line-clamp-2 mb-1">
                    {storyTitle}
                  </h3>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    {story.author && <span>{story.author}</span>}
                    {story.author && <span>·</span>}
                    <span>{story.slides.length} slides</span>
                    <span>·</span>
                    <span>{totalWordCount(story.slides)} words</span>
                    {story.animated_illustration_url && (
                      <>
                        <span>·</span>
                        <Badge className="h-4 text-[9px] bg-green-100 text-green-800 border-green-300 px-1">✨ Animated</Badge>
                      </>
                    )}
                  </div>
                </div>
              </div>

              {/* Action bar */}
              <div className="flex items-center gap-1.5 pt-1 border-t border-border/40 flex-wrap">
                {topicSlug && isLive && (
                  <Button size="sm" className="h-7 text-xs" asChild>
                    <a href={`/feed/${topicSlug}/story/${story.id}`} target="_blank" rel="noopener noreferrer">
                      View in Feed
                    </a>
                  </Button>
                )}
                
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => toggleExpanded(story.id)}
                  className="h-7 text-xs"
                >
                  <Eye className="h-3 w-3 mr-1" />
                  {expanded.has(story.id) ? 'Hide' : 'Preview'}
                </Button>

                <ImageModelSelector
                  onModelSelect={(model) => handleGenerateIllustration(story, model)}
                  isGenerating={generatingIllustrations.has(story.id)}
                  hasExistingImage={!!story.cover_illustration_url}
                  illustrationStyle={illustrationStyle as any}
                  size="sm"
                />

                {story.cover_illustration_url && !story.animated_illustration_url && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setAnimationModalStory(story)}
                    disabled={animatingVideos.has(story.id)}
                    className="h-7 text-xs"
                  >
                    {animatingVideos.has(story.id) ? (
                      <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                    ) : (
                      <Film className="w-3 h-3 mr-1" />
                    )}
                    Animate
                  </Button>
                )}

                <div className="ml-auto flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onArchive(story.id, storyTitle)}
                    className="h-7 w-7 p-0"
                    title="Archive"
                  >
                    <Archive className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onDelete(story.id, storyTitle)}
                    className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                    title="Delete"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>

              {/* Expandable slide preview */}
              {expanded.has(story.id) && (
                <div className="border-t pt-3 space-y-3">
                  {story.cover_illustration_url && (
                    <div className="bg-muted/30 rounded-lg p-3">
                      <div className={story.animated_illustration_url ? "grid grid-cols-2 gap-3" : ""}>
                        <div>
                          {story.animated_illustration_url && <p className="text-xs text-muted-foreground font-medium mb-1">Static</p>}
                          <img src={story.cover_illustration_url} alt="" className="w-full h-40 object-contain bg-background rounded border" />
                        </div>
                        {story.animated_illustration_url && (
                          <div>
                            <p className="text-xs text-muted-foreground font-medium mb-1">Animated</p>
                            <video src={story.animated_illustration_url} poster={story.cover_illustration_url} className="w-full h-40 object-contain bg-background rounded border" controls loop muted playsInline />
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                  
                  <div className="space-y-3">
                    <h4 className="text-sm font-medium">Slides ({story.slides.length})</h4>
                    {story.slides.map((slide, index) => (
                      <div key={slide.id} className="border rounded-lg p-3 bg-muted/10">
                        <div className="flex justify-between items-center mb-2">
                          <span className="text-xs font-medium text-muted-foreground">Slide {slide.slide_number || index + 1}</span>
                          <span className="text-xs text-muted-foreground">{slide.word_count || 0} words</span>
                        </div>
                        <div className="bg-background rounded p-2.5">
                          {edits[slide.id] !== undefined ? (
                            <textarea
                              value={edits[slide.id]}
                              onChange={(e) => setEdits(prev => ({ ...prev, [slide.id]: e.target.value }))}
                              className="w-full min-h-[100px] border-0 bg-transparent resize-none focus:outline-none text-sm"
                              placeholder="Slide content..."
                            />
                          ) : (
                            <p className="text-sm leading-relaxed">{renderContentWithLinks(slide.content, slide.links)}</p>
                          )}
                        </div>
                        <div className="flex items-center gap-1.5 mt-2">
                          {edits[slide.id] !== undefined ? (
                            <>
                              <Button size="sm" onClick={() => saveSlide(slide.id)} disabled={saving.has(slide.id)} className="h-6 text-xs px-2">
                                <Save className="mr-1 h-3 w-3" />
                                {saving.has(slide.id) ? 'Saving...' : 'Save'}
                              </Button>
                              <Button variant="outline" size="sm" onClick={() => setEdits(prev => { const next = { ...prev }; delete next[slide.id]; return next; })} className="h-6 text-xs px-2">
                                Cancel
                              </Button>
                            </>
                          ) : (
                            <>
                              <Button variant="outline" size="sm" onClick={() => setEdits(prev => ({ ...prev, [slide.id]: slide.content }))} className="h-6 text-xs px-2">
                                Edit
                              </Button>
                              <Button variant="outline" size="sm" onClick={() => setLinkEditorSlide(slide)} className="h-6 text-xs px-2">
                                <Link className="mr-1 h-3 w-3" />
                                Links ({slide.links?.length || 0})
                              </Button>
                            </>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {linkEditorSlide && (
              <LinkEditor
                content={linkEditorSlide.content}
                existingLinks={linkEditorSlide.links || []}
                onSaveLinks={(links) => handleSaveLinks(linkEditorSlide, links)}
                open={!!linkEditorSlide}
                onClose={() => setLinkEditorSlide(null)}
              />
            )}
          </Card>
        );
      })}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-1 mt-4">
          <Button variant="outline" size="sm" onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))} disabled={currentPage === 1} className="px-2">
            <ChevronLeft className="h-4 w-4" />
          </Button>
          {(() => {
            const pages: (number | 'ellipsis')[] = [];
            const showPages = new Set<number>();
            showPages.add(1);
            showPages.add(totalPages);
            for (let i = Math.max(1, currentPage - 1); i <= Math.min(totalPages, currentPage + 1); i++) showPages.add(i);
            const sortedPages = Array.from(showPages).sort((a, b) => a - b);
            sortedPages.forEach((page, idx) => {
              if (idx > 0 && page - sortedPages[idx - 1] > 1) pages.push('ellipsis');
              pages.push(page);
            });
            return pages.map((item, idx) =>
              item === 'ellipsis' ? (
                <span key={`e-${idx}`} className="px-1 text-muted-foreground">…</span>
              ) : (
                <Button key={item} variant={item === currentPage ? "default" : "outline"} size="sm" onClick={() => setCurrentPage(item)} className="w-8 h-8 p-0">{item}</Button>
              )
            );
          })()}
          <Button variant="outline" size="sm" onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))} disabled={currentPage === totalPages} className="px-2">
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      )}

      <AnimationInstructionsModal
        isOpen={!!animationModalStory}
        onClose={() => setAnimationModalStory(null)}
        story={animationModalStory ? {
          id: animationModalStory.id,
          headline: animationModalStory.title || animationModalStory.headline,
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
        isAnimating={animationModalStory ? animatingVideos.has(animationModalStory.id) : false}
        creditBalance={credits?.credits_balance}
        isSuperAdmin={isSuperAdmin}
      />
    </div>
  );
};
