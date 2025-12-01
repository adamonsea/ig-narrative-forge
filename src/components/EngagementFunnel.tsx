import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Loader2, Users, MousePointer, Layers, Share2, ExternalLink } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { engagementColors } from '@/lib/designTokens';

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
      <div className="flex items-center justify-center h-24">
        <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!data || data.visitors === 0) {
    return (
      <div className="h-24 flex items-center justify-center text-xs text-muted-foreground">
        No funnel data yet
      </div>
    );
  }

  const stages = [
    { 
      label: 'Visitors', 
      value: data.visitors, 
      color: engagementColors.visitors,
      icon: Users,
      tooltip: 'Unique visitors to your feed'
    },
    { 
      label: 'Engaged', 
      value: data.engaged, 
      color: engagementColors.engaged,
      icon: MousePointer,
      tooltip: 'Visitors who swiped through stories'
    },
    { 
      label: 'Completed', 
      value: data.completed, 
      color: engagementColors.completed,
      icon: Layers,
      tooltip: 'Visitors who read to final slide'
    },
    { 
      label: 'Shared', 
      value: data.shared, 
      color: engagementColors.shares,
      icon: Share2,
      tooltip: 'Visitors who shared stories'
    },
    { 
      label: 'Source', 
      value: data.source_clicks, 
      color: engagementColors.sourceClicks,
      icon: ExternalLink,
      tooltip: 'Visitors who clicked source links'
    },
  ];

  const maxValue = Math.max(...stages.map(s => s.value), 1);

  return (
    <TooltipProvider>
      <div className="space-y-2">
        <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
          Engagement Funnel (7 days)
        </div>
        
        <div className="space-y-2">
          {stages.map((stage, index) => {
            const widthPercent = Math.max((stage.value / maxValue) * 100, 8);
            const conversionRate = index > 0 && stages[index - 1].value > 0 
              ? Math.round((stage.value / stages[index - 1].value) * 100) 
              : 100;
            const Icon = stage.icon;
            
            return (
              <Tooltip key={stage.label}>
                <TooltipTrigger asChild>
                  <div className="flex items-center gap-2 cursor-help">
                    <div className="w-16 flex items-center gap-1 text-xs text-muted-foreground">
                      <Icon className="w-3 h-3" style={{ color: stage.color }} />
                      <span className="truncate">{stage.label}</span>
                    </div>
                    <div className="flex-1 h-6 bg-muted/30 rounded-full overflow-hidden relative">
                      <div 
                        className="h-full rounded-full transition-all duration-500 ease-out flex items-center justify-end pr-2"
                        style={{ 
                          width: `${widthPercent}%`,
                          backgroundColor: stage.color,
                          opacity: 0.85
                        }}
                      >
                        <span className="text-xs font-bold text-white drop-shadow-sm">
                          {stage.value}
                        </span>
                      </div>
                    </div>
                    {index > 0 && (
                      <div className="w-12 text-right">
                        <span className={`text-xs font-medium ${conversionRate >= 50 ? 'text-green-500' : conversionRate >= 20 ? 'text-yellow-500' : 'text-red-500'}`}>
                          {conversionRate}%
                        </span>
                      </div>
                    )}
                  </div>
                </TooltipTrigger>
                <TooltipContent>
                  <p>{stage.tooltip}</p>
                  {index > 0 && (
                    <p className="text-muted-foreground text-xs mt-1">
                      {conversionRate}% conversion from {stages[index - 1].label}
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