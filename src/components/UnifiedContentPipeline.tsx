import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { NextGatherPanel } from "@/components/topics/insight/NextGatherPanel";
import { RefreshCw, Loader2, AlertCircle, CheckCircle, Mail, Check } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useMultiTenantTopicPipeline, MultiTenantArticle } from "@/hooks/useMultiTenantTopicPipeline";
import { useMultiTenantActions } from "@/hooks/useMultiTenantActions";
import MultiTenantArticlesList from "@/components/topic-pipeline/MultiTenantArticlesList";

import { MultiTenantStoriesList } from "@/components/topic-pipeline/MultiTenantStoriesList";
import { PublishedStoriesList } from "@/components/topic-pipeline/PublishedStoriesList";
import { ApprovedStoriesPanel } from "@/components/ApprovedStoriesPanel";
import { useTopicPulse } from "@/hooks/useTopicPulse";
import { NewContentBadge } from "@/components/ui/new-content-badge";
import { useEventDesk, useEventDeskActions } from "@/hooks/useWhatsOnEvents";
import { EventHorizon, EventsSwitch, HiddenEvents, LiveWhatsOnRow, WaitingEventCard } from "@/components/events/DeskEvents";
import { isLowRelevance, londonToday } from "@/lib/whatsOn";
import { whatsOnPositions } from "@/lib/feedCardPositions";

interface Topic {
  id: string;
  name: string;
  topic_type: 'regional' | 'keyword';
  is_active: boolean;
  keywords?: string[];
  landmarks?: string[];
  organizations?: string[];
  default_tone?: 'formal' | 'conversational' | 'engaging' | 'satirical' | 'rhyming_couplet';
  default_writing_style?: 'journalistic' | 'educational' | 'listicle' | 'story_driven';
  auto_simplify_enabled?: boolean;
  automation_quality_threshold?: number;
}

interface UnifiedContentPipelineProps {
  selectedTopicId?: string;
}

