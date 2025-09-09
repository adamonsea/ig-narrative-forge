import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { AlertCircle, RefreshCw, CheckCircle } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import { supabase } from '@/integrations/supabase/client';

interface ReExtractionResult {
  processed: number;
  improved: number;
  failed: number;
  errors: string[];
}

interface ArticleReExtractorProps {
  topicId?: string;
  topicName?: string;
}

export function ArticleReExtractor({ topicId, topicName }: ArticleReExtractorProps) {
  const { toast } = useToast();
  const [isRunning, setIsRunning] = useState(false);
  const [result, setResult] = useState<ReExtractionResult | null>(null);
  const [progress, setProgress] = useState(0);

  const runReExtraction = async () => {
    setIsRunning(true);
    setResult(null);
    setProgress(0);

    try {
      toast({
        title: "Starting re-extraction",
        description: "Finding articles with low word counts...",
      });

      const { data, error } = await supabase.functions.invoke('re-extract-articles', {
        body: {
          minWordCount: 100,
          maxArticles: 50,
          topicId: topicId
        }
      });

      if (error) throw error;

      setResult(data);
      setProgress(100);

      if (data.improved > 0) {
        toast({
          title: "Re-extraction complete!",
          description: `Improved ${data.improved} out of ${data.processed} articles`,
        });
      } else {
        toast({
          title: "Re-extraction complete",
          description: "No articles needed improvement",
          variant: "destructive"
        });
      }

    } catch (error) {
      console.error('Re-extraction error:', error);
      toast({
        title: "Re-extraction failed",
        description: error.message,
        variant: "destructive"
      });
    } finally {
      setIsRunning(false);
    }
  };

  return (
    <Card className="w-full max-w-2xl">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <RefreshCw className="h-5 w-5" />
          Article Re-Extractor
          {topicName && (
            <span className="text-sm font-normal text-muted-foreground">
              - {topicName}
            </span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="bg-muted/50 p-4 rounded-lg">
          <div className="flex items-start gap-2 mb-2">
            <AlertCircle className="h-4 w-4 mt-0.5 text-warning" />
            <div className="text-sm">
              <p className="font-medium">Fix Snippet Articles</p>
              <p className="text-muted-foreground">
                This tool finds articles with low word counts (likely RSS snippets) and 
                re-extracts the full content from the original URLs.
              </p>
            </div>
          </div>
        </div>

        <Button 
          onClick={runReExtraction}
          disabled={isRunning}
          className="w-full"
        >
          {isRunning ? (
            <>
              <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
              Re-extracting Articles...
            </>
          ) : (
            <>
              <RefreshCw className="mr-2 h-4 w-4" />
              Start Re-extraction
            </>
          )}
        </Button>

        {isRunning && (
          <div className="space-y-2">
            <Progress value={progress} className="w-full" />
            <p className="text-sm text-muted-foreground text-center">
              Processing articles...
            </p>
          </div>
        )}

        {result && (
          <div className="space-y-3">
            <div className="grid grid-cols-3 gap-4 text-center">
              <div className="bg-muted/50 p-3 rounded-lg">
                <div className="text-2xl font-bold">{result.processed}</div>
                <div className="text-sm text-muted-foreground">Processed</div>
              </div>
              <div className="bg-success/10 p-3 rounded-lg">
                <div className="text-2xl font-bold text-success">{result.improved}</div>
                <div className="text-sm text-muted-foreground">Improved</div>
              </div>
              <div className="bg-destructive/10 p-3 rounded-lg">
                <div className="text-2xl font-bold text-destructive">{result.failed}</div>
                <div className="text-sm text-muted-foreground">Failed</div>
              </div>
            </div>

            {result.improved > 0 && (
              <div className="flex items-center gap-2 p-3 bg-success/10 rounded-lg">
                <CheckCircle className="h-4 w-4 text-success" />
                <span className="text-sm text-success">
                  Successfully improved {result.improved} articles with better content extraction
                </span>
              </div>
            )}

            {result.errors.length > 0 && (
              <div className="space-y-2">
                <p className="text-sm font-medium">Errors:</p>
                <div className="bg-destructive/10 p-3 rounded-lg">
                  {result.errors.slice(0, 3).map((error, index) => (
                    <p key={index} className="text-sm text-destructive">
                      • {error}
                    </p>
                  ))}
                  {result.errors.length > 3 && (
                    <p className="text-sm text-muted-foreground">
                      ...and {result.errors.length - 3} more errors
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}