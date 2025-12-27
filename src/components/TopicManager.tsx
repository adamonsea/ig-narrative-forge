import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Plus, Users, BarChart3, MapPin, Hash, Archive, Info, ExternalLink, TrendingUp } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { Link, useNavigate } from "react-router-dom";
import { CreateTopicDialog } from "@/components/CreateTopicDialog";
import { EngagementSparkline } from "@/components/EngagementSparkline";
import { SourceHealthBadge } from "@/components/SourceHealthBadge";
import { CollapsibleAudienceCard } from "@/components/CollapsibleAudienceCard";
import { CollapsibleEngagementCard } from "@/components/CollapsibleEngagementCard";
import { CollapsibleSubscribersCard } from "@/components/CollapsibleSubscribersCard";
import { TrafficHealthAlert } from "@/components/TrafficHealthAlert";

interface Topic {
  id: string;
  name: string;
  description: string;
  topic_type: 'regional' | 'keyword';
  keywords: string[];
  region?: string;
  landmarks?: string[];
  postcodes?: string[];
  organizations?: string[];
  slug?: string;
  is_active: boolean;
  is_public: boolean;
  created_at: string;
  audience_expertise?: 'beginner' | 'intermediate' | 'expert';
  default_tone?: 'formal' | 'conversational' | 'engaging' | 'satirical';
  articles_in_arrivals?: number;
  stories_published_this_week?: number;
  visits_today?: number;
  visits_this_week?: number;
  play_mode_visits_week?: number;
  articles_swiped?: number;
  articles_liked?: number;
  articles_disliked?: number;
  share_clicks?: number;
  source_clicks?: number;
  quiz_responses_count?: number;
  installs_this_week?: number;
  installs_total?: number;
  registrants_this_week?: number;
  registrants_total?: number;
  email_subscribers?: number;
  push_subscribers?: number;
  avg_stories_engaged?: number;
  avg_carousel_swipes?: number;
  avg_final_slides_seen?: number;
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
      // Load topics first to get IDs
      const topicsRes = await supabase
        .from('topics')
        .select('*')
        .eq('created_by', user?.id)
        .eq('is_archived', false)
        .order('created_at', { ascending: false });

      if (topicsRes.error) throw topicsRes.error;
      
      const topicIds = (topicsRes.data || []).map(t => t.id);
      
      // Load stats and subscribers in parallel
      const [statsRes, subscribersRes] = await Promise.all([
        supabase.rpc('get_user_dashboard_stats', { p_user_id: user?.id }),
        topicIds.length > 0 ? supabase
          .from('topic_newsletter_signups')
          .select('topic_id, notification_type, push_subscription')
          .in('topic_id', topicIds)
          .eq('is_active', true) : Promise.resolve({ data: [] })
      ]);
      
      // Create a map of topic_id -> stats for O(1) lookup
      const statsMap = new Map<string, any>();
      (statsRes.data || []).forEach((stat: any) => {
        statsMap.set(stat.topic_id, stat);
      });

      // Count subscribers per topic
      const emailCounts = new Map<string, number>();
      const pushCounts = new Map<string, number>();
      ((subscribersRes as any).data || []).forEach((sub: any) => {
        // Has push subscription = push subscriber
        if (sub.push_subscription) {
          pushCounts.set(sub.topic_id, (pushCounts.get(sub.topic_id) || 0) + 1);
        } else {
          // No push subscription = email subscriber  
          emailCounts.set(sub.topic_id, (emailCounts.get(sub.topic_id) || 0) + 1);
        }
      });

