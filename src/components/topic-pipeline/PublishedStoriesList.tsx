import React, { useState, useMemo, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, Loader2, Clock, XCircle, AlertCircle, Eye, RotateCcw, Zap, Check, Columns2 } from "lucide-react";
import { formatDistanceToNow, format, isFuture } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { optimizeImageUrl } from "@/lib/imageOptimization";
import { useToast } from "@/hooks/use-toast";
import { useCredits } from "@/hooks/useCredits";
import { useAuth } from "@/hooks/useAuth";
import { CreditService } from "@/lib/creditService";
import { illustrateOnPublish } from "@/lib/illustrateOnPublish";
import { edgeErrorMessage } from "@/lib/edgeError";
import { ImageModel } from "@/components/ImageModelSelector";
import { AnimationInstructionsModal } from "@/components/topic-pipeline/AnimationInstructionsModal";
import { ReelStudioModal } from "@/components/reels/ReelStudioModal";
import { MultiTenantQueueItem } from "@/hooks/useMultiTenantTopicPipeline";
import { publicationFromUrl, resolvePublicationName } from "@/lib/urlUtils";
import { DeskBadge, DeskCard, MetaLine, SpikeButton } from "./DeskCard";
import { StoryDrawer, type PublishedStory } from "./StoryDrawer";
import { DuplicateCompareDrawer } from "./DuplicateCompareDrawer";
import { StoryFilters, type StorySort, type StoryTypeFilter } from "./StoryFilters";

