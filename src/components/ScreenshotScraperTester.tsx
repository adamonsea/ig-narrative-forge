import React, { useState } from 'react';
import { Card, CardHeader, CardContent, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { Loader2, Camera, Cpu, DollarSign } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

export const ScreenshotScraperTester = () => {
  const [testUrl, setTestUrl] = useState('https://www.bbc.co.uk/news');
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState<any>(null);
  const { toast } = useToast();

  const testScreenshotScraper = async () => {
    if (!testUrl.trim()) {
      toast({
        title: "Error",
        description: "Please enter a URL to test",
        variant: "destructive",
      });
      return;
    }

    setTesting(true);
    setResult(null);

    try {
      console.log('🧪 Testing screenshot scraper with URL:', testUrl);

      const { data, error } = await supabase.functions.invoke('screenshot-ai-scraper', {
        body: {
          feedUrl: testUrl,
          sourceId: 'test-source-id',
          region: 'test'
        }
      });

      if (error) {
        throw error;
      }

      console.log('📊 Screenshot scraper result:', data);
      setResult(data);

      if (data.success) {
        toast({
          title: "Screenshot Scraping Successful",
          description: `Extracted ${data.articlesFound} articles using DeepSeek AI`,
        });
      } else {
        toast({
          title: "Screenshot Scraping Failed",
          description: data.errors?.[0] || "Unknown error occurred",
          variant: "destructive",
        });
      }

    } catch (error) {
      console.error('❌ Screenshot scraper test failed:', error);
      toast({
        title: "Test Failed",
        description: error.message || "Failed to test screenshot scraper",
        variant: "destructive",
      });
      setResult({
        success: false,
        error: error.message
      });
    } finally {
      setTesting(false);
    }
  };

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Camera className="w-5 h-5" />
          Screenshot AI Scraper Tester
          <Badge variant="secondary">DeepSeek V3</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="testUrl">Test URL</Label>
          <Input
            id="testUrl"
            value={testUrl}
            onChange={(e) => setTestUrl(e.target.value)}
            placeholder="Enter website URL to test..."
            disabled={testing}
          />
        </div>

        <Button 
          onClick={testScreenshotScraper}
          disabled={testing || !testUrl.trim()}
          className="w-full"
        >
          {testing ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Taking Screenshot & Extracting...
            </>
          ) : (
            <>
              <Camera className="w-4 h-4 mr-2" />
              Test Screenshot Scraper
            </>
          )}
        </Button>

        {result && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="font-medium">Test Results</h4>
              <Badge variant={result.success ? "default" : "destructive"}>
                {result.success ? "Success" : "Failed"}
              </Badge>
            </div>

            {result.success ? (
              <div className="space-y-2">
                <Alert>
                  <Cpu className="w-4 h-4" />
                  <AlertDescription>
                    Successfully extracted <strong>{result.articlesFound}</strong> articles
                    using <strong>{result.method}</strong>
                  </AlertDescription>
                </Alert>

                {result.cost && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <DollarSign className="w-4 h-4" />
                    Estimated cost: ${result.cost.toFixed(4)}
                  </div>
                )}

                {result.screenshotUrl && (
                  <div className="space-y-2">
                    <Label>Generated Screenshot</Label>
                    <img 
                      src={result.screenshotUrl} 
                      alt="Website screenshot"
                      className="w-full max-w-md rounded border"
                      style={{ maxHeight: '200px', objectFit: 'contain' }}
                    />
                  </div>
                )}

                {result.articles && result.articles.length > 0 && (
                  <div className="space-y-2">
                    <Label>Extracted Articles</Label>
                    <div className="space-y-2 max-h-40 overflow-y-auto">
                      {result.articles.map((article: any, index: number) => (
                        <div key={index} className="p-2 bg-muted rounded text-sm">
                          <div className="font-medium">{article.title}</div>
                          <div className="text-muted-foreground truncate">
                            {article.body?.substring(0, 100)}...
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <Alert variant="destructive">
                <AlertDescription>
                  {result.error || result.errors?.[0] || "Screenshot scraping failed"}
                </AlertDescription>
              </Alert>
            )}
          </div>
        )}

        <Alert>
          <Camera className="w-4 h-4" />
          <AlertDescription className="text-sm">
            <strong>How it works:</strong> Takes a screenshot of the website, then uses DeepSeek V3 vision AI 
            to extract article content. Great for bypassing bot detection on news sites.
          </AlertDescription>
        </Alert>
      </CardContent>
    </Card>
  );
};