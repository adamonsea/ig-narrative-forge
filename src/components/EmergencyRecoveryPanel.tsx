import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Loader2, AlertTriangle, CheckCircle, Play } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export function EmergencyRecoveryPanel() {
  const [isFixing, setIsFixing] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [results, setResults] = useState<any>(null);
  const { toast } = useToast();

  const handleMethodFix = async () => {
    setIsFixing(true);
    try {
      const { data, error } = await supabase.functions.invoke('emergency-source-fix', {
        body: { action: 'fix_method_assignment' }
      });

      if (error) throw error;

      toast({
        title: 'Method Assignment Fixed',
        description: `Updated ${data.sources_fixed} sources to use correct content gathering methods`,
      });

      setResults(data);
    } catch (error) {
      console.error('Method fix error:', error);
      toast({
        title: 'Fix Failed',
        description: error.message || 'Failed to fix method assignment',
        variant: 'destructive',
      });
    } finally {
      setIsFixing(false);
    }
  };

  const handleTestFeeds = async () => {
    setIsTesting(true);
    try {
      const { data, error } = await supabase.functions.invoke('emergency-source-fix', {
        body: { action: 'trigger_emergency_scraping' }
      });

      if (error) throw error;

      toast({
        title: 'RSS Feeds Tested',
        description: `Tested ${data.tested_count} RSS feeds`,
      });

      setResults(data);
    } catch (error) {
      console.error('Feed test error:', error);
      toast({
        title: 'Test Failed',
        description: error.message || 'Failed to test RSS feeds',
        variant: 'destructive',
      });
    } finally {
      setIsTesting(false);
    }
  };

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <AlertTriangle className="h-5 w-5 text-orange-500" />
          Emergency Recovery Panel
        </CardTitle>
        <CardDescription>
          Fix critical scraping issues affecting regional topics
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3">
          <Button
            onClick={handleMethodFix}
            disabled={isFixing}
            variant="outline"
            className="w-full justify-start"
          >
            {isFixing ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <CheckCircle className="h-4 w-4 mr-2" />
            )}
            Fix RSS Method Assignment
          </Button>

          <Button
            onClick={handleTestFeeds}
            disabled={isTesting}
            variant="outline"
            className="w-full justify-start"
          >
            {isTesting ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Play className="h-4 w-4 mr-2" />
            )}
            Test Fixed RSS Feeds
          </Button>
        </div>

        {results && (
          <div className="mt-4 p-3 bg-muted rounded-lg">
            <h4 className="font-medium mb-2">Recovery Results:</h4>
            {results.sources_fixed !== undefined && (
              <Badge variant="secondary" className="mr-2">
                {results.sources_fixed} sources fixed
              </Badge>
            )}
            {results.tested_count !== undefined && (
              <>
                <Badge variant="secondary" className="mr-2">
                  {results.tested_count} feeds tested
                </Badge>
                {results.results && (
                  <div className="mt-2 space-y-1">
                    {results.results.map((result: any, index: number) => (
                      <div key={index} className="text-sm flex items-center gap-2">
                        {result.success ? (
                          <CheckCircle className="h-3 w-3 text-green-500" />
                        ) : (
                          <AlertTriangle className="h-3 w-3 text-red-500" />
                        )}
                        <span className="truncate">
                          {result.source_name}: {result.success ? 'Working' : 'Failed'}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        )}

        <div className="text-xs text-muted-foreground space-y-1">
          <p>✅ Phase 1 Complete: Dead RSS feeds fixed, success rates reset</p>
          <p>✅ Phase 1 Complete: Duplicate detection sensitivity reduced</p>
          <p>🔧 Phase 2: Use buttons above to fix method assignment and test feeds</p>
        </div>
      </CardContent>
    </Card>
  );
}