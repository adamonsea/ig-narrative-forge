import { opt } from "@/lib/optionalProps";
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
import { findLiveRepeat, groupHeld, splitLiveNow, staleHeld, withJustPublished } from "@/lib/liveNow";
import { withPinnedFirst } from "@/lib/storyPin";
import { useSetStoryPin, useTopicPin } from "@/hooks/useStoryPin";
import { illustrateOnPublish } from "@/lib/illustrateOnPublish";
import { publishNowUpdate } from "@/lib/publishStory";
import { ToastAction } from "@/components/ui/toast";

interface Topic {
  id: string;
  name: string;
  topic_type: 'regional' | 'keyword';
  is_active: boolean;
  keywords?: string[] | undefined;
  landmarks?: string[] | undefined;
  organizations?: string[] | undefined;
  default_tone?: 'formal' | 'conversational' | 'engaging' | 'satirical' | 'rhyming_couplet' | undefined;
  default_writing_style?: 'journalistic' | 'educational' | 'listicle' | 'story_driven' | undefined;
  auto_simplify_enabled?: boolean | undefined;
  automation_quality_threshold?: number | undefined;
}

type DeskArea = 'happened' | 'live' | 'coming';

interface UnifiedContentPipelineProps {
  selectedTopicId?: string | undefined;
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
  const { pin: storyPin, pinnedId } = useTopicPin(selectedTopicId || undefined);
  const setStoryPin = useSetStoryPin(selectedTopicId || undefined);
  const handlePin = useCallback(async (storyId: string | null, hours: number) => {
    try {
      await setStoryPin(storyId, hours);
    } catch (e) {
      console.error("Pin failed", e);
      toast({ title: storyId ? "Couldn't pin" : "Couldn't unpin", description: "Try again.", variant: "destructive" });
    }
  }, [setStoryPin, toast]);
  const eventActions = useEventDeskActions(selectedTopicId || propTopicId);

  const multiTenantActions = useMultiTenantActions();
  const pulseCtx = useTopicPulse();
  const pulse = pulseCtx?.pulse;
  const [animatingStories, setAnimatingStories] = useState<Set<string>>(new Set());
  // Published from the Desk: in Live now at once (until a load confirms it), faded while its picture is drawn.
  const [justPublished, setJustPublished] = useState<Set<string>>(new Set());
  const [settlingIds, setSettlingIds] = useState<Set<string>>(new Set());
  // The owner's click shows at once: the card plays its leave motion, then is gone while the save runs.
  const [leavingIds, setLeavingIds] = useState<Map<string, 'publish' | 'skip'>>(new Map());
  const [skippedIds, setSkippedIds] = useState<Set<string>>(new Set());
  useEffect(() => {
    if (justPublished.size === 0) return;
    const confirmed = stories.filter(s => justPublished.has(s.id) && s.is_published && s.status === 'published').map(s => s.id);
    if (confirmed.length === 0) return;
    setJustPublished(prev => { const n = new Set(prev); confirmed.forEach(id => n.delete(id)); return n; });
  }, [stories, justPublished]);

