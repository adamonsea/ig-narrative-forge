import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip, Cell } from 'recharts';
import { Loader2, Activity } from 'lucide-react';

interface SourceHealthChartProps {
  topicId: string;
}

interface SourceHealth {
  source_id: string;
  source_name: string;
  success_rate: number;
  articles_last_7_days: number;
  consecutive_failures: number;
}

export const SourceHealthChart = ({ topicId }: SourceHealthChartProps) => {
  const [data, setData] = useState<SourceHealth[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const { data: healthData, error } = await supabase.rpc('get_source_health_stats', {
          p_topic_id: topicId
        });

        if (error) throw error;

        setData((healthData || []).map((item: any) => ({
          source_id: item.source_id,
          source_name: item.source_name,
          success_rate: Number(item.success_rate) || 0,
          articles_last_7_days: Number(item.articles_last_7_days) || 0,
          consecutive_failures: Number(item.consecutive_failures) || 0
        })));
      } catch (error) {
        console.error('Error fetching source health:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [topicId]);

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center h-48">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  if (data.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center h-48 text-center">
          <Activity className="w-8 h-8 text-muted-foreground mb-2" />
          <p className="text-sm text-muted-foreground">No sources configured</p>
        </CardContent>
      </Card>
    );
  }

  // Truncate source names for display
  const chartData = data.map(source => ({
    ...source,
    displayName: source.source_name.length > 12 
      ? source.source_name.substring(0, 12) + '...' 
      : source.source_name
  }));

  const getBarColor = (rate: number) => {
    if (rate >= 80) return 'hsl(142, 76%, 36%)'; // green
    if (rate >= 50) return 'hsl(48, 96%, 53%)'; // yellow
    return 'hsl(0, 84%, 60%)'; // red
  };

  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const source = payload[0].payload as SourceHealth & { displayName: string };
      return (
        <div className="bg-popover border border-border rounded-lg px-3 py-2 shadow-lg">
          <p className="font-medium text-sm mb-1">{source.source_name}</p>
          <p className="text-xs text-muted-foreground">
            Success rate: <span className="font-medium text-foreground">{source.success_rate}%</span>
          </p>
          <p className="text-xs text-muted-foreground">
            Articles (7d): <span className="font-medium text-foreground">{source.articles_last_7_days}</span>
          </p>
          {source.consecutive_failures > 0 && (
            <p className="text-xs text-destructive">
              Consecutive failures: {source.consecutive_failures}
            </p>
          )}
        </div>
      );
    }
    return null;
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <Activity className="w-4 h-4" />
          Source Health
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-48">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} layout="vertical" margin={{ left: 0, right: 8 }}>
              <XAxis type="number" domain={[0, 100]} tickFormatter={(v) => `${v}%`} fontSize={10} />
              <YAxis 
                type="category" 
                dataKey="displayName" 
                width={80} 
                fontSize={10}
                tickLine={false}
                axisLine={false}
              />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey="success_rate" radius={[0, 4, 4, 0]}>
                {chartData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={getBarColor(entry.success_rate)} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
};
