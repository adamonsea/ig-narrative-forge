import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AlertTriangle, RefreshCw, ExternalLink, Database } from 'lucide-react';
import { quickHealthCheck } from '@/hooks/useHealthCheck';

interface DatabaseErrorHandlerProps {
  error: Error | null;
  onRetry?: () => void;
  children: React.ReactNode;
}

export function DatabaseErrorHandler({ error, onRetry, children }: DatabaseErrorHandlerProps) {
  const [isDbDown, setIsDbDown] = useState(false);
  const [isChecking, setIsChecking] = useState(false);

  useEffect(() => {
    if (error) {
      const errorMessage = error.message.toLowerCase();
      const isConnectionError = 
        errorMessage.includes('timeout') ||
        errorMessage.includes('network') ||
        errorMessage.includes('fetch') ||
        errorMessage.includes('connection') ||
        errorMessage.includes('aborted') ||
        errorMessage.includes('failed to fetch');
      
      if (isConnectionError) {
        setIsDbDown(true);
      }
    }
  }, [error]);

  const handleRetry = async () => {
    setIsChecking(true);
    const isHealthy = await quickHealthCheck();
    setIsChecking(false);
    
    if (isHealthy) {
      setIsDbDown(false);
      onRetry?.();
    }
  };

  if (isDbDown) {
    return (
      <div className="min-h-[400px] flex items-center justify-center p-6">
        <Card className="max-w-lg w-full">
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 p-3 rounded-full bg-destructive/10 w-fit">
              <Database className="h-8 w-8 text-destructive" />
            </div>
            <CardTitle className="text-xl">Connection Issue</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                We're having trouble connecting to our servers. This is usually temporary.
              </AlertDescription>
            </Alert>
            
            <div className="space-y-2 text-sm text-muted-foreground">
              <p className="font-medium text-foreground">What you can try:</p>
              <ul className="list-disc list-inside space-y-1">
                <li>Wait a moment and click "Try Again"</li>
                <li>Check your internet connection</li>
                <li>Refresh the page</li>
              </ul>
            </div>

            <div className="flex flex-col sm:flex-row gap-2">
              <Button onClick={handleRetry} disabled={isChecking}>
                <RefreshCw className={`h-4 w-4 mr-2 ${isChecking ? 'animate-spin' : ''}`} />
                {isChecking ? 'Checking...' : 'Try Again'}
              </Button>
              
              <Button variant="outline" asChild>
                <a href="/health">
                  <ExternalLink className="h-4 w-4 mr-2" />
                  Check System Status
                </a>
              </Button>
            </div>

            <p className="text-xs text-muted-foreground text-center pt-2">
              Error: {error?.message || 'Unknown connection error'}
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return <>{children}</>;
}
