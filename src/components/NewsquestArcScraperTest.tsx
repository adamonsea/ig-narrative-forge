import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, PlayCircle, CheckCircle2, XCircle, ExternalLink } from "lucide-react";
import { toast } from "sonner";

interface ScraperTestResult {
  success: boolean;
  source: {
    id: string;
    name: string;
    domain: string;
  };
  scraping: {
    method: string;
    arcSite: string;
    sectionPath: string;
    fetchTimeMs: number;
  };
  results: {
    articlesFound: number;
    articlesStored: number;
    testMode: boolean;
    errors?: string[];
  };
  sample?: Array<{
    title: string;
    url: string;
    publishedAt: string;
    wordCount: number;
    hasImage: boolean;
    author?: string;
  }>;
  error?: string;
}

const NEWSQUEST_SOURCES = [
  { id: "019be65d-0075-406c-b572-c66e0528731b", name: "sussexexpress.co.uk", domain: "sussexexpress.co.uk" },
  { id: "019be65d-d78a-b72a-a002-74e66c45ab19", name: "theargus.co.uk", domain: "theargus.co.uk" }
];

export function NewsquestArcScraperTest() {
  const [loading, setLoading] = useState<string | null>(null);
  const [results, setResults] = useState<Record<string, ScraperTestResult>>({});

  const runTest = async (sourceId: string, domain: string, testMode: boolean = true) => {
    setLoading(sourceId);
    try {
      const { data, error } = await supabase.functions.invoke('newsquest-arc-scraper', {
        body: { sourceId, testMode, limit: 20 }
      });

      if (error) throw error;

      setResults(prev => ({ ...prev, [sourceId]: data }));
      
      if (data.success) {
        toast.success(`${testMode ? 'Test' : 'Live'} scrape complete: ${data.results.articlesFound} articles found`);
      } else {
        toast.error(`Scrape failed: ${data.error}`);
      }
    } catch (err: any) {
      const errorResult: ScraperTestResult = {
        success: false,
        error: err.message || 'Unknown error',
        source: { id: sourceId, name: domain, domain },
        scraping: { method: 'arc_api', arcSite: '', sectionPath: '', fetchTimeMs: 0 },
        results: { articlesFound: 0, articlesStored: 0, testMode }
      };
      setResults(prev => ({ ...prev, [sourceId]: errorResult }));
      toast.error(`Test failed: ${err.message}`);
    } finally {
      setLoading(null);
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Newsquest Arc API Scraper Test</CardTitle>
          <CardDescription>
            Isolated scraper using Arc API for Sussex Express and The Argus
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {NEWSQUEST_SOURCES.map(source => {
            const result = results[source.id];
            const isLoading = loading === source.id;

            return (
              <div key={source.id} className="space-y-3 p-4 border rounded-lg">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-semibold">{source.name}</h3>
                    <p className="text-sm text-muted-foreground">{source.domain}</p>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => runTest(source.id, source.domain, true)}
                      disabled={isLoading}
                    >
                      {isLoading ? (
                        <Loader2 className="h-4 w-4 animate-spin mr-2" />
                      ) : (
                        <PlayCircle className="h-4 w-4 mr-2" />
                      )}
                      Test Mode
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => runTest(source.id, source.domain, false)}
                      disabled={isLoading}
                    >
                      {isLoading ? (
                        <Loader2 className="h-4 w-4 animate-spin mr-2" />
                      ) : (
                        <PlayCircle className="h-4 w-4 mr-2" />
                      )}
                      Live Scrape
                    </Button>
                  </div>
                </div>

                {result && (
                  <div className="space-y-3">
                    <Alert variant={result.success ? "default" : "destructive"}>
                      <div className="flex items-start gap-2">
                        {result.success ? (
                          <CheckCircle2 className="h-4 w-4 mt-0.5" />
                        ) : (
                          <XCircle className="h-4 w-4 mt-0.5" />
                        )}
                        <AlertDescription>
                          {result.success ? (
                            <div className="space-y-2">
                              <div className="flex items-center gap-2 flex-wrap">
                                <Badge variant="outline">
                                  {result.scraping.method.toUpperCase()}
                                </Badge>
                                <Badge variant="secondary">
                                  {result.results.articlesFound} articles
                                </Badge>
                                {!result.results.testMode && (
                                  <Badge variant="default">
                                    {result.results.articlesStored} stored
                                  </Badge>
                                )}
                                <span className="text-xs text-muted-foreground">
                                  {result.scraping.fetchTimeMs}ms
                                </span>
                              </div>
                              <div className="text-sm text-muted-foreground">
                                Arc Site: {result.scraping.arcSite} | Path: {result.scraping.sectionPath}
                              </div>
                            </div>
                          ) : (
                            <span className="text-sm">{result.error}</span>
                          )}
                        </AlertDescription>
                      </div>
                    </Alert>

                    {result.sample && result.sample.length > 0 && (
                      <div className="space-y-2">
                        <h4 className="text-sm font-semibold">Sample Articles:</h4>
                        {result.sample.map((article, idx) => (
                          <div key={idx} className="text-sm p-3 bg-muted rounded-md space-y-1">
                            <div className="flex items-start justify-between gap-2">
                              <span className="font-medium">{article.title}</span>
                              <a
                                href={article.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="shrink-0"
                              >
                                <ExternalLink className="h-3 w-3" />
                              </a>
                            </div>
                            <div className="flex items-center gap-3 text-xs text-muted-foreground">
                              <span>{article.wordCount} words</span>
                              {article.author && <span>by {article.author}</span>}
                              {article.hasImage && <Badge variant="outline" className="text-xs">Has image</Badge>}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {new Date(article.publishedAt).toLocaleString()}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {result.results.errors && result.results.errors.length > 0 && (
                      <div className="space-y-1">
                        <h4 className="text-sm font-semibold text-destructive">Errors:</h4>
                        {result.results.errors.map((error, idx) => (
                          <div key={idx} className="text-xs text-muted-foreground">
                            {error}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
}
