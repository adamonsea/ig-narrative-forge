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

export const ParliamentaryBackfillTrigger = ({ topicId, region }: ParliamentaryBackfillTriggerProps) => {
  const [isProcessing, setIsProcessing] = useState(false);
  const { toast } = useToast();

  const handleBackfill = async () => {
    setIsProcessing(true);
    try {
      const { data, error } = await supabase.functions.invoke('parliamentary-weekly-backfill', {
        body: { topicId, region }
      });

      if (error) throw error;

      toast({
        title: "Backfill Complete",
        description: `Created weekly roundup with ${data.votesProcessed} votes from last 7 days.`
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
          Create a weekly roundup story from last week's parliamentary votes
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Button
          onClick={handleBackfill}
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
              Create Last Week's Roundup
            </>
          )}
        </Button>
      </CardContent>
    </Card>
  );
};
