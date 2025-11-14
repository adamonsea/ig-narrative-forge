import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { BarChart, Bar, XAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { Loader2 } from 'lucide-react';

interface SourceStorySparklineProps {
  sourceId: string;
  topicId: string;
}

interface DayData {
  date: string;
  unpublished: number;
  published: number;
  displayDate: string;
}

export const SourceStorySparkline = ({ sourceId, topicId }: SourceStorySparklineProps) => {
  const [data, setData] = useState<DayData[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadSparklineData();
  }, [sourceId, topicId]);

  const loadSparklineData = async () => {
    try {
      setLoading(true);

      // Query last 7 days
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      
      // Get all topic_articles for this source+topic (GATHERED)
      const { data: gatheredData } = await supabase
        .from('topic_articles')
        .select('id, created_at')
        .eq('topic_id', topicId)
        .eq('source_id', sourceId)
        .gte('created_at', sevenDaysAgo);

      const topicArticleIds = gatheredData?.map(ta => ta.id) || [];
      const gatheredArticles: Array<{ created_at: string }> = gatheredData || [];

      // Get published stories for those topic_articles (PUBLISHED)
      const { data: publishedData, error } = await supabase
        .from('stories')
        .select('created_at')
        .in('topic_article_id', topicArticleIds)
        .eq('is_published', true)
        .gte('created_at', sevenDaysAgo);

      if (error) throw error;

      const publishedStories: Array<{ created_at: string }> = publishedData || [];

      // Create array for last 7 days
      const last7Days: DayData[] = [];
      const today = new Date();
      
      for (let i = 6; i >= 0; i--) {
        const date = new Date(today);
        date.setDate(date.getDate() - i);
        date.setHours(0, 0, 0, 0);
        
        const dateStr = date.toISOString().split('T')[0];
        const displayDate = date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
        
        // Count gathered articles for this day
        const gathered = gatheredArticles.filter(article => {
          const articleDate = new Date(article.created_at);
          articleDate.setHours(0, 0, 0, 0);
          return articleDate.toISOString().split('T')[0] === dateStr;
        }).length;

        // Count published stories for this day
        const published = publishedStories.filter(story => {
          const storyDate = new Date(story.created_at);
          storyDate.setHours(0, 0, 0, 0);
          return storyDate.toISOString().split('T')[0] === dateStr;
        }).length;

        last7Days.push({
          date: dateStr,
          unpublished: Math.max(0, gathered - published),
          published,
          displayDate
        });
      }

      setData(last7Days);
    } catch (error) {
      console.error('Error loading sparkline data:', error);
      setData([]);
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

  const maxCount = Math.max(...data.map(d => d.unpublished + d.published), 1);

  return (
    <div className="inline-block w-[120px] h-[40px]">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 2, right: 2, left: 2, bottom: 2 }}>
          <XAxis dataKey="date" hide />
          <Tooltip 
            content={({ active, payload }) => {
              if (active && payload && payload[0]) {
                const data = payload[0].payload as DayData;
                const total = data.unpublished + data.published;
                return (
                  <div className="bg-popover border border-border rounded px-2 py-1 shadow-lg">
                    <p className="text-xs font-medium">{data.displayDate}</p>
                    <p className="text-xs text-muted-foreground">Gathered: {total}</p>
                    <p className="text-xs text-primary">Published: {data.published}</p>
                  </div>
                );
              }
              return null;
            }}
            cursor={false}
          />
          <Bar 
            dataKey="unpublished" 
            stackId="stories"
            fill="hsl(var(--muted))"
            radius={[0, 0, 0, 0]}
            maxBarSize={16}
          />
          <Bar 
            dataKey="published" 
            stackId="stories"
            fill="hsl(var(--primary))"
            radius={[2, 2, 0, 0]}
            maxBarSize={16}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
};
