import { useState, useEffect } from "react";
import { Spinner } from '@/components/ui/spinner';
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Plus, Archive, ExternalLink, TrendingDown, TrendingUp, AlertTriangle, MoreHorizontal, ShieldCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { Link, useNavigate } from "react-router-dom";
import { CreateTopicDialog } from "@/components/CreateTopicDialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { FeedSafetyDialog } from "@/components/topics/FeedSafetyDialog";
import { FeedBackupsDialog } from "@/components/topics/FeedBackupsDialog";
import { StatusPill, PageState } from "@/components/ui/editorial";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";

interface Topic {
  id: string;
  name: string;
  description: string;
  topic_type: 'regional' | 'keyword';
  keywords: string[];
  region?: string;
  slug?: string;
  is_active: boolean;
  is_public: boolean;
  created_at: string;
  articles_in_arrivals?: number;
  stories_published_this_week?: number;
  visits_this_week?: number;
  visits_last_week?: number;
  articles_liked?: number;
  articles_disliked?: number;
  avg_stories_engaged?: number;
  installs_total?: number;
  registrants_total?: number;
  email_subscribers?: number;
  push_subscribers?: number;
  branding_config?: any;
  _count?: {
    articles: number;
    sources: number;
  };
}

export const TopicManager = () => {
  const navigate = useNavigate();
  const [topics, setTopics] = useState<Topic[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [safetyTarget, setSafetyTarget] = useState<{ id: string; name: string } | null>(null);
  const [backupsTarget, setBackupsTarget] = useState<{ id: string; name: string } | null>(null);
  const [unpublishTarget, setUnpublishTarget] = useState<Topic | null>(null);

  const { toast } = useToast();
  const { user } = useAuth();

  useEffect(() => {
    if (user) {
      loadTopics();
    }
  }, [user]);

  const loadTopics = async () => {
    try {
      const topicsRes = await supabase
        .from('topics')
        .select('*')
        .eq('created_by', user?.id)
        .eq('is_archived', false)
        .order('created_at', { ascending: false });

      if (topicsRes.error) throw topicsRes.error;

      const topicIds = (topicsRes.data || []).map(t => t.id);

      const [statsRes, subscribersRes, sourcesRes] = await Promise.all([
        supabase.rpc('get_user_dashboard_stats', { p_user_id: user?.id }),
        topicIds.length > 0 ? supabase
          .from('topic_newsletter_signups')
          .select('topic_id, notification_type, push_subscription')
          .in('topic_id', topicIds)
          .eq('is_active', true) : Promise.resolve({ data: [] }),
        topicIds.length > 0 ? supabase
          .from('content_sources')
          .select('topic_id')
          .in('topic_id', topicIds)
          .eq('is_active', true) : Promise.resolve({ data: [] })
      ]);

      const statsMap = new Map<string, any>();
      (statsRes.data || []).forEach((stat: any) => {
        statsMap.set(stat.topic_id, stat);
      });

      // Count sources per topic
      const sourceCountMap = new Map<string, number>();
      ((sourcesRes as any).data || []).forEach((s: any) => {
        sourceCountMap.set(s.topic_id, (sourceCountMap.get(s.topic_id) || 0) + 1);
      });

      const emailCounts = new Map<string, number>();
      const pushCounts = new Map<string, number>();
      ((subscribersRes as any).data || []).forEach((sub: any) => {
        if (sub.push_subscription) {
          pushCounts.set(sub.topic_id, (pushCounts.get(sub.topic_id) || 0) + 1);
        } else {
          emailCounts.set(sub.topic_id, (emailCounts.get(sub.topic_id) || 0) + 1);
        }
      });

      const topicsWithStats = (topicsRes.data || []).map((topic) => {
        const stats = statsMap.get(topic.id) || {};
        return {
          ...topic,
          topic_type: topic.topic_type as 'regional' | 'keyword',
          articles_in_arrivals: Number(stats.articles_in_arrivals) || 0,
          stories_published_this_week: Number(stats.stories_published_week) || 0,
          visits_this_week: Number(stats.visits_this_week) || 0,
          visits_last_week: Number(stats.visits_last_week) || 0,
          articles_liked: Number(stats.articles_liked) || 0,
          articles_disliked: Number(stats.articles_disliked) || 0,
          avg_stories_engaged: Number(stats.avg_stories_engaged) || 0,
          installs_total: Number(stats.installs_total) || 0,
          registrants_total: Number(stats.registrants_total) || 0,
          email_subscribers: emailCounts.get(topic.id) || 0,
          push_subscribers: pushCounts.get(topic.id) || 0,
          _count: {
            articles: 0,
            sources: sourceCountMap.get(topic.id) || 0,
          }
        };
      });

      setTopics(topicsWithStats);
    } catch (error) {
      console.error('Error loading topics:', error);
      toast({
        title: "Error",
        description: "Failed to load feeds",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const handleTopicCreated = (topicSlug: string) => {
    loadTopics();
    navigate(`/dashboard/topic/${topicSlug}`);
  };

  const setPublishState = async (topicId: string, isPublic: boolean) => {
    try {
      const { error } = await supabase
        .from('topics')
        .update({ is_public: isPublic, is_active: isPublic })
        .eq('id', topicId);
      if (error) throw error;
      setTopics(prev => prev.map(t => t.id === topicId ? { ...t, is_public: isPublic, is_active: isPublic } : t));
    } catch (error) {
      console.error('Error toggling publish:', error);
      toast({ title: "Error", description: "Failed to update publish state", variant: "destructive" });
    }
  };

  const handlePublishToggle = (topic: Topic) => {
    if (topic.is_public) {
      setUnpublishTarget(topic);
    } else {
      setPublishState(topic.id, true);
    }
  };

  const handleArchiveTopic = (topicId: string, topicName: string) => {
    setSafetyTarget({ id: topicId, name: topicName });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Spinner size="lg" />
      </div>
    );
  }

  const getWowChange = (thisWeek: number, lastWeek: number) => {
    if (lastWeek === 0) return thisWeek > 0 ? 100 : 0;
    return Math.round(((thisWeek - lastWeek) / lastWeek) * 100);
  };

  const getAudienceBreakdown = (topic: Topic) => {
    const email = topic.email_subscribers || 0;
    const push = topic.push_subscribers || 0;
    const reg = topic.registrants_total || 0;
    const installs = topic.installs_total || 0;
    const total = email + push + reg + installs;
    if (total === 0) return { total: 0, label: 'No subscribers yet' };
    const parts: string[] = [];
    if (email > 0) parts.push(`${email} email`);
    if (push > 0) parts.push(`${push} push`);
    if (reg > 0) parts.push(`${reg} registered`);
    if (installs > 0) parts.push(`${installs} installed`);
    return { total, label: parts.join(' · ') };
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-end">
        <Button onClick={() => setShowCreateDialog(true)}>
          <Plus className="w-4 h-4 mr-2" />
          Create feed
        </Button>
      </div>

      <CreateTopicDialog
        open={showCreateDialog}
        onOpenChange={setShowCreateDialog}
        onTopicCreated={handleTopicCreated}
      />

      {topics.length === 0 ? (
        <PageState
          title="No feeds yet"
          description="Create your first feed to start curating stories into your own publication."
          action={
            <Button onClick={() => setShowCreateDialog(true)}>
              <Plus className="w-4 h-4 mr-2" />
              Create your first feed
            </Button>
          }
        />
      ) : (
        <div className="grid gap-5">
          {topics.map((topic) => {
            const wowChange = getWowChange(topic.visits_this_week || 0, topic.visits_last_week || 0);
            const audience = getAudienceBreakdown(topic);
            const trafficAlert = wowChange < -50;
            const arrivalsAttention = (topic.articles_in_arrivals || 0) > 20;

            return (
              <Card key={topic.id} className="relative overflow-hidden group hover:shadow-md transition-shadow duration-200 bg-card border-border">
                <Link
                  to={`/dashboard/topic/${topic.slug}`}
                  className="block"
                  onClick={(e) => {
                    const target = e.target as HTMLElement;
                    if (target.closest('button') || target.closest('[role="button"]')) {
                      e.preventDefault();
                    }
                  }}
                >
                  <CardContent className="p-4 md:p-6 space-y-4">
                    {/* Identity row: name, state, actions */}
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex items-start gap-3 min-w-0">
                        {topic.branding_config?.logo_url && (
                          <img
                            src={topic.branding_config.logo_url}
                            alt={`${topic.name} logo`}
                            className="w-10 h-10 rounded-lg object-cover flex-shrink-0"
                          />
                        )}
                        <div className="min-w-0">
                          <div className="flex items-center gap-2.5 flex-wrap">
                            <h3 className="text-lg md:text-xl font-semibold tracking-tight group-hover:text-purple-dark transition-colors truncate">
                              {topic.name}
                            </h3>
                            <StatusPill live={topic.is_public} onToggle={() => handlePublishToggle(topic)} />
                          </div>
                          <p className="text-xs text-muted-foreground mt-0.5 tabular-nums">
                            {topic.articles_in_arrivals || 0} in arrivals · {topic.stories_published_this_week || 0} published this week · {topic._count?.sources || 0} sources
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-8 hover:bg-purple-soft hover:text-purple-dark hover:border-purple-bright/30"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            navigate(`/feed/${topic.slug}`);
                          }}
                        >
                          <ExternalLink className="w-3 h-3 mr-1.5" />
                          <span className="hidden md:inline text-xs">View</span>
                        </Button>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-8 w-8 p-0"
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                              }}
                            >
                              <MoreHorizontal className="w-4 h-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
                            <DropdownMenuItem
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                navigate(`/dashboard/topic/${topic.slug}?tab=reviews`);
                              }}
                            >
                              <TrendingUp className="w-3.5 h-3.5 mr-2" />
                              Reviews
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                setBackupsTarget({ id: topic.id, name: topic.name });
                              }}
                            >
                              <ShieldCheck className="w-3.5 h-3.5 mr-2" />
                              Backups &amp; restore
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              className="text-destructive focus:text-destructive"
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                handleArchiveTopic(topic.id, topic.name);
                              }}
                            >
                              <Archive className="w-3.5 h-3.5 mr-2" />
                              Archive
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </div>

                    {/* Attention states first, one primary audience signal otherwise */}
                    {trafficAlert ? (
                      <div className="flex items-center gap-2 text-sm text-destructive">
                        <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                        <span>
                          Visitors down {Math.abs(wowChange)}% this week ({topic.visits_this_week || 0} vs {topic.visits_last_week || 0} last week)
                        </span>
                      </div>
                    ) : arrivalsAttention ? (
                      <div className="flex items-center gap-2 text-sm text-foreground">
                        <TrendingUp className="w-4 h-4 text-purple-bright flex-shrink-0" />
                        <span className="tabular-nums">
                          {topic.articles_in_arrivals} stories waiting in Arrivals
                        </span>
                      </div>
                    ) : (
                      <div className="flex items-baseline gap-3 text-sm">
                        <span className="text-2xl font-semibold tabular-nums">{audience.total}</span>
                        <span className="text-muted-foreground truncate">
                          {audience.label === 'No subscribers yet' ? 'No subscribers yet' : `subscribers · ${audience.label}`}
                        </span>
                        {topic.visits_this_week ? (
                          <span className="text-xs text-muted-foreground ml-auto tabular-nums">
                            {topic.visits_this_week} visitors this week
                            {wowChange > 0 && <span className="text-pop ml-1">+{wowChange}%</span>}
                          </span>
                        ) : null}
                      </div>
                    )}
                  </CardContent>
                </Link>
              </Card>
            );
          })}
        </div>
      )}

      <ConfirmationDialog
        isOpen={!!unpublishTarget}
        onClose={() => setUnpublishTarget(null)}
        onConfirm={() => {
          if (unpublishTarget) setPublishState(unpublishTarget.id, false);
        }}
        title={`Take ${unpublishTarget?.name || 'this feed'} offline?`}
        description="It will no longer be visible to readers. You can publish it again at any time."
        confirmText="Take offline"
        variant="destructive"
      />

      {safetyTarget && (
        <FeedSafetyDialog
          open={!!safetyTarget}
          onOpenChange={(open) => !open && setSafetyTarget(null)}
          topicId={safetyTarget.id}
          topicName={safetyTarget.name}
          onArchived={() => {
            setTopics((prev) => prev.filter((t) => t.id !== safetyTarget.id));
            setSafetyTarget(null);
          }}
        />
      )}

      {backupsTarget && (
        <FeedBackupsDialog
          open={!!backupsTarget}
          onOpenChange={(open) => !open && setBackupsTarget(null)}
          topicId={backupsTarget.id}
          topicName={backupsTarget.name}
          onRestored={loadTopics}
        />
      )}
    </div>
  );
};
