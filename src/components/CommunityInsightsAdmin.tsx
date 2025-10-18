import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/components/ui/use-toast';
import { Loader2, RefreshCw, Clock, CheckCircle2, AlertCircle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

interface CommunityInsightsAdminProps {
  topicId: string;
  topicName: string;
  communityConfig?: {
    subreddits?: string[];
    last_processed?: string;
    processing_frequency_hours?: number;
  };
}

export const CommunityInsightsAdmin = ({ 
  topicId, 
  topicName,
  communityConfig 
}: CommunityInsightsAdminProps) => {
  const [isProcessing, setIsProcessing] = useState(false);
  const [lastResult, setLastResult] = useState<any>(null);

  const handleManualTrigger = async () => {
    setIsProcessing(true);
    try {
      console.log('🚀 Manually triggering Reddit community processor for topic:', topicId);
      
      const { data, error } = await supabase.functions.invoke('reddit-community-scheduler', {
        body: { 
          manual_test: true,
          force_topic_id: topicId 
        }
      });

      if (error) {
        console.error('❌ Error invoking scheduler:', error);
        throw error;
      }

      console.log('✅ Scheduler response:', data);
      setLastResult(data);
      
      toast({
        title: "Processing Started",
        description: `Reddit community insights are being processed for ${topicName}. Check back in a few minutes.`,
      });
    } catch (error) {
      console.error('Error triggering community processor:', error);
      toast({
        title: "Processing Failed",
        description: error instanceof Error ? error.message : "Failed to start processing",
        variant: "destructive",
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const lastProcessed = communityConfig?.last_processed;
  const subreddits = communityConfig?.subreddits || [];
  const frequency = communityConfig?.processing_frequency_hours || 24;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Community Intelligence Admin</CardTitle>
        <CardDescription>
          Manage Reddit community insights for {topicName}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Status */}
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium">Last Processed:</span>
            {lastProcessed ? (
              <Badge variant="outline">
                {new Date(lastProcessed).toLocaleString()}
              </Badge>
            ) : (
              <Badge variant="secondary">Never</Badge>
            )}
          </div>
          
          <div className="flex items-center gap-2">
            <RefreshCw className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium">Frequency:</span>
            <Badge variant="outline">Every {frequency} hours</Badge>
          </div>
        </div>

        {/* Subreddits */}
        <div className="space-y-2">
          <span className="text-sm font-medium">Monitored Subreddits:</span>
          <div className="flex flex-wrap gap-2">
            {subreddits.length > 0 ? (
              subreddits.map((sub) => (
                <Badge key={sub} variant="secondary">
                  r/{sub}
                </Badge>
              ))
            ) : (
              <span className="text-sm text-muted-foreground">No subreddits configured</span>
            )}
          </div>
        </div>

        {/* Manual Trigger */}
        <div className="pt-4 border-t">
          <Button
            onClick={handleManualTrigger}
            disabled={isProcessing || subreddits.length === 0}
            className="w-full"
          >
            {isProcessing ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Processing...
              </>
            ) : (
              <>
                <RefreshCw className="mr-2 h-4 w-4" />
                Process Community Insights Now
              </>
            )}
          </Button>
          {subreddits.length === 0 && (
            <p className="text-sm text-muted-foreground mt-2">
              Configure subreddits in topic settings to enable processing
            </p>
          )}
        </div>

        {/* Last Result */}
        {lastResult && (
          <div className="pt-4 border-t">
            <div className="flex items-start gap-2">
              {lastResult.success ? (
                <CheckCircle2 className="h-4 w-4 text-green-500 mt-0.5" />
              ) : (
                <AlertCircle className="h-4 w-4 text-red-500 mt-0.5" />
              )}
              <div className="flex-1">
                <p className="text-sm font-medium">
                  {lastResult.success ? 'Processing Successful' : 'Processing Failed'}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  {lastResult.message || JSON.stringify(lastResult, null, 2)}
                </p>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
