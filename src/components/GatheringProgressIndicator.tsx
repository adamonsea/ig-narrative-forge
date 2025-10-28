import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { AlertCircle, CheckCircle, Clock, Loader2, XCircle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

interface GatheringStatus {
  sourceId: string;
  sourceName: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  articlesFound: number;
  progress: number;
  lastUpdate: string;
  error?: string;
  diagnosticInfo?: string;
  alternateRouteUsed?: string;
}

interface GatheringProgressIndicatorProps {
  topicId: string;
  isVisible: boolean;
  jobRunId?: string | null;
  onComplete?: () => void;
}

export const GatheringProgressIndicator = ({ 
  topicId, 
  isVisible,
  jobRunId,
  onComplete 
}: GatheringProgressIndicatorProps) => {
  const [gatheringStatuses, setGatheringStatuses] = useState<GatheringStatus[]>([]);
  const [totalProgress, setTotalProgress] = useState(0);
  const [jobStatus, setJobStatus] = useState<'pending' | 'processing' | 'completed' | 'failed'>('pending');

  useEffect(() => {
    if (!isVisible || !topicId) return;

    const fetchGatheringStatus = async () => {
      try {
        // Check job run status if available
        if (jobRunId) {
          const { data: jobRun } = await supabase
            .from('job_runs')
            .select('status, output_data')
            .eq('id', jobRunId)
            .single();
          
          if (jobRun) {
            setJobStatus(jobRun.status as any);
            
            if (jobRun.status === 'completed' && onComplete) {
              onComplete();
              return;
            }
          }
        }

        // Get all sources for this topic via junction table
        const { data: topicSources, error: sourcesError } = await supabase
          .from('topic_sources')
          .select(`
            source_id,
            content_sources:source_id (
              id,
              source_name,
              last_scraped_at,
              success_rate,
              articles_scraped
            )
          `)
          .eq('topic_id', topicId)
          .eq('is_active', true);

        if (sourcesError) throw sourcesError;

        const statuses: GatheringStatus[] = topicSources?.map(ts => {
          const source = ts.content_sources as any;
          if (!source) return null;
          
          // Determine status based on recent activity and success rate
          const lastScraped = source.last_scraped_at ? new Date(source.last_scraped_at) : null;
          const isRecent = lastScraped && (Date.now() - lastScraped.getTime()) < 300000; // Within last 5 minutes
          
          let status: GatheringStatus['status'] = 'pending';
          let progress = 0;
          let articlesFound = source.articles_scraped || 0;

          if (isRecent) {
            if (source.success_rate > 0) {
              status = 'completed';
              progress = 100;
            } else {
              status = 'processing';
              progress = 50;
            }
          } else if (source.articles_scraped > 0) {
            status = 'completed';
            progress = 100;
          }

          return {
            sourceId: source.id,
            sourceName: source.source_name,
            status,
            articlesFound,
            progress,
            lastUpdate: source.last_scraped_at || new Date().toISOString(),
            error: source.success_rate === 0 && isRecent ? 'Gathering in progress' : undefined
          };
        }).filter(Boolean) as GatheringStatus[] || [];

        setGatheringStatuses(statuses);

        // Calculate overall progress
        const completedSources = statuses.filter(s => s.status === 'completed').length;
        const processingSources = statuses.filter(s => s.status === 'processing').length;
        const totalSources = statuses.length;
        
        if (totalSources > 0) {
          const overallProgress = ((completedSources + (processingSources * 0.5)) / totalSources) * 100;
          setTotalProgress(overallProgress);
        }

        // Auto-complete if job is done or all sources completed
        if ((jobStatus === 'completed' || totalProgress >= 100) && onComplete) {
          setTimeout(() => onComplete(), 2000);
        }

      } catch (error) {
        console.error('Error fetching content gathering status:', error);
      }
    };

    // Initial fetch
    fetchGatheringStatus();

    // Set up polling every 5 seconds
    const interval = setInterval(fetchGatheringStatus, 5000);

    return () => clearInterval(interval);
  }, [topicId, isVisible, jobRunId, jobStatus, totalProgress, onComplete]);

  if (!isVisible || gatheringStatuses.length === 0) {
    return null;
  }

  const getStatusIcon = (status: GatheringStatus['status']) => {
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

  const getStatusBadge = (status: GatheringStatus['status']) => {
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
    <Card className="mb-6 border-primary/20">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          {jobStatus === 'completed' ? (
            <CheckCircle className="w-5 h-5 text-green-500" />
          ) : (
            <Loader2 className="w-5 h-5 animate-spin text-primary" />
          )}
          Content Gathering Progress
          {jobStatus === 'completed' && (
            <Badge variant="default" className="ml-2 bg-green-500">Complete</Badge>
          )}
        </CardTitle>
        <Progress value={totalProgress} className="w-full mt-2" />
        <p className="text-sm text-muted-foreground mt-1">
          {Math.round(totalProgress)}% complete ({gatheringStatuses.filter(s => s.status === 'completed').length} of {gatheringStatuses.length} sources)
        </p>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {gatheringStatuses.map((status) => (
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