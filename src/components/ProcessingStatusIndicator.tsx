import React, { useState, useEffect } from 'react';
import { Badge } from '@/components/ui/badge';
import { Loader2, CheckCircle, XCircle, Clock } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

interface ProcessingStatusIndicatorProps {
  sourceId: string;
  className?: string;
}

interface GatheringStatus {
  isActive: boolean;
  startTime?: number;
  estimatedDuration?: number;
  progress?: number;
}

export function ProcessingStatusIndicator({ sourceId, className }: ProcessingStatusIndicatorProps) {
  const [status, setStatus] = useState<GatheringStatus>({ isActive: false });
  const [elapsedTime, setElapsedTime] = useState(0);

  useEffect(() => {
    checkGatheringStatus();
    
    // Set up real-time subscription for scrape jobs
    const channel = supabase
      .channel('scrape-job-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'scrape_jobs',
          filter: `source_id=eq.${sourceId}`
        },
        (payload) => {
          console.log('Scrape job change:', payload);
          checkGatheringStatus();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [sourceId]);

  useEffect(() => {
    let interval: NodeJS.Timeout;
    
    if (status.isActive && status.startTime) {
      interval = setInterval(() => {
        const elapsed = Date.now() - status.startTime!;
        setElapsedTime(Math.floor(elapsed / 1000));
      }, 1000);
    }

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [status.isActive, status.startTime]);

  const checkGatheringStatus = async () => {
    try {
      // Check for active scrape jobs for this source
      const { data: activeJobs } = await supabase
        .from('scrape_jobs')
        .select('id, started_at, status, created_at')
        .eq('source_id', sourceId)
        .in('status', ['pending', 'running'])
        .order('created_at', { ascending: false })
        .limit(1);

      if (activeJobs && activeJobs.length > 0) {
        const job = activeJobs[0];
        const startTime = job.started_at ? new Date(job.started_at).getTime() : new Date(job.created_at).getTime();
        
        setStatus({
          isActive: true,
          startTime,
          estimatedDuration: 60000, // 1 minute estimated
          progress: undefined // We don't have detailed progress yet
        });
      } else {
        setStatus({ isActive: false });
        setElapsedTime(0);
      }
    } catch (error) {
      console.error('Error checking gathering status:', error);
      setStatus({ isActive: false });
    }
  };

  const formatElapsedTime = (seconds: number) => {
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}m ${remainingSeconds}s`;
  };

  const getProgressText = () => {
    if (elapsedTime < 5) return 'Starting up...';
    if (elapsedTime < 15) return 'Connecting...';
    if (elapsedTime < 30) return 'Gathering articles...';
    if (elapsedTime < 60) return 'Processing content...';
    return 'Finishing up...';
  };

  if (!status.isActive) {
    return null;
  }

  return (
    <Badge 
      variant="secondary" 
      className={`flex items-center gap-1 animate-pulse bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/20 dark:text-blue-400 ${className}`}
    >
      <Loader2 className="h-3 w-3 animate-spin" />
      <span className="text-xs">
        {getProgressText()} ({formatElapsedTime(elapsedTime)})
      </span>
    </Badge>
  );
}

export default ProcessingStatusIndicator;