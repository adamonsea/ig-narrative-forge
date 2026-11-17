import { useState, useEffect, useCallback } from "react";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { NextGatherPanel } from "@/components/topics/insight/NextGatherPanel";
import { AlertCircle, Mail, Check, ArrowRight, ArrowLeft } from "lucide-react";
import { InlineError } from "@/components/ui/editorial";
import { RememberedFold } from "@/components/settings/RememberedFold";
import { AutopilotPill, EventHorizonGlance, PublishedGlance, useAutopilotOn } from "@/components/topic-pipeline/PoolGlance";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useMultiTenantTopicPipeline, MultiTenantArticle } from "@/hooks/useMultiTenantTopicPipeline";
import { useMultiTenantActions } from "@/hooks/useMultiTenantActions";
import MultiTenantArticlesList from "@/components/topic-pipeline/MultiTenantArticlesList";

import { PublishedStoriesList } from "@/components/topic-pipeline/PublishedStoriesList";
import { useTopicPulse } from "@/hooks/useTopicPulse";
import { NewContentBadge } from "@/components/ui/new-content-badge";
import { useEventDesk, useEventDeskActions } from "@/hooks/useWhatsOnEvents";
import { AttentionTag, ComingUpPanel, EventsOffCard, EventsSettings, LiveWhatsOnRow } from "@/components/events/DeskEvents";
import { HappenedSettings } from "@/components/topic-pipeline/HappenedSettings";
import { comingUpTimeline, leftOutOrder, londonTime, londonToday, toCheckOrder } from "@/lib/whatsOn";
import { cn } from "@/lib/utils";
import { whatsOnPositions } from "@/lib/feedCardPositions";
import { splitLiveNow, staleHeld } from "@/lib/liveNow";
import { ToastAction } from "@/components/ui/toast";

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

