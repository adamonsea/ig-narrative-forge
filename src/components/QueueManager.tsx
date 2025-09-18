import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { RefreshCw, PlayCircle, RotateCcw } from 'lucide-react';

interface QueueStats {
  pending: number;
  processing: number;
  completed: number;
  failed: number;
}

export function QueueManager() {
  const [stats, setStats] = useState<QueueStats>({ pending: 0, processing: 0, completed: 0, failed: 0 });
  const [isLoading, setIsLoading] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const { toast } = useToast();

  const loadStats = async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('content_generation_queue')
        .select('status');

      if (error) throw error;

      const newStats = {
        pending: data.filter(item => item.status === 'pending').length,
        processing: data.filter(item => item.status === 'processing').length,
        completed: data.filter(item => item.status === 'completed').length,
        failed: data.filter(item => item.status === 'failed').length,
      };

      setStats(newStats);
    } catch (error) {
      console.error('Failed to load queue stats:', error);
      toast({
        title: "Error",
        description: "Failed to load queue statistics",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const processQueue = async () => {
    setIsProcessing(true);
    try {
      console.log('🚀 Starting queue processing...');
      const { data, error } = await supabase.functions.invoke('queue-processor');
      
      if (error) {
        console.error('Queue processor error:', error);
        throw error;
      }

      console.log('✅ Queue processing response:', data);
      
      const processed = data?.processed || 0;
      toast({
        title: "Success",
        description: `Queue processing completed successfully. Processed ${processed} jobs.`,
      });

      // Reload stats after processing
      setTimeout(loadStats, 2000);
    } catch (error) {
      console.error('Failed to process queue:', error);
      toast({
        title: "Error",
        description: `Failed to start queue processing: ${error.message}`,
        variant: "destructive",
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const resetFailedJobs = async () => {
    setIsResetting(true);
    try {
      // Reset failed jobs by updating their status and attempts
      const { error } = await supabase
        .from('content_generation_queue')
        .update({ 
          attempts: 0, 
          status: 'pending', 
          error_message: null 
        })
        .gte('attempts', 3)
        .eq('status', 'pending');

      if (error) throw error;

      toast({
        title: "Success",
        description: "Failed jobs have been reset and will be retried",
      });

      loadStats();
    } catch (error) {
      console.error('Failed to reset jobs:', error);
      toast({
        title: "Error",
        description: "Failed to reset failed jobs",
        variant: "destructive",
      });
    } finally {
      setIsResetting(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          Content Generation Queue
          <Button
            variant="outline"
            size="sm"
            onClick={loadStats}
            disabled={isLoading}
          >
            <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
          </Button>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="text-center">
            <Badge variant="outline" className="w-full justify-center">
              Pending: {stats.pending}
            </Badge>
          </div>
          <div className="text-center">
            <Badge variant="secondary" className="w-full justify-center">
              Processing: {stats.processing}
            </Badge>
          </div>
          <div className="text-center">
            <Badge variant="default" className="w-full justify-center">
              Completed: {stats.completed}
            </Badge>
          </div>
          <div className="text-center">
            <Badge variant="destructive" className="w-full justify-center">
              Failed: {stats.failed}
            </Badge>
          </div>
        </div>

        <div className="flex gap-2">
          <Button
            onClick={processQueue}
            disabled={isProcessing}
            className="flex items-center gap-2"
          >
            <PlayCircle className={`h-4 w-4 ${isProcessing ? 'animate-pulse' : ''}`} />
            {isProcessing ? 'Processing...' : 'Process Queue'}
          </Button>

          {stats.failed > 0 && (
            <Button
              variant="outline"
              onClick={resetFailedJobs}
              disabled={isResetting}
              className="flex items-center gap-2"
            >
              <RotateCcw className={`h-4 w-4 ${isResetting ? 'animate-spin' : ''}`} />
              {isResetting ? 'Resetting...' : 'Reset Failed'}
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}