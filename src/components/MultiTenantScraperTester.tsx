import React, { useState } from 'react';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2, Play, CheckCircle, XCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

const MultiTenantScraperTester = () => {
  const [testing, setTesting] = useState(false);
  const [results, setResults] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();

  // Brighton topic for testing
  const testTopic = {
    id: 'ba443441-9f01-4116-8695-67ec08cba1df',
    name: 'Brighton',
    region: 'Brighton and Hove',
    type: 'regional'
  };

  const testArticles = [
    {
      title: "New Brighton Marina Development Gets Planning Approval",
      body: "Brighton and Hove City Council has approved plans for a major redevelopment of Brighton Marina. The £500 million project will include new residential units, retail spaces, and improved waterfront facilities. Local residents have welcomed the investment in the area, which is expected to create hundreds of jobs and boost tourism. The development will feature sustainable design elements and improved public transport links to the city center.",
      author: "Sarah Johnson",
      published_at: new Date().toISOString(),
      source_url: "https://test.brighton-news.co.uk/marina-development-approved",
      image_url: "https://example.com/marina.jpg",
      word_count: 85
    }
  ];

  const runMultiTenantTest = async () => {
    setTesting(true);
    setError(null);
    setResults(null);

    try {
      console.log('🧪 Starting multi-tenant scraper test for Brighton topic...');
      
      const { data, error: functionError } = await supabase.functions.invoke('multi-tenant-scraper', {
        body: {
          feedUrl: 'test-url',
          topicId: testTopic.id,
          sourceId: 'c2ad5092-398e-414a-b12f-9111ad401648', // BBC Sussex source
          articles: testArticles
        }
      });

      if (functionError) {
        throw new Error(`Function error: ${functionError.message}`);
      }

      console.log('✅ Multi-tenant scraper test completed:', data);
      setResults(data);
      
      toast({
        title: "Test Completed",
        description: `Multi-tenant scraper processed ${data.articlesFound} articles, created ${data.newContentCreated} new content entries`,
      });

    } catch (err: any) {
      console.error('❌ Test failed:', err);
      setError(err.message);
      toast({
        title: "Test Failed",
        description: err.message,
        variant: "destructive",
      });
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            🧪 Multi-Tenant Scraper Test
          </CardTitle>
          <CardDescription>
            Test the new multi-tenant scraper architecture with the Brighton topic before rolling out system-wide.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="border rounded-lg p-4 space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-medium">Test Topic:</span>
              <Badge variant="outline">{testTopic.name}</Badge>
            </div>
            <div className="flex items-center justify-between">
              <span className="font-medium">Region:</span>
              <span className="text-muted-foreground">{testTopic.region}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="font-medium">Type:</span>
              <Badge variant="secondary">{testTopic.type}</Badge>
            </div>
          </div>

          <Alert>
            <AlertDescription>
              This will test the multi-tenant scraper with sample Brighton news data to verify:
              <ul className="mt-2 ml-4 list-disc space-y-1">
                <li>Shared content storage in <code>shared_article_content</code></li>
                <li>Topic-specific metadata in <code>topic_articles</code></li>
                <li>Regional relevance scoring for Brighton content</li>
                <li>Quality filtering and content enhancement</li>
              </ul>
            </AlertDescription>
          </Alert>

          <Button 
            onClick={runMultiTenantTest} 
            disabled={testing}
            className="w-full"
            size="lg"
          >
            {testing ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Running Multi-Tenant Test...
              </>
            ) : (
              <>
                <Play className="w-4 h-4 mr-2" />
                Test Multi-Tenant Scraper
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      {error && (
        <Alert variant="destructive">
          <XCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {results && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CheckCircle className="w-5 h-5 text-green-600" />
              Test Results
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="border rounded-lg p-3">
                <div className="text-sm text-muted-foreground">Articles Found</div>
                <div className="text-2xl font-bold">{results.articlesFound}</div>
              </div>
              <div className="border rounded-lg p-3">
                <div className="text-sm text-muted-foreground">Articles Scraped</div>
                <div className="text-2xl font-bold">{results.articlesScraped}</div>
              </div>
              <div className="border rounded-lg p-3">
                <div className="text-sm text-muted-foreground">New Content Created</div>
                <div className="text-2xl font-bold">{results.newContentCreated}</div>
              </div>
              <div className="border rounded-lg p-3">
                <div className="text-sm text-muted-foreground">Topic Articles Created</div>
                <div className="text-2xl font-bold">{results.topicArticlesCreated}</div>
              </div>
            </div>

            <div className="border rounded-lg p-3">
              <div className="text-sm text-muted-foreground mb-2">Method Used</div>
              <Badge>{results.method}</Badge>
            </div>

            {results.errors && results.errors.length > 0 && (
              <div className="border border-red-200 rounded-lg p-3">
                <div className="text-sm text-red-600 mb-2">Errors</div>
                <ul className="space-y-1">
                  {results.errors.map((error: string, index: number) => (
                    <li key={index} className="text-sm text-red-600">• {error}</li>
                  ))}
                </ul>
              </div>
            )}

            <Alert>
              <CheckCircle className="h-4 w-4" />
              <AlertDescription>
                {results.success 
                  ? "✅ Multi-tenant scraper test completed successfully! Ready for system-wide deployment."
                  : "⚠️ Test completed with issues. Review errors before proceeding."
                }
              </AlertDescription>
            </Alert>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default MultiTenantScraperTester;