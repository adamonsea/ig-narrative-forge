import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { LineChart, Line, ResponsiveContainer, Tooltip } from 'recharts';
import { Loader2 } from 'lucide-react';

interface EngagementSparklineProps {
  topicId: string;
}

interface DayData {
  date: string;
  swipes: number;
  shares: number;
  visitors: number;
  displayDate: string;
}

export const EngagementSparkline = ({ topicId }: EngagementSparklineProps) => {
  const [data, setData] = useState<DayData[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadSparklineData();
  }, [topicId]);

  const loadSparklineData = async () => {
    try {
      setLoading(true);

      // Query last 7 days of engagement data
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      
      const [{ data: interactions, error: interactionsError }, { data: visits, error: visitsError }] = await Promise.all([
        supabase
          .from('story_interactions')
          .select('interaction_type, created_at')
          .eq('topic_id', topicId)
          .gte('created_at', sevenDaysAgo.toISOString())
          .in('interaction_type', ['swipe', 'share_click']),
        supabase
          .from('feed_visits')
          .select('visit_date')
          .eq('topic_id', topicId)
          .gte('visit_date', sevenDaysAgo.toISOString().split('T')[0])
      ]);

      if (interactionsError) throw interactionsError;
      if (visitsError) throw visitsError;

      // Group by day
      const dayMap = new Map<string, { swipes: number; shares: number; visitors: number }>();
      
      // Initialize all 7 days with zero counts
      for (let i = 0; i < 7; i++) {
        const date = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
        const dateKey = date.toISOString().split('T')[0];
        dayMap.set(dateKey, { swipes: 0, shares: 0, visitors: 0 });
      }

      // Count interactions per day
      (interactions || []).forEach((interaction) => {
        const dateKey = interaction.created_at.split('T')[0];
        const existing = dayMap.get(dateKey);
        if (existing) {
          if (interaction.interaction_type === 'swipe') {
            existing.swipes++;
          } else if (interaction.interaction_type === 'share_click') {
            existing.shares++;
          }
        }
      });

      // Count unique visitors per day
      (visits || []).forEach((visit) => {
        const existing = dayMap.get(visit.visit_date);
        if (existing) {
          existing.visitors++;
        }
      });

      // Convert to array and sort by date
      const chartData: DayData[] = Array.from(dayMap.entries())
        .map(([date, counts]) => ({
          date,
          swipes: counts.swipes,
          shares: counts.shares,
          visitors: counts.visitors,
          displayDate: new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
        }))
        .sort((a, b) => a.date.localeCompare(b.date));

      setData(chartData);
    } catch (error) {
      console.error('Error loading engagement sparkline:', error);
      setData([]);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-12">
        <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div className="h-12 flex items-center justify-center text-xs text-muted-foreground">
        No data yet
      </div>
    );
  }

  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-popover border border-border rounded-lg px-2 py-1 shadow-lg">
          <p className="text-xs font-medium">{payload[0].payload.displayDate}</p>
          <p className="text-xs text-primary">Swipes: {payload[0].value}</p>
          <p className="text-xs text-pop">Shares: {payload[1].value}</p>
          <p className="text-xs" style={{ color: 'hsl(270, 100%, 68%)' }}>Visitors: {payload[2].value}</p>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="w-full h-12">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 2, right: 2, bottom: 2, left: 2 }}>
          <Tooltip content={<CustomTooltip />} />
          <Line 
            type="monotone" 
            dataKey="swipes" 
            stroke="hsl(var(--primary))"
            strokeWidth={1.5}
            dot={false}
          />
          <Line 
            type="monotone" 
            dataKey="shares" 
            stroke="hsl(var(--pop))"
            strokeWidth={1.5}
            dot={false}
          />
          <Line 
            type="monotone" 
            dataKey="visitors" 
            stroke="hsl(270, 100%, 68%)"
            strokeWidth={1.5}
            dot={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
};