  useEffect(() => {
    const loadTopics = async () => {
      try {
        const { data, error } = await supabase
          .from('topics')
          .select('id, name, topic_type, is_active, keywords, landmarks, organizations, default_tone, default_writing_style, auto_simplify_enabled, automation_quality_threshold')
          .eq('is_active', true)
          .order('name');

        if (error) throw error;
        setTopics(((data || []).map(topic => ({
          ...topic,
          topic_type: topic.topic_type as 'regional' | 'keyword',
          default_writing_style: topic.default_writing_style as 'journalistic' | 'educational' | 'listicle' | 'story_driven'
        }))) as unknown as Topic[]);

        if (data && data.length > 0 && !selectedTopicId && !propTopicId) {
          setSelectedTopicId(data[0]!.id);
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
        if (data) setTopicSlug(data.slug!);
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

  /** Archive stories (Skip, or every stale one at once); Undo puts each back as it was. */
  const LEAVE_MS = 220;
  const setLeaving = (ids: string[], kind: 'publish' | 'skip' | null) =>
    setLeavingIds(prev => { const n = new Map(prev); ids.forEach(id => (kind ? n.set(id, kind) : n.delete(id))); return n; });
  const setSkipped = (ids: string[], on: boolean) =>
    setSkippedIds(prev => { const n = new Set(prev); ids.forEach(id => (on ? n.add(id) : n.delete(id))); return n; });

  const archiveWithUndo = async (items: { id: string; status: string; is_published: boolean }[], skipped: boolean | 'removed' = false) => {
    const ids = items.map(s => s.id);
    // Gone from the Desk straight away; put back if the save fails or the owner taps Undo.
    setLeaving(ids, 'skip');
    window.setTimeout(() => { setSkipped(ids, true); setLeaving(ids, null); }, LEAVE_MS);
    try {
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
            await supabase.from('stories').update({ ...opt("status", status), is_published: pub === 'true' }).in('id', groupIds);
          }
        } finally {
          setSkipped(ids, false);
          refreshContent();
        }
      };
      toast({
        description: skipped === 'removed' ? 'Removed from feed' : skipped ? 'Skipped' : `Archived ${ids.length} ${ids.length === 1 ? 'story' : 'stories'}`,
        duration: 3000,
        action: <ToastAction altText="Undo" onClick={restore}>Undo</ToastAction>,
      });
      refreshContent();
    } catch (error) {
      console.error('Error archiving stories:', error);
      window.setTimeout(() => { setLeaving(ids, null); setSkipped(ids, false); }, LEAVE_MS);
      toast({ title: skipped ? "Couldn't skip" : "Couldn't archive", description: "Try again.", variant: "destructive" });
    }
  };

  const handleArchiveStale = async (items: { id: string; status: string; is_published: boolean }[]) => {
    if (items.length === 0 || archivingStale) return;
    setArchivingStale(true);
    try {
      await archiveWithUndo(items);
    } finally {
      setArchivingStale(false);
    }
  };

  const publishNow = async (storyId: string, title: string, opts: { withPicture?: boolean } = {}) => {
    const withPicture = opts.withPicture !== false;
    const drop = (setter: typeof setSettlingIds) => setter(prev => { const n = new Set(prev); n.delete(storyId); return n; });
    // The card flows out of the pool at once, then joins Live now (faded) while the save runs.
    let failed = false;
    setLeaving([storyId], 'publish');
    window.setTimeout(() => {
      setLeaving([storyId], null);
      if (failed) return;
      setJustPublished(prev => new Set(prev).add(storyId));
      if (withPicture) setSettlingIds(prev => new Set(prev).add(storyId));
      // Bring it into view where it now sits in Live now (desktop shows all three columns).
      window.setTimeout(() => {
        const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
        document.getElementById(`live-story-${storyId}`)?.scrollIntoView({ block: 'nearest', behavior: reduce ? 'auto' : 'smooth' });
      }, 60);
    }, LEAVE_MS);
    try {
      const publishedAt = new Date().toISOString();
      const { data, error } = await supabase
        .from('stories')
        .update(publishNowUpdate(publishedAt, opts))
        .eq('id', storyId)
        .select('id')
        .maybeSingle();
      if (error) throw error;
      if (!data) throw new Error('No story was updated.');
    } catch (e: any) {
      console.error('Error publishing story:', e);
      failed = true;
      drop(setJustPublished);
      drop(setSettlingIds);
      toast({
        title: "Couldn't publish",
        description: e?.code === '57014' ? 'The database timed out. Refresh to check.' : 'Try again.',
        variant: 'destructive',
      });
      return;
    }
    // On phones Live now is another tab, so say so (with a way there).
    if (!window.matchMedia?.('(min-width: 1024px)').matches) {
      toast({
        description: `"${title}" is live`,
        duration: 3000,
        action: <ToastAction altText="View in Live now" onClick={() => setMobileArea('live')}>View</ToastAction>,
      });
    }
    refreshContent();
    // Draw its picture if it has none; the card stays faded until that's done.
    if (!withPicture) return;
    void illustrateOnPublish(storyId).finally(() => {
      drop(setSettlingIds);
      refreshContent();
    });
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
  const { live: liveFeedOrder, held: heldStories } = splitLiveNow(withJustPublished((stories as any[]).filter(st => !skippedIds.has(st.id)), justPublished));
  // A pinned story sits first, as it does in the public feed.
  const liveStories = withPinnedFirst(liveFeedOrder, pinnedId);
  const visibleIdsKey = [...liveStories, ...heldStories].map(s => s.id).join(',');
  // Drafts nothing will publish on its own wait for a one-click OK; queued ones go out by themselves.
  const { toCheck: storiesToCheck, queued: queuedStories, other: otherHeld } = groupHeld(heldStories as any[]);
  const staleStories = staleHeld(otherHeld);
  // Waiting stories that repeat one already live, with the live story they repeat (for side-by-side compare).
  const repeatOf = new Map<string, any>();
  for (const s of [...storiesToCheck, ...queuedStories] as any[]) {
    const match = findLiveRepeat(s.title || '', liveStories as any[]);
    if (match) repeatOf.set(s.id, match);
  }
  const repeatIds = new Set(repeatOf.keys());
  const repeatsToCheck = storiesToCheck.filter((s: any) => repeatIds.has(s.id));
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
  const areaTabs: { key: DeskArea; label: string; count?: number | undefined }[] = [
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
            {storiesToCheck.length > 0 && <AttentionTag>{storiesToCheck.length} to check</AttentionTag>}
            {newsCount > 0 && <span className="text-base text-muted-foreground tabular-nums">{newsCount} new</span>}
            <NewContentBadge show={newArrivals} onDismiss={clearNewArrivals} />
            <div className="ml-auto flex items-center gap-1">
              <HappenedSettings topicId={selectedTopicId} onChanged={autopilot.refresh} />
              <ArrowRight className="hidden h-4 w-4 text-muted-foreground/70 lg:block" aria-hidden="true" />
            </div>
          </div>
          {storiesToCheck.length > 0 && (
            <section aria-labelledby="stories-to-check" className="space-y-2 rounded-xl border border-attention/50 bg-attention-soft p-3">
              <h4 id="stories-to-check" className="flex items-center gap-2 text-base font-semibold text-attention-foreground">
                <span className="h-2 w-2 rounded-full bg-attention" aria-hidden="true" />
                {storiesToCheck.length === 1 ? "1 story needs your OK" : `${storiesToCheck.length} stories need your OK`}
                {repeatsToCheck.length > 1 && (
                  <Button size="sm" variant="outline" className="ml-auto" onClick={() => archiveWithUndo(repeatsToCheck, true)}>
                    Skip {repeatsToCheck.length} repeats
                  </Button>
                )}
              </h4>
              <PublishedStoriesList
                toCheck
                repeatOf={repeatOf}
                stories={storiesToCheck}
                onSkip={(s) => archiveWithUndo([s], true)}
                onPublishNow={publishNow}
                leavingIds={leavingIds}
                onArchive={handleArchiveStory}
                onReturnToReview={handleMultiTenantRejectStory}
                onDelete={handleMultiTenantRejectStory}
                onViewStory={handleViewStory}
                onRefresh={refreshContent}
                topicSlug={topicSlug}
                topicId={selectedTopicId}
              />
            </section>
          )}
          {selectedTopicId && (
            <RememberedFold foldKey="desk-story-glance" label="Published" contentClassName="pt-2">
              <PublishedGlance topicId={selectedTopicId} />
            </RememberedFold>
          )}
          {queuedStories.length > 0 && (
            <RememberedFold foldKey="desk-queued" label={`Queued · ${queuedStories.length}`} contentClassName="pt-2">
              <PublishedStoriesList
                repeatOf={repeatOf}
                stories={queuedStories}
                onSkip={(s) => archiveWithUndo([s], true)}
                onPublishNow={publishNow}
                leavingIds={leavingIds}
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
          {otherHeld.length > 0 && (
            <RememberedFold foldKey="desk-written-not-live" label={`Written, not in the feed · ${otherHeld.length}`} contentClassName="pt-2">
              {staleStories.length > 0 && (
                <div className="mb-2 flex justify-end">
                  <Button size="sm" variant="ghost" disabled={archivingStale} onClick={() => handleArchiveStale(staleStories)}>
                    Archive {staleStories.length} over a week old
                  </Button>
                </div>
              )}
              <PublishedStoriesList
                stories={otherHeld}
                onSkip={(s) => archiveWithUndo([s], true)}
                onPublishNow={publishNow}
                leavingIds={leavingIds}
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
              pinnedId={pinnedId}
              pinnedUntil={storyPin?.pinned_until ?? null}
              onPin={handlePin}
              onSkip={(s) => archiveWithUndo([s], 'removed')}
              leavingIds={leavingIds}
              settlingIds={settlingIds}
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
              {...opt("storyReads", pulse?.story_reads)}
              risingStoryId={pulse?.rising_story_id ?? null}
              {...opt("readingNowIds", pulse?.reading_now_story_ids)}
              totalPublishedCount={totalPublishedCount}
              hasMorePublished={hasMorePublished}
              loadingMorePublished={loadingMorePublished}
              onLoadMorePublished={loadMorePublished}
              {...opt("renderAfterFeedPosition", renderWhatsOnAfter)}
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
                {...opt("showInFeed", eventDesk?.showInFeed)} onShowInFeedChange={eventActions.setShowInFeed}
                {...opt("suggestOn", eventDesk?.readerSuggestions)} onSuggestChange={eventActions.setReaderSuggestions} />
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
