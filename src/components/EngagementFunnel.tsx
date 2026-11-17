import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Users, MousePointer, Layers, Share2, ExternalLink } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Skeleton } from '@/components/ui/skeleton';

interface EngagementFunnelProps {
  topicId: string;
}

interface FunnelData {
  visitors: number;
  engaged: number;
  completed: number;
  shared: number;
  source_clicks: number;
}

export const EngagementFunnel = ({ topicId }: EngagementFunnelProps) => {
  const [data, setData] = useState<FunnelData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadFunnelData();
  }, [topicId]);

  const loadFunnelData = async () => {
    try {
      setLoading(true);
      const { data: funnelData, error } = await (supabase.rpc as any)('get_topic_engagement_funnel', {
        p_topic_id: topicId,
        p_days: 7
      });

      if (error) throw error;

      if (funnelData && funnelData.length > 0) {
        setData({
          visitors: Number(funnelData[0].visitors) || 0,
          engaged: Number(funnelData[0].engaged) || 0,
          completed: Number(funnelData[0].completed) || 0,
          shared: Number(funnelData[0].shared) || 0,
          source_clicks: Number(funnelData[0].source_clicks) || 0,
        });
      }
    } catch (error) {
      console.error('Error loading engagement funnel:', error);
      setData(null);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-3" aria-busy="true">
        <Skeleton className="h-4 w-40" />
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className="flex items-center gap-3">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-6 flex-1 rounded-full" />
          </div>
        ))}
      </div>
    );
  }

  if (!data || data.visitors === 0) {
    return <p className="text-sm text-muted-foreground">No funnel data yet</p>;
  }

  const stages = [
    { label: 'Visitors', value: data.visitors, icon: Users, tooltip: 'Unique visitors to your feed' },
    { label: 'Engaged', value: data.engaged, icon: MousePointer, tooltip: 'Visitors who swiped through stories' },
    { label: 'Completed', value: data.completed, icon: Layers, tooltip: 'Visitors who read to final slide' },
    { label: 'Shared', value: data.shared, icon: Share2, tooltip: 'Visitors who shared stories' },
    { label: 'Source', value: data.source_clicks, icon: ExternalLink, tooltip: 'Visitors who clicked source links' },
  ];

  const maxValue = Math.max(...stages.map(s => s.value), 1);

  return (
    <TooltipProvider>
      <div className="space-y-3">
        <h3 className="text-sm font-medium text-muted-foreground">Engagement funnel (7 days)</h3>

        <div className="space-y-2">
          {stages.map((stage, index) => {
            const widthPercent = Math.max((stage.value / maxValue) * 100, 8);
            const prevValue = index > 0 ? stages[index - 1].value : 0;
            const hasConversion = index > 0 && prevValue > 0;
            const conversionRate = hasConversion
              ? Math.round((stage.value / prevValue) * 100)
              : null;
            const Icon = stage.icon;
            const tone = conversionRate === null
              ? 'text-muted-foreground'
              : conversionRate >= 50 ? 'text-pop' : conversionRate >= 20 ? 'text-attention' : 'text-destructive-ink';

            return (
              <Tooltip key={stage.label}>
                <TooltipTrigger asChild>
                  <div className="flex items-center gap-3">
                    <div className="w-24 flex items-center gap-2 text-sm text-muted-foreground">
                      <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                      <span className="truncate">{stage.label}</span>
                    </div>
                    <div className="flex-1 h-6 rounded-full bg-muted overflow-hidden">
                      <div
                        className="h-full rounded-full bg-primary flex items-center justify-end pr-2 transition-[width] duration-300 ease-out"
                        style={{ width: `${widthPercent}%` }}
                      >
                        <span className="text-sm font-medium tabular-nums text-primary-foreground">
                          {stage.value}
                        </span>
                      </div>
                    </div>
                    <div className={`w-14 text-right text-sm font-medium tabular-nums ${tone}`}>
                      {hasConversion ? `${conversionRate}%` : '—'}
                    </div>
                  </div>
                </TooltipTrigger>
                <TooltipContent className="max-w-xs text-sm">
                  <p>{stage.tooltip}</p>
                  {index > 0 && hasConversion && (
                    <p className="text-muted-foreground mt-1">
                      {conversionRate}% from {stages[index - 1].label}
                    </p>
                  )}
                </TooltipContent>
              </Tooltip>
            );
          })}
        </div>
      </div>
    </TooltipProvider>
  );
};
