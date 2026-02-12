import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { LineChart, Line, ResponsiveContainer, Tooltip, XAxis } from 'recharts';
import { Loader2 } from 'lucide-react';
import { engagementColors } from '@/lib/designTokens';
import { Button } from '@/components/ui/button';

interface EngagementSparklineProps {
  topicId: string;
  minimal?: boolean;
}

interface DayData {
  date: string;
  swipes: number;
  shares: number;
  visitors: number;
  displayDate: string;
}

type TimeRange = 7 | 14 | 30;

export const EngagementSparkline = ({ topicId, minimal = false }: EngagementSparklineProps) => {
  const [data, setData] = useState<DayData[]>([]);
  const [loading, setLoading] = useState(true);
  const [timeRange, setTimeRange] = useState<TimeRange>(7);

  const effectiveRange = minimal ? 7 : timeRange;

  useEffect(() => {
    loadSparklineData();
  }, [topicId, effectiveRange]);

  const loadSparklineData = async () => {
    try {
      setLoading(true);
      const daysAgo = new Date(Date.now() - effectiveRange * 24 * 60 * 60 * 1000);
      
      const visitsQuery = supabase
        .from('feed_visits')
        .select('visit_date, visitor_id')
        .eq('topic_id', topicId)
        .gte('visit_date', daysAgo.toISOString().split('T')[0]);

      if (minimal) {
        const { data: visits, error } = await visitsQuery;
        if (error) throw error;

        const dayMap = new Map<string, { swipes: number; shares: number; visitors: number }>();
        for (let i = 0; i < effectiveRange; i++) {
          const date = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
          dayMap.set(date.toISOString().split('T')[0], { swipes: 0, shares: 0, visitors: 0 });
        }

        const visitorsPerDay = new Map<string, Set<string>>();
        (visits || []).forEach((visit: any) => {
          if (!visitorsPerDay.has(visit.visit_date)) visitorsPerDay.set(visit.visit_date, new Set());
          visitorsPerDay.get(visit.visit_date)!.add(visit.visitor_id);
        });
        visitorsPerDay.forEach((visitorSet, date) => {
          const existing = dayMap.get(date);
          if (existing) existing.visitors = visitorSet.size;
        });

        const chartData: DayData[] = Array.from(dayMap.entries())
          .map(([date, counts]) => ({
            date, ...counts,
            displayDate: new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
          }))
          .sort((a, b) => a.date.localeCompare(b.date));

        setData(chartData);
        setLoading(false);
        return;
      }

      // Full mode: fetch both visits and interactions
      const [{ data: visits, error: visitsError }, { data: interactions, error: interactionsError }] = await Promise.all([
        visitsQuery,
        supabase
          .from('story_interactions')
          .select('interaction_type, created_at')
          .eq('topic_id', topicId)
          .gte('created_at', daysAgo.toISOString())
          .in('interaction_type', ['swipe', 'share_click'])
      ]);
      if (visitsError) throw visitsError;
      if (interactionsError) throw interactionsError;

      const dayMap = new Map<string, { swipes: number; shares: number; visitors: number }>();
      for (let i = 0; i < effectiveRange; i++) {
        const date = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
        const dateKey = date.toISOString().split('T')[0];
        dayMap.set(dateKey, { swipes: 0, shares: 0, visitors: 0 });
      }

      interactions.forEach((interaction: any) => {
        const dateKey = interaction.created_at.split('T')[0];
        const existing = dayMap.get(dateKey);
        if (existing) {
          if (interaction.interaction_type === 'swipe') existing.swipes++;
          else if (interaction.interaction_type === 'share_click') existing.shares++;
        }
      });

      const visitorsPerDay = new Map<string, Set<string>>();
      visits.forEach((visit: any) => {
        if (!visitorsPerDay.has(visit.visit_date)) {
          visitorsPerDay.set(visit.visit_date, new Set());
        }
        visitorsPerDay.get(visit.visit_date)!.add(visit.visitor_id);
      });
      
      visitorsPerDay.forEach((visitorSet, date) => {
        const existing = dayMap.get(date);
        if (existing) existing.visitors = visitorSet.size;
      });

      const chartData: DayData[] = Array.from(dayMap.entries())
        .map(([date, counts]) => ({
          date,
          ...counts,
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
      <div className={`flex items-center justify-center ${minimal ? 'h-10' : 'h-16'}`}>
        <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div className={`${minimal ? 'h-10' : 'h-16'} flex items-center justify-center text-xs text-muted-foreground`}>
        No data yet
      </div>
    );
  }

  const MinimalTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-popover border border-border rounded-lg px-2 py-1 shadow-lg">
          <p className="text-xs font-medium">{payload[0].payload.displayDate}</p>
          <p className="text-xs" style={{ color: engagementColors.visitors }}>
            {payload[0]?.value || 0} visitors
          </p>
        </div>
      );
    }
    return null;
  };

  const FullTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-popover border border-border rounded-lg px-2 py-1 shadow-lg">
          <p className="text-xs font-medium">{payload[0].payload.displayDate}</p>
          <p className="text-xs" style={{ color: engagementColors.swipes }}>Swipes: {payload[0]?.value || 0}</p>
          <p className="text-xs" style={{ color: engagementColors.shares }}>Shares: {payload[1]?.value || 0}</p>
          <p className="text-xs" style={{ color: engagementColors.visitors }}>Visitors: {payload[2]?.value || 0}</p>
        </div>
      );
    }
    return null;
  };

  // Minimal mode: visitors-only sparkline, no toggles
  if (minimal) {
    return (
      <div className="w-full h-10">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 2, right: 2, bottom: 2, left: 2 }}>
            <Tooltip content={<MinimalTooltip />} />
            <Line 
              type="monotone" 
              dataKey="visitors" 
              stroke={engagementColors.visitors}
              strokeWidth={1.5}
              dot={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    );
  }

  // Full mode: 3 lines with time range toggle
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-end gap-1">
        {([7, 14, 30] as TimeRange[]).map((range) => (
          <Button
            key={range}
            variant={timeRange === range ? "default" : "ghost"}
            size="sm"
            className={`h-6 px-2 text-[10px] ${
              timeRange === range 
                ? 'bg-[hsl(270,100%,68%)] text-white hover:bg-[hsl(270,100%,68%)]/90' 
                : 'text-muted-foreground hover:text-foreground'
            }`}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setTimeRange(range);
            }}
          >
            {range}d
          </Button>
        ))}
      </div>
      
      <div className="w-full h-16">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 2, right: 2, bottom: 2, left: 2 }}>
            <Tooltip content={<FullTooltip />} />
            {timeRange >= 14 && (
              <XAxis 
                dataKey="displayDate" 
                tick={{ fontSize: 8, fill: 'hsl(var(--muted-foreground))' }}
                tickLine={false}
                axisLine={false}
                interval={timeRange === 30 ? 6 : 3}
              />
            )}
            <Line type="monotone" dataKey="swipes" stroke={engagementColors.swipes} strokeWidth={1.5} dot={false} />
            <Line type="monotone" dataKey="shares" stroke={engagementColors.shares} strokeWidth={1.5} dot={false} />
            <Line type="monotone" dataKey="visitors" stroke={engagementColors.visitors} strokeWidth={1.5} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};
