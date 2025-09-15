import { useState } from "react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertTriangle, CheckCircle } from "lucide-react";

export const DiscardedArticlesBackfillButton = () => {
  const [isRunning, setIsRunning] = useState(false);
  const [hasRun, setHasRun] = useState(false);
  const [result, setResult] = useState<any>(null);
  const { toast } = useToast();

  const runBackfill = async () => {
    if (isRunning) return;

    setIsRunning(true);
    
    try {
      console.log('🔄 Running discarded articles backfill...');
      
      const { data, error } = await supabase.functions.invoke('backfill-discarded-articles');
      
      if (error) {
        throw error;
      }

      console.log('✅ Backfill completed:', data);
      setResult(data);
      setHasRun(true);
      
      toast({
        title: "Backfill Complete",
        description: data.message || "Successfully backfilled discarded articles for permanent suppression.",
      });

    } catch (error: any) {
      console.error('❌ Backfill failed:', error);
      toast({
        title: "Backfill Failed", 
        description: error.message || "Failed to backfill discarded articles.",
        variant: "destructive",
      });
    } finally {
      setIsRunning(false);
    }
  };

  return (
    <Card className="border-orange-200">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          {hasRun ? (
            <CheckCircle className="w-5 h-5 text-green-600" />
          ) : (
            <AlertTriangle className="w-5 h-5 text-orange-600" />
          )}
          Permanent Article Deletion Setup
        </CardTitle>
        <CardDescription>
          {hasRun 
            ? "✅ One-time setup completed successfully"
            : "One-time setup to ensure previously deleted articles stay permanently deleted"
          }
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {!hasRun && (
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">
              This will backfill the suppression list with articles you've previously deleted,
              ensuring they never reappear in future scrapes.
            </p>
          </div>
        )}

        {hasRun && result && (
          <div className="space-y-2">
            <p className="text-sm text-green-700">
              ✅ Backfilled {result.stats?.backfilled_count || 0} entries
            </p>
            <p className="text-sm text-muted-foreground">
              Skipped {result.stats?.skipped_count || 0} duplicates
            </p>
          </div>
        )}

        <Button 
          onClick={runBackfill} 
          disabled={isRunning || hasRun}
          variant={hasRun ? "outline" : "default"}
          className={hasRun ? "opacity-60" : ""}
        >
          {isRunning ? "Running Backfill..." : hasRun ? "Backfill Complete" : "Run One-Time Backfill"}
        </Button>
      </CardContent>
    </Card>
  );
};