export const UnifiedContentPipeline: React.FC<UnifiedContentPipelineProps> = ({ selectedTopicId: propTopicId }) => {
  const [selectedTopicId, setSelectedTopicId] = useState(propTopicId || '');
  const [topics, setTopics] = useState<Topic[]>([]);
  const [topicSlug, setTopicSlug] = useState<string>('');
  const [slideQuantities, setSlideQuantities] = useState<Record<string, 'short' | 'tabloid' | 'indepth' | 'extensive'>>({});
  const [toneOverrides, setToneOverrides] = useState<Record<string, 'formal' | 'conversational' | 'engaging' | 'satirical' | 'rhyming_couplet' | undefined>>({});
  const [writingStyleOverrides, setWritingStyleOverrides] = useState<Record<string, 'journalistic' | 'educational' | 'listicle' | 'story_driven' | undefined>>({});
  const [expandedStories, setExpandedStories] = useState<Set<string>>(new Set());
  const [processingApproval, setProcessingApproval] = useState<Set<string>>(new Set());
  const [processingRejection, setProcessingRejection] = useState<Set<string>>(new Set());
  const [deletingStories, setDeletingStories] = useState<Set<string>>(new Set());
  const [publishingStories, setPublishingStories] = useState<Set<string>>(new Set());
  const [deletingQueueItems, setDeletingQueueItems] = useState<Set<string>>(new Set());
  const { toast } = useToast();

  const [runningPublishMigration, setRunningPublishMigration] = useState(false);

  const {
    articles,
    queueItems,
    stories,
    loading,
    loadError,
    loadingMore,
    stats,
    duplicateMap,
    loadTopicContent: refreshContent,
    handleMultiTenantApprove,
    handleMultiTenantDelete,
    handleMultiTenantBulkDelete,
    handleMultiTenantCancelQueue,
    handleMultiTenantApproveStory,
    handleMultiTenantRejectStory,
    markArticleAsDiscarded,
    promoteTopicArticle,
    processingArticle,
    deletingArticles,
    animatingArticles,
    newArrivals,
    newPublished,
    clearNewArrivals,
    clearNewPublished,
    hasMoreArticles,
    totalArticlesCount,
    loadMoreArticles,
    hasMorePublished,
    totalPublishedCount,
    loadingMorePublished,
    loadMorePublished
  } = useMultiTenantTopicPipeline(selectedTopicId);

  // Events flow through the same pipeline: Waiting (Publish / Skip), Hidden, and the What's on set in Live
  const { data: eventDesk } = useEventDesk(selectedTopicId || propTopicId);
  const eventActions = useEventDeskActions(selectedTopicId || propTopicId);

  const multiTenantActions = useMultiTenantActions();
  const pulseCtx = useTopicPulse();
  const pulse = pulseCtx?.pulse;
  const [animatingStories, setAnimatingStories] = useState<Set<string>>(new Set());

  useEffect(() => {
    const loadTopics = async () => {
      try {
        const { data, error } = await supabase
          .from('topics')
          .select('id, name, topic_type, is_active, keywords, landmarks, organizations, default_tone, default_writing_style, auto_simplify_enabled, automation_quality_threshold')
          .eq('is_active', true)
          .order('name');

        if (error) throw error;
        setTopics((data || []).map(topic => ({
          ...topic,
          topic_type: topic.topic_type as 'regional' | 'keyword',
          default_writing_style: topic.default_writing_style as 'journalistic' | 'educational' | 'listicle' | 'story_driven'
        })));

        if (data && data.length > 0 && !selectedTopicId && !propTopicId) {
          setSelectedTopicId(data[0].id);
        }
      } catch (error) {
        console.error('Error loading topics:', error);
        toast({ title: "Error", description: "Failed to load topics", variant: "destructive" });
      }
    };
    loadTopics();
  }, []);

  useEffect(() => {
    if (propTopicId && propTopicId !== selectedTopicId) {
      setSelectedTopicId(propTopicId);
    }
  }, [propTopicId]);

  const currentTopic = topics.find(t => t.id === selectedTopicId);

  useEffect(() => {
    const loadTopicSlug = async () => {
      if (!selectedTopicId) return;
      try {
        const { data, error } = await supabase
          .from('topics')
          .select('slug')
          .eq('id', selectedTopicId)
          .single();
        if (error) throw error;
        if (data) setTopicSlug(data.slug);
      } catch (error) {
        console.error('Error loading topic slug:', error);
      }
    };
    loadTopicSlug();
  }, [selectedTopicId]);

  const totalArticles = articles.length;
  const totalQueue = queueItems.length;
  const totalStories = stories.length;
  const processingCount = queueItems.filter(q => 
    (q.status === 'processing' || q.status === 'pending') && 
    q.attempts < q.max_attempts
  ).length;
  const stuckCount = queueItems.filter(q => 
    q.status === 'pending' && 
    q.attempts >= q.max_attempts && 
    q.error_message
  ).length;

  const handleSlideQuantityChange = (articleId: string, quantity: 'short' | 'tabloid' | 'indepth' | 'extensive') => {
    setSlideQuantities(prev => ({ ...prev, [articleId]: quantity }));
  };

  const handleToneOverrideChange = (articleId: string, tone: 'formal' | 'conversational' | 'engaging' | 'satirical' | 'rhyming_couplet' | undefined) => {
    setToneOverrides(prev => ({ ...prev, [articleId]: tone }));
  };

  const handleWritingStyleOverrideChange = (articleId: string, style: 'journalistic' | 'educational' | 'listicle' | 'story_driven' | undefined) => {
    setWritingStyleOverrides(prev => ({ ...prev, [articleId]: style }));
  };

  const handleToggleStoryExpanded = (storyId: string) => {
    setExpandedStories(prev => {
      const newSet = new Set(prev);
      newSet.has(storyId) ? newSet.delete(storyId) : newSet.add(storyId);
      return newSet;
    });
  };

  const handleStoryApprove = async (storyId: string) => {
    setProcessingApproval(prev => new Set([...prev, storyId]));
    try {
      await handleMultiTenantApproveStory(storyId);
      toast({ title: "Story Approved", description: "Story approved and published" });
    } catch (error) {
      console.error('Error approving story:', error);
      toast({ title: "Error", description: "Failed to approve story", variant: "destructive" });
    } finally {
      setProcessingApproval(prev => { const n = new Set(prev); n.delete(storyId); return n; });
    }
  };

  const handleStoryReject = async (storyId: string) => {
    setProcessingRejection(prev => new Set([...prev, storyId]));
    try {
      await handleMultiTenantRejectStory(storyId);
      await refreshContent();
      toast({ title: "Story Rejected", description: "Story has been rejected and returned to Waiting" });
    } catch (error) {
      console.error('Error rejecting story:', error);
      toast({ title: "Error", description: "Failed to reject story", variant: "destructive" });
    } finally {
      setProcessingRejection(prev => { const n = new Set(prev); n.delete(storyId); return n; });
    }
  };

  const handleReturnToReview = async (storyId: string) => {
    try {
      await handleMultiTenantRejectStory(storyId);
    } catch (error) {
      console.error('Error returning story to review:', error);
    }
  };

  const handleArchiveStory = async (storyId: string, title: string) => {
    try {
      const { error } = await supabase
        .from('stories')
        .update({ status: 'archived', is_published: false, updated_at: new Date().toISOString() })
        .eq('id', storyId);
      if (error) throw error;
      toast({ title: "Success", description: `Story "${title}" archived successfully` });
      refreshContent();
    } catch (error) {
      console.error('Error archiving story:', error);
      toast({ title: "Error", description: "Failed to archive story", variant: "destructive" });
    }
  };

  const handleViewStory = (story: any) => {
    if (story.id && topicSlug) {
      window.open(`/feed/${topicSlug}/story/${story.id}`, '_blank');
    } else if (story.id) {
      window.open(`/story/${story.id}`, '_blank');
    }
  };

  const runPublishMigration = useCallback(async () => {
    try {
      setRunningPublishMigration(true);
      const { data, error } = await supabase.functions.invoke('publish-ready-stories', { body: {} });
      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || 'Failed to publish ready stories');
      toast({ title: 'Published', description: data.message || 'Converted ready stories to published' });
      await refreshContent();
    } catch (err: any) {
      console.error('Publish migration failed:', err);
      toast({ title: 'Migration failed', description: err.message || 'Could not publish ready stories', variant: 'destructive' });
    } finally {
      setRunningPublishMigration(false);
    }
  }, [supabase, toast, refreshContent]);

  if (!selectedTopicId) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Select a Topic</CardTitle>
          <CardDescription>Choose a topic to manage its content</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const visibleStories = stories.filter(s => ['draft', 'ready', 'published'].includes(s.status));
  const visibleIdsKey = visibleStories.map(s => s.id).join(',');
  const setPulseIds = pulseCtx?.setStoryIds;
  useEffect(() => {
    setPulseIds?.(visibleIdsKey ? visibleIdsKey.split(',') : []);
  }, [visibleIdsKey, setPulseIds]);

  // ----- events on the Desk -----
  const eventsOn = Boolean(eventDesk?.eventsOn);
  const waitingEvents = eventsOn ? eventDesk?.waiting ?? [] : [];
  const hiddenEvents = eventsOn ? eventDesk?.hidden ?? [] : [];
  const waitingCount = totalArticles + waitingEvents.length;
  const today = londonToday();
  const waitingEventItems = waitingEvents.map((e) => ({
    id: e.id,
    at: Date.parse(e.created_at) || 0,
    low: isLowRelevance(e.relevance_score),
    node: <WaitingEventCard event={e} onPublish={() => eventActions.publish(e)} onSkip={() => eventActions.skip(e)} />,
  }));
  // The What's on set sits in Live exactly where readers see it (same rule as the feed).
  const whatsOnAt = new Set(whatsOnPositions(Math.max(visibleStories.length, 1)));
  const renderWhatsOnAfter = eventsOn && eventDesk
    ? (position: number) => {
        if (!whatsOnAt.has(position)) return null;
        const first = position === 1;
        // Not shown to readers (or nothing to show): one row at the top to switch it on, no repeats
        if (!first && (!eventDesk.showInFeed || eventDesk.live.length === 0)) return null;
        return (
          <div className="py-1">
            <LiveWhatsOnRow first={first} events={eventDesk.live} today={today} showInFeed={eventDesk.showInFeed} liveMore={eventDesk.liveMore}
              onToggleShow={eventActions.setShowInFeed} onRemove={(e) => eventActions.removeFromLive(e)} />
          </div>
        );
      }
    : undefined;

  return (
    <div className="max-w-3xl space-y-4">
      {/* Quiet inline load-error banner with retry — replaces the old per-refresh error toasts */}
      {loadError && (
        <div
          role="status"
          aria-live="polite"
          className="flex items-center justify-between gap-3 rounded-lg border border-amber-300/60 bg-amber-50 dark:bg-amber-950/40 px-3 py-2 text-sm"
        >
          <span className="flex items-center gap-2 text-amber-900 dark:text-amber-200">
            <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
            {loadError}
          </span>
          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => refreshContent()}>
            <RefreshCw className="h-3 w-3 mr-1" aria-hidden="true" />
            Retry
          </Button>
        </div>
      )}

      {/* One pipeline: Waiting (stories and events) on top, Live (what readers see) below */}
      <section className="space-y-3" aria-labelledby="pipeline-waiting">
        <div className="flex items-center gap-2 pb-2 border-b">
          <h3 id="pipeline-waiting" className="section-label text-foreground">Waiting</h3>
          {waitingCount > 0 && (
            <span className="rounded-full bg-foreground px-2 py-0.5 text-xs font-medium text-background tabular-nums">{waitingCount}</span>
          )}
          <NewContentBadge show={newArrivals} onDismiss={clearNewArrivals} />
          <div className="ml-auto">
            <EventsSwitch on={eventsOn} disabled={!eventDesk} onChange={eventActions.setEventsOn}
              suggestOn={eventDesk?.readerSuggestions} onSuggestChange={eventActions.setReaderSuggestions} />
          </div>
        </div>
        {eventsOn && eventDesk && (
          <EventHorizon live={eventDesk.allLive} waiting={eventDesk.waiting} today={today}
            onPublish={(e) => eventActions.publish(e)} onSkip={(e) => eventActions.skip(e)} onRemove={(e) => eventActions.removeFromLive(e)} />
        )}
        {(pulse?.new_arrivals ?? 0) > 0 && (
          <p className="text-sm text-muted-foreground">{pulse!.new_arrivals} new since you last looked</p>
        )}
        {waitingCount === 0 ? (
          <div className="space-y-3">
            <p className="flex items-center gap-2 text-muted-foreground"><Check className="h-4 w-4 text-primary" aria-hidden="true" />All caught up</p>
            <NextGatherPanel topicId={selectedTopicId} />
          </div>
        ) : (
          <MultiTenantArticlesList
            articles={articles}
            processingArticle={processingArticle}
            deletingArticles={deletingArticles}
            animatingArticles={animatingArticles}
            duplicateMap={duplicateMap}
            slideQuantityOverrides={slideQuantities}
            toneOverrides={toneOverrides}
            writingStyleOverrides={writingStyleOverrides}
            onSlideQuantityChange={handleSlideQuantityChange}
            onToneOverrideChange={handleToneOverrideChange}
            onWritingStyleOverrideChange={handleWritingStyleOverrideChange}
            highlightTerms={{
              regionName: currentTopic?.name || '',
              landmarks: currentTopic?.landmarks || [],
              keywords: currentTopic?.keywords || [],
              organizations: currentTopic?.organizations || [],
            }}
            onApprove={(article, slideType, tone, writingStyle, generateIllustration) => 
              handleMultiTenantApprove(article, slideType, tone, writingStyle, generateIllustration)
            }
            onDelete={handleMultiTenantDelete}
            onBulkDelete={handleMultiTenantBulkDelete}
            onPromote={promoteTopicArticle}
            defaultTone={currentTopic?.default_tone || 'conversational'}
            defaultWritingStyle={currentTopic?.default_writing_style || 'journalistic'}
            onRefresh={refreshContent}
            hasMoreArticles={hasMoreArticles}
            totalArticlesCount={totalArticlesCount}
            loadingMore={loadingMore}
            onLoadMore={loadMoreArticles}
            extraItems={waitingEventItems}
            showTypeChips={waitingEvents.length > 0}
          />
        )}
        {eventsOn && <HiddenEvents events={hiddenEvents} onRestore={(e) => eventActions.unhide(e)} />}
      </section>

      <section className="space-y-3 pt-4" aria-labelledby="pipeline-live">
        <div className="flex items-center gap-2 pb-2 border-b">
          <h3 id="pipeline-live" className="section-label text-foreground">Live</h3>
          <span className="text-xs text-muted-foreground tabular-nums">{visibleStories.length}</span>
          {queueItems.length > 0 && (
            <span className="inline-flex items-center gap-1 text-purple-bright animate-fade-in">
              <Loader2 className="h-3 w-3 animate-spin" />
              <span className="text-xs">{queueItems.length} being prepared</span>
            </span>
          )}
          <NewContentBadge show={newPublished} onDismiss={clearNewPublished} />
          {stuckCount > 0 && (
            <Button
              size="sm"
              variant="outline"
              onClick={async () => {
                try {
                  const { data, error } = await supabase.functions.invoke('auto-recover-stuck-stories');
                  if (error) throw error;
                  const recovered = data?.totalRecovered || 0;
                  const processed = data?.processedNow || 0;
                  toast({
                    title: recovered ? "Processing stuck items…" : "Nothing to recover",
                    description: recovered
                      ? `Requeued ${recovered} · processed ${processed} now. Watch Live.`
                      : "No stuck items were found.",
                  });
                  refreshContent();
                  for (let i = 0; i < 6; i++) {
                    await new Promise((r) => setTimeout(r, 5000));
                    refreshContent();
                  }
                } catch (error) {
                  toast({ title: "Recovery Failed", description: error instanceof Error ? error.message : "Failed to recover stuck items", variant: "destructive" });
                }
              }}
              className="text-destructive border-destructive/50 hover:bg-destructive/10 h-7 text-xs"
            >
              <AlertCircle className="w-3 h-3 mr-1" />
              Recover {stuckCount} stuck
            </Button>
          )}
          <span className="ml-auto hidden items-center gap-1.5 text-xs text-muted-foreground sm:inline-flex">
            <Mail className="h-3.5 w-3.5" aria-hidden="true" />The weekly email takes what's here
          </span>
        </div>

        {visibleStories.length === 0 && queueItems.length === 0 ? (
          <div className="space-y-3">
            {eventsOn && eventDesk && (
              <LiveWhatsOnRow first events={eventDesk.live} today={today} showInFeed={eventDesk.showInFeed} liveMore={eventDesk.liveMore}
                onToggleShow={eventActions.setShowInFeed} onRemove={(e) => eventActions.removeFromLive(e)} />
            )}
            <div className="text-center py-8 text-muted-foreground">
              <CheckCircle className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>Nothing live yet</p>
              <p className="text-sm mt-2">Approved stories appear here while they are written and published.</p>
            </div>
          </div>
        ) : (
          <PublishedStoriesList 
            stories={visibleStories}
            processingItems={queueItems}
            onArchive={handleArchiveStory}
            onReturnToReview={handleMultiTenantRejectStory}
            onDelete={handleMultiTenantRejectStory}
            onViewStory={handleViewStory}
            onCancelProcessing={handleMultiTenantCancelQueue}
            onRefresh={refreshContent}
            loading={loading}
            topicSlug={topicSlug}
            topicId={selectedTopicId}
            storyReads={pulse?.story_reads}
            risingStoryId={pulse?.rising_story_id ?? null}
            readingNowIds={pulse?.reading_now_story_ids}
            totalPublishedCount={totalPublishedCount}
            hasMorePublished={hasMorePublished}
            loadingMorePublished={loadingMorePublished}
            onLoadMorePublished={loadMorePublished}
            renderAfterFeedPosition={renderWhatsOnAfter}
          />
        )}
      </section>

    </div>
  );
};
