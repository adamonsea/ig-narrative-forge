import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Calendar, Clock, TrendingUp, ExternalLink, Eye } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { format, subDays, parseISO } from 'date-fns';
import { Link } from 'react-router-dom';

interface FlashbackInsightsPanelProps {
  topicId: string;
  topicSlug?: string;
}

interface FlashbackStory {
  id: string;
  title: string;
  created_at: string;
  cover_illustration_url?: string;
  views?: number;
  shares?: number;
}

interface FlashbackData {
  stories: FlashbackStory[];
  date: Date;
  totalStoriesThen: number;
  totalStoriesNow: number;
  engagement: {
    viewsThen: number;
    viewsNow: number;
  };
}

export const FlashbackInsightsPanel = ({ topicId, topicSlug }: FlashbackInsightsPanelProps) => {
  const [data, setData] = useState<FlashbackData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadFlashbackData();
  }, [topicId]);

  const loadFlashbackData = async () => {
    try {
      setLoading(true);
      
      // Target date: 30 days ago with ±3 day window
      const targetDate = subDays(new Date(), 30);
      const windowStart = subDays(targetDate, 3);
      const windowEnd = subDays(targetDate, -3);

      // Get topic articles from that time window
      const { data: topicArticles, error: taError } = await supabase
        .from('topic_articles')
        .select('id')
        .eq('topic_id', topicId)
        .gte('created_at', windowStart.toISOString())
        .lte('created_at', windowEnd.toISOString());

      if (taError) throw taError;

      const topicArticleIds = topicArticles?.map(ta => ta.id) || [];

      if (topicArticleIds.length === 0) {
        setData(null);
        setLoading(false);
        return;
      }

      // Get stories from that time window
      const { data: stories, error: storiesError } = await supabase
        .from('stories')
        .select('id, title, created_at, cover_illustration_url')
        .in('topic_article_id', topicArticleIds)
        .eq('is_published', true)
        .order('created_at', { ascending: false })
        .limit(3);

      if (storiesError) throw storiesError;

      // Get engagement counts for those stories
      const storyIds = (stories || []).map(s => s.id);
      
      let storiesWithEngagement: FlashbackStory[] = (stories || []).map(s => ({
        ...s,
        views: 0,
        shares: 0
      }));

      if (storyIds.length > 0) {
        // Get view counts
        const { data: interactions } = await supabase
          .from('story_interactions')
          .select('story_id, interaction_type')
          .in('story_id', storyIds);

        // Calculate per-story engagement
        for (const story of storiesWithEngagement) {
          const storyInteractions = (interactions || []).filter(i => i.story_id === story.id);
          story.views = storyInteractions.filter(i => i.interaction_type === 'swipe').length;
          story.shares = storyInteractions.filter(i => i.interaction_type === 'share_click').length;
        }
      }

      // Get total story counts for comparison
      const { count: totalThen } = await supabase
        .from('topic_articles')
        .select('id', { count: 'exact', head: true })
        .eq('topic_id', topicId)
        .lte('created_at', windowEnd.toISOString());

      const { count: totalNow } = await supabase
        .from('topic_articles')
        .select('id', { count: 'exact', head: true })
        .eq('topic_id', topicId);

      // Get engagement comparison (simplified)
      const thenEnd = windowEnd.toISOString();
      const { count: viewsThen } = await supabase
        .from('story_interactions')
        .select('id', { count: 'exact', head: true })
        .eq('topic_id', topicId)
        .eq('interaction_type', 'swipe')
        .lte('created_at', thenEnd);

      const { count: viewsNow } = await supabase
        .from('story_interactions')
        .select('id', { count: 'exact', head: true })
        .eq('topic_id', topicId)
        .eq('interaction_type', 'swipe');

      setData({
        stories: storiesWithEngagement,
        date: targetDate,
        totalStoriesThen: totalThen || 0,
        totalStoriesNow: totalNow || 0,
        engagement: {
          viewsThen: viewsThen || 0,
          viewsNow: viewsNow || 0
        }
      });
    } catch (error) {
      console.error('Error loading flashback data:', error);
      setData(null);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-5 w-48" />
          <Skeleton className="h-4 w-32 mt-1" />
        </CardHeader>
        <CardContent className="space-y-3">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (!data || data.stories.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Calendar className="h-4 w-4" />
            This Time Last Month
          </CardTitle>
          <CardDescription>
            No stories from 30 days ago
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground text-center py-4">
            Check back after your feed has been running for a month!
          </p>
        </CardContent>
      </Card>
    );
  }

  const growthPercent = data.totalStoriesThen > 0 
    ? Math.round(((data.totalStoriesNow - data.totalStoriesThen) / data.totalStoriesThen) * 100)
    : 0;

  const engagementGrowth = data.engagement.viewsThen > 0
    ? Math.round(((data.engagement.viewsNow - data.engagement.viewsThen) / data.engagement.viewsThen) * 100)
    : 0;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <Calendar className="h-4 w-4" />
              This Time Last Month
            </CardTitle>
            <CardDescription className="flex items-center gap-1 mt-1">
              <Clock className="h-3 w-3" />
              {format(data.date, 'MMMM d, yyyy')}
            </CardDescription>
          </div>
          {growthPercent > 0 && (
            <Badge className="bg-green-600 gap-1">
              <TrendingUp className="h-3 w-3" />
              +{growthPercent}% stories
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Top stories from that time */}
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Popular Stories Then
          </p>
          {data.stories.map((story) => (
            <Link 
              key={story.id}
              to={topicSlug ? `/feed/${topicSlug}/story/${story.id}` : '#'}
              className="block"
            >
              <div className="flex items-start gap-3 p-2 rounded-lg hover:bg-muted/50 transition-colors group">
                {story.cover_illustration_url && (
                  <img 
                    src={story.cover_illustration_url} 
                    alt=""
                    className="w-12 h-12 rounded object-cover shrink-0"
                  />
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium line-clamp-2 group-hover:text-primary transition-colors">
                    {story.title}
                  </p>
                  <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Eye className="h-3 w-3" />
                      {story.views || 0}
                    </span>
                    {(story.shares || 0) > 0 && (
                      <span className="flex items-center gap-1">
                        <ExternalLink className="h-3 w-3" />
                        {story.shares}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </Link>
          ))}
        </div>

        {/* Growth comparison */}
        <div className="grid grid-cols-2 gap-4 pt-3 border-t">
          <div className="text-center">
            <div className="text-xl font-bold text-foreground">
              {data.totalStoriesThen}
              <span className="text-xs font-normal text-muted-foreground ml-1">→ {data.totalStoriesNow}</span>
            </div>
            <div className="text-xs text-muted-foreground">Total Stories</div>
          </div>
          <div className="text-center">
            <div className="text-xl font-bold text-foreground">
              {engagementGrowth > 0 ? '+' : ''}{engagementGrowth}%
            </div>
            <div className="text-xs text-muted-foreground">Engagement Growth</div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
