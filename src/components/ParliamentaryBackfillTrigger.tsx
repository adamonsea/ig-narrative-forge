import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Calendar, Loader2 } from 'lucide-react';

interface ParliamentaryBackfillTriggerProps {
  topicId: string;
  region: string;
}

type BackfillPeriod = 7 | 30;

export const ParliamentaryBackfillTrigger = ({ topicId, region }: ParliamentaryBackfillTriggerProps) => {
  const [isProcessing, setIsProcessing] = useState(false);
  const { toast } = useToast();

  const handleBackfill = async (days: BackfillPeriod) => {
    setIsProcessing(true);
    try {
      const { data, error } = await supabase.functions.invoke('parliamentary-weekly-backfill', {
        body: { topicId, region, days }
      });

      if (error) throw error;

      toast({
        title: "Backfill Complete",
        description: `Created roundup with ${data.votesProcessed} votes from last ${days} days.`
      });
    } catch (error) {
      console.error('Backfill error:', error);
      toast({
        title: "Backfill Failed",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive"
      });
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Calendar className="h-5 w-5" />
          Weekly Roundup Backfill
        </CardTitle>
        <CardDescription>
          Create a roundup story from recent parliamentary votes
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <Button
          onClick={() => handleBackfill(7)}
          disabled={isProcessing}
          className="w-full"
          variant="secondary"
        >
          {isProcessing ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Creating Roundup...
            </>
          ) : (
            <>
              <Calendar className="mr-2 h-4 w-4" />
              Last 7 Days
            </>
          )}
        </Button>
        <Button
          onClick={() => handleBackfill(30)}
          disabled={isProcessing}
          className="w-full"
        >
          {isProcessing ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Creating Roundup...
            </>
          ) : (
            <>
              <Calendar className="mr-2 h-4 w-4" />
              Last 30 Days
            </>
          )}
        </Button>
      </CardContent>
    </Card>
  );
};
