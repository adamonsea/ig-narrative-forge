import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { LineChart, Line, ResponsiveContainer, Tooltip } from 'recharts';
import { Loader2 } from 'lucide-react';

interface NewStoriesSparklineProps {
  topicId: string;
}

interface DailyCount {
  date: string;
  story_count: number;
}

export const NewStoriesSparkline = ({ topicId }: NewStoriesSparklineProps) => {
  const [data, setData] = useState<DailyCount[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const { data: counts, error } = await supabase.rpc('get_daily_story_counts', {
          p_topic_id: topicId,
          p_days: 7
        });

        if (error) throw error;

        if (counts) {
          setData(counts.map((c: any) => ({
            date: c.date,
            story_count: Number(c.story_count) || 0
          })));
        }
      } catch (error) {
        console.error('Error fetching story counts:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [topicId]);

  if (loading) {
    return <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />;
  }

  if (data.length === 0) {
    return null;
  }

  const total = data.reduce((sum, d) => sum + d.story_count, 0);
  const hasData = total > 0;

  return (
    <div className="flex items-center gap-2">
      <div className="w-20 h-8">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data}>
            <Line
              type="monotone"
              dataKey="story_count"
              stroke={hasData ? "hsl(var(--primary))" : "hsl(var(--muted))"}
              strokeWidth={1.5}
              dot={false}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: 'hsl(var(--popover))',
                border: '1px solid hsl(var(--border))',
                borderRadius: '6px',
                fontSize: '12px',
                padding: '4px 8px'
              }}
              formatter={(value: number) => [`${value} stories`, '']}
              labelFormatter={(label) => {
                const date = new Date(label);
                return date.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric' });
              }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <span className="text-xs text-muted-foreground">7d</span>
    </div>
  );
};