      // Merge topics with their stats
      const topicsWithStats = (topicsRes.data || []).map((topic) => {
        const stats = statsMap.get(topic.id) || {};
        return {
          ...topic,
          topic_type: topic.topic_type as 'regional' | 'keyword',
          articles_in_arrivals: Number(stats.articles_in_arrivals) || 0,
          stories_published_this_week: Number(stats.stories_published_week) || 0,
          visits_today: Number(stats.visits_today) || 0,
          visits_this_week: Number(stats.visits_this_week) || 0,
          play_mode_visits_week: Number(stats.play_mode_visits_week) || 0,
          articles_swiped: 0, // Not used in UI anymore
          articles_liked: Number(stats.articles_liked) || 0,
          articles_disliked: Number(stats.articles_disliked) || 0,
          share_clicks: Number(stats.share_clicks) || 0,
          source_clicks: Number(stats.source_clicks) || 0,
          quiz_responses_count: Number(stats.quiz_responses_count) || 0,
          installs_this_week: Number(stats.installs_this_week) || 0,
          installs_total: Number(stats.installs_total) || 0,
          registrants_this_week: Number(stats.registrants_this_week) || 0,
          registrants_total: Number(stats.registrants_total) || 0,
          avg_stories_engaged: Number(stats.avg_stories_engaged) || 0,
          avg_carousel_swipes: Number(stats.avg_carousel_swipes) || 0,
          avg_final_slides_seen: Number(stats.avg_final_slides_seen) || 0,
          email_subscribers: emailCounts.get(topic.id) || 0,
          push_subscribers: pushCounts.get(topic.id) || 0
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
    loadTopics(); // Refresh the topics list
    navigate(`/dashboard/topic/${topicSlug}`);
  };

  const toggleTopicStatus = async (topicId: string, isActive: boolean) => {
    try {
      const { error } = await supabase
        .from('topics')
        .update({ is_active: isActive })
        .eq('id', topicId);

      if (error) throw error;

      setTopics(topics.map(topic => 
        topic.id === topicId ? { ...topic, is_active: isActive } : topic
      ));

      toast({
        title: "Success",
        description: `Topic ${isActive ? 'published' : 'moved to draft'}`
      });
    } catch (error) {
      console.error('Error updating topic:', error);
      toast({
        title: "Error",
        description: "Failed to update topic",
        variant: "destructive"
      });
    }
  };

  const toggleTopicPublic = async (topicId: string, isPublic: boolean) => {
    try {
      const { error } = await supabase
        .from('topics')
        .update({ is_public: isPublic })
        .eq('id', topicId);

      if (error) throw error;

      setTopics(topics.map(topic => 
        topic.id === topicId ? { ...topic, is_public: isPublic } : topic
      ));

      toast({
        title: "Success",
        description: `Feed ${isPublic ? 'published' : 'unpublished'}`
      });
    } catch (error) {
      console.error('Error updating feed status:', error);
      toast({
        title: "Error",
        description: "Failed to update feed status",
        variant: "destructive"
      });
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

      // Remove from current topics list
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

      {/* Traffic Health Alerts */}
      <TrafficHealthAlert />

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
            return (
              <Card key={topic.id} className="relative overflow-hidden group hover:shadow-lg transition-all duration-300 bg-card border-border hover:border-[hsl(270,100%,68%)]/30">
                <Link 
                  to={`/dashboard/topic/${topic.slug}`}
                  className="block"
                  onClick={(e) => {
                    // Let buttons handle their own clicks
                    const target = e.target as HTMLElement;
                    if (target.closest('button') || target.closest('[role="button"]')) {
                      e.preventDefault();
                    }
                  }}
                >
                  <CardContent className="p-4 md:p-6">
                    {/* Header: Topic Info */}
                    <div className="flex items-start gap-4 mb-6">
                      {topic.branding_config?.logo_url && (
                        <img 
                          src={topic.branding_config.logo_url} 
                          alt={`${topic.name} logo`}
                          className="w-12 h-12 rounded-lg object-cover flex-shrink-0"
                        />
                      )}
                      <div className="flex-1 min-w-0">
                        <h3 className="text-xl md:text-2xl font-bold tracking-tight group-hover:text-[hsl(270,100%,68%)] transition-colors truncate">
                          {topic.name}
                        </h3>
                        <p className="text-sm text-muted-foreground leading-relaxed line-clamp-2">
                          {topic.description}
                        </p>
                      </div>
                    </div>

                    {/* Stats Grid - Consolidated Layout */}
                    <TooltipProvider>
                      {/* Row 1: Content + Audience (collapsible) */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                        {/* Content Group */}
                        <div className="bg-background/30 rounded-xl p-4 border border-border/30">
                          <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-1.5">
                            <BarChart3 className="w-3 h-3" />
                            Content
                          </div>
                          <div className="grid grid-cols-2 gap-3">
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <div className="bg-background/50 rounded-lg p-3 border border-border/50 cursor-help hover:border-border transition-colors">
                                  <div className="text-2xl font-bold text-foreground">
                                    {topic.articles_in_arrivals || 0}
                                  </div>
                                  <div className="text-xs text-muted-foreground">Arrivals</div>
                                </div>
                              </TooltipTrigger>
                              <TooltipContent>
                                <p>New articles discovered, waiting for review</p>
                              </TooltipContent>
                            </Tooltip>
                            
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <div className="bg-background/50 rounded-lg p-3 border border-border/50 cursor-help hover:border-border transition-colors">
                                  <div className="text-2xl font-bold text-foreground">
                                    {topic.stories_published_this_week || 0}
                                  </div>
                                  <div className="text-xs text-muted-foreground">Stories (7d)</div>
                                </div>
                              </TooltipTrigger>
                              <TooltipContent>
                                <p>Stories published in the last 7 days</p>
                              </TooltipContent>
                            </Tooltip>
                          </div>
                          <div className="mt-3">
                            <SourceHealthBadge topicId={topic.id} />
                          </div>
                        </div>

                        {/* Audience Group - Collapsible */}
                        <CollapsibleAudienceCard 
                          topicId={topic.id}
                          visitsToday={topic.visits_today || 0}
                          visitsThisWeek={topic.visits_this_week || 0}
                        />
                      </div>

                      {/* Row 2: Engagement (collapsible) */}
                      <div className="mb-4">
                        <CollapsibleEngagementCard
                          topicId={topic.id}
                          articlesLiked={topic.articles_liked || 0}
                          articlesDisliked={topic.articles_disliked || 0}
                          playModeVisitsWeek={topic.play_mode_visits_week || 0}
                          avgStoriesEngaged={topic.avg_stories_engaged || 0}
                          avgFinalSlidesSeen={topic.avg_final_slides_seen || 0}
                          shareClicks={topic.share_clicks || 0}
                          sourceClicks={topic.source_clicks || 0}
                          quizResponsesCount={topic.quiz_responses_count || 0}
                        />
                      </div>

                      {/* Row 3: Sparkline Trends */}
                      <div className="bg-background/30 rounded-xl p-4 border border-border/30 mb-4">
                        <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-1.5">
                          <TrendingUp className="w-3 h-3" />
                          7-Day Trend
                        </div>
                        <EngagementSparkline topicId={topic.id} />
                      </div>

                      {/* Subscribers Section - Collapsible with email list */}
                      <CollapsibleSubscribersCard
                        topicId={topic.id}
                        installsThisWeek={topic.installs_this_week}
                        installsTotal={topic.installs_total}
                        registrantsThisWeek={topic.registrants_this_week}
                        registrantsTotal={topic.registrants_total}
                        emailSubscribers={topic.email_subscribers || 0}
                        pushSubscribers={topic.push_subscribers || 0}
                      />
                    </TooltipProvider>

                    <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 pt-4 border-t border-border/20 mt-2">
                      <div className="flex flex-wrap items-center gap-2 md:gap-3">
                        <Badge variant="outline" className="flex items-center gap-1.5 bg-card/60 backdrop-blur-sm border-border/50">
                          {topic.topic_type === 'regional' ? <MapPin className="w-3 h-3" /> : <Hash className="w-3 h-3" />}
                          <span className="font-medium text-xs md:text-sm">{topic.topic_type === 'regional' ? 'Regional' : 'General'}</span>
                        </Badge>
                        
                        <div className="flex items-center gap-2 bg-card/40 backdrop-blur-sm rounded-lg p-2 border border-border/30">
                          <div className="text-xs font-medium text-muted-foreground">
                            Status:
                          </div>
                          <Badge variant="secondary" className="h-6 px-2 text-xs font-semibold">
                            Published
                          </Badge>
                        </div>

                        {topic.keywords && topic.keywords.length > 0 && (
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <button 
                                  className="p-1 rounded-full hover:bg-card/60 transition-colors"
                                  onClick={(e) => e.preventDefault()}
                                >
                                  <Info className="w-4 h-4 text-muted-foreground" />
                                </button>
                              </TooltipTrigger>
                              <TooltipContent side="top" className="max-w-xs">
                                <div className="space-y-1">
                                  <p className="font-medium text-xs">Keywords:</p>
                                  <div className="flex flex-wrap gap-1">
                                    {topic.keywords.map((keyword, index) => (
                                      <Badge key={index} variant="secondary" className="text-xs">
                                        {keyword}
                                      </Badge>
                                    ))}
                                  </div>
                                </div>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        )}

                        <span className="text-xs font-medium text-muted-foreground">
                          {new Date(topic.created_at).toLocaleDateString()}
                        </span>
                      </div>

                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          className="hover:bg-[hsl(270,100%,68%)]/10 hover:text-[hsl(270,100%,68%)] hover:border-[hsl(270,100%,68%)]/30 flex items-center gap-2"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            navigate(`/feed/${topic.slug}`);
                          }}
                        >
                          <ExternalLink className="w-3 h-3" />
                          <span className="hidden md:inline">Feed</span>
                        </Button>

                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant="outline"
                                size="sm"
                                className="bg-card/60 backdrop-blur-sm border-border/50 hover:bg-destructive/10 hover:text-destructive p-2"
                                onClick={(e) => {
                                  e.preventDefault();
                                  handleArchiveTopic(topic.id, topic.name);
                                }}
                              >
                                <Archive className="w-4 h-4" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>
                              <p>Archive this topic</p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      </div>
                    </div>
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