import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Vote, Calendar, Play, RefreshCw } from 'lucide-react';

interface ParliamentaryAutomationSettingsProps {
  topicId: string;
  region?: string;
  enabled: boolean;
  onToggle: (enabled: boolean) => void;
}

export const ParliamentaryAutomationSettings = ({
  topicId,
  region,
  enabled,
  onToggle
}: ParliamentaryAutomationSettingsProps) => {
  const [isTestingDaily, setIsTestingDaily] = useState(false);
  const [isTestingWeekly, setIsTestingWeekly] = useState(false);
  const { toast } = useToast();

  const handleTestDaily = async () => {
    if (!region) {
      toast({
        title: "Region Required",
        description: "Please set a region for this topic first",
        variant: "destructive"
      });
      return;
    }

    setIsTestingDaily(true);
    try {
      const { data, error } = await supabase.functions.invoke('uk-parliament-collector', {
        body: {
          topicId,
          region,
          mode: 'daily'
        }
      });

      if (error) throw error;

      toast({
        title: "Daily Collection Triggered",
        description: `Found ${data.votesCollected || 0} votes. Stories will be generated shortly.`
      });
    } catch (error) {
      console.error('Test daily collection error:', error);
      toast({
        title: "Collection Failed",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive"
      });
    } finally {
      setIsTestingDaily(false);
    }
  };

  const handleTestWeekly = async () => {
    if (!region) {
      toast({
        title: "Region Required",
        description: "Please set a region for this topic first",
        variant: "destructive"
      });
      return;
    }

    setIsTestingWeekly(true);
    try {
      const { data, error } = await supabase.functions.invoke('uk-parliament-collector', {
        body: {
          topicId,
          region,
          mode: 'weekly'
        }
      });

      if (error) throw error;

      toast({
        title: "Weekly Roundup Created",
        description: `Compiled ${data.votesIncluded || 0} votes into weekly story.`
      });
    } catch (error) {
      console.error('Test weekly roundup error:', error);
      toast({
        title: "Roundup Failed",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive"
      });
    } finally {
      setIsTestingWeekly(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Vote className="h-5 w-5" />
          Parliamentary Voting Automation
        </CardTitle>
        <CardDescription>
          Automatically track and publish MP voting records for your region
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <Label htmlFor="parliamentary-tracking">Enable Parliamentary Tracking</Label>
            <p className="text-sm text-muted-foreground">
              Automatically collect daily votes and weekly roundups
            </p>
          </div>
          <Switch
            id="parliamentary-tracking"
            checked={enabled}
            onCheckedChange={onToggle}
            disabled={!region}
          />
        </div>

        {!region && (
          <div className="rounded-md bg-muted p-3 text-sm text-muted-foreground">
            Set a region for this topic to enable parliamentary tracking
          </div>
        )}

        {enabled && region && (
          <div className="space-y-4 border-t pt-4">
            <div>
              <h4 className="text-sm font-medium mb-2">Automation Status</h4>
              <div className="grid gap-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Daily Collection</span>
                  <Badge variant="secondary" className="gap-1">
                    <RefreshCw className="h-3 w-3" />
                    Every 6 hours
                  </Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Weekly Roundup</span>
                  <Badge variant="secondary" className="gap-1">
                    <Calendar className="h-3 w-3" />
                    Mondays at 9am
                  </Badge>
                </div>
              </div>
            </div>

            <div>
              <h4 className="text-sm font-medium mb-2">Manual Testing</h4>
              <div className="flex gap-2">
                <Button
                  onClick={handleTestDaily}
                  disabled={isTestingDaily}
                  variant="outline"
                  size="sm"
                  className="flex-1"
                >
                  <Play className="h-4 w-4 mr-2" />
                  {isTestingDaily ? "Collecting..." : "Test Daily"}
                </Button>
                <Button
                  onClick={handleTestWeekly}
                  disabled={isTestingWeekly}
                  variant="outline"
                  size="sm"
                  className="flex-1"
                >
                  <Calendar className="h-4 w-4 mr-2" />
                  {isTestingWeekly ? "Creating..." : "Test Weekly"}
                </Button>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
