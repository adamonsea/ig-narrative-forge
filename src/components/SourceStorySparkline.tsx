import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Loader2, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

interface SourceStorySparklineProps {
  sourceId: string;
  topicId: string;
}

interface WeekStats {
  gathered: number;
  published: number;
  conversionRate: number;
  prevWeekGathered: number;
  dailyData: { date: string; gathered: number; published: number; displayDate: string }[];
}

export const SourceStorySparkline = ({ sourceId, topicId }: SourceStorySparklineProps) => {
  const [stats, setStats] = useState<WeekStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadStats();
  }, [sourceId, topicId]);

  const loadStats = async () => {
    try {
      setLoading(true);

      const now = new Date();
      const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const fourteenDaysAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000).toISOString();

      // Get gathered articles (this week + last week for trend)
      const { data: gatheredData } = await supabase
        .from('topic_articles')
        .select('id, created_at')
        .eq('topic_id', topicId)
        .eq('source_id', sourceId)
        .gte('created_at', fourteenDaysAgo);

      const allGathered = gatheredData || [];
      const thisWeekGathered = allGathered.filter(a => a.created_at >= sevenDaysAgo);
      const prevWeekGathered = allGathered.filter(a => a.created_at < sevenDaysAgo);

      const topicArticleIds = thisWeekGathered.map(ta => ta.id);

      // Get published stories
      let publishedCount = 0;
      if (topicArticleIds.length > 0) {
        const { data: publishedData } = await supabase
          .from('stories')
          .select('created_at')
          .in('topic_article_id', topicArticleIds)
          .eq('is_published', true);
        publishedCount = publishedData?.length || 0;
      }

      // Build daily data for the dot strip
      const dailyData = [];
      for (let i = 6; i >= 0; i--) {
        const date = new Date(now);
        date.setDate(date.getDate() - i);
        date.setHours(0, 0, 0, 0);
        const dateStr = date.toISOString().split('T')[0];
        const displayDate = date.toLocaleDateString('en-GB', { weekday: 'short' });

        const dayGathered = thisWeekGathered.filter(a => {
          const d = new Date(a.created_at);
          d.setHours(0, 0, 0, 0);
          return d.toISOString().split('T')[0] === dateStr;
        }).length;

        dailyData.push({ date: dateStr, gathered: dayGathered, published: 0, displayDate });
      }

      const gathered = thisWeekGathered.length;
      const conversionRate = gathered > 0 ? Math.round((publishedCount / gathered) * 100) : 0;

      setStats({
        gathered,
        published: publishedCount,
        conversionRate,
        prevWeekGathered: prevWeekGathered.length,
        dailyData,
      });
    } catch (error) {
      console.error('Error loading sparkline data:', error);
      setStats(null);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="inline-flex items-center gap-1">
        <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!stats) return null;

  const { gathered, published, conversionRate, prevWeekGathered, dailyData } = stats;

  // Trend calculation
  const trend = prevWeekGathered === 0
    ? (gathered > 0 ? 'up' : 'stable')
    : gathered > prevWeekGathered
      ? 'up'
      : gathered < prevWeekGathered
        ? 'down'
        : 'stable';

  const trendPct = prevWeekGathered > 0
    ? Math.round(((gathered - prevWeekGathered) / prevWeekGathered) * 100)
    : 0;

  // Max dots per day (cap at 3 for visual consistency)
  const maxDots = 3;

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="flex items-center gap-2.5 cursor-default select-none">
            {/* Activity dots — 7 columns, each showing activity level */}
            <div className="flex items-end gap-[3px] h-[28px]">
              {dailyData.map((day, i) => {
                const level = day.gathered === 0 ? 0 : Math.min(day.gathered, maxDots);
                return (
                  <div key={i} className="flex flex-col-reverse gap-[2px] justify-end items-center w-[6px]">
                    {level === 0 ? (
                      <div className="w-[5px] h-[5px] rounded-full bg-muted/60" />
                    ) : (
                      Array.from({ length: level }).map((_, dotIdx) => (
                        <div
                          key={dotIdx}
                          className="w-[5px] h-[5px] rounded-full bg-primary/70"
                          style={{
                            opacity: 0.4 + (dotIdx / maxDots) * 0.6,
                          }}
                        />
                      ))
                    )}
                  </div>
                );
              })}
            </div>

            {/* Conversion pill */}
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] font-semibold tabular-nums text-foreground">
                {gathered}
              </span>
              <span className="text-[10px] text-muted-foreground">→</span>
              <span className="text-[11px] font-semibold tabular-nums text-primary">
                {published}
              </span>
              {gathered > 0 && (
                <span className={`text-[10px] tabular-nums font-medium px-1 py-0.5 rounded ${
                  conversionRate >= 50
                    ? 'bg-green-500/10 text-green-600 dark:text-green-400'
                    : conversionRate >= 20
                      ? 'bg-yellow-500/10 text-yellow-600 dark:text-yellow-400'
                      : 'bg-muted text-muted-foreground'
                }`}>
                  {conversionRate}%
                </span>
              )}
            </div>

            {/* Trend indicator */}
            {prevWeekGathered > 0 && (
              <div className="flex items-center">
                {trend === 'up' && <TrendingUp className="w-3 h-3 text-green-500" />}
                {trend === 'down' && <TrendingDown className="w-3 h-3 text-destructive" />}
                {trend === 'stable' && <Minus className="w-3 h-3 text-muted-foreground" />}
              </div>
            )}
          </div>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="text-xs max-w-[200px]">
          <div className="space-y-1">
            <p className="font-medium">7-day source activity</p>
            <p>Gathered: <span className="font-semibold">{gathered}</span> articles</p>
            <p>Published: <span className="font-semibold text-primary">{published}</span> stories</p>
            <p>Conversion: <span className="font-semibold">{conversionRate}%</span></p>
            {prevWeekGathered > 0 && (
              <p className="text-muted-foreground">
                vs last week: {trendPct > 0 ? '+' : ''}{trendPct}% ({prevWeekGathered} gathered)
              </p>
            )}
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};