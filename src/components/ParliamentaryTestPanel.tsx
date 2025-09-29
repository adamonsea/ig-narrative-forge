import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Building2, Loader2, CheckCircle, XCircle, AlertCircle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface ParliamentaryTestPanelProps {
  topicId: string;
  region: string;
  parliamentaryTrackingEnabled: boolean;
}

export const ParliamentaryTestPanel = ({ 
  topicId, 
  region, 
  parliamentaryTrackingEnabled 
}: ParliamentaryTestPanelProps) => {
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{
    success: boolean;
    message: string;
    data?: any;
  } | null>(null);
  const { toast } = useToast();

  const runParliamentaryTest = async () => {
    setTesting(true);
    setTestResult(null);

    try {
      console.log('Testing parliamentary data collection...');
      
      const { data, error } = await supabase.functions.invoke('uk-parliament-collector', {
        body: {
          topicId,
          region,
          forceRefresh: true // Force refresh for testing
        }
      });

      if (error) throw error;

      setTestResult({
        success: true,
        message: 'Parliamentary data collection successful',
        data
      });

      toast({
        title: "Test Successful",
        description: "Parliamentary data collection is working correctly."
      });

    } catch (error) {
      console.error('Parliamentary test failed:', error);
      
      setTestResult({
        success: false,
        message: error instanceof Error ? error.message : 'Unknown error occurred'
      });

      toast({
        title: "Test Failed",
        description: "Parliamentary data collection encountered an error.",
        variant: "destructive"
      });
    } finally {
      setTesting(false);
    }
  };

  if (!parliamentaryTrackingEnabled) {
    return (
      <Card className="border-amber-200 bg-amber-50">
        <CardContent className="p-4">
          <div className="flex items-center gap-2 text-amber-700">
            <AlertCircle className="w-4 h-4" />
            <span className="text-sm font-medium">
              Parliamentary tracking is disabled for this topic
            </span>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Building2 className="w-4 h-4" />
          Parliamentary Integration Test
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium">Test data collection for {region}</p>
            <p className="text-xs text-muted-foreground">
              This will fetch MP voting records and parliamentary debates
            </p>
          </div>
          <Button 
            onClick={runParliamentaryTest}
            disabled={testing}
            size="sm"
          >
            {testing ? (
              <>
                <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                Testing...
              </>
            ) : (
              'Run Test'
            )}
          </Button>
        </div>

        {testResult && (
          <div className={`p-3 rounded-md border ${
            testResult.success 
              ? 'border-green-200 bg-green-50' 
              : 'border-red-200 bg-red-50'
          }`}>
            <div className="flex items-center gap-2">
              {testResult.success ? (
                <CheckCircle className="w-4 h-4 text-green-600" />
              ) : (
                <XCircle className="w-4 h-4 text-red-600" />
              )}
              <span className={`text-sm font-medium ${
                testResult.success ? 'text-green-700' : 'text-red-700'
              }`}>
                {testResult.message}
              </span>
            </div>
            
            {testResult.data && (
              <div className="mt-2 text-xs text-muted-foreground">
                <p>Data collected: {testResult.data.mentionsCreated || 0} mentions</p>
                <p>Processing time: {testResult.data.processingTimeMs || 0}ms</p>
              </div>
            )}
          </div>
        )}

        <div className="text-xs text-muted-foreground">
          <p><strong>Note:</strong> This test uses simulated data for the beta.</p>
          <p>Real parliamentary data will be integrated in the production version.</p>
        </div>
      </CardContent>
    </Card>
  );
};