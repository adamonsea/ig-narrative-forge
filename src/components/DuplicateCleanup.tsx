import React, { useState } from 'react';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Search, CheckCircle } from "lucide-react";

export const DuplicateCleanup = () => {
  const [isRunning, setIsRunning] = useState(false);
  const [lastResult, setLastResult] = useState<any>(null);
  const { toast } = useToast();

  const runCleanup = async () => {
    setIsRunning(true);
    try {
      console.log('🧹 Starting duplicate cleanup...');
      
      const { data, error } = await supabase.functions.invoke('duplicate-cleanup', {
        body: {}
      });

      if (error) {
        throw error;
      }

      console.log('✅ Cleanup completed:', data);
      setLastResult(data.result);
      
      toast({
        title: "Cleanup Completed",
        description: data.message,
      });
      
    } catch (error: any) {
      console.error('❌ Cleanup failed:', error);
      toast({
        title: "Cleanup Failed",
        description: error.message || "An error occurred during cleanup",
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
          <Search className="w-5 h-5" />
          Duplicate Cleanup Tool
        </CardTitle>
        <CardDescription>
          Scan existing articles for duplicates that may have been missed. 
          This will process articles in batches and flag potential duplicates for review.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-2">
          <Button 
            onClick={runCleanup} 
            disabled={isRunning}
            className="flex items-center gap-2"
          >
            {isRunning ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Search className="w-4 h-4" />
            )}
            {isRunning ? 'Scanning Articles...' : 'Run Cleanup Scan'}
          </Button>
          
          {lastResult && (
            <Badge variant="secondary" className="flex items-center gap-1">
              <CheckCircle className="w-3 h-3" />
              Last run: {lastResult.articles_processed} articles checked, {lastResult.duplicates_found} duplicates found
            </Badge>
          )}
        </div>
        
        {isRunning && (
          <div className="p-4 bg-muted rounded-lg">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin" />
              Scanning articles for duplicates... This may take a few moments.
            </div>
          </div>
        )}
        
        {lastResult && !isRunning && (
          <div className="p-4 bg-green-50 dark:bg-green-900/20 rounded-lg border border-green-200 dark:border-green-800">
            <div className="text-sm space-y-1">
              <div className="font-medium text-green-800 dark:text-green-200">
                Cleanup Results:
              </div>
              <div className="text-green-700 dark:text-green-300">
                • Articles processed: {lastResult.articles_processed}
              </div>
              <div className="text-green-700 dark:text-green-300">
                • Duplicates found: {lastResult.duplicates_found}
              </div>
              {lastResult.duplicates_found > 0 && (
                <div className="text-green-700 dark:text-green-300 text-xs mt-2">
                  Check the Duplicate Detection panel to review and manage found duplicates.
                </div>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};