import { useState, useEffect, useRef } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, Area, AreaChart } from 'recharts';
import { TrendingUp, TrendingDown, Minus, Loader2, BarChart3, RefreshCw } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { format, parseISO, subWeeks } from 'date-fns';
import { toast } from 'sonner';

interface SentimentOverviewCardProps {
  topicId: string;
}

interface WeeklyAggregate {
  week: string;
  weekStart: string;
  positive: number;
  negative: number;
  neutral: number;
  total: number;
  ratio: number;
}

export const SentimentOverviewCard = ({ topicId }: SentimentOverviewCardProps) => {
  const [data, setData] = useState<WeeklyAggregate[]>([]);
  const [loading, setLoading] = useState(true);
  const [backfilling, setBackfilling] = useState(false);
  const [trend, setTrend] = useState<'improving' | 'declining' | 'stable' | null>(null);
  const backfillAttempted = useRef(false);

  useEffect(() => {
    loadAggregateData();
  }, [topicId]);

  const triggerBackfill = async () => {
    try {
      setBackfilling(true);
      const { error } = await supabase.functions.invoke('sentiment-history-snapshot', {
        body: { backfill: true, weeksToBackfill: 8 }
      });
      if (error) throw error;
      toast.success('Historical data generated');
      await loadAggregateData();
    } catch (err) {
      toast.error('Failed to generate history');
    } finally {
      setBackfilling(false);
    }
  };

  const loadAggregateData = async () => {
    try {
      setLoading(true);
      
      // Get last 8 weeks of history aggregated across all keywords
      const { data: history, error } = await (supabase as any)
        .from('sentiment_keyword_history')
        .select('week_start_date, positive_mentions, negative_mentions, neutral_mentions, total_mentions')
        .eq('topic_id', topicId)
        .order('week_start_date', { ascending: true });

      if (error) throw error;

      // Aggregate by week
      const weekMap = new Map<string, WeeklyAggregate>();
      
      for (const record of history || []) {
        const weekKey = record.week_start_date;
        const existing = weekMap.get(weekKey) || {
          week: format(parseISO(weekKey), 'MMM d'),
          weekStart: weekKey,
          positive: 0,
          negative: 0,
          neutral: 0,
          total: 0,
          ratio: 0
        };

        existing.positive += record.positive_mentions || 0;
        existing.negative += record.negative_mentions || 0;
        existing.neutral += record.neutral_mentions || 0;
        existing.total += record.total_mentions || 0;
        
        weekMap.set(weekKey, existing);
      }

      // Calculate ratios and sort
      const aggregated = Array.from(weekMap.values())
        .map(w => ({
          ...w,
          ratio: w.total > 0 ? Math.round(((w.positive - w.negative) / w.total) * 100) : 0
        }))
        .sort((a, b) => a.weekStart.localeCompare(b.weekStart))
        .slice(-8); // Last 8 weeks

      setData(aggregated);

      // Calculate trend
      if (aggregated.length >= 2) {
        const recent = aggregated[aggregated.length - 1].ratio;
        const previous = aggregated[aggregated.length - 2].ratio;
        const diff = recent - previous;
        
        if (diff > 5) setTrend('improving');
        else if (diff < -5) setTrend('declining');
        else setTrend('stable');
      }
    } catch (error) {
      console.error('Error loading sentiment overview:', error);
    } finally {
      setLoading(false);
    }
  };

  const getTrendBadge = () => {
    if (!trend || data.length < 2) {
      return <Badge variant="secondary" className="gap-1.5"><Minus className="h-3 w-3" /> No trend data</Badge>;
    }

    switch (trend) {
      case 'improving':
        return <Badge className="gap-1.5 bg-green-600"><TrendingUp className="h-3 w-3" /> Improving</Badge>;
      case 'declining':
        return <Badge variant="destructive" className="gap-1.5"><TrendingDown className="h-3 w-3" /> Declining</Badge>;
      default:
        return <Badge variant="secondary" className="gap-1.5"><Minus className="h-3 w-3" /> Stable</Badge>;
    }
  };

  const latestData = data[data.length - 1];
  const totalMentions = latestData?.total || 0;
  const positivePercent = latestData && latestData.total > 0 
    ? Math.round((latestData.positive / latestData.total) * 100) 
    : 0;
  const negativePercent = latestData && latestData.total > 0 
    ? Math.round((latestData.negative / latestData.total) * 100) 
    : 0;

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <CardTitle className="flex items-center gap-2 text-base">
              <BarChart3 className="h-4 w-4" />
              Overall Sentiment
            </CardTitle>
            <CardDescription>
              Aggregate coverage sentiment across all tracked keywords
            </CardDescription>
          </div>
          {getTrendBadge()}
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : data.length === 0 ? (
          <div className="text-center py-8 space-y-3">
            <p className="text-sm text-muted-foreground">No historical data yet.</p>
            <Button
              variant="outline"
              size="sm"
              onClick={triggerBackfill}
              disabled={backfilling}
            >
              {backfilling ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4 mr-2" />
              )}
              Generate Historical Data
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Chart */}
            <ResponsiveContainer width="100%" height={120}>
              <AreaChart data={data}>
                <defs>
                  <linearGradient id="positiveGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(142, 76%, 36%)" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="hsl(142, 76%, 36%)" stopOpacity={0}/>
                  </linearGradient>
                  <linearGradient id="negativeGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(var(--destructive))" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="hsl(var(--destructive))" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <XAxis 
                  dataKey="week" 
                  tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'hsl(var(--card))',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: '6px',
                    fontSize: '12px'
                  }}
                  formatter={(value: number, name: string) => [value, name === 'positive' ? 'Positive' : 'Negative']}
                />
                <Area
                  type="monotone"
                  dataKey="positive"
                  stroke="hsl(142, 76%, 36%)"
                  fill="url(#positiveGradient)"
                  strokeWidth={2}
                />
                <Area
                  type="monotone"
                  dataKey="negative"
                  stroke="hsl(var(--destructive))"
                  fill="url(#negativeGradient)"
                  strokeWidth={2}
                />
              </AreaChart>
            </ResponsiveContainer>

            {/* Summary stats */}
            <div className="grid grid-cols-3 gap-4 pt-2 border-t">
              <div className="text-center">
                <div className="text-lg font-bold text-green-600">{positivePercent}%</div>
                <div className="text-xs text-muted-foreground">Positive</div>
              </div>
              <div className="text-center">
                <div className="text-lg font-bold text-destructive">{negativePercent}%</div>
                <div className="text-xs text-muted-foreground">Negative</div>
              </div>
              <div className="text-center">
                <div className="text-lg font-bold text-foreground">{totalMentions}</div>
                <div className="text-xs text-muted-foreground">This Week</div>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
