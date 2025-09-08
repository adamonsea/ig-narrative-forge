import { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Loader2, CheckCircle, AlertCircle, Clock } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

interface ScrapingStatus {
  source_id: string;
  source_name: string;
  status: 'pending' | 'scraping' | 'completed' | 'failed';
  articles_found: number;
  progress: number;
  last_update: string;
  error_message?: string;
}

interface ScrapingProgressIndicatorProps {
  topicId: string;
  isVisible: boolean;
  onComplete?: () => void;
}

export const ScrapingProgressIndicator = ({ 
  topicId, 
  isVisible, 
  onComplete 
}: ScrapingProgressIndicatorProps) => {
  const [scrapingStatuses, setScrapingStatuses] = useState<ScrapingStatus[]>([]);
  const [totalProgress, setTotalProgress] = useState(0);

  useEffect(() => {
    if (!isVisible) return;

    // Simulate real-time scraping updates
    const fetchScrapingStatus = async () => {
      try {
        const { data: sources } = await supabase
          .from('content_sources')
          .select('id, source_name, last_scraped_at, articles_scraped, success_rate')
          .eq('topic_id', topicId)
          .eq('is_active', true);

        if (sources) {
          const statuses: ScrapingStatus[] = sources.map(source => {
            const timeSinceLastScrape = source.last_scraped_at ? 
              Date.now() - new Date(source.last_scraped_at).getTime() : 0;
            
            // Determine status based on recent activity
            let status: ScrapingStatus['status'] = 'pending';
            if (timeSinceLastScrape < 60000) { // Less than 1 minute
              status = 'scraping';
            } else if (source.articles_scraped > 0) {
              status = 'completed';
            } else if (source.success_rate < 50) {
              status = 'failed';
            }

            return {
              source_id: source.id,
              source_name: source.source_name,
              status,
              articles_found: source.articles_scraped || 0,
              progress: Math.min(100, (source.success_rate || 0)),
              last_update: source.last_scraped_at || new Date().toISOString(),
              error_message: source.success_rate < 30 ? 'Low success rate' : undefined
            };
          });

          setScrapingStatuses(statuses);
          
          // Calculate total progress
          const completed = statuses.filter(s => s.status === 'completed').length;
          const total = statuses.length;
          const progress = total > 0 ? (completed / total) * 100 : 0;
          setTotalProgress(progress);

          if (progress === 100 && onComplete) {
            setTimeout(onComplete, 2000); // Delay to show completion
          }
        }
      } catch (error) {
        console.error('Failed to fetch scraping status:', error);
      }
    };

    const interval = setInterval(fetchScrapingStatus, 3000);
    fetchScrapingStatus(); // Initial fetch

    return () => clearInterval(interval);
  }, [isVisible, topicId, onComplete]);

  if (!isVisible || scrapingStatuses.length === 0) {
    return null;
  }

  const getStatusIcon = (status: ScrapingStatus['status']) => {
    switch (status) {
      case 'scraping':
        return <Loader2 className="w-4 h-4 animate-spin text-blue-500" />;
      case 'completed':
        return <CheckCircle className="w-4 h-4 text-green-500" />;
      case 'failed':
        return <AlertCircle className="w-4 h-4 text-red-500" />;
      default:
        return <Clock className="w-4 h-4 text-gray-500" />;
    }
  };

  const getStatusBadge = (status: ScrapingStatus['status']) => {
    const variants = {
      pending: 'secondary',
      scraping: 'default',
      completed: 'default',
      failed: 'destructive'
    } as const;

    const labels = {
      pending: 'Pending',
      scraping: 'Scraping...',
      completed: 'Complete',
      failed: 'Failed'
    };

    return (
      <Badge variant={variants[status]} className="text-xs">
        {labels[status]}
      </Badge>
    );
  };

  return (
    <Card className="mb-6">
      <CardContent className="p-4">
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-medium text-sm">Scraping Progress</h3>
            <span className="text-sm text-muted-foreground">
              {Math.round(totalProgress)}% Complete
            </span>
          </div>
          
          <Progress value={totalProgress} className="h-2" />
          
          <div className="space-y-2 max-h-48 overflow-y-auto">
            {scrapingStatuses.map((status) => (
              <div 
                key={status.source_id}
                className="flex items-center justify-between p-2 rounded-lg bg-muted/50"
              >
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  {getStatusIcon(status.status)}
                  <span className="text-sm font-medium truncate">
                    {status.source_name}
                  </span>
                  {status.articles_found > 0 && (
                    <span className="text-xs text-muted-foreground">
                      ({status.articles_found} articles)
                    </span>
                  )}
                </div>
                
                <div className="flex items-center gap-2">
                  {getStatusBadge(status.status)}
                  {status.error_message && (
                    <div title={status.error_message}>
                      <AlertCircle className="w-3 h-3 text-orange-500" />
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
};