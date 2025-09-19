import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, Play, RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

export const QueueProcessor = () => {
  const [isProcessing, setIsProcessing] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [queueStats, setQueueStats] = useState({
    pending: 0,
    processing: 0,
    completed: 0,
    failed: 0
  });
  const { toast } = useToast();

  const loadQueueStats = async () => {
    setIsRefreshing(true);
    try {
      const { data, error } = await supabase
        .from('content_generation_queue')
        .select('status');
      
      if (error) throw error;
      
      const stats = data.reduce((acc, item) => {
        acc[item.status as keyof typeof acc]++;
        return acc;
      }, { pending: 0, processing: 0, completed: 0, failed: 0 });
      
      setQueueStats(stats);
    } catch (error) {
      console.error('Error loading queue stats:', error);
      toast({
        title: "Error loading queue stats",
        description: "Please try again",
        variant: "destructive",
      });
    } finally {
      setIsRefreshing(false);
    }
  };

  const processQueue = async () => {
    setIsProcessing(true);
    try {
      console.log('🚀 Triggering queue processor...');
      
      const { data, error } = await supabase.functions.invoke('queue-processor', {
        body: { 
          trigger: 'manual',
          reset_attempts: true 
        }
      });

      if (error) {
        console.error('Queue processing error:', error);
        throw error;
      }

      console.log('✅ Queue processing result:', data);
      
      toast({
        title: "Queue processing started",
        description: `Processing ${queueStats.pending} pending items...`,
      });

      // Refresh stats after a short delay
      setTimeout(loadQueueStats, 2000);
      
    } catch (error: any) {
      console.error('Failed to process queue:', error);
      toast({
        title: "Failed to process queue",
        description: error.message || "Please try again",
        variant: "destructive",
      });
    } finally {
      setIsProcessing(false);
    }
  };

  // Load stats on component mount
  useEffect(() => {
    loadQueueStats();
  }, []);

  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Play className="w-5 h-5" />
          Queue Processor
        </CardTitle>
        <CardDescription>
          Trigger content generation pipeline
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-2">
          <div className="text-center">
            <Badge variant="outline" className="w-full">
              Pending: {queueStats.pending}
            </Badge>
          </div>
          <div className="text-center">
            <Badge variant="secondary" className="w-full">
              Processing: {queueStats.processing}
            </Badge>
          </div>
          <div className="text-center">
            <Badge variant="default" className="w-full bg-green-100 text-green-800">
              Completed: {queueStats.completed}
            </Badge>
          </div>
          <div className="text-center">
            <Badge variant="destructive" className="w-full">
              Failed: {queueStats.failed}
            </Badge>
          </div>
        </div>

        <div className="flex gap-2">
          <Button
            onClick={processQueue}
            disabled={isProcessing || queueStats.pending === 0}
            className="flex-1"
          >
            {isProcessing ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Processing...
              </>
            ) : (
              <>
                <Play className="w-4 h-4 mr-2" />
                Process Queue
              </>
            )}
          </Button>
          
          <Button
            variant="outline"
            onClick={loadQueueStats}
            disabled={isRefreshing}
            size="icon"
          >
            <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
          </Button>
        </div>

        {queueStats.pending > 0 && (
          <p className="text-sm text-muted-foreground">
            Ready to process {queueStats.pending} articles into stories
          </p>
        )}
      </CardContent>
    </Card>
  );
};