/** Best-effort source label for a story. */
const storySourceLabel = (s: { publication_name?: string | null; source_url?: string | null }): string =>
  resolvePublicationName(s.publication_name, s.source_url) || 'Unknown source';

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
  totalPublishedCount?: number | null;
  hasMorePublished?: boolean;
  loadingMorePublished?: boolean;
  onLoadMorePublished?: () => void;
  storyReads?: Record<string, number>;
  risingStoryId?: string | null;
  readingNowIds?: string[];
  /** Something readers see after the story at this feed position (1 = after the first live story). */
  renderAfterFeedPosition?: (position: number) => React.ReactNode;
  /** Stories arrive already in the public feed's order and are all in the feed (Live now). */
  feedOrder?: boolean;
  /** Drafts waiting for the owner's OK: Publish and Skip always showing, no filters or pages. */
  toCheck?: boolean;
  onSkip?: (story: PublishedStory) => void;
  /** Waiting stories that repeat one already live, mapped to that live story. */
  repeatOf?: Map<string, PublishedStory>;
  /** Publishing handled by the Desk, so the story moves into Live now at once. */
  onPublishNow?: (storyId: string, title: string) => Promise<void>;
  /** Just-published stories still getting their picture: shown faded until it lands. */
  settlingIds?: Set<string>;
  /** Stories the owner just published or skipped: they play their leave motion before going. */
  leavingIds?: Map<string, 'publish' | 'skip'>;
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
  topicId,
  totalPublishedCount = null,
  hasMorePublished = false,
  loadingMorePublished = false,
  onLoadMorePublished,
  storyReads,
  risingStoryId = null,
  readingNowIds = [],
  renderAfterFeedPosition,
  feedOrder = false,
  toCheck = false,
  onSkip,
  repeatOf,
  onPublishNow,
  settlingIds,
  leavingIds,
}) => {
  const { toast } = useToast();
  const { credits } = useCredits();
  const { isAdmin, isSuperAdmin, isProductOwner } = useAuth();
  const [generatingIllustrations, setGeneratingIllustrations] = useState<Set<string>>(new Set());
  const [animatingVideos, setAnimatingVideos] = useState<Set<string>>(new Set());
  const [publishingNow, setPublishingNow] = useState<Set<string>>(new Set());
  const [cancellingQueue, setCancellingQueue] = useState<Set<string>>(new Set());
  const [openStoryId, setOpenStoryId] = useState<string | null>(null);
  const [compareId, setCompareId] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [storyFilter, setStoryFilter] = useState<StoryTypeFilter>('all');
  const [sourceFilter, setSourceFilter] = useState<string>('all');
  const [sortMode, setSortMode] = useState<StorySort>('newest');
  const pageSize = 10;
  const [illustrationStyle, setIllustrationStyle] = useState<string>('editorial_illustrative');
  const [animationModalStory, setAnimationModalStory] = useState<PublishedStory | null>(null);
  const [reelStory, setReelStory] = useState<PublishedStory | null>(null);

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
    if (onPublishNow) {
      try {
        await onPublishNow(storyId, title);
      } finally {
        setPublishingNow(prev => { const n = new Set(prev); n.delete(storyId); return n; });
      }
      return;
    }
    try {
      const publishedAt = new Date().toISOString();
      const { data, error } = await supabase
        .from('stories')
        .update({
          scheduled_publish_at: null,
          status: 'published',
          is_published: true,
          published_at: publishedAt,
          updated_at: publishedAt,
        })
        .eq('id', storyId)
        .select('id')
        .maybeSingle();
      if (error) throw error;
      if (!data) throw new Error('No story was updated. Check topic ownership and access.');
      toast({ title: 'Published Immediately', description: `"${title}" is now live.` });
      onRefresh();
      // Live now, so draw its picture if it has none; refresh again when it lands.
      void illustrateOnPublish(storyId).then(onRefresh);
    } catch (e: any) {
      console.error('Error publishing story:', e);
      const detail = e?.message || 'Could not publish story';
      toast({
        title: 'Publish failed',
        description: e?.code === '57014'
          ? 'The database timed out. The story may still have published — refresh to check.'
          : detail,
        variant: 'destructive',
      });
    } finally {

      setPublishingNow(prev => { const n = new Set(prev); n.delete(storyId); return n; });
    }
  };

  const filteredStories = useMemo(() => {
    let list = stories;
    if (storyFilter === 'parliamentary') list = list.filter(s => s.is_parliamentary);
    else if (storyFilter === 'regular') list = list.filter(s => !s.is_parliamentary);
    if (sourceFilter !== 'all') list = list.filter(s => storySourceLabel(s) === sourceFilter);

    const byNewest = (a: PublishedStory, b: PublishedStory) => b.created_at.localeCompare(a.created_at);
    const sorted = [...list];
    if (sortMode === 'oldest') sorted.sort((a, b) => -byNewest(a, b));
    else if (sortMode === 'source') {
      sorted.sort((a, b) =>
        storySourceLabel(a).localeCompare(storySourceLabel(b)) || byNewest(a, b)
      );
    } else if (!feedOrder) sorted.sort(byNewest);
    return sorted;
  }, [stories, storyFilter, sourceFilter, sortMode, feedOrder]);

  /** Feed position of each live story, as readers see them (only in the default newest-first, unfiltered view). */
  const feedPositions = useMemo(() => {
    const map = new Map<string, number>();
    if (sortMode !== 'newest' || storyFilter !== 'all' || sourceFilter !== 'all') return map;
    let n = 0;
    for (const s of filteredStories) {
      const scheduled = s.scheduled_publish_at && isFuture(new Date(s.scheduled_publish_at));
      if (feedOrder || (s.status === 'published' && !scheduled)) map.set(s.id, ++n);
    }
    return map;
  }, [filteredStories, sortMode, storyFilter, sourceFilter, feedOrder]);

  const availableSources = useMemo(() => {
    const counts = new Map<string, number>();
    for (const s of stories) {
      const label = storySourceLabel(s);
      counts.set(label, (counts.get(label) ?? 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  }, [stories]);

  const paginatedStories = useMemo(() => {
    if (toCheck) return filteredStories;
    const startIndex = (currentPage - 1) * pageSize;
    return filteredStories.slice(startIndex, startIndex + pageSize);
  }, [filteredStories, currentPage, pageSize, toCheck]);

  const totalPages = toCheck ? 1 : Math.ceil(filteredStories.length / pageSize);

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

  const handleGenerateIllustration = async (story: PublishedStory, model: ImageModel, style?: string) => {
    if (generatingIllustrations.has(story.id)) return;
    if (!isProductOwner && (!credits || credits.credits_balance < model.credits)) {
      toast({ title: 'Insufficient Credits', description: `You need ${model.credits} credits.`, variant: 'destructive' });
      return;
    }
    setGeneratingIllustrations(prev => new Set(prev.add(story.id)));
    try {
      const result = await CreditService.generateStoryIllustration(story.id, model.id, style);
      if (result.success) {
        if (result.satirical_declined) toast({ title: "Standard style used", description: "This story looked too serious for satire, so it got the standard picture style instead.", duration: 8000 });
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
    if (!isProductOwner && (!credits || credits.credits_balance < creditCost)) {
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
      toast({ title: 'Animation Error', description: await edgeErrorMessage(e, 'Failed to create animation'), variant: 'destructive' });
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

  const openStory = openStoryId ? stories.find(s => s.id === openStoryId) ?? null : null;
  const compareStory = compareId ? stories.find(s => s.id === compareId) ?? null : null;
  useEffect(() => {
    if (openStoryId && !stories.some(s => s.id === openStoryId)) setOpenStoryId(null);
  }, [openStoryId, stories]);

  const handleAssignTime = async () => {
    if (!topicId) return;
    try {
      await supabase.functions.invoke('drip-feed-scheduler', { body: { topic_id: topicId } });
      toast({ title: 'Scheduler triggered' });
      setTimeout(onRefresh, 1500);
    } catch (e) { console.error(e); }
  };

  if (stories.length === 0 && processingItems.length === 0 && !loading) {
    return (
      <div className="py-12 text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-muted">
          <Eye className="h-6 w-6 text-muted-foreground" />
        </div>
        <h3 className="mb-2 text-lg font-semibold">Nothing live yet</h3>
        <p className="mb-4 text-base text-muted-foreground">Stories appear here once they're published.</p>
        <Button variant="outline" onClick={onRefresh}>
          <RotateCcw className="mr-2 h-4 w-4" />
          Refresh
        </Button>
      </div>
    );
  }

  const parliamentaryCount = stories.filter(s => s.is_parliamentary).length;
  const regularCount = stories.length - parliamentaryCount;
  const allLabel = `All (${stories.length}${typeof totalPublishedCount === 'number' && totalPublishedCount > stories.length ? ` of ${totalPublishedCount}` : ''})`;
  const resetPage = () => setCurrentPage(1);

  return (
    <div className="space-y-3">
      {/* One quiet row: page indicator and one filter button */}
      {!toCheck && <div className="flex items-center justify-end gap-2">
        {totalPages > 1 && <span className="text-sm text-muted-foreground tabular-nums">Page {currentPage} of {totalPages}</span>}
        <StoryFilters
          storyFilter={storyFilter}
          onStoryFilter={(f) => { setStoryFilter(f); resetPage(); }}
          allLabel={allLabel}
          regularCount={regularCount}
          parliamentaryCount={parliamentaryCount}
          sources={availableSources}
          sourceFilter={sourceFilter}
          onSourceFilter={(s) => { setSourceFilter(s); resetPage(); }}
          sortMode={sortMode}
          onSortMode={(m) => { setSortMode(m); resetPage(); }}
          onRefresh={onRefresh}
          loading={loading}
        />
      </div>}

      {/* Being written, or failed: slim rows with cancel */}
      {processingItems.length > 0 && (
        <ul className="space-y-2">
          {processingItems.map((item) => {
            const failed = item.status === 'failed';
            return (
              <li key={item.id} className="flex items-center gap-3 rounded-lg bg-muted/50 px-3 py-2">
                {item.status === 'processing' ? (
                  <span className="flex h-4 w-4 shrink-0 items-center justify-center" aria-hidden="true"><span className="live-pulse h-2 w-2 rounded-full bg-pop" /></span>
                ) : failed ? (
                  <AlertCircle className="h-4 w-4 shrink-0 text-destructive" aria-hidden="true" />
                ) : (
                  <Clock className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-base text-muted-foreground">{item.article_title || item.title || 'New story'}</p>
                  <p className={`truncate text-sm ${failed ? 'text-destructive' : 'text-muted-foreground'}`}>
                    {failed ? (item.error_message || 'Failed') : item.status === 'processing' ? 'Writing…' : 'Queued'}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive"
                  onClick={() => handleCancelQueueItem(item.id)}
                  disabled={cancellingQueue.has(item.id)}
                  aria-label="Cancel"
                >
                  {cancellingQueue.has(item.id) ? <Loader2 className="h-4 w-4 animate-spin" /> : <XCircle className="h-4 w-4" />}
                </Button>
              </li>
            );
          })}
        </ul>
      )}

      {paginatedStories.map((story) => {
        const isScheduled = Boolean(story.scheduled_publish_at && isFuture(new Date(story.scheduled_publish_at)));
        const isLive = feedOrder || (story.status === 'published' && !isScheduled);
        const isReady = !feedOrder && story.status === 'ready' && !isScheduled;
        const isDraft = story.status === 'draft';
        const storyTitle = story.title || story.headline || 'Untitled';
        const reads = storyReads?.[story.id] ?? 0;
        const readingNow = readingNowIds.includes(story.id);
        const publishing = publishingNow.has(story.id);
        const settling = Boolean(settlingIds?.has(story.id));

        const feedPosition = feedPositions.get(story.id);
        const afterNode = feedPosition !== undefined && renderAfterFeedPosition ? renderAfterFeedPosition(feedPosition) : null;
        return (
          <React.Fragment key={story.id}>
            <DeskCard
              id={feedOrder ? `live-story-${story.id}` : undefined}
              className={leavingIds?.get(story.id) === 'publish' ? 'flow-out' : leavingIds?.get(story.id) === 'skip' ? 'skip-out' : settling ? 'settle-in opacity-60' : undefined}
              title={storyTitle}
              thumbnailUrl={story.cover_illustration_url ? (optimizeImageUrl(story.cover_illustration_url, { width: 128, height: 128, quality: 70 }) || story.cover_illustration_url) : null}
              thumbClassName={readingNow ? 'reading-ring' : undefined}
              thumbTitle={readingNow ? 'Being read now' : undefined}
              onOpen={() => (repeatOf?.has(story.id) ? setCompareId(story.id) : setOpenStoryId(story.id))}
              keepActions={publishing}
              pinActions={toCheck}
              badges={
                <>
                  {settling && (
                    <DeskBadge>
                      <span className="live-pulse h-2 w-2 rounded-full bg-pop" aria-hidden="true" />Adding picture
                    </DeskBadge>
                  )}
                  {risingStoryId === story.id && <DeskBadge tone="pop">↑ Rising</DeskBadge>}
                  {isScheduled && <DeskBadge><Clock className="h-3.5 w-3.5" aria-hidden="true" />{format(new Date(story.scheduled_publish_at!), 'd MMM, HH:mm')}</DeskBadge>}
                  {isReady && <DeskBadge tone="primary">Ready</DeskBadge>}
                  {isDraft && !toCheck && <DeskBadge>Draft</DeskBadge>}
                  {repeatOf?.has(story.id) && (
                    <button
                      type="button"
                      className="rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      onClick={(e) => { e.stopPropagation(); setCompareId(story.id); }}
                      title="Compare with the live story"
                    >
                      <DeskBadge tone="warning"><Columns2 className="h-3.5 w-3.5" aria-hidden="true" />Duplicate live</DeskBadge>
                    </button>
                  )}
                </>
              }
              meta={
                <MetaLine parts={[
                  storySourceLabel(story),
                  formatDistanceToNow(new Date(story.created_at), { addSuffix: true }),
                  isLive && reads > 0 ? <span className="tabular-nums" title="Reads in the last 7 days">{reads} {reads === 1 ? 'read' : 'reads'}</span> : null,
                ]} />
              }
              actions={toCheck ? (
                <>
                  {onSkip && <SpikeButton onClick={() => onSkip(story)} disabled={publishing} />}
                  <Button size="sm" onClick={() => handlePublishNow(story.id, storyTitle)} disabled={publishing}>
                    {publishing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Check className="mr-2 h-4 w-4" />}
                    Publish
                  </Button>
                </>
              ) : isLive ? (
                <>
                  {onSkip && <SpikeButton label="Remove from feed" onClick={() => onSkip(story)} />}
                  <Button size="sm" variant="ghost" onClick={() => onReturnToReview(story.id)}>Unpublish</Button>
                </>
              ) : (
                <>
                  {onSkip && <SpikeButton onClick={() => onSkip(story)} disabled={publishing} />}
                  <Button size="sm" onClick={() => handlePublishNow(story.id, storyTitle)} disabled={publishing}>
                    {publishing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Zap className="mr-2 h-4 w-4" />}
                    Publish now
                  </Button>
                </>
              )}
            />
            {afterNode}
          </React.Fragment>
        );
      })}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="mt-4 flex items-center justify-center gap-1">
          <Button variant="outline" size="sm" onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))} disabled={currentPage === 1} className="px-2" aria-label="Previous page">
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
                <Button key={item} variant={item === currentPage ? "default" : "outline"} size="sm" onClick={() => setCurrentPage(item)} className="h-9 w-9 p-0 text-sm">{item}</Button>
              )
            );
          })()}
          <Button variant="outline" size="sm" onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))} disabled={currentPage === totalPages} className="px-2" aria-label="Next page">
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      )}

      {hasMorePublished && onLoadMorePublished && (
        <div className="flex justify-center pt-2">
          <Button variant="outline" size="sm" onClick={onLoadMorePublished} disabled={loadingMorePublished}>
            {loadingMorePublished ? (
              <>Loading</>
            ) : (
              'Load older stories'
            )}
          </Button>
        </div>
      )}

      <DuplicateCompareDrawer
        waiting={compareStory}
        live={compareStory ? repeatOf?.get(compareStory.id) ?? null : null}
        onOpenChange={(o) => !o && setCompareId(null)}
        onSkip={onSkip}
        onPublish={async (s) => { await handlePublishNow(s.id, s.title || s.headline || 'Untitled'); setCompareId(null); }}
        publishing={compareStory ? publishingNow.has(compareStory.id) : false}
      />

      <StoryDrawer
        story={openStory}
        open={!!openStory}
        onOpenChange={(o) => !o && setOpenStoryId(null)}
        sourceLabel={openStory ? storySourceLabel(openStory) : ''}
        topicSlug={topicSlug}
        illustrationStyle={illustrationStyle}
        generating={openStory ? generatingIllustrations.has(openStory.id) : false}
        animating={openStory ? animatingVideos.has(openStory.id) : false}
        publishing={openStory ? publishingNow.has(openStory.id) : false}
        onGenerateIllustration={(model, style) => openStory && handleGenerateIllustration(openStory, model, style)}
        onAnimate={() => openStory && setAnimationModalStory(openStory)}
        onDeleteAnimation={() => openStory && handleDeleteAnimation(openStory.id)}
        onDeleteIllustration={() => openStory && handleDeleteIllustration(openStory.id)}
        onReel={() => openStory && setReelStory(openStory)}
        onPublishNow={() => openStory && handlePublishNow(openStory.id, openStory.title || openStory.headline || 'Untitled')}
        onUnpublish={() => { if (openStory) { onReturnToReview(openStory.id); setOpenStoryId(null); } }}
        onAssignTime={handleAssignTime}
        onArchive={() => { if (openStory) { onArchive(openStory.id, openStory.title || openStory.headline || 'Untitled'); setOpenStoryId(null); } }}
        onDelete={() => { if (openStory) { onDelete(openStory.id, openStory.title || openStory.headline || 'Untitled'); setOpenStoryId(null); } }}
        onRefresh={onRefresh}
      />

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
        isAdmin={isProductOwner}
      />

      {reelStory && (
        <ReelStudioModal
          open={!!reelStory}
          onOpenChange={(o) => !o && setReelStory(null)}
          story={{
            id: reelStory.id,
            title: reelStory.title || reelStory.headline || 'Untitled',
            cover_illustration_url: reelStory.cover_illustration_url,
            slides: reelStory.slides?.map((s) => ({
              slide_number: s.slide_number,
              content: s.content,
            })) || null,
          }}
          brandName={topicSlug || 'curatr'}
          feedUrl={topicSlug ? `curatr.pro/feed/${topicSlug}` : 'curatr.pro'}
          sourceLabel={
            [
              reelStory.author,
              reelStory.publication_name ||
                publicationFromUrl(reelStory.source_url),
            ]
              .filter(Boolean)
              .join(' · ') || ''
          }
          featureUnlocked={isProductOwner}
        />
      )}
    </div>
  );
};
