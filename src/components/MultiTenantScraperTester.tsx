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

  // Hastings topic for Phase 2 testing
  const testTopic = {
    id: 'e6de0eaa-6884-41c5-9478-e369265e8a8f',
    name: 'Hastings and St Leonards',
    region: 'Hastings and St Leonards',
    type: 'regional'
  };

  const hastingsSources = [
    {
      id: '1dc924bc-2068-4d45-b7a0-6c29cf67ecfe',
      name: 'BBC Sussex',
      url: 'https://www.bbc.co.uk/news/england/sussex'
    },
    {
      id: '33bda2c5-27fe-4fd2-ad0e-05df0d358299', 
      name: 'Sussex Express',
      url: 'https://www.sussexexpress.co.uk/'
    },
    {
      id: 'b86ea1b2-23cb-42c5-ae8b-9988563c17a7',
      name: 'The Argus', 
      url: 'https://www.theargus.co.uk/'
    },
    {
      id: 'e4c6f7f8-0e74-47f7-b356-0a8a66b83504',
      name: 'Visit 1066 Country',
      url: 'https://www.visit1066country.com/news'
    }
  ];

  const [sourceResults, setSourceResults] = useState<Record<string, any>>({});
  const [testingSource, setTestingSource] = useState<string | null>(null);

  const testSource = async (source: any) => {
    setTestingSource(source.id);
    setError(null);

    try {
      console.log(`🧪 Testing source: ${source.name} - ${source.url}`);
      
      // Phase 1 Standardization: Use universal-topic-scraper for all regional topics
      const { data, error: functionError } = await supabase.functions.invoke('universal-topic-scraper', {
        body: {
          topicId: testTopic.id,
          sourceIds: [source.id],
          testMode: true
        }
      });

      if (functionError) {
        throw new Error(`Function error: ${functionError.message}`);
      }

      console.log(`✅ Source test completed for ${source.name}:`, data);
      
      // Extract result for this specific source
      const sourceResult = data.results?.find((r: any) => r.sourceId === source.id) || data;
      
      setSourceResults(prev => ({
        ...prev,
        [source.id]: { ...sourceResult, source: source.name }
      }));
      
      const hasNewContent = sourceResult?.success && sourceResult.articlesScraped > 0;
      
      toast({
        title: hasNewContent ? "Source Working!" : sourceResult?.success ? "No New Content" : "Source Failed",
        description: sourceResult?.success 
          ? `${source.name}: Found ${sourceResult.articlesFound || 0}, stored ${sourceResult.articlesScraped || 0}`
          : `${source.name}: ${sourceResult?.error || 'No articles stored'}`,
        variant: hasNewContent ? "success" : sourceResult?.success ? "muted" : "destructive"
      });

    } catch (err: any) {
      console.error(`❌ Test failed for ${source.name}:`, err);
      setSourceResults(prev => ({
        ...prev,
        [source.id]: { success: false, error: err.message, source: source.name }
      }));
      toast({
        title: "Source Test Failed",
        description: `${source.name}: ${err.message}`,
        variant: "destructive",
      });
    } finally {
      setTestingSource(null);
    }
  };

  const testAllSources = async () => {
    setTesting(true);
    setSourceResults({});
    setError(null);
    
    toast({
      title: "Phase 4 Testing Started",
      description: "Testing sources with standardized response format and neutral messaging..."
    });

    for (const source of hastingsSources) {
      await testSource(source);
      // Small delay between tests
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    setTesting(false);
    
    const sourcesWithContent = Object.values(sourceResults).filter((result: any) => 
      result.success && result.articlesScraped > 0
    ).length;
    
    toast({
      title: sourcesWithContent > 0 ? "Testing Complete - Content Found" : "Testing Complete - No New Content",
      description: `${sourcesWithContent}/${hastingsSources.length} Hastings sources working successfully`,
      variant: sourcesWithContent > 0 ? "success" : sourcesWithContent === 0 ? "muted" : "destructive"
    });
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            🧪 Phase 2: Hastings Multi-Tenant Testing
          </CardTitle>
          <CardDescription>
            Test each Hastings source to verify multi-tenant architecture and regional isolation.
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
              <span className="font-medium">Sources to Test:</span>
              <Badge variant="secondary">{hastingsSources.length} sources</Badge>
            </div>
          </div>

          <Alert>
            <AlertDescription>
              This will test each Hastings source to verify:
              <ul className="mt-2 ml-4 list-disc space-y-1">
                <li>Dual storage: legacy <code>articles</code> + multi-tenant <code>topic_articles</code></li>
                <li>Regional isolation: articles only appear in Hastings topic</li>
                <li>Content extraction and quality scoring</li>
                <li>Which sources are actually working for continued Phase 2 testing</li>
              </ul>
            </AlertDescription>
          </Alert>

          <div className="grid gap-3">
            {hastingsSources.map(source => (
              <div key={source.id} className="flex items-center justify-between p-3 border rounded-lg">
                <div className="flex items-center gap-3">
                  {testingSource === source.id ? (
                    <Loader2 className="h-4 w-4 animate-spin text-blue-500" />
                  ) : sourceResults[source.id]?.success ? (
                    <CheckCircle className="h-4 w-4 text-green-500" />
                  ) : sourceResults[source.id] ? (
                    <XCircle className="h-4 w-4 text-red-500" />
                  ) : (
                    <div className="h-4 w-4 rounded-full border-2 border-gray-300" />
                  )}
                  <div>
                    <h4 className="font-medium">{source.name}</h4>
                    <p className="text-sm text-muted-foreground">{source.url}</p>
                  </div>
                </div>
                
                <div className="flex items-center gap-3">
                  {sourceResults[source.id] && (
                    <div className="text-sm text-right">
                      {sourceResults[source.id].success ? (
                        <>
                          <div>Found: {sourceResults[source.id].articlesFound || 0}</div>
                          <div className="text-xs text-muted-foreground">
                            Legacy: {sourceResults[source.id].articlesStored || 0} | 
                            Multi: {sourceResults[source.id].multiTenantArticlesStored || 0}
                          </div>
                        </>
                      ) : (
                        <div className="text-red-500">{sourceResults[source.id].error || 'Failed'}</div>
                      )}
                    </div>
                  )}
                  
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={() => testSource(source)}
                    disabled={testing || testingSource === source.id}
                  >
                    {testingSource === source.id ? 'Testing...' : 'Test'}
                  </Button>
                </div>
              </div>
            ))}
          </div>

          <Button 
            onClick={testAllSources} 
            disabled={testing}
            className="w-full"
            size="lg"
          >
            {testing ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Testing All Sources...
              </>
            ) : (
              <>
                <Play className="w-4 h-4 mr-2" />
                Test All Hastings Sources
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      {Object.keys(sourceResults).length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CheckCircle className="w-5 h-5 text-green-600" />
              Phase 2 Test Results
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="border rounded-lg p-3">
                <div className="text-sm text-muted-foreground">Sources Tested</div>
                <div className="text-2xl font-bold">{Object.keys(sourceResults).length}</div>
              </div>
              <div className="border rounded-lg p-3">
                <div className="text-sm text-muted-foreground">Working Sources</div>
                <div className="text-2xl font-bold text-green-600">
                  {Object.values(sourceResults).filter((r: any) => 
                    r.success && (r.articlesStored > 0 || r.multiTenantArticlesStored > 0)
                  ).length}
                </div>
              </div>
              <div className="border rounded-lg p-3">
                <div className="text-sm text-muted-foreground">Total Articles Found</div>
                <div className="text-2xl font-bold">
                  {Object.values(sourceResults).reduce((sum: number, r: any) => 
                    sum + (r.articlesFound || 0), 0
                  )}
                </div>
              </div>
              <div className="border rounded-lg p-3">
                <div className="text-sm text-muted-foreground">Multi-Tenant Articles</div>
                <div className="text-2xl font-bold text-blue-600">
                  {Object.values(sourceResults).reduce((sum: number, r: any) => 
                    sum + (r.multiTenantArticlesStored || 0), 0
                  )}
                </div>
              </div>
            </div>

            {Object.values(sourceResults).some((r: any) => r.success && (r.articlesStored > 0 || r.multiTenantArticlesStored > 0)) && (
              <Alert>
                <CheckCircle className="h-4 w-4" />
                <AlertDescription>
                  ✅ Found working sources! Multi-tenant architecture is functioning for Hastings. Ready to continue Phase 2 testing with regional isolation verification.
                </AlertDescription>
              </Alert>
            )}
            
            {Object.values(sourceResults).every((r: any) => !r.success || (r.articlesStored === 0 && r.multiTenantArticlesStored === 0)) && Object.keys(sourceResults).length === hastingsSources.length && (
              <Alert variant="destructive">
                <XCircle className="h-4 w-4" />
                <AlertDescription>
                  ⚠️ No working sources found for Hastings. All sources are failing at network/content extraction level. Consider adding different Hastings sources or investigating source accessibility.
                </AlertDescription>
              </Alert>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default MultiTenantScraperTester;