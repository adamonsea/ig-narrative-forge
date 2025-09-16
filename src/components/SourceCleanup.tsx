import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle, Trash2, Settings, RefreshCw } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface CleanupResult {
  success: boolean;
  operation: string;
  results?: Array<{
    operation: string;
    result: {
      success: boolean;
      orphaned_sources_removed?: number;
      duplicate_sources_consolidated?: number;
      duplicates_removed?: number;
      message: string;
    };
  }>;
  final_source_count?: number;
  summary?: string;
  error?: string;
}

export const SourceCleanup = () => {
  const [isLoading, setIsLoading] = useState(false);
  const [lastResult, setLastResult] = useState<CleanupResult | null>(null);
  const { toast } = useToast();

  const runCleanup = async (operation: 'cleanup_orphaned' | 'fix_sussex_express' | 'full_cleanup' | 'cleanup_legacy_orphaned') => {
    setIsLoading(true);
    try {
      let data, error;
      
      if (operation === 'cleanup_legacy_orphaned') {
        // Call the new cleanup function directly
        const result = await supabase.rpc('cleanup_orphaned_legacy_sources');
        data = result.data;
        error = result.error;
      } else {
        // Use existing source-cleanup function
        const result = await supabase.functions.invoke('source-cleanup', {
          body: { operation }
        });
        data = result.data;
        error = result.error;
      }

      if (error) throw error;
      
      setLastResult({ ...data, operation });
      
      if (data.success) {
        toast({
          title: "Cleanup Successful",
          description: data.message || data.summary || "Source cleanup completed successfully",
        });
      } else {
        throw new Error(data.error || 'Unknown error during cleanup');
      }
    } catch (error) {
      console.error('Source cleanup failed:', error);
      toast({
        title: "Cleanup Failed",
        description: error.message || "Failed to run source cleanup",
        variant: "destructive",
      });
      setLastResult({
        success: false,
        operation,
        error: error.message
      });
    } finally {
      setIsLoading(false);
    }
  };

  const getOperationDescription = (op: string) => {
    switch (op) {
      case 'cleanup_orphaned':
        return 'Removes sources with no topic links and consolidates duplicates';
      case 'fix_sussex_express':
        return 'Fixes Sussex Express source conflicts and duplicates';
      case 'full_cleanup':
        return 'Runs complete cleanup: Sussex Express fix + orphaned source removal';
      default:
        return 'Unknown operation';
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Settings className="h-5 w-5" />
          Source Management & Cleanup
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Clean up orphaned sources, consolidate duplicates, and fix collection issues
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Action Buttons */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <Button
            onClick={() => runCleanup('fix_sussex_express')}
            disabled={isLoading}
            variant="outline"
            className="flex items-center gap-2"
          >
            <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
            Fix Sussex Express
          </Button>
          
          <Button
            onClick={() => runCleanup('cleanup_orphaned')}
            disabled={isLoading}
            variant="outline"
            className="flex items-center gap-2"
          >
            <Trash2 className="h-4 w-4" />
            Clean Orphaned Sources
          </Button>
          
          <Button
            onClick={() => runCleanup('cleanup_legacy_orphaned')}
            disabled={isLoading}
            variant="destructive"
            className="flex items-center gap-2"
          >
            <AlertTriangle className="h-4 w-4" />
            Remove Legacy Orphaned Sources
          </Button>
        </div>

        {/* Operation Descriptions */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs text-muted-foreground">
          <div className="p-2 bg-muted rounded">
            <strong>Sussex Express Fix:</strong><br />
            {getOperationDescription('fix_sussex_express')}
          </div>
          <div className="p-2 bg-muted rounded">
            <strong>Orphaned Cleanup:</strong><br />
            {getOperationDescription('cleanup_orphaned')}
          </div>
          <div className="p-2 bg-muted rounded">
            <strong>Full Cleanup:</strong><br />
            {getOperationDescription('full_cleanup')}
          </div>
        </div>

        {/* Results Display */}
        {lastResult && (
          <div className="mt-6 p-4 border rounded-lg">
            <div className="flex items-center gap-2 mb-3">
              <Badge variant={lastResult.success ? "default" : "destructive"}>
                {lastResult.success ? "SUCCESS" : "FAILED"}
              </Badge>
              <span className="text-sm font-medium">
                Operation: {lastResult.operation}
              </span>
              {lastResult.final_source_count !== undefined && (
                <Badge variant="secondary">
                  Final Count: {lastResult.final_source_count} sources
                </Badge>
              )}
            </div>
            
            {lastResult.success ? (
              <div className="space-y-2">
                {lastResult.summary && (
                  <p className="text-sm text-green-600 dark:text-green-400">
                    {lastResult.summary}
                  </p>
                )}
                
                {lastResult.results?.map((result, index) => (
                  <div key={index} className="text-xs bg-muted p-2 rounded">
                    <strong>{result.operation}:</strong> {result.result.message}
                    {result.result.orphaned_sources_removed !== undefined && (
                      <span className="ml-2 text-destructive">
                        Removed: {result.result.orphaned_sources_removed}
                      </span>
                    )}
                    {result.result.duplicate_sources_consolidated !== undefined && (
                      <span className="ml-2 text-warning">
                        Consolidated: {result.result.duplicate_sources_consolidated}
                      </span>
                    )}
                    {result.result.duplicates_removed !== undefined && (
                      <span className="ml-2 text-warning">
                        Duplicates: {result.result.duplicates_removed}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-destructive">
                Error: {lastResult.error}
              </p>
            )}
          </div>
        )}

        {/* Warning Notice */}
        <div className="flex items-start gap-2 p-3 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg">
          <AlertTriangle className="h-4 w-4 text-yellow-600 dark:text-yellow-400 mt-0.5 flex-shrink-0" />
          <div className="text-sm text-yellow-800 dark:text-yellow-200">
            <strong>Warning:</strong> These operations will permanently delete orphaned sources and 
            consolidate duplicates. The changes cannot be undone. Run individual operations first 
            to test before using "Full Cleanup".
          </div>
        </div>
      </CardContent>
    </Card>
  );
};