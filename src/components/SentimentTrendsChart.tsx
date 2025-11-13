import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { TrendingUp, TrendingDown, Minus, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { format, parseISO } from 'date-fns';

interface SentimentHistory {
  id: string;
  topic_id: string;
  keyword_phrase: string;
  week_start_date: string;
  total_mentions: number;
  positive_mentions: number;
  negative_mentions: number;
  neutral_mentions: number;
  sentiment_ratio: number;
  source_count: number;
}

interface TrendsChartProps {
  topicId: string;
  keywords: Array<{ id: string; keyword_phrase: string }>;
}

export const SentimentTrendsChart = ({ topicId, keywords }: TrendsChartProps) => {
  const [selectedKeyword, setSelectedKeyword] = useState<string>('');
  const [historyData, setHistoryData] = useState<SentimentHistory[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (keywords.length > 0 && !selectedKeyword) {
      setSelectedKeyword(keywords[0].keyword_phrase);
    }
  }, [keywords, selectedKeyword]);

  useEffect(() => {
    if (selectedKeyword) {
      loadHistoryData();
    }
  }, [selectedKeyword, topicId]);

  const loadHistoryData = async () => {
    try {
      setLoading(true);
      
      const { data, error } = await supabase
        .from('sentiment_keyword_history')
        .select('*')
        .eq('topic_id', topicId)
        .eq('keyword_phrase', selectedKeyword)
        .order('week_start_date', { ascending: true })
        .limit(12); // Last 12 weeks

      if (error) throw error;
      
      setHistoryData(data || []);
    } catch (error) {
      console.error('Error loading sentiment history:', error);
    } finally {
      setLoading(false);
    }
  };

  const chartData = historyData.map(record => ({
    week: format(parseISO(record.week_start_date), 'MMM d'),
    positive: record.positive_mentions,
    negative: record.negative_mentions,
    neutral: record.neutral_mentions,
    total: record.total_mentions,
    // Calculate sentiment score (-100 to +100)
    sentiment: record.negative_mentions > record.positive_mentions
      ? -20 - ((record.negative_mentions / record.total_mentions) * 80)
      : record.positive_mentions > record.negative_mentions
      ? 20 + ((record.positive_mentions / record.total_mentions) * 80)
      : 0
  }));

  const getSentimentTrend = () => {
    if (chartData.length < 2) return null;
    
    const recent = chartData[chartData.length - 1];
    const previous = chartData[chartData.length - 2];
    
    const recentSentiment = recent.negative > recent.positive ? 'negative' : 'positive';
    const previousSentiment = previous.negative > previous.positive ? 'negative' : 'positive';
    
    if (recentSentiment === previousSentiment) {
      const recentRatio = recentSentiment === 'negative' 
        ? recent.negative / recent.total 
        : recent.positive / recent.total;
      const previousRatio = previousSentiment === 'negative'
        ? previous.negative / previous.total
        : previous.positive / previous.total;
      
      if (recentRatio > previousRatio) {
        return recentSentiment === 'negative' ? 'worsening' : 'improving';
      } else if (recentRatio < previousRatio) {
        return recentSentiment === 'negative' ? 'stabilizing' : 'softening';
      }
    } else if (recentSentiment === 'positive' && previousSentiment === 'negative') {
      return 'recovering';
    } else if (recentSentiment === 'negative' && previousSentiment === 'positive') {
      return 'declining';
    }
    
    return 'stable';
  };

  const getTrendBadge = () => {
    const trend = getSentimentTrend();
    
    if (!trend || chartData.length < 2) {
      return <Badge variant="secondary" className="gap-1.5"><Minus className="h-3 w-3" /> No trend data</Badge>;
    }
    
    switch (trend) {
      case 'improving':
        return <Badge className="gap-1.5 bg-green-600"><TrendingUp className="h-3 w-3" /> Improving</Badge>;
      case 'recovering':
        return <Badge className="gap-1.5 bg-green-600"><TrendingUp className="h-3 w-3" /> Recovering</Badge>;
      case 'worsening':
        return <Badge variant="destructive" className="gap-1.5"><TrendingDown className="h-3 w-3" /> Worsening</Badge>;
      case 'declining':
        return <Badge variant="destructive" className="gap-1.5"><TrendingDown className="h-3 w-3" /> Declining</Badge>;
      case 'stabilizing':
        return <Badge variant="outline" className="gap-1.5 border-orange-500 text-orange-700"><Minus className="h-3 w-3" /> Stabilizing</Badge>;
      case 'softening':
        return <Badge variant="outline" className="gap-1.5 border-blue-500 text-blue-700"><Minus className="h-3 w-3" /> Softening</Badge>;
      default:
        return <Badge variant="secondary" className="gap-1.5"><Minus className="h-3 w-3" /> Stable</Badge>;
    }
  };

  if (keywords.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Sentiment Trends</CardTitle>
          <CardDescription>Week-by-week sentiment comparison</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8 text-muted-foreground">
            No keywords available. Run sentiment analysis to see trends.
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between">
          <div>
            <CardTitle>Sentiment Trends</CardTitle>
            <CardDescription>Week-by-week sentiment comparison</CardDescription>
          </div>
          {getTrendBadge()}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-2">
          <label className="text-sm font-medium">Keyword:</label>
          <Select value={selectedKeyword} onValueChange={setSelectedKeyword}>
            <SelectTrigger className="w-[250px]">
              <SelectValue placeholder="Select keyword" />
            </SelectTrigger>
            <SelectContent>
              {keywords.map((keyword) => (
                <SelectItem key={keyword.id} value={keyword.keyword_phrase}>
                  {keyword.keyword_phrase}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : chartData.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <p>No historical data yet for this keyword.</p>
            <p className="text-sm mt-2">Trends will appear after running analysis for multiple weeks.</p>
          </div>
        ) : (
          <>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis 
                  dataKey="week" 
                  className="text-xs"
                  tick={{ fill: 'hsl(var(--muted-foreground))' }}
                />
                <YAxis 
                  className="text-xs"
                  tick={{ fill: 'hsl(var(--muted-foreground))' }}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'hsl(var(--card))',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: '6px',
                  }}
                  labelStyle={{ color: 'hsl(var(--foreground))' }}
                />
                <Legend 
                  wrapperStyle={{ paddingTop: '20px' }}
                  iconType="line"
                />
                <Line 
                  type="monotone" 
                  dataKey="positive" 
                  stroke="hsl(142, 76%, 36%)" 
                  strokeWidth={2}
                  dot={{ fill: 'hsl(142, 76%, 36%)', strokeWidth: 2 }}
                  name="Positive"
                />
                <Line 
                  type="monotone" 
                  dataKey="negative" 
                  stroke="hsl(var(--destructive))" 
                  strokeWidth={2}
                  dot={{ fill: 'hsl(var(--destructive))', strokeWidth: 2 }}
                  name="Negative"
                />
                <Line 
                  type="monotone" 
                  dataKey="neutral" 
                  stroke="hsl(var(--muted-foreground))" 
                  strokeWidth={1}
                  strokeDasharray="5 5"
                  dot={{ fill: 'hsl(var(--muted-foreground))' }}
                  name="Neutral"
                />
              </LineChart>
            </ResponsiveContainer>

            <div className="grid grid-cols-3 gap-4 pt-4 border-t">
              <div className="text-center">
                <div className="text-2xl font-bold text-green-600">
                  {chartData[chartData.length - 1]?.positive || 0}
                </div>
                <div className="text-xs text-muted-foreground">Positive (This Week)</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-destructive">
                  {chartData[chartData.length - 1]?.negative || 0}
                </div>
                <div className="text-xs text-muted-foreground">Negative (This Week)</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-muted-foreground">
                  {chartData[chartData.length - 1]?.total || 0}
                </div>
                <div className="text-xs text-muted-foreground">Total Mentions</div>
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
};
