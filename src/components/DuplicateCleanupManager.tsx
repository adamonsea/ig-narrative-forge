import { useState } from 'react';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, Trash2, Merge } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/components/ui/use-toast";

interface CleanupResult {
  success: boolean;
  processed_count: number;
  deleted_count: number;
  merged_count: number;
}

export const DuplicateCleanupManager = () => {
  const [isRunning, setIsRunning] = useState(false);
  const [lastResult, setLastResult] = useState<CleanupResult | null>(null);
  const { toast } = useToast();

  const runCleanup = async () => {
    setIsRunning(true);
    try {
      const { data, error } = await supabase.rpc('cleanup_duplicate_articles');
      
      if (error) {
        throw error;
      }
      
      const result = data as unknown as CleanupResult;
      setLastResult(result);
      toast({
        title: "Cleanup Complete",
        description: `Processed ${result.processed_count} duplicates, cleaned up ${result.deleted_count} articles`,
      });
    } catch (error: any) {
      console.error('Cleanup failed:', error);
      toast({
        title: "Cleanup Failed", 
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setIsRunning(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Merge className="h-5 w-5" />
          Duplicate Article Cleanup
        </CardTitle>
        <CardDescription>
          Clean up duplicate articles that are cluttering the pipeline. This will identify and merge/remove exact URL duplicates automatically.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Button 
          onClick={runCleanup} 
          disabled={isRunning}
          className="w-full"
        >
          {isRunning && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {isRunning ? "Running Cleanup..." : "Clean Up Duplicates"}
        </Button>
        
        {lastResult && (
          <div className="space-y-2">
            <Badge variant="secondary">
              Last Cleanup Results
            </Badge>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="font-medium">Processed:</span> {lastResult.processed_count}
              </div>
              <div>
                <span className="font-medium">Cleaned:</span> {lastResult.deleted_count}
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};