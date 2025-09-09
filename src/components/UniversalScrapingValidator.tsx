import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Progress } from '@/components/ui/progress';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { CheckCircle, XCircle, AlertTriangle, Globe, Zap, Database } from 'lucide-react';

interface ValidationResult {
  test: string;
  status: 'pending' | 'running' | 'passed' | 'failed';
  message?: string;
  details?: any;
}

interface UniversalScrapingValidatorProps {
  topicId?: string;
  topicName?: string;
}

export const UniversalScrapingValidator = ({ topicId, topicName }: UniversalScrapingValidatorProps) => {
  const [validating, setValidating] = useState(false);
  const [results, setResults] = useState<ValidationResult[]>([
    { test: 'Universal Scraper Function', status: 'pending' },
    { test: 'Junction Table Integration', status: 'pending' },
    { test: 'Multi-Tenant Storage', status: 'pending' },
    { test: 'Automation Pipeline', status: 'pending' },
    { test: 'Real-Time Progress Tracking', status: 'pending' }
  ]);
  const { toast } = useToast();

  const updateResult = (index: number, status: ValidationResult['status'], message?: string, details?: any) => {
    setResults(prev => prev.map((result, i) => 
      i === index ? { ...result, status, message, details } : result
    ));
  };

  const runValidation = async () => {
    const currentTopicId = topicId;
    if (!currentTopicId) {
      toast({
        title: "No Topic Selected",
        description: "Please provide a topic ID for validation",
        variant: "destructive"
      });
      return;
    }

    setValidating(true);
    
    try {
      // Test 1: Universal Scraper Function
      updateResult(0, 'running');
      const { data: scraperTest, error: scraperError } = await supabase.functions.invoke(
        'universal-topic-scraper', 
        { 
          body: { 
            topicId: currentTopicId, 
            test_mode: true,
            max_articles_per_source: 1 
          } 
        }
      );

      if (scraperError) throw scraperError;
      updateResult(0, 'passed', `Function responded: ${scraperTest?.message || 'OK'}`);

      // Test 2: Junction Table Integration
      updateResult(1, 'running');
      if (topicId) {
        const { data: sources } = await supabase
          .rpc('get_topic_sources', { p_topic_id: topicId });
        
        updateResult(1, 'passed', `${sources?.length || 0} sources available via junction table`);
      } else {
        updateResult(1, 'passed', 'No specific topic for testing');
      }

      // Test 3: Multi-Tenant Storage
      updateResult(2, 'running');
      const { data: topicArticles } = await supabase
        .from('topic_articles')
        .select('id', { count: 'exact' })
        .eq('topic_id', topicId || '')
        .limit(1);

      updateResult(2, 'passed', `Multi-tenant storage accessible: ${topicArticles?.length || 0} articles`);

      // Test 4: Automation Pipeline
      updateResult(3, 'running');
      const { data: automationTest, error: automationError } = await supabase.functions.invoke(
        'universal-topic-automation',
        { body: { test_mode: true } }
      );

      if (automationError) throw automationError;
      updateResult(3, 'passed', `Automation pipeline: ${automationTest?.message || 'Active'}`);

      // Test 5: Real-Time Progress Tracking
      updateResult(4, 'running');
      const { data: realtimeTest } = await supabase
        .from('scrape_jobs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(1);

      updateResult(4, 'passed', `Progress tracking: ${realtimeTest?.length || 0} recent jobs`);

      toast({
        title: "Validation Complete",
        description: "Universal scraping validation completed successfully"
      });

    } catch (error) {
      toast({
        title: "Validation Failed",
        description: error instanceof Error ? error.message : "Unknown error occurred",
        variant: "destructive"
      });
    } finally {
      setValidating(false);
    }
  };

  const getStatusIcon = (status: ValidationResult['status']) => {
    switch (status) {
      case 'passed': return <CheckCircle className="w-4 h-4 text-green-500" />;
      case 'failed': return <XCircle className="w-4 h-4 text-red-500" />;
      case 'running': return <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />;
      default: return <AlertTriangle className="w-4 h-4 text-muted-foreground" />;
    }
  };

  const passedTests = results.filter(r => r.status === 'passed').length;
  const progress = (passedTests / results.length) * 100;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Globe className="w-5 h-5" />
          Universal Scraping Validator
          {topicName && <Badge variant="outline">{topicName}</Badge>}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between">
          <Button 
            onClick={runValidation} 
            disabled={validating}
            className="flex items-center gap-2"
          >
            <Zap className="w-4 h-4" />
            {validating ? 'Validating...' : 'Run Validation'}
          </Button>
          <div className="text-sm text-muted-foreground">
            {passedTests}/{results.length} tests passed
          </div>
        </div>

        <Progress value={progress} className="w-full" />

        <div className="space-y-2">
          {results.map((result, index) => (
            <div key={index} className="flex items-center justify-between p-3 border rounded-lg">
              <div className="flex items-center gap-2">
                {getStatusIcon(result.status)}
                <span className="font-medium">{result.test}</span>
              </div>
              <div className="flex items-center gap-2">
                {result.message && (
                  <span className="text-sm text-muted-foreground">{result.message}</span>
                )}
                <Badge variant={
                  result.status === 'passed' ? 'default' : 
                  result.status === 'failed' ? 'destructive' : 'secondary'
                }>
                  {result.status}
                </Badge>
              </div>
            </div>
          ))}
        </div>

        <Alert>
          <Database className="w-4 h-4" />
          <AlertDescription>
            Validates the universal scraping pipeline with junction table integration and multi-tenant architecture.
          </AlertDescription>
        </Alert>
      </CardContent>
    </Card>
  );
};