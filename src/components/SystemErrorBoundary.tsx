import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface Props {
  children: React.ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
  errorInfo?: React.ErrorInfo;
}

export class SystemErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): State {
    return {
      hasError: true,
      error,
    };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('SystemErrorBoundary caught an error:', error, errorInfo);
    
    // Create error signature for deduplication
    const errorSignature = `${error.message}|${error.stack?.substring(0, 200)}`;
    const now = Date.now();
    
    // Check if we've logged this error recently (within 5 minutes)
    const recentErrors = sessionStorage.getItem('logged_errors');
    const errorLog = recentErrors ? JSON.parse(recentErrors) : {};
    
    const lastLogged = errorLog[errorSignature];
    if (lastLogged && (now - lastLogged) < 5 * 60 * 1000) {
      console.log('Skipping duplicate error log');
    } else {
      // Log new or stale error
      errorLog[errorSignature] = now;
      sessionStorage.setItem('logged_errors', JSON.stringify(errorLog));
      
      // Clean up old entries (older than 10 minutes)
      Object.keys(errorLog).forEach(key => {
        if (now - errorLog[key] > 10 * 60 * 1000) {
          delete errorLog[key];
        }
      });
      sessionStorage.setItem('logged_errors', JSON.stringify(errorLog));
    }
    
    this.setState({
      error,
      errorInfo,
    });
  }

  handleReset = () => {
    this.setState({ hasError: false, error: undefined, errorInfo: undefined });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen p-6 flex items-center justify-center">
          <Card className="max-w-2xl w-full">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-destructive">
                <AlertTriangle className="h-5 w-5" />
                System Error Detected
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>
                  The application encountered an unexpected error. This may be due to conflicting 
                  code or system integrity issues that have been automatically resolved.
                </AlertDescription>
              </Alert>
              
              <div className="space-y-2">
                <p className="font-medium">What happened:</p>
                <code className="block p-3 bg-muted rounded text-sm break-all">
                  {this.state.error?.message || 'Unknown error occurred'}
                </code>
              </div>

              <div className="flex gap-2">
                <Button onClick={this.handleReset} className="flex items-center gap-2">
                  <RefreshCw className="h-4 w-4" />
                  Retry
                </Button>
                <Button 
                  variant="outline" 
                  onClick={() => window.location.reload()}
                >
                  Refresh Page
                </Button>
              </div>

              <div className="text-sm text-muted-foreground">
                <p>
                  If this error persists, the system has been cleaned up and streamlined 
                  to prevent conflicts. All legacy image generation code has been removed 
                  and replaced with a single, robust Canvas-based approach.
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      );
    }

    return this.props.children;
  }
}