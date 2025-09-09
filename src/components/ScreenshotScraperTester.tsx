import React, { useState } from 'react';
import { Card, CardHeader, CardContent, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { supabase } from '@/integrations/supabase/client';
import { Loader2, Camera, Cpu, DollarSign, Target, TrendingDown, AlertTriangle, CheckCircle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

// Challenging sources that have historically failed with traditional scraping
const CHALLENGING_SOURCES = [
  {
    id: "1066-country-blog",
    name: "1066 Country Blog",
    url: "https://1066country.com",
    successRate: 3.69,
    description: "Local Eastbourne blog - extremely challenging",
    type: "hyper-local",
    attemptsTotal: 65
  },
  {
    id: "sussex-express",
    name: "Sussex Express Eastbourne",
    url: "https://www.sussexexpress.co.uk/news/eastbourne",
    successRate: 5.25,
    description: "Local news site with complex structure",
    type: "hyper-local",
    attemptsTotal: 95
  },
  {
    id: "more-radio",
    name: "More Radio Eastbourne",
    url: "https://www.moreradio.online/eastbourne",
    successRate: 2.17,
    description: "Radio station news - very low success rate",
    type: "hyper-local",
    attemptsTotal: 46
  },
  {
    id: "meads-news",
    name: "Meads Community News",
    url: "https://meads-news.org.uk",
    successRate: 0,
    description: "Local community news - never scraped successfully",
    type: "hyper-local",
    attemptsTotal: 12
  },
  {
    id: "eastbourne-chamber",
    name: "Eastbourne Chamber of Commerce",
    url: "https://www.eastbournechamber.co.uk/news",
    successRate: 2.94,
    description: "Business news - difficult to scrape",
    type: "hyper-local",
    attemptsTotal: 34
  },
  {
    id: "bbc-sussex",
    name: "BBC Sussex",
    url: "https://www.bbc.co.uk/news/england/sussex",
    successRate: 0,
    description: "Never successfully scraped",
    type: "regional",
    attemptsTotal: 8
  },
  {
    id: "guardian-uk",
    name: "The Guardian UK News",
    url: "https://www.theguardian.com/uk-news",
    successRate: 85,
    description: "National source for comparison",
    type: "national",
    attemptsTotal: 127
  }
];

export const ScreenshotScraperTester = () => {
  const [selectedSourceId, setSelectedSourceId] = useState(CHALLENGING_SOURCES[0].id);
  const [customUrl, setCustomUrl] = useState('');
  const [useCustomUrl, setUseCustomUrl] = useState(false);
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState<any>(null);
  const { toast } = useToast();

  const selectedSource = CHALLENGING_SOURCES.find(s => s.id === selectedSourceId) || CHALLENGING_SOURCES[0];
  const testUrl = useCustomUrl ? customUrl : selectedSource.url;

  const testScreenshotScraper = async () => {
    const urlToTest = useCustomUrl ? customUrl : selectedSource.url;
    
    if (!urlToTest.trim()) {
      toast({
        title: "Error",
        description: "Please enter a URL to test or select a source",
        variant: "destructive",
      });
      return;
    }

    setTesting(true);
    setResult(null);

    try {
      console.log('🧪 Testing screenshot scraper with URL:', urlToTest);
      console.log('📊 Selected source context:', {
        name: selectedSource.name,
        successRate: selectedSource.successRate,
        type: selectedSource.type
      });

      const { data, error } = await supabase.functions.invoke('screenshot-ai-scraper', {
        body: {
          feedUrl: urlToTest,
          sourceId: useCustomUrl ? 'custom-test-source' : selectedSource.id,
          region: 'test'
        }
      });

      if (error) {
        throw error;
      }

      console.log('📊 Screenshot scraper result:', data);
      setResult(data);

      if (data.success) {
        let message = `Extracted ${data.articlesFound} articles using OpenAI Vision`;
        if (data.duplicatesFound > 0) {
          message += ` (${data.articlesInserted} new, ${data.duplicatesFound} duplicates prevented)`;
        }
        
        toast({
          title: "Screenshot Scraping Successful",
          description: message,
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

  const getSuccessRateColor = (rate: number) => {
    if (rate === 0) return "destructive";
    if (rate < 10) return "destructive";
    if (rate < 50) return "secondary";
    return "default";
  };

  const getSuccessRateIcon = (rate: number) => {
    if (rate === 0) return <AlertTriangle className="w-3 h-3" />;
    if (rate < 10) return <TrendingDown className="w-3 h-3" />;
    if (rate < 50) return <Target className="w-3 h-3" />;
    return <CheckCircle className="w-3 h-3" />;
  };

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Camera className="w-5 h-5" />
          Screenshot AI Scraper Tester
          <Badge variant="secondary">OpenAI Vision</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-4">
          {/* Source Selection */}
          <div className="space-y-2">
            <Label>Test Source</Label>
            <div className="flex items-center space-x-2">
              <Switch
                id="use-custom"
                checked={useCustomUrl}
                onCheckedChange={setUseCustomUrl}
              />
              <Label htmlFor="use-custom" className="text-sm">
                Use custom URL
              </Label>
            </div>
          </div>

          {useCustomUrl ? (
            <div className="space-y-2">
              <Label htmlFor="customUrl">Custom URL</Label>
              <Input
                id="customUrl"
                value={customUrl}
                onChange={(e) => setCustomUrl(e.target.value)}
                placeholder="Enter custom website URL to test..."
                disabled={testing}
              />
            </div>
          ) : (
            <div className="space-y-2">
              <Label htmlFor="sourceSelect">Select Challenging Source</Label>
              <Select value={selectedSourceId} onValueChange={setSelectedSourceId}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CHALLENGING_SOURCES.map((source) => (
                    <SelectItem key={source.id} value={source.id}>
                      <div className="flex items-center justify-between w-full">
                        <span>{source.name}</span>
                        <Badge 
                          variant={getSuccessRateColor(source.successRate)} 
                          className="ml-2 flex items-center gap-1"
                        >
                          {getSuccessRateIcon(source.successRate)}
                          {source.successRate}%
                        </Badge>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              
              {/* Source Context Display */}
              <div className="p-3 bg-muted rounded-lg space-y-2">
                <div className="flex items-center justify-between">
                  <h4 className="font-medium text-sm">{selectedSource.name}</h4>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-xs">
                      {selectedSource.type}
                    </Badge>
                    <Badge variant={getSuccessRateColor(selectedSource.successRate)} className="flex items-center gap-1">
                      {getSuccessRateIcon(selectedSource.successRate)}
                      {selectedSource.successRate}% success
                    </Badge>
                  </div>
                </div>
                <p className="text-sm text-muted-foreground">{selectedSource.description}</p>
                <div className="text-xs text-muted-foreground">
                  URL: {selectedSource.url} • {selectedSource.attemptsTotal} previous attempts
                </div>
              </div>
            </div>
          )}
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
              <div className="flex items-center gap-2">
                <Badge variant={result.success ? "default" : "destructive"}>
                  {result.success ? "Success" : "Failed"}
                </Badge>
                {!useCustomUrl && (
                  <Badge variant="outline" className="text-xs">
                    {selectedSource.successRate}% traditional success rate
                  </Badge>
                )}
              </div>
            </div>

            {result.success ? (
              <div className="space-y-2">
                <Alert>
                  <CheckCircle className="w-4 h-4" />
                  <AlertDescription>
                    {result.message || (
                      <>
                        Successfully extracted <strong>{result.articlesFound}</strong> articles
                        {result.articlesInserted !== undefined && (
                          <> • <strong>{result.articlesInserted}</strong> new articles added</>
                        )}
                        {result.duplicatesFound > 0 && (
                          <> • <strong>{result.duplicatesFound}</strong> duplicates prevented</>
                        )}
                        {!useCustomUrl && selectedSource.successRate < 10 && (
                          <> • 🎉 <strong>Breakthrough!</strong> This source usually fails traditional scraping</>
                        )}
                      </>
                    )}
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
                <AlertTriangle className="w-4 h-4" />
                <AlertDescription>
                  {result.error || result.errors?.[0] || "Screenshot scraping failed"}
                  {!useCustomUrl && selectedSource.successRate < 10 && (
                    <div className="mt-2 text-xs">
                      Note: This source has a {selectedSource.successRate}% traditional success rate, so failures are expected.
                    </div>
                  )}
                </AlertDescription>
              </Alert>
            )}
          </div>
        )}

        <Alert>
          <Camera className="w-4 h-4" />
          <AlertDescription className="text-sm">
            <strong>How it works:</strong> Takes a screenshot of the website, then uses OpenAI Vision AI 
            to extract article content. Perfect for testing sources that traditionally fail with RSS/HTML scraping.
            {!useCustomUrl && selectedSource.successRate < 10 && (
              <div className="mt-2 font-medium text-orange-600">
                ⚡ Challenge Mode: Testing a source with {selectedSource.successRate}% traditional success rate!
              </div>
            )}
          </AlertDescription>
        </Alert>
      </CardContent>
    </Card>
  );
};