import { useState, useEffect, useMemo } from 'react';
import { LineChart, Line, ResponsiveContainer } from 'recharts';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

interface KeywordSparklineProps {
  topicId: string;
  keyword: string;
  sentimentDirection?: string;
}

interface HistoryPoint {
  week: string;
  mentions: number;
}

export const KeywordSparkline = ({ topicId, keyword, sentimentDirection }: KeywordSparklineProps) => {
  const [data, setData] = useState<HistoryPoint[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadHistory();
  }, [topicId, keyword, sentimentDirection]);

  const loadHistory = async () => {
    try {
      let query = (supabase as any)
        .from('sentiment_keyword_history')
        .select('week_start_date, total_mentions')
        .eq('topic_id', topicId)
        .eq('keyword_phrase', keyword)
        .order('week_start_date', { ascending: true })
        .limit(6);

      if (sentimentDirection) {
        query = query.eq('sentiment_direction', sentimentDirection);
      }

      const { data: history, error } = await query;

      if (error) throw error;

      setData((history || []).map((h: any) => ({
        week: h.week_start_date,
        mentions: h.total_mentions || 0
      })));
    } catch (error) {
      console.error('Error loading keyword history:', error);
    } finally {
      setLoading(false);
    }
  };

  const trend = useMemo(() => {
    if (data.length < 2) return null;
    const recent = data[data.length - 1].mentions;
    const previous = data[data.length - 2].mentions;
    const change = previous > 0 ? ((recent - previous) / previous) * 100 : 0;
    
    if (change > 20) return 'up';
    if (change < -20) return 'down';
    return 'stable';
  }, [data]);

  const TrendIcon = trend === 'up' ? TrendingUp : trend === 'down' ? TrendingDown : Minus;
  const trendColor = trend === 'up' ? 'text-green-500' : trend === 'down' ? 'text-destructive' : 'text-muted-foreground';

  if (loading || data.length === 0) {
    return <div className="w-16 h-6" />;
  }

  return (
    <div className="flex items-center gap-1">
      <div className="w-16 h-6">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data}>
            <Line
              type="monotone"
              dataKey="mentions"
              stroke={trend === 'up' ? 'hsl(142, 76%, 36%)' : trend === 'down' ? 'hsl(var(--destructive))' : 'hsl(var(--muted-foreground))'}
              strokeWidth={1.5}
              dot={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <TrendIcon className={`h-3 w-3 ${trendColor}`} />
    </div>
  );
};