type DeskArea = 'happened' | 'live' | 'coming';

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
  const [archivingStale, setArchivingStale] = useState(false);
  // Phones show one area at a time, opening on Live now.
  const [mobileArea, setMobileArea] = useState<DeskArea>('live');
  // Re-check the clock every minute so started events leave the Event pool on their own.
  const [, setMinuteTick] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => setMinuteTick((n) => n + 1), 60_000);
    return () => window.clearInterval(id);
  }, []);

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

  /** Archive every stale story in "Written, not in the feed" at once; Undo puts each back as it was. */
  const handleArchiveStale = async (items: { id: string; status: string; is_published: boolean }[]) => {
    if (items.length === 0 || archivingStale) return;
    setArchivingStale(true);
    try {
      const ids = items.map(s => s.id);
      const { error } = await supabase
        .from('stories')
        .update({ status: 'archived', is_published: false, updated_at: new Date().toISOString() })
        .in('id', ids);
      if (error) throw error;
      const restore = async () => {
        const groups = new Map<string, string[]>();
        for (const s of items) {
          const key = `${s.status}|${s.is_published}`;
          groups.set(key, [...(groups.get(key) ?? []), s.id]);
        }
        try {
          for (const [key, groupIds] of groups) {
            const [status, pub] = key.split('|');
            await supabase.from('stories').update({ status, is_published: pub === 'true' }).in('id', groupIds);
          }
        } finally {
          refreshContent();
        }
      };
      toast({
        description: `Archived ${ids.length} ${ids.length === 1 ? 'story' : 'stories'}`,
        duration: 3000,
        action: <ToastAction altText="Undo" onClick={restore}>Undo</ToastAction>,
      });
      refreshContent();
    } catch (error) {
      console.error('Error archiving stale stories:', error);
      toast({ title: "Couldn't archive", description: "Try again.", variant: "destructive" });
    } finally {
      setArchivingStale(false);
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

  // Live now = exactly the feed (same stories, same order); written-but-not-live waits in the Story pool.
  const { live: liveStories, held: heldStories } = splitLiveNow(stories);
  const visibleIdsKey = [...liveStories, ...heldStories].map(s => s.id).join(',');
  const staleStories = staleHeld(heldStories as any[]);
  const setPulseIds = pulseCtx?.setStoryIds;
  useEffect(() => {
    setPulseIds?.(visibleIdsKey ? visibleIdsKey.split(',') : []);
  }, [visibleIdsKey, setPulseIds]);

  // ----- events on the Desk: their own column, the Event pool -----
  const eventsOn = Boolean(eventDesk?.eventsOn);
  const today = londonToday();
  const nowTime = londonTime();
  // Waiting events are pinned on top for a one-click OK (reader suggestions first);
  // below them every live event, soonest first; the rest didn't make the cut.
  const eventsToCheck = eventsOn && eventDesk ? toCheckOrder(eventDesk.waiting, today, nowTime) : [];
  const comingUp = eventsOn && eventDesk ? comingUpTimeline(eventDesk.upcoming, [] as typeof eventDesk.waiting, today, nowTime) : [];
  const leftOutEvents = eventsOn && eventDesk ? leftOutOrder(eventDesk.hidden, today, nowTime) : [];
  const newsCount = totalArticlesCount ?? totalArticles;
  const autopilot = useAutopilotOn(selectedTopicId);
  // The What's on set sits in Live exactly where readers see it (same rule as the feed).
  const whatsOnAt = new Set(whatsOnPositions(Math.max(liveStories.length, 1)));
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

  // Desktop: the two pools sit on a quiet tint and feed the clean, raised Live now column between them.
  const areaClass = (area: DeskArea) => cn(
    'min-w-0 space-y-3',
    mobileArea === area ? 'block' : 'hidden lg:block',
    area === 'live' ? 'bg-mint-soft lg:rounded-xl lg:border lg:p-4 lg:shadow-sm' : 'lg:rounded-xl lg:border lg:border-border/60 lg:bg-muted/40 lg:p-3',
  );
  const areaTabs: { key: DeskArea; label: string; count?: number }[] = [
    { key: 'happened', label: 'Story pool', count: newsCount },
    { key: 'live', label: 'Live now' },
    { key: 'coming', label: 'Event pool', count: eventsToCheck.length },
  ];

  const recoverStuck = async () => {
    try {
      const { data, error } = await supabase.functions.invoke('auto-recover-stuck-stories');
      if (error) throw error;
      const recovered = data?.totalRecovered || 0;
      const processed = data?.processedNow || 0;
      toast({
        title: recovered ? "Processing stuck items…" : "Nothing to recover",
        description: recovered
          ? `Requeued ${recovered} · processed ${processed} now. Watch Live now.`
          : "No stuck items were found.",
      });
      refreshContent();
      for (let i = 0; i < 6; i++) {
        await new Promise((r) => setTimeout(r, 5000));
        refreshContent();
      }
    } catch (error) {
      toast({ title: "Couldn't recover stuck stories", description: error instanceof Error ? error.message : undefined, variant: "destructive" });
    }
  };

  return (
    <div className="space-y-4">
      {/* Quiet inline load-error banner with retry — replaces the old per-refresh error toasts */}
      {loadError && (
        <InlineError message={loadError} actionLabel="Retry" onAction={() => refreshContent()} />
      )}

      {/* Phones: one simple three-way switch, opening on Live now */}
      <div className="grid grid-cols-3 gap-1 rounded-xl bg-muted p-1 lg:hidden" role="tablist" aria-label="Desk areas">
        {areaTabs.map((t) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={mobileArea === t.key}
            onClick={() => setMobileArea(t.key)}
            className={cn(
              'rounded-lg px-2 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              mobileArea === t.key ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground',
            )}
          >
            {t.label}
            {t.count ? <span className="ml-1 tabular-nums text-muted-foreground">{t.count}</span> : null}
          </button>
        ))}
      </div>

      {/* Desktop: incoming news on the left, the feed in the middle, events coming up on the right */}
      <div className="grid gap-6 lg:grid-cols-3 lg:items-start">
        {/* ===== Story pool: waiting news ===== */}
        <section className={areaClass('happened')} aria-labelledby="desk-happened">
          <div className="flex min-h-10 items-center gap-2 border-b pb-2">
            <h3 id="desk-happened" className="text-lg font-semibold text-foreground">Story pool</h3>
            {autopilot.on && <AutopilotPill />}
            {newsCount > 0 && <span className="text-base text-muted-foreground tabular-nums">{newsCount} new</span>}
            <NewContentBadge show={newArrivals} onDismiss={clearNewArrivals} />
            <div className="ml-auto flex items-center gap-1">
              <HappenedSettings topicId={selectedTopicId} onChanged={autopilot.refresh} />
              <ArrowRight className="hidden h-4 w-4 text-muted-foreground/70 lg:block" aria-hidden="true" />
            </div>
          </div>
          {selectedTopicId && (
            <RememberedFold foldKey="desk-story-glance" label="Published" contentClassName="pt-2">
              <PublishedGlance topicId={selectedTopicId} />
            </RememberedFold>
          )}
          {heldStories.length > 0 && (
            <RememberedFold foldKey="desk-written-not-live" label={`Written, not in the feed · ${heldStories.length}`} contentClassName="pt-2">
              {staleStories.length > 0 && (
                <div className="mb-2 flex justify-end">
                  <Button size="sm" variant="ghost" disabled={archivingStale} onClick={() => handleArchiveStale(staleStories)}>
                    Archive {staleStories.length} over a week old
                  </Button>
                </div>
              )}
              <PublishedStoriesList
                stories={heldStories}
                onArchive={handleArchiveStory}
                onReturnToReview={handleMultiTenantRejectStory}
                onDelete={handleMultiTenantRejectStory}
                onViewStory={handleViewStory}
                onRefresh={refreshContent}
                loading={loading}
                topicSlug={topicSlug}
                topicId={selectedTopicId}
              />
            </RememberedFold>
          )}
          {(pulse?.new_arrivals ?? 0) > 0 && (
            <p className="text-sm text-muted-foreground">{pulse!.new_arrivals} new since you last looked</p>
          )}
          {totalArticles === 0 ? (
            <div className="space-y-3">
              <p className="flex items-center gap-2 text-base text-muted-foreground"><Check className="h-4 w-4 text-primary" aria-hidden="true" />All caught up</p>
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
            />
          )}
        </section>

        {/* ===== Live now: exactly what readers see, in feed order ===== */}
        <section className={areaClass('live')} aria-labelledby="desk-live">
          <div className="flex min-h-10 flex-wrap items-center gap-x-2 gap-y-1 bg-mint px-2 py-2 lg:-mx-4 lg:-mt-4 lg:rounded-t-xl lg:px-4">
            <span className="live-pulse live-pulse-light h-2.5 w-2.5 shrink-0 rounded-full bg-mint-foreground" aria-hidden="true" />
            <h3 id="desk-live" className="text-lg font-semibold text-pop-foreground">Live now</h3>
            <NewContentBadge show={newPublished} onDismiss={clearNewPublished} />
            {queueItems.length > 0 && (
              <span className="inline-flex items-center gap-2 text-sm text-pop-foreground animate-fade-in">
                <span className="live-pulse live-pulse-light h-2 w-2 rounded-full bg-pop-foreground/60" aria-hidden="true" />{queueItems.length} being written
              </span>
            )}
            {stuckCount > 0 && (
              <Button size="sm" variant="outline" onClick={recoverStuck}
                className="ml-auto border-destructive/50 text-destructive hover:bg-destructive/10">
                <AlertCircle className="mr-1 h-4 w-4" aria-hidden="true" />
                Recover {stuckCount} stuck
              </Button>
            )}
          </div>

          {liveStories.length === 0 && queueItems.length === 0 ? (
            <div className="space-y-3">
              {eventsOn && eventDesk && (
                <LiveWhatsOnRow first events={eventDesk.live} today={today} showInFeed={eventDesk.showInFeed} liveMore={eventDesk.liveMore}
                  onToggleShow={eventActions.setShowInFeed} onRemove={(e) => eventActions.removeFromLive(e)} />
              )}
              <p className="py-8 text-center text-base text-muted-foreground">Nothing live yet</p>
            </div>
          ) : (
            <PublishedStoriesList
              feedOrder
              stories={liveStories}
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
          <p className="flex items-center gap-1.5 pt-1 text-sm text-muted-foreground">
            <Mail className="h-3.5 w-3.5" aria-hidden="true" />The weekly email takes what's here
          </p>
        </section>

        {/* ===== Event pool: every upcoming event, soonest first; the left-out ones one tap away ===== */}
        <section className={areaClass('coming')} aria-labelledby="desk-coming">
          <div className="flex min-h-10 items-center gap-2 border-b pb-2">
            <ArrowLeft className="hidden h-4 w-4 text-muted-foreground/70 lg:block" aria-hidden="true" />
            <h3 id="desk-coming" className="text-lg font-semibold text-foreground">Event pool</h3>
            {eventsToCheck.length > 0 && <AttentionTag>{eventsToCheck.length} to check</AttentionTag>}
            <div className="ml-auto">
              <EventsSettings on={eventsOn} disabled={!eventDesk} onChange={eventActions.setEventsOn}
                showInFeed={eventDesk?.showInFeed} onShowInFeedChange={eventActions.setShowInFeed}
                suggestOn={eventDesk?.readerSuggestions} onSuggestChange={eventActions.setReaderSuggestions} />
            </div>
          </div>
          {eventsOn && (
            <RememberedFold foldKey="desk-event-glance" label="Events ahead" contentClassName="pt-2">
              <EventHorizonGlance topicId={selectedTopicId} waiting={eventDesk?.waiting ?? []} />
            </RememberedFold>
          )}
          {!eventsOn ? (
            <EventsOffCard disabled={!eventDesk} onSwitchOn={() => eventActions.setEventsOn(true)} />
          ) : (
            <ComingUpPanel toCheck={eventsToCheck} upcoming={comingUp} leftOut={leftOutEvents} today={today} actions={eventActions} topicId={selectedTopicId} />
          )}
        </section>
      </div>
    </div>
  );
};
