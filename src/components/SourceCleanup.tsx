import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle, Trash2, Settings } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Spinner } from '@/components/ui/spinner';

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

  const runCleanup = async (operation: 'cleanup_orphaned' | 'cleanup_legacy_orphaned') => {
    setIsLoading(true);
    try {
      let data, error;
      
      if (operation === 'cleanup_legacy_orphaned') {
        const result = await supabase.rpc('cleanup_orphaned_legacy_sources');
        data = result.data;
        error = result.error;
      } else {
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
    } catch (error: any) {
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

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Settings className="h-5 w-5" />
          Source Cleanup
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Remove orphaned sources and consolidate duplicates
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-3">
          <Button
            onClick={() => runCleanup('cleanup_orphaned')}
            disabled={isLoading}
            variant="outline"
            className="flex items-center gap-2"
          >
            {isLoading ? <Spinner size="sm" /> : <Trash2 className="h-4 w-4" />}
            Clean Orphaned Sources
          </Button>
          
          <Button
            onClick={() => runCleanup('cleanup_legacy_orphaned')}
            disabled={isLoading}
            variant="destructive"
            className="flex items-center gap-2"
          >
            {isLoading ? <Spinner size="sm" className="text-destructive-foreground" /> : <AlertTriangle className="h-4 w-4" />}
            Remove Legacy Orphaned
          </Button>
        </div>

        {lastResult && (
          <div className="p-4 border rounded-lg">
            <div className="flex items-center gap-2 mb-3">
              <Badge variant={lastResult.success ? "default" : "destructive"}>
                {lastResult.success ? "SUCCESS" : "FAILED"}
              </Badge>
              {lastResult.final_source_count !== undefined && (
                <Badge variant="secondary">
                  {lastResult.final_source_count} sources remaining
                </Badge>
              )}
            </div>
            
            {lastResult.success ? (
              <div className="space-y-2">
                {lastResult.summary && (
                  <p className="text-sm text-muted-foreground">{lastResult.summary}</p>
                )}
                {lastResult.results?.map((result, index) => (
                  <div key={index} className="text-xs bg-muted p-2 rounded">
                    <strong>{result.operation}:</strong> {result.result.message}
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
      </CardContent>
    </Card>
  );
};
