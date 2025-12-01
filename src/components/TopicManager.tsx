import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Plus, Settings, Users, BarChart3, MapPin, Hash, Trash2, MessageSquare, Clock, Archive, Info, Eye, MousePointer, Share2, ExternalLink, Heart, Brain, ThumbsDown, Gamepad2, TrendingUp, Layers, SlidersHorizontal } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { Link, useNavigate } from "react-router-dom";
import { CreateTopicDialog } from "@/components/CreateTopicDialog";
import { EngagementSparkline } from "@/components/EngagementSparkline";
import { EngagementFunnel } from "@/components/EngagementFunnel";
import { SourceHealthBadge } from "@/components/SourceHealthBadge";
import { engagementColors } from "@/lib/designTokens";

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
      // Only load active (non-archived) topics created by the current user
      const { data, error } = await supabase
        .from('topics')
        .select('*')
        .eq('created_by', user?.id)
        .eq('is_archived', false)
        .order('created_at', { ascending: false });

      if (error) throw error;
      
        // Get real stats for each topic
        const topicsWithStats = await Promise.all((data || []).map(async (topic) => {
          // Get accurate stats that match the Arrivals tab UX
          // 1) Multi-tenant articles for this topic
          const [mtArticlesRes, storiesThisWeekLegacy, storiesThisWeekMT, visitorStats, interactionStats, installStats, registrantStats, swipeInsights, quizStats, engagementAverages] = await Promise.all([
            supabase.rpc('get_topic_articles_multi_tenant', {
              p_topic_id: topic.id,
              p_status: null,
              p_limit: 500
            }),
            // Legacy published stories from this week
            supabase
              .from('stories')
              .select(`
                id,
                article_id,
                articles!inner(topic_id)
              `, { count: 'exact' })
              .in('status', ['ready', 'published'])
              .gte('created_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())
              .eq('articles.topic_id', topic.id),
            // Multi-tenant published stories from this week
            supabase
              .from('stories')
              .select(`
                id,
                topic_article_id,
                topic_articles!inner(topic_id)
              `, { count: 'exact' })
              .in('status', ['ready', 'published'])
              .gte('created_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())
              .eq('topic_articles.topic_id', topic.id)
              .not('topic_article_id', 'is', null),
            // Get visitor stats (now includes play_mode_visits_week)
            supabase.rpc('get_topic_visitor_stats', { p_topic_id: topic.id }),
            // Get interaction stats (swipes and shares)
            supabase.rpc('get_topic_interaction_stats', { p_topic_id: topic.id, p_days: 7 }),
            // Get install stats (homescreen)
            supabase.rpc('get_topic_install_stats', { p_topic_id: topic.id }),
            // Get registrant stats (game mode users)
            supabase.rpc('get_topic_registrant_stats', { p_topic_id: topic.id }),
            // Get liked stories count from Play Mode
            supabase.rpc('get_swipe_insights', { p_topic_id: topic.id }),
            // Get quiz stats
            supabase.rpc('get_topic_quiz_stats', { p_topic_id: topic.id, p_days: 7 }),
            // Get engagement averages (avg stories scrolled, avg stories swiped)
            (supabase.rpc as any)('get_topic_engagement_averages', { p_topic_id: topic.id, p_days: 7 })
          ]);

        const mtArticles = (mtArticlesRes.data || []) as any[];
        const mtIds = new Set(mtArticles.map(a => a.id));

        // 2) Published stories for this topic (ready/published) to exclude from arrivals
        const [{ data: publishedStories }, { data: queuedItems }] = await Promise.all([
          supabase
            .from('stories')
            .select(`topic_article_id, topic_articles!inner(topic_id)`) 
            .in('status', ['ready', 'published'])
            .not('topic_article_id', 'is', null)
            .eq('topic_articles.topic_id', topic.id),
          supabase
            .from('content_generation_queue')
            .select('topic_article_id')
            .in('status', ['pending', 'processing'])
            .not('topic_article_id', 'is', null)
        ]);

        const publishedIds = new Set((publishedStories || []).map(s => s.topic_article_id).filter((id: string | null) => id && mtIds.has(id)) as string[]);
        const queuedIds = new Set((queuedItems || []).map(q => q.topic_article_id).filter((id: string | null) => id && mtIds.has(id)) as string[]);

        // Helper to check if article is parliamentary (matching Arrivals tab exclusion)
        const isParliamentaryArticle = (a: any) => {
          const metadata = a.import_metadata || {};
          return (
            metadata.source === 'parliamentary_vote' ||
            metadata.parliamentary_vote === true ||
            metadata.source === 'parliamentary_weekly_roundup'
          );
        };

        // 3) Count arrivals exactly like the Arrivals tab
        const arrivalsCount = mtArticles.filter(a => (
          a.processing_status === 'new' || a.processing_status === 'processed'
        ) && !publishedIds.has(a.id) && !queuedIds.has(a.id) && !isParliamentaryArticle(a)).length;

          const publishedThisWeek = (storiesThisWeekLegacy.count || 0) + (storiesThisWeekMT.count || 0);
          const visitorData = visitorStats.data?.[0] || { visits_today: 0, visits_this_week: 0, play_mode_visits_week: 0 };
          const interactionData = interactionStats.data?.[0] || { articles_swiped: 0, share_clicks: 0 };
          const installData = installStats.data?.[0] || { installs_this_week: 0, installs_total: 0 };
          const registrantData = registrantStats.data?.[0] || { registrants_this_week: 0, registrants_total: 0 };
          const swipeInsightsData = (swipeInsights.data as any)?.[0] || { total_likes: 0, total_discards: 0 };
          const likedCount = Number(swipeInsightsData?.total_likes) || 0;
          const dislikedCount = Number(swipeInsightsData?.total_discards) || 0;
          const quizData = quizStats.data?.[0] || { quiz_responses_count: 0 };
          const engagementData = engagementAverages?.data?.[0] || { 
            avg_stories_engaged: 0, 
            avg_carousel_swipes: 0,
            avg_final_slides_seen: 0,
            total_source_clicks: 0
          };

          return {
            ...topic,
            topic_type: topic.topic_type as 'regional' | 'keyword',
            articles_in_arrivals: arrivalsCount,
            stories_published_this_week: publishedThisWeek,
            visits_today: visitorData.visits_today || 0,
            visits_this_week: visitorData.visits_this_week || 0,
            play_mode_visits_week: Number(visitorData.play_mode_visits_week) || 0,
            articles_swiped: Number(interactionData.articles_swiped) || 0,
            articles_liked: likedCount,
            articles_disliked: dislikedCount,
            share_clicks: Number(interactionData.share_clicks) || 0,
            source_clicks: Number(engagementData.total_source_clicks) || 0,
            quiz_responses_count: Number(quizData.quiz_responses_count) || 0,
            installs_this_week: Number(installData.installs_this_week) || 0,
            installs_total: Number(installData.installs_total) || 0,
            registrants_this_week: Number(registrantData.registrants_this_week) || 0,
            registrants_total: Number(registrantData.registrants_total) || 0,
            avg_stories_engaged: Number(engagementData.avg_stories_engaged) || 0,
            avg_carousel_swipes: Number(engagementData.avg_carousel_swipes) || 0,
            avg_final_slides_seen: Number(engagementData.avg_final_slides_seen) || 0
          };
      }));
      
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
                    <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4 mb-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2">
                          {topic.branding_config?.logo_url && (
                            <img 
                              src={topic.branding_config.logo_url} 
                              alt={`${topic.name} logo`}
                              className="w-8 h-8 md:w-10 md:h-10 rounded object-cover"
                            />
                          )}
                          <h3 className="text-xl md:text-2xl font-bold tracking-tight group-hover:text-[hsl(270,100%,68%)] transition-colors">
                            {topic.name}
                          </h3>
                        </div>
                        <p className="text-sm text-muted-foreground leading-relaxed">
                          {topic.description}
                        </p>
                      </div>
                      
                      {/* Stats Section */}
                      <TooltipProvider>
                        <div className="flex flex-col gap-3 w-full md:w-auto md:min-w-[180px]">
                          {/* Content Generation Stats */}
                          <div className="space-y-2">
                            <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                              <BarChart3 className="w-3 h-3" />
                              Content
                            </div>
                            <div className="grid grid-cols-2 gap-2">
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <div className="bg-background/50 rounded-lg p-2 border border-border/50 cursor-help">
                                    <div className="text-lg font-bold text-foreground">
                                      {topic.articles_in_arrivals || 0}
                                    </div>
                                    <div className="text-xs font-medium text-muted-foreground">
                                      Arrivals
                                    </div>
                                  </div>
                                </TooltipTrigger>
                                <TooltipContent>
                                  <p>New articles discovered by scrapers, waiting for your review</p>
                                </TooltipContent>
                              </Tooltip>
                              
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <div className="bg-background/50 rounded-lg p-2 border border-border/50 cursor-help">
                                    <div className="text-lg font-bold text-foreground">
                                      {topic.stories_published_this_week || 0}
                                    </div>
                                    <div className="text-xs font-medium text-muted-foreground">
                                      Stories
                                    </div>
                                  </div>
                                </TooltipTrigger>
                                <TooltipContent>
                                  <p>Stories published to your feed in the last 7 days</p>
                                </TooltipContent>
                              </Tooltip>
                            </div>
                            
                            {/* Source Health Badge */}
                            <div className="mt-2">
                              <SourceHealthBadge topicId={topic.id} />
                            </div>
                          </div>
                          
                          {/* Engagement Stats - Last 7 Days */}
                          <div className="space-y-3">
                            <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                              <MousePointer className="w-3 h-3" />
                              Engagement
                            </div>
                            
                            {/* Play Mode Stats */}
                            <div className="space-y-2">
                              <div className="text-[10px] font-medium text-muted-foreground/60 uppercase tracking-wider px-1">
                                Play Mode
                              </div>
                              <div className="grid grid-cols-2 gap-2">
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <div className="bg-pink-500/10 rounded-lg p-2 border border-pink-500/30 cursor-help">
                                      <div className="text-lg font-bold text-pink-500 flex items-center gap-1">
                                        <Heart className="w-3 h-3" />
                                        {topic.articles_liked || 0}
                                      </div>
                                      <div className="text-xs font-medium text-muted-foreground">
                                        Liked
                                      </div>
                                    </div>
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    <p>Stories rated positively in Play Mode</p>
                                  </TooltipContent>
                                </Tooltip>
                                
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <div className="bg-orange-500/10 rounded-lg p-2 border border-orange-500/30 cursor-help">
                                      <div className="text-lg font-bold text-orange-500 flex items-center gap-1">
                                        <ThumbsDown className="w-3 h-3" />
                                        {topic.articles_disliked || 0}
                                      </div>
                                      <div className="text-xs font-medium text-muted-foreground">
                                        Skipped
                                      </div>
                                    </div>
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    <p>Stories rated negatively in Play Mode</p>
                                  </TooltipContent>
                                </Tooltip>
                              </div>
                              
                              {/* Play Mode Visitors & Avg Swiped */}
                              <div className="grid grid-cols-2 gap-2 mt-2">
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <div className="bg-blue-500/10 rounded-lg p-2 border border-blue-500/30 cursor-help">
                                      <div className="text-lg font-bold text-blue-500 flex items-center gap-1">
                                        <Gamepad2 className="w-3 h-3" />
                                        {topic.play_mode_visits_week || 0}
                                      </div>
                                      <div className="text-xs font-medium text-muted-foreground">
                                        Visitors
                                      </div>
                                    </div>
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    <p>Unique visitors to Play Mode this week</p>
                                  </TooltipContent>
                                </Tooltip>
                                
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <div className="bg-cyan-500/10 rounded-lg p-2 border border-cyan-500/30 cursor-help">
                                      <div className="text-lg font-bold text-cyan-500 flex items-center gap-1">
                                        <TrendingUp className="w-3 h-3" />
                                        {topic.avg_carousel_swipes || 0}
                                      </div>
                                      <div className="text-xs font-medium text-muted-foreground">
                                        Avg/User
                                      </div>
                                    </div>
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    <p>Average carousel swipes per user this week</p>
                                  </TooltipContent>
                                </Tooltip>
                              </div>
                            </div>
                            
                            {/* Feed Mode Stats */}
                            <div className="space-y-2 pt-2 border-t border-border/30">
                              <div className="text-[10px] font-medium text-muted-foreground/60 uppercase tracking-wider px-1">
                                Feed Mode
                              </div>
                              <div className="grid grid-cols-2 gap-2">
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <div className="rounded-lg p-2 border cursor-help" style={{ backgroundColor: `${engagementColors.engaged}15`, borderColor: `${engagementColors.engaged}40` }}>
                                      <div className="text-lg font-bold flex items-center gap-1" style={{ color: engagementColors.engaged }}>
                                        <MousePointer className="w-3 h-3" />
                                        {topic.avg_stories_engaged || 0}
                                      </div>
                                      <div className="text-xs font-medium text-muted-foreground">
                                        Engaged
                                      </div>
                                    </div>
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    <p>Avg unique stories engaged per visitor</p>
                                  </TooltipContent>
                                </Tooltip>
                                
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <div className="rounded-lg p-2 border cursor-help" style={{ backgroundColor: `${engagementColors.completed}15`, borderColor: `${engagementColors.completed}40` }}>
                                      <div className="text-lg font-bold flex items-center gap-1" style={{ color: engagementColors.completed }}>
                                        <Layers className="w-3 h-3" />
                                        {topic.avg_final_slides_seen || 0}
                                      </div>
                                      <div className="text-xs font-medium text-muted-foreground">
                                        Completed
                                      </div>
                                    </div>
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    <p>Avg stories read to final slide per visitor</p>
                                  </TooltipContent>
                                </Tooltip>
                              </div>
                              
                              {/* Secondary Feed Stats */}
                              <div className="grid grid-cols-3 gap-2 mt-2">
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <div className="rounded-lg p-2 border cursor-help" style={{ backgroundColor: `${engagementColors.shares}15`, borderColor: `${engagementColors.shares}40` }}>
                                      <div className="text-lg font-bold" style={{ color: engagementColors.shares }}>
                                        {topic.share_clicks || 0}
                                      </div>
                                      <div className="text-xs font-medium text-muted-foreground">
                                        Shares
                                      </div>
                                    </div>
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    <p>Share button clicks on stories</p>
                                  </TooltipContent>
                                </Tooltip>
                                
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <div className="rounded-lg p-2 border cursor-help" style={{ backgroundColor: `${engagementColors.sourceClicks}15`, borderColor: `${engagementColors.sourceClicks}40` }}>
                                      <div className="text-lg font-bold flex items-center gap-1" style={{ color: engagementColors.sourceClicks }}>
                                        <ExternalLink className="w-3 h-3" />
                                        {topic.source_clicks || 0}
                                      </div>
                                      <div className="text-xs font-medium text-muted-foreground">
                                        Source
                                      </div>
                                    </div>
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    <p>Clicks to original source articles</p>
                                  </TooltipContent>
                                </Tooltip>
                                
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <div className="rounded-lg p-2 border cursor-help" style={{ backgroundColor: `${engagementColors.quiz}15`, borderColor: `${engagementColors.quiz}40` }}>
                                      <div className="text-lg font-bold flex items-center gap-1" style={{ color: engagementColors.quiz }}>
                                        <Brain className="w-3 h-3" />
                                        {topic.quiz_responses_count || 0}
                                      </div>
                                      <div className="text-xs font-medium text-muted-foreground">
                                        Quizzed
                                      </div>
                                    </div>
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    <p>Quiz questions answered by readers</p>
                                  </TooltipContent>
                                </Tooltip>
                              </div>
                            </div>
                            
                            {/* Engagement Funnel */}
                            <div className="mt-3 pt-3 border-t border-border/30">
                              <EngagementFunnel topicId={topic.id} />
                            </div>
                            
                            {/* Trend sparkline */}
                            <div className="mt-2">
                              <EngagementSparkline topicId={topic.id} />
                            </div>
                            
                            <div className="text-xs text-muted-foreground italic text-center">
                              Last 7 days
                            </div>
                          </div>
                          
                          {/* Visitor Stats */}
                          <div className="space-y-2">
                            <div className="text-xs font-semibold text-[hsl(270,100%,68%)] uppercase tracking-wider flex items-center gap-1">
                              <Eye className="w-3 h-3" />
                              Visitors
                            </div>
                            <div className="grid grid-cols-2 gap-2">
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <div className="bg-[hsl(270,100%,68%)]/5 rounded-lg p-2 border border-[hsl(270,100%,68%)]/20 cursor-help">
                                    <div className="text-lg font-bold text-[hsl(270,100%,68%)]">
                                      {topic.visits_today || 0}
                                    </div>
                                    <div className="text-xs font-medium text-[hsl(270,100%,68%)]/70">
                                      Today
                                    </div>
                                  </div>
                                </TooltipTrigger>
                                <TooltipContent>
                                  <p>Unique people who viewed your feed today</p>
                                </TooltipContent>
                              </Tooltip>
                              
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <div className="bg-[hsl(270,100%,68%)]/5 rounded-lg p-2 border border-[hsl(270,100%,68%)]/20 cursor-help">
                                    <div className="text-lg font-bold text-[hsl(270,100%,68%)]">
                                      {topic.visits_this_week || 0}
                                    </div>
                                    <div className="text-xs font-medium text-[hsl(270,100%,68%)]/70">
                                      This week
                                    </div>
                                  </div>
                                </TooltipTrigger>
                                <TooltipContent>
                                  <p>Unique people who viewed your feed in the last 7 days</p>
                                </TooltipContent>
                              </Tooltip>
                            </div>
                          </div>

                          {/* Subscribers Section */}
                          {((topic.installs_this_week || 0) > 0 || (topic.installs_total || 0) > 0 || (topic.registrants_this_week || 0) > 0 || (topic.registrants_total || 0) > 0) && (
                            <div className="space-y-2">
                              <div className="text-xs font-semibold text-pop uppercase tracking-wider flex items-center gap-1">
                                <Users className="w-2.5 h-2.5" />
                                Subscribers
                              </div>
                              
                              {/* Homescreen Installs */}
                              {((topic.installs_this_week || 0) > 0 || (topic.installs_total || 0) > 0) && (
                                <>
                                  <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Homescreen</div>
                                  <div className="grid grid-cols-2 gap-2">
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <div className="bg-pop/10 rounded-lg p-2 border border-pop/30 cursor-help">
                                          <div className="text-lg font-bold text-pop-foreground">
                                            {topic.installs_this_week || 0}
                                          </div>
                                          <div className="text-xs font-medium text-muted-foreground">
                                            This week
                                          </div>
                                        </div>
                                      </TooltipTrigger>
                                      <TooltipContent>
                                        <p>Users who added this feed to their phone's home screen this week</p>
                                      </TooltipContent>
                                    </Tooltip>
                                    
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <div className="bg-pop/10 rounded-lg p-2 border border-pop/30 cursor-help">
                                          <div className="text-lg font-bold text-pop-foreground">
                                            {topic.installs_total || 0}
                                          </div>
                                          <div className="text-xs font-medium text-muted-foreground">
                                            Total
                                          </div>
                                        </div>
                                      </TooltipTrigger>
                                      <TooltipContent>
                                        <p>Total users with this feed on their home screen</p>
                                      </TooltipContent>
                                    </Tooltip>
                                  </div>
                                </>
                              )}
                              
                              {/* Registrants (Game Mode users) */}
                              {((topic.registrants_this_week || 0) > 0 || (topic.registrants_total || 0) > 0) && (
                                <>
                                  <div className="text-[10px] text-muted-foreground uppercase tracking-wider mt-2">Registrants</div>
                                  <div className="grid grid-cols-2 gap-2">
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <div className="bg-[hsl(155,100%,67%)]/10 rounded-lg p-2 border border-[hsl(155,100%,67%)]/30 cursor-help">
                                          <div className="text-lg font-bold text-[hsl(155,100%,67%)]">
                                            {topic.registrants_this_week || 0}
                                          </div>
                                          <div className="text-xs font-medium text-muted-foreground">
                                            This week
                                          </div>
                                        </div>
                                      </TooltipTrigger>
                                      <TooltipContent>
                                        <p>New users who signed up to rate stories in Play Mode this week</p>
                                      </TooltipContent>
                                    </Tooltip>
                                    
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <div className="bg-[hsl(155,100%,67%)]/10 rounded-lg p-2 border border-[hsl(155,100%,67%)]/30 cursor-help">
                                          <div className="text-lg font-bold text-[hsl(155,100%,67%)]">
                                            {topic.registrants_total || 0}
                                          </div>
                                          <div className="text-xs font-medium text-muted-foreground">
                                            Total
                                          </div>
                                        </div>
                                      </TooltipTrigger>
                                      <TooltipContent>
                                        <p>Total Play Mode users for this feed</p>
                                      </TooltipContent>
                                    </Tooltip>
                                  </div>
                                </>
                              )}
                            </div>
                          )}
                        </div>
                      </TooltipProvider>
                    </div>

                    <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
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
                          asChild
                          className="hover:bg-[hsl(270,100%,68%)]/10 hover:text-[hsl(270,100%,68%)] hover:border-[hsl(270,100%,68%)]/30"
                          onClick={(e) => e.preventDefault()}
                        >
                          <Link to={`/feed/${topic.slug}`} className="flex items-center gap-2">
                            <ExternalLink className="w-3 h-3" />
                            <span className="hidden md:inline">Feed</span>
                          </Link>
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