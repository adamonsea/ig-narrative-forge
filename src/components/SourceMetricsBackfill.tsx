import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { RefreshCw, Check, AlertCircle } from "lucide-react";

interface BackfillResult {
  sourceId: string;
  sourceName: string;
  success: boolean;
  articlesScraped?: number;
  successRate?: number;
  error?: string;
}

export function SourceMetricsBackfill() {
  const [isRunning, setIsRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [results, setResults] = useState<BackfillResult[]>([]);
  const { toast } = useToast();

  const handleBackfillAll = async () => {
    setIsRunning(true);
    setProgress(0);
    setResults([]);

    try {
      const { data, error } = await supabase.functions.invoke('update-source-metrics', {
        body: { backfillAll: true }
      });

      if (error) throw error;

      setProgress(100);
      setResults(data.results || []);
      
      toast({
        title: "Backfill Complete",
        description: `Updated metrics for ${data.successfulUpdates}/${data.totalSources} sources`,
      });

    } catch (error) {
      console.error('Backfill error:', error);
      toast({
        title: "Backfill Failed",
        description: error.message || "Failed to update source metrics",
        variant: "destructive",
      });
    } finally {
      setIsRunning(false);
    }
  };

  const handleBackfillStale = async () => {
    setIsRunning(true);
    setProgress(0);
    setResults([]);

    try {
      const { data, error } = await supabase.functions.invoke('update-source-metrics', {
        body: {} // No specific sourceId = update stale sources
      });

      if (error) throw error;

      setProgress(100);
      setResults(data.results || []);
      
      toast({
        title: "Stale Sources Updated",
        description: `Updated metrics for ${data.successfulUpdates}/${data.totalSources} stale sources`,
      });

    } catch (error) {
      console.error('Stale update error:', error);
      toast({
        title: "Update Failed",
        description: error.message || "Failed to update stale source metrics",
        variant: "destructive",
      });
    } finally {
      setIsRunning(false);
    }
  };

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <RefreshCw className="h-5 w-5" />
          Source Metrics Backfill
        </CardTitle>
        <CardDescription>
          Update source performance metrics based on actual article data to fix status tracking issues.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex gap-2">
          <Button 
            onClick={handleBackfillStale}
            disabled={isRunning}
            variant="outline"
          >
            {isRunning ? 'Processing...' : 'Update Stale Sources'}
          </Button>
          <Button 
            onClick={handleBackfillAll}
            disabled={isRunning}
            variant="secondary"
          >
            {isRunning ? 'Processing...' : 'Backfill All Sources'}
          </Button>
        </div>

        {isRunning && (
          <div className="space-y-2">
            <div className="text-sm text-muted-foreground">
              Updating source metrics...
            </div>
            <Progress value={progress} className="w-full" />
          </div>
        )}

        {results.length > 0 && (
          <div className="space-y-2">
            <h4 className="text-sm font-medium">Update Results</h4>
            <div className="max-h-48 overflow-y-auto space-y-2">
              {results.map((result, index) => (
                <div key={index} className="flex items-center justify-between p-2 border rounded-sm">
                  <div className="flex items-center gap-2">
                    {result.success ? (
                      <Check className="h-4 w-4 text-green-600" />
                    ) : (
                      <AlertCircle className="h-4 w-4 text-red-600" />
                    )}
                    <span className="text-sm font-mono">
                      {result.sourceName}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    {result.success ? (
                      <>
                        <Badge variant="outline" className="text-xs">
                          {result.articlesScraped} articles
                        </Badge>
                        <Badge variant="outline" className="text-xs">
                          {result.successRate}% success
                        </Badge>
                      </>
                    ) : (
                      <Badge variant="destructive" className="text-xs">
                        {result.error}
                      </Badge>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}