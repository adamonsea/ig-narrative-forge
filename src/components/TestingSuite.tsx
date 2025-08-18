import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { CheckCircle, XCircle, Clock, Play, Loader2 } from 'lucide-react';

interface TestResult {
  name: string;
  status: 'pending' | 'running' | 'passed' | 'failed';
  message?: string;
  duration?: number;
  details?: any;
}

export const TestingSuite = () => {
  const [tests, setTests] = useState<TestResult[]>([
    { name: 'Database Connection', status: 'pending' },
    { name: 'Sample Data Validation', status: 'pending' },
    { name: 'Search Functionality', status: 'pending' },
    { name: 'RSS Scraper Function', status: 'pending' },
    { name: 'Content Sources Access', status: 'pending' },
    { name: 'Article Metadata Calculation', status: 'pending' },
    { name: 'Deduplication Detection', status: 'pending' }
  ]);
  const [isRunning, setIsRunning] = useState(false);
  const { toast } = useToast();

  const updateTestStatus = (index: number, status: TestResult['status'], message?: string, details?: any, duration?: number) => {
    setTests(prev => prev.map((test, i) => 
      i === index ? { ...test, status, message, details, duration } : test
    ));
  };

  const runTest = async (testName: string, testFunction: () => Promise<any>) => {
    const index = tests.findIndex(t => t.name === testName);
    const startTime = Date.now();
    
    updateTestStatus(index, 'running');
    
    try {
      const result = await testFunction();
      const duration = Date.now() - startTime;
      updateTestStatus(index, 'passed', 'Test completed successfully', result, duration);
      return true;
    } catch (error: any) {
      const duration = Date.now() - startTime;
      updateTestStatus(index, 'failed', error.message || 'Test failed', error, duration);
      return false;
    }
  };

  const testDatabaseConnection = async () => {
    const { data, error } = await supabase
      .from('articles')
      .select('count', { count: 'exact', head: true });
    
    if (error) throw new Error(`Database connection failed: ${error.message}`);
    return { articlesCount: data || 0 };
  };

  const testSampleData = async () => {
    const { data: articles, error: articlesError } = await supabase
      .from('articles')
      .select('*')
      .limit(5);
    
    if (articlesError) throw new Error(`Failed to fetch articles: ${articlesError.message}`);
    
    const { data: sources, error: sourcesError } = await supabase
      .from('content_sources')
      .select('*')
      .limit(5);
    
    if (sourcesError) throw new Error(`Failed to fetch sources: ${sourcesError.message}`);
    
    if (!articles || articles.length === 0) {
      throw new Error('No sample articles found in database');
    }
    
    if (!sources || sources.length === 0) {
      throw new Error('No sample content sources found in database');
    }
    
    return { 
      articlesFound: articles.length,
      sourcesFound: sources.length,
      sampleArticle: articles[0]?.title,
      sampleSource: sources[0]?.source_name
    };
  };

  const testSearchFunctionality = async () => {
    const { data, error } = await supabase.rpc('test_search_functionality', {
      p_search_term: 'sample'
    });
    
    if (error) throw new Error(`Search test failed: ${error.message}`);
    
    if (!data || data.length === 0) {
      throw new Error('Search returned no results for test term "sample"');
    }
    
    return {
      resultsFound: data.length,
      topResult: data[0]?.title,
      relevanceScore: data[0]?.relevance_score
    };
  };

  const testRSSScraperFunction = async () => {
    const { data, error } = await supabase.functions.invoke('health-check');
    
    if (error) throw new Error(`Health check failed: ${error.message}`);
    
    // Test the RSS scraper function exists
    try {
      const { data: rssData, error: rssError } = await supabase.rpc('test_rss_import', {
        p_source_name: 'Test RSS Validation'
      });
      
      if (rssError) throw new Error(`RSS test function failed: ${rssError.message}`);
      
      return {
        healthCheckStatus: data,
        rssTestResult: rssData
      };
    } catch (err: any) {
      throw new Error(`RSS scraper validation failed: ${err.message}`);
    }
  };

  const testContentSourcesAccess = async () => {
    const { data, error } = await supabase
      .from('content_sources')
      .select('*')
      .eq('is_active', true)
      .limit(1);
    
    if (error) throw new Error(`Content sources access failed: ${error.message}`);
    
    if (!data || data.length === 0) {
      throw new Error('No active content sources found');
    }
    
    return {
      activeSourcesFound: data.length,
      testSource: data[0]
    };
  };

  const testArticleMetadata = async () => {
    const { data, error } = await supabase
      .from('articles')
      .select('word_count, reading_time_minutes, title')
      .not('word_count', 'is', null)
      .limit(3);
    
    if (error) throw new Error(`Article metadata test failed: ${error.message}`);
    
    if (!data || data.length === 0) {
      throw new Error('No articles with calculated metadata found');
    }
    
    // Check if word count and reading time are reasonable
    const articlesWithValidMetadata = data.filter(article => 
      article.word_count > 0 && article.reading_time_minutes > 0
    );
    
    if (articlesWithValidMetadata.length === 0) {
      throw new Error('Articles found but metadata calculation seems incorrect');
    }
    
    return {
      articlesChecked: data.length,
      validMetadataCount: articlesWithValidMetadata.length,
      sampleMetadata: articlesWithValidMetadata[0]
    };
  };

  const testDeduplicationDetection = async () => {
    // Get a sample article to test deduplication against
    const { data: articles, error: articlesError } = await supabase
      .from('articles')
      .select('id')
      .limit(1);
    
    if (articlesError || !articles || articles.length === 0) {
      throw new Error('No articles found for deduplication test');
    }
    
    const { data, error } = await supabase.rpc('find_duplicate_articles', {
      p_article_id: articles[0].id,
      p_similarity_threshold: 0.1  // Low threshold to find any potential matches
    });
    
    if (error) throw new Error(`Deduplication test failed: ${error.message}`);
    
    return {
      testArticleId: articles[0].id,
      duplicatesFound: data?.length || 0,
      duplicatesData: data || []
    };
  };

  const runAllTests = async () => {
    setIsRunning(true);
    
    // Reset all tests to pending
    setTests(prev => prev.map(test => ({ ...test, status: 'pending' as const })));
    
    try {
      await runTest('Database Connection', testDatabaseConnection);
      await runTest('Sample Data Validation', testSampleData);
      await runTest('Search Functionality', testSearchFunctionality);
      await runTest('RSS Scraper Function', testRSSScraperFunction);
      await runTest('Content Sources Access', testContentSourcesAccess);
      await runTest('Article Metadata Calculation', testArticleMetadata);
      await runTest('Deduplication Detection', testDeduplicationDetection);
      
      const passedTests = tests.filter(t => t.status === 'passed').length;
      const totalTests = tests.length;
      
      toast({
        title: "Testing Complete",
        description: `${passedTests}/${totalTests} tests passed`,
        variant: passedTests === totalTests ? "default" : "destructive",
      });
    } catch (error) {
      toast({
        title: "Testing Failed",
        description: "An error occurred during testing",
        variant: "destructive",
      });
    } finally {
      setIsRunning(false);
    }
  };

  const getStatusIcon = (status: TestResult['status']) => {
    switch (status) {
      case 'passed':
        return <CheckCircle className="w-4 h-4 text-green-500" />;
      case 'failed':
        return <XCircle className="w-4 h-4 text-red-500" />;
      case 'running':
        return <Loader2 className="w-4 h-4 text-blue-500 animate-spin" />;
      default:
        return <Clock className="w-4 h-4 text-gray-400" />;
    }
  };

  const getStatusBadge = (status: TestResult['status']) => {
    switch (status) {
      case 'passed':
        return <Badge variant="outline" className="text-green-700 border-green-300">Passed</Badge>;
      case 'failed':
        return <Badge variant="destructive">Failed</Badge>;
      case 'running':
        return <Badge variant="outline" className="text-blue-700 border-blue-300">Running</Badge>;
      default:
        return <Badge variant="outline" className="text-gray-500">Pending</Badge>;
    }
  };

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          Phase 1 Testing & Validation Suite
          <Button 
            onClick={runAllTests} 
            disabled={isRunning}
            className="flex items-center gap-2"
          >
            {isRunning ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Running Tests...
              </>
            ) : (
              <>
                <Play className="w-4 h-4" />
                Run All Tests
              </>
            )}
          </Button>
        </CardTitle>
        <CardDescription>
          Comprehensive validation of content management system functionality
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {tests.map((test, index) => (
          <div key={test.name} className="space-y-2">
            <div className="flex items-center justify-between p-3 rounded-lg border">
              <div className="flex items-center gap-3">
                {getStatusIcon(test.status)}
                <span className="font-medium">{test.name}</span>
              </div>
              <div className="flex items-center gap-2">
                {test.duration && (
                  <span className="text-sm text-muted-foreground">
                    {test.duration}ms
                  </span>
                )}
                {getStatusBadge(test.status)}
              </div>
            </div>
            
            {test.message && (
              <div className={`p-2 rounded text-sm ${
                test.status === 'failed' 
                  ? 'bg-red-50 text-red-700 border border-red-200' 
                  : 'bg-green-50 text-green-700 border border-green-200'
              }`}>
                {test.message}
              </div>
            )}
            
            {test.details && test.status === 'passed' && (
              <details className="text-sm">
                <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
                  View test details
                </summary>
                <pre className="mt-2 p-2 bg-muted rounded text-xs overflow-auto">
                  {JSON.stringify(test.details, null, 2)}
                </pre>
              </details>
            )}
            
            {index < tests.length - 1 && <Separator />}
          </div>
        ))}
        
        <div className="mt-6 p-4 bg-muted/50 rounded-lg">
          <h4 className="font-medium mb-2">Test Coverage</h4>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div>
              <span className="text-muted-foreground">Total: </span>
              <span className="font-medium">{tests.length}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Passed: </span>
              <span className="font-medium text-green-600">
                {tests.filter(t => t.status === 'passed').length}
              </span>
            </div>
            <div>
              <span className="text-muted-foreground">Failed: </span>
              <span className="font-medium text-red-600">
                {tests.filter(t => t.status === 'failed').length}
              </span>
            </div>
            <div>
              <span className="text-muted-foreground">Pending: </span>
              <span className="font-medium text-gray-600">
                {tests.filter(t => t.status === 'pending').length}
              </span>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};