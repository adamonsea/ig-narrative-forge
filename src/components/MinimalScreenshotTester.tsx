import React, { useState } from 'react';
import { Card, CardHeader, CardContent, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { Loader2, TestTube, CheckCircle, XCircle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

export const MinimalScreenshotTester = () => {
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState<any>(null);
  const { toast } = useToast();

  const runMinimalTest = async () => {
    setTesting(true);
    setResult(null);

    try {
      console.log('🧪 Running minimal screenshot test...');

      const { data, error } = await supabase.functions.invoke('test-screenshot-minimal', {
        body: {
          test: true,
          url: 'https://www.bbc.co.uk/news'
        }
      });

      if (error) {
        throw error;
      }

      console.log('📊 Minimal test result:', data);
      setResult(data);

      if (data.success) {
        toast({
          title: "Function Deployment Test Passed",
          description: "Screenshot function is deployed and accessible",
        });
      } else {
        toast({
          title: "Function Test Failed", 
          description: data.error || "Unknown error occurred",
          variant: "destructive",
        });
      }

    } catch (error) {
      console.error('❌ Minimal test failed:', error);
      toast({
        title: "Test Failed",
        description: error.message || "Failed to invoke function",
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
          <TestTube className="w-5 h-5" />
          Function Deployment Test
          <Badge variant="outline">Debug</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <Button 
          onClick={runMinimalTest}
          disabled={testing}
          className="w-full"
        >
          {testing ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Testing Function...
            </>
          ) : (
            <>
              <TestTube className="w-4 h-4 mr-2" />
              Test Function Deployment
            </>
          )}
        </Button>

        {result && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="font-medium">Test Results</h4>
              <Badge variant={result.success ? "default" : "destructive"}>
                {result.success ? (
                  <><CheckCircle className="w-3 h-3 mr-1" /> Success</>
                ) : (
                  <><XCircle className="w-3 h-3 mr-1" /> Failed</>
                )}
              </Badge>
            </div>

            {result.success ? (
              <div className="space-y-2">
                <Alert>
                  <CheckCircle className="w-4 h-4" />
                  <AlertDescription>
                    Function deployed successfully at {result.timestamp}
                  </AlertDescription>
                </Alert>

                {result.environment && (
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div className="flex justify-between">
                      <span>Screenshot API:</span>
                      <Badge variant={result.environment.screenshotToken ? "default" : "destructive"}>
                        {result.environment.screenshotToken ? "✓" : "✗"}
                      </Badge>
                    </div>
                    <div className="flex justify-between">
                      <span>OpenAI API:</span>
                      <Badge variant={result.environment.openaiKey ? "default" : "destructive"}>
                        {result.environment.openaiKey ? "✓" : "✗"}
                      </Badge>
                    </div>
                    <div className="flex justify-between">
                      <span>Supabase URL:</span>
                      <Badge variant={result.environment.supabaseUrl ? "default" : "destructive"}>
                        {result.environment.supabaseUrl ? "✓" : "✗"}
                      </Badge>
                    </div>
                    <div className="flex justify-between">
                      <span>Supabase Key:</span>
                      <Badge variant={result.environment.supabaseKey ? "default" : "destructive"}>
                        {result.environment.supabaseKey ? "✓" : "✗"}
                      </Badge>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <Alert variant="destructive">
                <XCircle className="w-4 h-4" />
                <AlertDescription>
                  {result.error || "Function test failed"}
                </AlertDescription>
              </Alert>
            )}
          </div>
        )}

        <Alert>
          <TestTube className="w-4 h-4" />
          <AlertDescription className="text-sm">
            <strong>Debug Test:</strong> Verifies function deployment and environment variable configuration.
          </AlertDescription>
        </Alert>
      </CardContent>
    </Card>
  );
};