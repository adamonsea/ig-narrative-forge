import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { AlertTriangle, RefreshCw, ExternalLink } from 'lucide-react';


interface ServiceUnavailableProps {
  title?: string;
  message?: string;
  onRetry?: () => void;
  showHealthLink?: boolean;
}

export function ServiceUnavailable({ 
  title = 'Service Temporarily Unavailable',
  message = 'We\'re experiencing technical difficulties. Our team has been notified and is working to resolve the issue.',
  onRetry,
  showHealthLink = true
}: ServiceUnavailableProps) {
  return (
    <div className="min-h-[400px] flex items-center justify-center p-6">
      <Card className="max-w-md w-full">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 p-3 rounded-full bg-yellow-500/10 w-fit">
            <AlertTriangle className="h-8 w-8 text-yellow-500" />
          </div>
          <CardTitle className="text-xl">{title}</CardTitle>
        </CardHeader>
        <CardContent className="text-center space-y-4">
          <p className="text-muted-foreground">{message}</p>
          
          <div className="flex flex-col sm:flex-row gap-2 justify-center">
            {onRetry && (
              <Button onClick={onRetry} variant="default">
                <RefreshCw className="h-4 w-4 mr-2" />
                Try Again
              </Button>
            )}
            
            {showHealthLink && (
              <Button variant="outline" asChild>
                <a href="/health">
                  <ExternalLink className="h-4 w-4 mr-2" />
                  Check System Status
                </a>
              </Button>
            )}
          </div>
          
          <p className="text-xs text-muted-foreground pt-4">
            If this issue persists, please try again in a few minutes or contact support.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
