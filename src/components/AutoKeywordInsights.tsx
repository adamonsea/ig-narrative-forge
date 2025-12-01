import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { TrendingUp, TrendingDown, AlertTriangle, Sparkles, Check, X, Bell } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface AutoKeywordInsightsProps {
  topicId: string;
}

interface KeywordInsight {
  id: string;
  type: 'trending_up' | 'trending_down' | 'sentiment_shift' | 'coverage_gap' | 'milestone';
  keyword: string;
  message: string;
  severity: 'info' | 'warning' | 'success';
  data: {
    change?: number;
    previousValue?: number;
    currentValue?: number;
    daysInactive?: number;
    milestone?: number;
  };
  dismissed?: boolean;
}

export const AutoKeywordInsights = ({ topicId }: AutoKeywordInsightsProps) => {
  const [insights, setInsights] = useState<KeywordInsight[]>([]);
  const [loading, setLoading] = useState(true);
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    generateInsights();
  }, [topicId]);

  const generateInsights = async () => {
    try {
      setLoading(true);
      const generatedInsights: KeywordInsight[] = [];

      // Get current week start
      const now = new Date();
      const dayOfWeek = now.getDay();
      const daysToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
      const currentWeekStart = new Date(now);
      currentWeekStart.setDate(now.getDate() - daysToMonday);
      currentWeekStart.setHours(0, 0, 0, 0);

      const previousWeekStart = new Date(currentWeekStart);
      previousWeekStart.setDate(previousWeekStart.getDate() - 7);

      // Get current and previous week data
      const { data: currentWeek } = await (supabase as any)
        .from('sentiment_keyword_history')
        .select('*')
        .eq('topic_id', topicId)
        .eq('week_start_date', currentWeekStart.toISOString().split('T')[0]);

      const { data: previousWeek } = await (supabase as any)
        .from('sentiment_keyword_history')
        .select('*')
        .eq('topic_id', topicId)
        .eq('week_start_date', previousWeekStart.toISOString().split('T')[0]);

      // Get tracked keywords
      const { data: trackedKeywords } = await supabase
        .from('sentiment_keyword_tracking')
        .select('keyword_phrase, sentiment_direction, total_mentions, last_seen_at')
        .eq('topic_id', topicId)
        .eq('tracked_for_cards', true);

      // Build lookup maps
      const currentMap = new Map((currentWeek || []).map((w: any) => [w.keyword_phrase, w]));
      const previousMap = new Map((previousWeek || []).map((w: any) => [w.keyword_phrase, w]));

      // Check each keyword for patterns
      for (const kw of trackedKeywords || []) {
        const current = currentMap.get(kw.keyword_phrase) as any;
        const previous = previousMap.get(kw.keyword_phrase) as any;

        if (current && previous) {
          const currentMentions = current.total_mentions || 0;
          const previousMentions = previous.total_mentions || 0;
          
          if (previousMentions > 0) {
            const changePercent = ((currentMentions - previousMentions) / previousMentions) * 100;

            // Trending up significantly (>50%)
            if (changePercent > 50) {
              generatedInsights.push({
                id: `trending_up_${kw.keyword_phrase}`,
                type: 'trending_up',
                keyword: kw.keyword_phrase,
                message: `"${kw.keyword_phrase}" is trending up ${Math.round(changePercent)}% this week`,
                severity: 'success',
                data: { change: changePercent, previousValue: previousMentions, currentValue: currentMentions }
              });
            }

            // Trending down significantly (>50%)
            if (changePercent < -50) {
              generatedInsights.push({
                id: `trending_down_${kw.keyword_phrase}`,
                type: 'trending_down',
                keyword: kw.keyword_phrase,
                message: `"${kw.keyword_phrase}" is down ${Math.round(Math.abs(changePercent))}% this week`,
                severity: 'warning',
                data: { change: changePercent, previousValue: previousMentions, currentValue: currentMentions }
              });
            }
          }

          // Sentiment shift detection
          const currentPositive = (current.positive_mentions || 0) > (current.negative_mentions || 0);
          const previousPositive = (previous.positive_mentions || 0) > (previous.negative_mentions || 0);

          if (currentPositive !== previousPositive && current.total_mentions > 5) {
            generatedInsights.push({
              id: `sentiment_shift_${kw.keyword_phrase}`,
              type: 'sentiment_shift',
              keyword: kw.keyword_phrase,
              message: `"${kw.keyword_phrase}" sentiment shifted from ${previousPositive ? 'positive' : 'negative'} to ${currentPositive ? 'positive' : 'negative'}`,
              severity: 'warning',
              data: {}
            });
          }
        }

        // Coverage gap: no activity for 7+ days
        if (kw.last_seen_at) {
          const lastSeen = new Date(kw.last_seen_at);
          const daysSinceLastSeen = Math.floor((now.getTime() - lastSeen.getTime()) / (1000 * 60 * 60 * 24));
          
          if (daysSinceLastSeen >= 7) {
            generatedInsights.push({
              id: `coverage_gap_${kw.keyword_phrase}`,
              type: 'coverage_gap',
              keyword: kw.keyword_phrase,
              message: `"${kw.keyword_phrase}" has had no coverage for ${daysSinceLastSeen} days`,
              severity: 'info',
              data: { daysInactive: daysSinceLastSeen }
            });
          }
        }
      }

      // Check for engagement milestones
      const { count: totalInteractions } = await supabase
        .from('story_interactions')
        .select('id', { count: 'exact', head: true })
        .eq('topic_id', topicId);

      const milestones = [100, 500, 1000, 5000, 10000];
      const reachedMilestone = milestones.find(m => 
        totalInteractions && totalInteractions >= m && totalInteractions < m * 1.1
      );

      if (reachedMilestone) {
        generatedInsights.push({
          id: `milestone_${reachedMilestone}`,
          type: 'milestone',
          keyword: 'engagement',
          message: `🎉 Your feed just passed ${reachedMilestone.toLocaleString()} total interactions!`,
          severity: 'success',
          data: { milestone: reachedMilestone }
        });
      }

      setInsights(generatedInsights);
    } catch (error) {
      console.error('Error generating keyword insights:', error);
    } finally {
      setLoading(false);
    }
  };

  const dismissInsight = (id: string) => {
    setDismissedIds(prev => new Set([...prev, id]));
    toast.success('Insight dismissed');
  };

  const visibleInsights = insights.filter(i => !dismissedIds.has(i.id));

  const getIcon = (type: KeywordInsight['type']) => {
    switch (type) {
      case 'trending_up': return <TrendingUp className="h-4 w-4 text-green-500" />;
      case 'trending_down': return <TrendingDown className="h-4 w-4 text-destructive" />;
      case 'sentiment_shift': return <AlertTriangle className="h-4 w-4 text-orange-500" />;
      case 'coverage_gap': return <Bell className="h-4 w-4 text-muted-foreground" />;
      case 'milestone': return <Sparkles className="h-4 w-4 text-primary" />;
    }
  };

  const getBadgeVariant = (severity: KeywordInsight['severity']) => {
    switch (severity) {
      case 'success': return 'default';
      case 'warning': return 'destructive';
      default: return 'secondary';
    }
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-4 w-56 mt-1" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-12 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (visibleInsights.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Sparkles className="h-4 w-4" />
            Keyword Insights
          </CardTitle>
          <CardDescription>
            Auto-generated insights from your tracked keywords
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground text-center py-4">
            No notable patterns detected this week. Keep tracking!
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <Sparkles className="h-4 w-4" />
              Keyword Insights
            </CardTitle>
            <CardDescription>
              Auto-generated from your tracked keywords
            </CardDescription>
          </div>
          <Badge variant="secondary">{visibleInsights.length}</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        {visibleInsights.map((insight) => (
          <div 
            key={insight.id}
            className="flex items-start gap-3 p-3 rounded-lg border bg-muted/30"
          >
            <div className="mt-0.5">{getIcon(insight.type)}</div>
            <div className="flex-1 min-w-0">
              <p className="text-sm">{insight.message}</p>
              {insight.data.change && (
                <Badge variant={getBadgeVariant(insight.severity)} className="mt-1 text-xs">
                  {insight.data.previousValue} → {insight.data.currentValue} mentions
                </Badge>
              )}
            </div>
            <Button 
              variant="ghost" 
              size="sm" 
              className="h-6 w-6 p-0 shrink-0"
              onClick={() => dismissInsight(insight.id)}
            >
              <X className="h-3 w-3" />
            </Button>
          </div>
        ))}
      </CardContent>
    </Card>
  );
};
