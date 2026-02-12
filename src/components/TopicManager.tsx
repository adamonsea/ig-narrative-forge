import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Plus, Hash, Archive, ExternalLink, TrendingUp, TrendingDown, AlertTriangle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { Link, useNavigate } from "react-router-dom";
import { CreateTopicDialog } from "@/components/CreateTopicDialog";
import { EngagementSparkline } from "@/components/EngagementSparkline";

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
          visits_last_week: Number(stats.visits_last_week) || 0,  // Now from RPC
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
        description: "Failed to load topics",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const handleTopicCreated = (topicSlug: string) => {
    toast({
      title: "Success!",
      description: "Topic created successfully! Redirecting to topic dashboard..."
    });
    loadTopics();
    navigate(`/dashboard/topic/${topicSlug}`);
  };

  const handlePublishToggle = async (topicId: string, currentlyPublic: boolean) => {
    if (currentlyPublic) {
      if (!confirm('Take this topic offline? It will no longer be visible to readers.')) return;
    }
    const newPublic = !currentlyPublic;
    try {
      const { error } = await supabase
        .from('topics')
        .update({ is_public: newPublic, is_active: newPublic })
        .eq('id', topicId);
      if (error) throw error;
      setTopics(prev => prev.map(t => t.id === topicId ? { ...t, is_public: newPublic, is_active: newPublic } : t));
    } catch (error) {
      console.error('Error toggling publish:', error);
      toast({ title: "Error", description: "Failed to update publish state", variant: "destructive" });
    }
  };

  const handleArchiveTopic = async (topicId: string, topicName: string) => {
    if (!confirm(`Archive "${topicName}"? You can restore it later from the archive.`)) {
      return;
    }

    try {
      const { error } = await supabase
        .from('topics')
        .update({ 
          is_archived: true,
          archived_at: new Date().toISOString(),
          archived_by: user?.id
        })
        .eq('id', topicId);

      if (error) throw error;
      setTopics(topics.filter(topic => topic.id !== topicId));
      toast({
        title: "Success",
        description: `"${topicName}" has been archived`
      });
    } catch (error) {
      console.error('Error archiving topic:', error);
      toast({
        title: "Error",
        description: "Failed to archive topic",
        variant: "destructive"
      });
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  const getWowChange = (thisWeek: number, lastWeek: number) => {
    if (lastWeek === 0) return thisWeek > 0 ? 100 : 0;
    return Math.round(((thisWeek - lastWeek) / lastWeek) * 100);
  };

  const getApprovalRate = (liked: number, disliked: number) => {
    const total = liked + disliked;
    if (total === 0) return null;
    return Math.round((liked / total) * 100);
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
        <Button onClick={() => setShowCreateDialog(true)} className="bg-[hsl(270,100%,68%)] hover:bg-[hsl(270,100%,68%)]/90 text-white">
          <Plus className="w-4 h-4 mr-2" />
          Create Topic
        </Button>
      </div>

      <CreateTopicDialog
        open={showCreateDialog}
        onOpenChange={setShowCreateDialog}
        onTopicCreated={handleTopicCreated}
      />

      {topics.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center">
            <div className="mb-4">
              <Hash className="w-16 h-16 mx-auto text-muted-foreground" />
            </div>
            <h3 className="text-lg font-semibold mb-2">No topics yet</h3>
            <p className="text-muted-foreground mb-4">
              Create your first topic to start curating content feeds
            </p>
            <Button onClick={() => setShowCreateDialog(true)} className="bg-[hsl(270,100%,68%)] hover:bg-[hsl(270,100%,68%)]/90 text-white">
              <Plus className="w-4 h-4 mr-2" />
              Create Your First Topic
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-6">
          {topics.map((topic) => {
            const wowChange = getWowChange(topic.visits_this_week || 0, topic.visits_last_week || 0);
            const approvalRate = getApprovalRate(topic.articles_liked || 0, topic.articles_disliked || 0);
            const audience = getAudienceBreakdown(topic);
            const trafficAlert = wowChange < -50;

            return (
              <Card key={topic.id} className="relative overflow-hidden group hover:shadow-lg transition-all duration-300 bg-card border-border hover:border-[hsl(270,100%,68%)]/30">
                {/* Accent bar */}
                <div className={`h-[3px] w-full ${
                  topic.is_public
                    ? 'bg-gradient-to-r from-[hsl(270,100%,68%)] to-[hsl(270,100%,68%)]/30'
                    : 'bg-muted/50'
                }`} />
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
                  <CardContent className="p-4 md:p-6">
                    {/* Header: Name + pill + actions */}
                    <div className="flex items-start justify-between gap-4 mb-5">
                      <div className="flex items-start gap-3 min-w-0">
                        {topic.branding_config?.logo_url && (
                          <img 
                            src={topic.branding_config.logo_url} 
                            alt={`${topic.name} logo`}
                            className="w-10 h-10 rounded-lg object-cover flex-shrink-0"
                          />
                        )}
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <h3 className="text-lg md:text-xl font-bold tracking-tight group-hover:text-[hsl(270,100%,68%)] transition-colors truncate">
                              {topic.name}
                            </h3>
                            <button
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                handlePublishToggle(topic.id, topic.is_public);
                              }}
                              className={`text-[10px] px-2 py-0.5 rounded-full font-medium flex-shrink-0 transition-colors ${
                                topic.is_public
                                  ? 'bg-green-500/15 text-green-600 dark:text-green-400 hover:bg-green-500/25'
                                  : 'bg-muted text-muted-foreground hover:bg-muted/80'
                              }`}
                            >
                              {topic.is_public ? 'Live' : 'Draft'}
                            </button>
                          </div>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {topic.articles_in_arrivals || 0} in arrivals · {topic.stories_published_this_week || 0} published · {topic._count?.sources || 0} sources
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-8 hover:bg-[hsl(270,100%,68%)]/10 hover:text-[hsl(270,100%,68%)] hover:border-[hsl(270,100%,68%)]/30"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            navigate(`/feed/${topic.slug}`);
                          }}
                        >
                          <ExternalLink className="w-3 h-3 mr-1.5" />
                          <span className="hidden md:inline text-xs">Feed</span>
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-8 hover:bg-destructive/10 hover:text-destructive"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            handleArchiveTopic(topic.id, topic.name);
                          }}
                        >
                          <Archive className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </div>

                    {/* Inline Stats Row */}
                    <div className="grid grid-cols-3 gap-4 mb-4">
                      {/* Visitors */}
                      <div>
                        <div className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-1" title="Unique visitors to your feed this week">Visitors</div>
                        <div className="text-xl font-bold">{topic.visits_this_week || 0}</div>
                        <div className={`text-xs flex items-center gap-0.5 mt-0.5 ${
                          trafficAlert ? 'text-destructive font-medium' : 
                          wowChange > 0 ? 'text-green-600 dark:text-green-400' : 
                          wowChange < 0 ? 'text-muted-foreground' : 'text-muted-foreground'
                        }`}>
                          {trafficAlert && <AlertTriangle className="w-3 h-3" />}
                          {wowChange > 0 && <TrendingUp className="w-3 h-3" />}
                          {wowChange < 0 && !trafficAlert && <TrendingDown className="w-3 h-3" />}
                          {wowChange > 0 ? '+' : ''}{wowChange}% WoW
                        </div>
                      </div>

                      {/* Approval */}
                      <div>
                        <div className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-1" title="% of stories readers swiped right on">Approval</div>
                        <div className="text-xl font-bold">
                          {approvalRate !== null ? `${approvalRate}%` : '—'}
                        </div>
                        <div className="text-xs text-muted-foreground mt-0.5">
                          {(topic.avg_stories_engaged || 0) > 0 
                            ? `${(topic.avg_stories_engaged || 0).toFixed(1)} avg engaged` 
                            : 'No data'}
                        </div>
                      </div>

                      {/* Audience */}
                      <div>
                        <div className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-1" title="People subscribed to your feed updates">Audience</div>
                        <div className="text-xl font-bold">{audience.total}</div>
                        <div className="text-xs text-muted-foreground mt-0.5">{audience.label}</div>
                      </div>
                    </div>

                    {/* Sparkline - visitors only */}
                    <EngagementSparkline topicId={topic.id} minimal />
                  </CardContent>
                </Link>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
};
