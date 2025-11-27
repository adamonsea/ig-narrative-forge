import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Activity, AlertTriangle, CheckCircle } from 'lucide-react';

interface SourceHealthBadgeProps {
  topicId: string;
}

interface SourceHealth {
  source_name: string;
  success_rate: number;
  consecutive_failures: number;
}

export const SourceHealthBadge = ({ topicId }: SourceHealthBadgeProps) => {
  const [healthyCount, setHealthyCount] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const [unhealthySources, setUnhealthySources] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const { data, error } = await supabase.rpc('get_source_health_stats', {
          p_topic_id: topicId
        });

        if (error) throw error;

        const sources = (data || []) as SourceHealth[];
        const healthy = sources.filter(s => s.success_rate >= 50 && s.consecutive_failures < 3);
        const unhealthy = sources.filter(s => s.success_rate < 50 || s.consecutive_failures >= 3);
        
        setHealthyCount(healthy.length);
        setTotalCount(sources.length);
        setUnhealthySources(unhealthy.map(s => s.source_name));
      } catch (error) {
        console.error('Error fetching source health:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [topicId]);

  if (loading || totalCount === 0) {
    return null;
  }

  const healthPercentage = totalCount > 0 ? (healthyCount / totalCount) * 100 : 0;
  const isHealthy = healthPercentage >= 80;
  const isWarning = healthPercentage >= 50 && healthPercentage < 80;

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className={`flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-medium cursor-help ${
            isHealthy 
              ? 'bg-green-500/10 text-green-600 dark:text-green-400' 
              : isWarning 
                ? 'bg-yellow-500/10 text-yellow-600 dark:text-yellow-400'
                : 'bg-destructive/10 text-destructive'
          }`}>
            {isHealthy ? (
              <CheckCircle className="w-3 h-3" />
            ) : isWarning ? (
              <Activity className="w-3 h-3" />
            ) : (
              <AlertTriangle className="w-3 h-3" />
            )}
            <span>{healthyCount}/{totalCount} sources</span>
          </div>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="max-w-xs">
          <div className="space-y-1.5">
            <p className="font-medium">
              {healthyCount} of {totalCount} sources delivering content successfully
            </p>
            {unhealthySources.length > 0 && (
              <div className="text-xs text-muted-foreground">
                <p className="font-medium text-destructive">Issues with:</p>
                <ul className="list-disc list-inside">
                  {unhealthySources.slice(0, 3).map((name, i) => (
                    <li key={i} className="truncate">{name}</li>
                  ))}
                  {unhealthySources.length > 3 && (
                    <li>+{unhealthySources.length - 3} more</li>
                  )}
                </ul>
              </div>
            )}
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};
