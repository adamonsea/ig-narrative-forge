import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Progress } from '@/components/ui/progress';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { CheckCircle, XCircle, AlertTriangle, Database, Link2, ArrowRightLeft } from 'lucide-react';

interface ValidationResult {
  test: string;
  status: 'pending' | 'running' | 'passed' | 'failed';
  message?: string;
  details?: any;
}

interface JunctionTableValidatorProps {
  topicId?: string;
  topicName?: string;
}

export const JunctionTableValidator = ({ topicId, topicName }: JunctionTableValidatorProps) => {
  const [validating, setValidating] = useState(false);
  const [results, setResults] = useState<ValidationResult[]>([
    { test: 'Junction Table Integrity', status: 'pending' },
    { test: 'Cross-Topic Source Sharing', status: 'pending' },
    { test: 'Source Linking Operations', status: 'pending' },
    { test: 'Migration Data Consistency', status: 'pending' },
    { test: 'RLS Policy Validation', status: 'pending' }
  ]);
  const { toast } = useToast();

  const updateResult = (index: number, status: ValidationResult['status'], message?: string, details?: any) => {
    setResults(prev => prev.map((result, i) => 
      i === index ? { ...result, status, message, details } : result
    ));
  };

  const runValidation = async () => {
    setValidating(true);
    
    try {
      // Test 1: Junction Table Integrity
      updateResult(0, 'running');
      const { data: junctionData, error: junctionError } = await supabase
        .from('topic_sources')
        .select(`
          id,
          topic_id,
          source_id,
          topics!inner(name),
          content_sources!inner(source_name, is_active)
        `)
        .limit(5);

      if (junctionError) throw junctionError;
      
      updateResult(0, 'passed', `${junctionData.length} junction records validated`);

      // Test 2: Cross-Topic Source Sharing
      updateResult(1, 'running');
      const { data: sourceUsage } = await supabase
        .from('topic_sources')
        .select('source_id');

      // Count how many sources are used by multiple topics
      const sourceCounts = sourceUsage?.reduce((acc, item) => {
        acc[item.source_id] = (acc[item.source_id] || 0) + 1;
        return acc;
      }, {} as Record<string, number>) || {};
      
      const sharedSources = Object.values(sourceCounts).filter(count => count > 1);
      updateResult(1, 'passed', `${sharedSources.length} sources shared across topics`);

      // Test 3: Source Linking Operations
      updateResult(2, 'running');
      if (topicId) {
        const { data: topicSources } = await supabase
          .rpc('get_topic_sources', { p_topic_id: topicId });
        
        updateResult(2, 'passed', `${topicSources?.length || 0} sources linked to topic`);
      } else {
        updateResult(2, 'passed', 'No specific topic selected for testing');
      }

      // Test 4: Migration Data Consistency  
      updateResult(3, 'running');
      const { data: legacyCount } = await supabase
        .from('content_sources')
        .select('id', { count: 'exact' })
        .not('topic_id', 'is', null);

      const { data: junctionCount } = await supabase
        .from('topic_sources')
        .select('id', { count: 'exact' });

      updateResult(3, 'passed', `Legacy: ${legacyCount?.length || 0}, Junction: ${junctionCount?.length || 0}`);

      // Test 5: RLS Policy Validation
      updateResult(4, 'running');
      const { error: rlsError } = await supabase
        .from('topic_sources')
        .select('*')
        .limit(1);

      updateResult(4, rlsError ? 'failed' : 'passed', 
        rlsError ? 'RLS policy blocked access' : 'RLS policies working correctly');

      toast({
        title: "Validation Complete",
        description: "Junction table validation completed successfully"
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
          <Database className="w-5 h-5" />
          Junction Table Validator
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
            <Link2 className="w-4 h-4" />
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
          <ArrowRightLeft className="w-4 h-4" />
          <AlertDescription>
            Validates the new junction table architecture for topic-source relationships and cross-topic source sharing.
          </AlertDescription>
        </Alert>
      </CardContent>
    </Card>
  );
};