import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { CheckCircle, XCircle, Play, Clock, Zap } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/components/ui/use-toast';

interface ScrapeResult {
  sourceId: string;
  sourceName: string;
  success: boolean;
  articlesFound?: number;
  articlesScraped?: number;
  multiTenantStored?: number;
  method?: string;
  error?: string;
}

interface UniversalScrapeResponse {
  success: boolean;
  topicId: string;
  topicName: string;
  sourcesProcessed: number;
  successfulSources: number;
  totalArticles: number;
  results: ScrapeResult[];
  error?: string;
}

interface UniversalTopicScraperProps {
  topicId: string;
  topicName: string;
}

export function UniversalTopicScraper({ topicId, topicName }: UniversalTopicScraperProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [isAutomating, setIsAutomating] = useState(false);
  const [results, setResults] = useState<UniversalScrapeResponse | null>(null);
  const [progress, setProgress] = useState(0);
  const { toast } = useToast();

  const startUniversalScraping = async (forceRescrape = false) => {
    setIsLoading(true);
    setResults(null);
    setProgress(0);

    try {
      toast({
        title: "Universal Scraping Started",
        description: `Scraping all sources for ${topicName}...`,
      });

      const { data, error } = await supabase.functions.invoke('universal-topic-scraper', {
        body: {
          topicId,
          forceRescrape
        }
      });

      if (error) {
        throw new Error(error.message);
      }

      setResults(data);
      setProgress(100);

      toast({
        title: "Universal Scraping Complete",
        description: `Found ${data.totalArticles} articles from ${data.successfulSources}/${data.sourcesProcessed} sources`,
      });

    } catch (error) {
      console.error('Universal scraping error:', error);
      toast({
        title: "Scraping Failed",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const testAutomation = async () => {
    setIsAutomating(true);
    
    try {
      toast({
        title: "Testing Automation",
        description: "Running automation check for this topic...",
      });

      const { data, error } = await supabase.functions.invoke('universal-topic-automation', {
        body: {
          topicIds: [topicId],
          force: true
        }
      });

      if (error) {
        throw new Error(error.message);
      }

      toast({
        title: "Automation Test Complete",
        description: `Processed ${data.topicsProcessed} topics, scraped ${data.totalArticles} articles`,
      });

    } catch (error) {
      console.error('Automation test error:', error);
      toast({
        title: "Automation Test Failed",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setIsAutomating(false);
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Zap className="h-5 w-5" />
            Universal Topic Scraper
          </CardTitle>
          <CardDescription>
            Universal scraping pipeline using junction table for {topicName}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-3">
            <Button
              onClick={() => startUniversalScraping(false)}
              disabled={isLoading}
              className="flex-1"
            >
              {isLoading ? (
                <>
                  <Clock className="mr-2 h-4 w-4 animate-spin" />
                  Scraping...
                </>
              ) : (
                <>
                  <Play className="mr-2 h-4 w-4" />
                  Start Universal Scrape
                </>
              )}
            </Button>
            
            <Button
              variant="outline"
              onClick={() => startUniversalScraping(true)}
              disabled={isLoading}
            >
              Force Rescrape
            </Button>

            <Button
              variant="secondary"
              onClick={testAutomation}
              disabled={isAutomating}
            >
              {isAutomating ? (
                <>
                  <Clock className="mr-2 h-4 w-4 animate-spin" />
                  Testing...
                </>
              ) : (
                "Test Automation"
              )}
            </Button>
          </div>

          {isLoading && (
            <div className="space-y-2">
              <div className="flex justify-between text-sm text-muted-foreground">
                <span>Universal scraping in progress...</span>
                <span>{progress}%</span>
              </div>
              <Progress value={progress} className="h-2" />
            </div>
          )}
        </CardContent>
      </Card>

      {results && (
        <Card>
          <CardHeader>
            <CardTitle>Universal Scraping Results</CardTitle>
            <CardDescription>
              Scraped {results.totalArticles} articles from {results.successfulSources}/{results.sourcesProcessed} sources
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {!results.success && (
              <Alert variant="destructive">
                <XCircle className="h-4 w-4" />
                <AlertDescription>{results.error}</AlertDescription>
              </Alert>
            )}

            <div className="grid gap-2">
              {results.results?.map((result, index) => (
                <div
                  key={index}
                  className="flex items-center justify-between p-3 border rounded-lg"
                >
                  <div className="flex items-center gap-3">
                    {result.success ? (
                      <CheckCircle className="h-5 w-5 text-green-500" />
                    ) : (
                      <XCircle className="h-5 w-5 text-red-500" />
                    )}
                    <div>
                      <div className="font-medium">{result.sourceName}</div>
                      {result.error && (
                        <div className="text-sm text-red-500">{result.error}</div>
                      )}
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-2">
                    {result.success && (
                      <>
                        <Badge variant="secondary">
                          {result.articlesScraped} scraped
                        </Badge>
                        <Badge variant="outline">
                          {result.multiTenantStored} stored
                        </Badge>
                        {result.method && (
                          <Badge variant="outline">
                            {result.method}
                          </Badge>
                        )}
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>

            <div className="pt-4 border-t">
              <div className="grid grid-cols-3 gap-4 text-center">
                <div>
                  <div className="text-2xl font-bold">{results.sourcesProcessed}</div>
                  <div className="text-sm text-muted-foreground">Sources Processed</div>
                </div>
                <div>
                  <div className="text-2xl font-bold">{results.successfulSources}</div>
                  <div className="text-sm text-muted-foreground">Successful</div>
                </div>
                <div>
                  <div className="text-2xl font-bold">{results.totalArticles}</div>
                  <div className="text-sm text-muted-foreground">Articles Found</div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}