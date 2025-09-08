import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { AlertCircle, CheckCircle, Clock, Loader2, XCircle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

interface ScrapingStatus {
  sourceId: string;
  sourceName: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  articlesFound: number;
  progress: number;
  lastUpdate: string;
  error?: string;
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
    if (!isVisible || !topicId) return;

    const fetchScrapingStatus = async () => {
      try {
        // Get all active sources for this topic
        const { data: sources, error } = await supabase
          .from('content_sources')
          .select('id, source_name, last_scraped_at, success_rate, articles_scraped')
          .eq('topic_id', topicId)
          .eq('is_active', true);

        if (error) throw error;

        const statuses: ScrapingStatus[] = sources?.map(source => {
          // Determine status based on recent activity and success rate
          const lastScraped = source.last_scraped_at ? new Date(source.last_scraped_at) : null;
          const isRecent = lastScraped && (Date.now() - lastScraped.getTime()) < 60000; // Within last minute
          
          let status: ScrapingStatus['status'] = 'pending';
          let progress = 0;
          let articlesFound = source.articles_scraped || 0;

          if (isRecent) {
            if (source.success_rate > 0) {
              status = 'completed';
              progress = 100;
            } else {
              status = 'failed';
              progress = 100;
            }
          } else if (source.success_rate === 0 && source.articles_scraped > 0) {
            status = 'failed';
            progress = 100;
          } else if (source.success_rate > 0) {
            status = 'completed';
            progress = 100;
          } else {
            status = 'pending';
            progress = 0;
          }

          return {
            sourceId: source.id,
            sourceName: source.source_name,
            status,
            articlesFound,
            progress,
            lastUpdate: source.last_scraped_at || new Date().toISOString(),
            error: source.success_rate === 0 && source.articles_scraped > 0 ? 'Scraping failed' : undefined
          };
        }) || [];

        setScrapingStatuses(statuses);

        // Calculate overall progress
        const completedSources = statuses.filter(s => s.status === 'completed' || s.status === 'failed').length;
        const totalSources = statuses.length;
        const overallProgress = totalSources > 0 ? (completedSources / totalSources) * 100 : 0;
        setTotalProgress(overallProgress);

        // Call onComplete if all sources are done
        if (overallProgress === 100 && onComplete) {
          onComplete();
        }

      } catch (error) {
        console.error('Error fetching scraping status:', error);
      }
    };

    // Initial fetch
    fetchScrapingStatus();

    // Set up polling every 3 seconds
    const interval = setInterval(fetchScrapingStatus, 3000);

    return () => clearInterval(interval);
  }, [topicId, isVisible, onComplete]);

  if (!isVisible || scrapingStatuses.length === 0) {
    return null;
  }

  const getStatusIcon = (status: ScrapingStatus['status']) => {
    switch (status) {
      case 'completed':
        return <CheckCircle className="w-4 h-4 text-green-500" />;
      case 'failed':
        return <XCircle className="w-4 h-4 text-red-500" />;
      case 'processing':
        return <Loader2 className="w-4 h-4 text-blue-500 animate-spin" />;
      default:
        return <Clock className="w-4 h-4 text-gray-400" />;
    }
  };

  const getStatusBadge = (status: ScrapingStatus['status']) => {
    switch (status) {
      case 'completed':
        return <Badge variant="default" className="bg-green-500">Completed</Badge>;
      case 'failed':
        return <Badge variant="destructive">Failed</Badge>;
      case 'processing':
        return <Badge variant="secondary">Processing</Badge>;
      default:
        return <Badge variant="outline">Pending</Badge>;
    }
  };

  return (
    <Card className="mb-6">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Loader2 className="w-5 h-5 animate-spin" />
          Scraping Progress
        </CardTitle>
        <Progress value={totalProgress} className="w-full" />
        <p className="text-sm text-muted-foreground">
          {Math.round(totalProgress)}% complete ({scrapingStatuses.filter(s => s.status === 'completed' || s.status === 'failed').length} of {scrapingStatuses.length} sources)
        </p>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {scrapingStatuses.map((status) => (
            <div key={status.sourceId} className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
              <div className="flex items-center gap-3">
                {getStatusIcon(status.status)}
                <div>
                  <p className="font-medium">{status.sourceName}</p>
                  <p className="text-sm text-muted-foreground">
                    {status.articlesFound} articles found
                  </p>
                  {status.error && (
                    <div className="flex items-center gap-1 mt-1">
                      <AlertCircle className="w-3 h-3 text-red-500" />
                      <p className="text-xs text-red-600">{status.error}</p>
                    </div>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2">
                {getStatusBadge(status.status)}
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
};