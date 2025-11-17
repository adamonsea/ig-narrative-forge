import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { CheckCircle, Clock, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

interface SourceAvailabilitySummaryProps {
  topicId: string;
}

interface SourceStatus {
  ready: number;
  onCooldown: number;
  avgTimeRemaining: number;
  sources: Array<{
    id: string;
    name: string;
    isReady: boolean;
    timeRemaining: number;
  }>;
}

export const SourceAvailabilitySummary = ({ topicId }: SourceAvailabilitySummaryProps) => {
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<SourceStatus>({
    ready: 0,
    onCooldown: 0,
    avgTimeRemaining: 0,
    sources: []
  });

  useEffect(() => {
    loadSourceStatus();
    
    // Refresh every 2 minutes
    const interval = setInterval(loadSourceStatus, 120000);
    return () => clearInterval(interval);
  }, [topicId]);

  const loadSourceStatus = async () => {
    try {
      const { data: sources, error } = await supabase
        .from('content_sources')
        .select('id, source_name, last_scraped_at, scrape_frequency_hours, is_active')
        .eq('topic_id', topicId)
        .eq('is_active', true);

      if (error) throw error;

      const now = Date.now();
      let readyCount = 0;
      let cooldownCount = 0;
      let totalTimeRemaining = 0;

      const sourceStatuses = sources?.map(source => {
        if (!source.last_scraped_at || !source.scrape_frequency_hours) {
          readyCount++;
          return {
            id: source.id,
            name: source.source_name,
            isReady: true,
            timeRemaining: 0
          };
        }

        const lastScraped = new Date(source.last_scraped_at).getTime();
        const cooldownMs = source.scrape_frequency_hours * 60 * 60 * 1000;
        const nextAvailable = lastScraped + cooldownMs;
        const timeRemaining = Math.max(0, nextAvailable - now);
        const isReady = timeRemaining === 0;

        if (isReady) {
          readyCount++;
        } else {
          cooldownCount++;
          totalTimeRemaining += timeRemaining;
        }

        return {
          id: source.id,
          name: source.source_name,
          isReady,
          timeRemaining: timeRemaining / (1000 * 60 * 60) // Convert to hours
        };
      }) || [];

      setStatus({
        ready: readyCount,
        onCooldown: cooldownCount,
        avgTimeRemaining: cooldownCount > 0 ? totalTimeRemaining / cooldownCount / (1000 * 60 * 60) : 0,
        sources: sourceStatuses
      });
    } catch (error) {
      console.error('Error loading source status:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5" />
            Source Availability
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-4">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        </CardContent>
      </Card>
    );
  }

  const totalSources = status.ready + status.onCooldown;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Clock className="h-5 w-5" />
          Source Availability
        </CardTitle>
        <CardDescription>
          Current status of content sources for automated scraping
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-2 p-4 rounded-lg bg-primary/5 border border-primary/20">
              <div className="flex items-center gap-2">
                <CheckCircle className="h-4 w-4 text-primary" />
                <span className="text-sm font-medium text-muted-foreground">Ready</span>
              </div>
              <div className="text-3xl font-bold text-foreground">{status.ready}</div>
              <div className="text-xs text-muted-foreground">
                {totalSources > 0 ? Math.round((status.ready / totalSources) * 100) : 0}% available
              </div>
            </div>

            <div className="flex flex-col gap-2 p-4 rounded-lg bg-secondary/50 border border-border">
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium text-muted-foreground">On Cooldown</span>
              </div>
              <div className="text-3xl font-bold text-foreground">{status.onCooldown}</div>
              {status.onCooldown > 0 && (
                <div className="text-xs text-muted-foreground">
                  Avg. {status.avgTimeRemaining.toFixed(1)}h remaining
                </div>
              )}
            </div>
          </div>

          {status.sources.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-sm font-medium text-muted-foreground">Sources</h4>
              <div className="space-y-1">
                {status.sources.slice(0, 5).map(source => (
                  <div key={source.id} className="flex items-center justify-between text-sm py-1">
                    <span className="text-foreground truncate flex-1">{source.name}</span>
                    <Badge variant={source.isReady ? "outline" : "secondary"} className="ml-2">
                      {source.isReady ? (
                        <CheckCircle className="h-3 w-3 mr-1" />
                      ) : (
                        <Clock className="h-3 w-3 mr-1" />
                      )}
                      {source.isReady ? 'Ready' : `${source.timeRemaining.toFixed(1)}h`}
                    </Badge>
                  </div>
                ))}
                {status.sources.length > 5 && (
                  <p className="text-xs text-muted-foreground pt-1">
                    +{status.sources.length - 5} more sources
                  </p>
                )}
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
};
