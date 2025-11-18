import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { CheckCircle, XCircle, Play, Clock, Zap, Info } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/components/ui/use-toast';

interface ScrapeResult {
  sourceId: string;
  sourceName: string;
  success: boolean;
  articlesFound?: number;
  articlesScraped?: number;
  articlesStored?: number;  // Actually stored articles
  rejectedLowRelevance?: number;
  rejectedLowQuality?: number;
  rejectedCompeting?: number;
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
  const [maxAgeDays, setMaxAgeDays] = useState(7);
  const [selectedSourceId, setSelectedSourceId] = useState<string>('');
  const [availableSources, setAvailableSources] = useState<Array<{ id: string; name: string }>>([]);
  const { toast } = useToast();

  // Load available sources on mount
  React.useEffect(() => {
    const loadSources = async () => {
      const { data } = await supabase
        .from('topic_sources')
        .select('source_id, content_sources(id, source_name)')
        .eq('topic_id', topicId)
        .eq('is_active', true);
      
      if (data) {
        const sources = data
          .filter(ts => ts.content_sources)
          .map(ts => ({
            id: ts.content_sources!.id,
            name: ts.content_sources!.source_name
          }));
        setAvailableSources(sources);
      }
    };
    loadSources();
  }, [topicId]);

  const startUniversalScraping = async (forceRescrape = false, singleSourceMode = false) => {
    setIsLoading(true);
    setResults(null);
    setProgress(0);

    try {
      const isSingleSource = singleSourceMode && selectedSourceId;
      const ageWindowLabel = maxAgeDays === 7 ? 'default' : maxAgeDays === 30 ? 'seed mode' : 'full archive';
      const sourceName = isSingleSource ? availableSources.find(s => s.id === selectedSourceId)?.name : 'all sources';
      
      toast({
        title: isSingleSource ? "Single Source Debug Scrape" : "Universal Scraping Started",
        description: `Scraping ${sourceName} for ${topicName} (${ageWindowLabel})...`,
      });

      const { data, error } = await supabase.functions.invoke('universal-topic-scraper', {
        body: {
          topicId,
          forceRescrape: true, // Always force in debug mode
          maxAgeDays,
          ...(isSingleSource && {
            sourceIds: [selectedSourceId],
            batchSize: 1,
            enforceStrictScope: false,
            singleSourceMode: true
          })
        }
      });

      if (error) {
        throw new Error(error.message);
      }

      setResults(data);
      setProgress(100);

      const hasNewContent = (data?.summary?.totalArticlesStored || 0) > 0;
      toast({
        title: hasNewContent ? "Content Found" : "No New Content",
        description: hasNewContent 
          ? `Found ${data.summary.totalArticlesStored} articles from ${data.summary.successfulSources}/${data.summary.totalSources} sources`
          : `Checked ${data.summary.totalSources} sources - no new articles found`,
        variant: hasNewContent ? "success" : "muted",
      });

    } catch (error) {
      console.error('❌ Universal scraping error:', error);
      console.error('Scraping error details:', {
        message: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
        topicId,
        topicName,
        maxAgeDays,
        forceRescrape,
        timestamp: new Date().toISOString()
      });
      
      toast({
        title: "Scraping Failed",
        description: error instanceof Error ? error.message : 'An unknown error occurred',
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
          <div className="flex items-center gap-4 p-3 bg-muted/50 rounded-lg">
            <Label htmlFor="maxAgeDays" className="text-sm font-medium whitespace-nowrap">
              Content Age Window:
            </Label>
            <Select
              value={maxAgeDays.toString()}
              onValueChange={(value) => setMaxAgeDays(parseInt(value))}
            >
              <SelectTrigger id="maxAgeDays" className="w-[220px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="7">Last 7 days (default)</SelectItem>
                <SelectItem value="30">Last 30 days (seed mode)</SelectItem>
                <SelectItem value="100">Last 100 days (full archive)</SelectItem>
              </SelectContent>
            </Select>
            <Info className="h-4 w-4 text-muted-foreground" />
          </div>

          <div className="flex items-center gap-4 p-3 bg-muted/50 rounded-lg">
            <Label htmlFor="singleSource" className="text-sm font-medium whitespace-nowrap">
              Single Source Debug:
            </Label>
            <Select
              value={selectedSourceId}
              onValueChange={setSelectedSourceId}
            >
              <SelectTrigger id="singleSource" className="w-[220px]">
                <SelectValue placeholder="All sources (normal)" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">All sources (normal mode)</SelectItem>
                {availableSources.map(source => (
                  <SelectItem key={source.id} value={source.id}>
                    {source.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {selectedSourceId && (
              <Badge variant="outline" className="text-xs">
                Debug: Enhanced logs
              </Badge>
            )}
          </div>
          
          <div className="flex gap-3">
            <Button
              onClick={() => startUniversalScraping(false, false)}
              disabled={isLoading || isAutomating || !!selectedSourceId}
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
              onClick={() => startUniversalScraping(true, !!selectedSourceId)}
              disabled={isLoading || isAutomating}
              variant={selectedSourceId ? "default" : "outline"}
            >
              <Zap className="mr-2 h-4 w-4" />
              {selectedSourceId ? 'Debug Single Source' : 'Force Rescrape'}
            </Button>
          </div>

          <Button
            variant="secondary"
            onClick={testAutomation}
            disabled={isLoading || isAutomating}
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
        </CardContent>

        {isLoading && (
          <div className="space-y-2">
            <div className="flex justify-between text-sm text-muted-foreground">
              <span>Universal scraping in progress...</span>
              <span>{progress}%</span>
            </div>
            <Progress value={progress} className="h-2" />
          </div>
        )}
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
                  
                  <div className="flex items-center gap-2 flex-wrap">
                    {result.success && (
                      <>
                        {result.articlesFound !== undefined && (
                          <Badge variant="outline" className="bg-muted">
                            {result.articlesFound} found
                          </Badge>
                        )}
                        {result.articlesScraped !== undefined && (
                          <Badge variant="secondary">
                            {result.articlesScraped} qualified
                          </Badge>
                        )}
                        {result.articlesStored !== undefined && (
                          <Badge variant={result.articlesStored > 0 ? "default" : "outline"}>
                            {result.articlesStored} stored
                          </Badge>
                        )}
                        {(result.rejectedLowRelevance || 0) > 0 && (
                          <Badge variant="destructive">
                            -{result.rejectedLowRelevance} relevance
                          </Badge>
                        )}
                        {(result.rejectedLowQuality || 0) > 0 && (
                          <Badge variant="outline" className="text-yellow-600 border-yellow-600">
                            -{result.rejectedLowQuality} quality
                          </Badge>
                        )}
                        {(result.rejectedCompeting || 0) > 0 && (
                          <Badge variant="outline" className="text-orange-600 border-orange-600">
                            -{result.rejectedCompeting} competing
                          </Badge>
                        )}
                        {result.method && (
                          <Badge variant="outline" className="text-xs">
                            {result.method}
                          </Badge>
                        )}
                        {result.articlesFound && result.articlesScraped === 0 && (
                          <Badge variant="destructive" className="animate-pulse">
                            ⚠️ All filtered
                          </Badge>
                        )}
                        {result.articlesScraped && result.articlesStored === 0 && (
                          <Badge variant="destructive" className="animate-pulse">
                            ⚠️ All rejected
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