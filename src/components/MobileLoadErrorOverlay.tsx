import React from 'react';
import { RefreshCw, WifiOff, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface MobileLoadErrorOverlayProps {
  error: string;
  onRetry: () => void;
  retryCount?: number;
  isRetrying?: boolean;
}

/**
 * Mobile-optimized error overlay for when feeds fail to load
 * Designed for touch interaction and poor network conditions
 */
export function MobileLoadErrorOverlay({ 
  error, 
  onRetry, 
  retryCount = 0,
  isRetrying = false 
}: MobileLoadErrorOverlayProps) {
  const isConnectionError = error.toLowerCase().includes('timeout') || 
                           error.toLowerCase().includes('network') ||
                           error.toLowerCase().includes('fetch') ||
                           error.toLowerCase().includes('aborted');

  const Icon = isConnectionError ? WifiOff : AlertCircle;
  
  const getMessage = () => {
    if (isConnectionError) {
      if (retryCount > 2) {
        return "Connection is slow. Try switching to WiFi or moving to a better signal area.";
      }
      return "Having trouble connecting. Your network might be slow.";
    }
    return "Something went wrong loading the feed.";
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] px-6 py-12 text-center">
      <div className="mb-6 p-4 rounded-full bg-muted/50">
        <Icon className="h-12 w-12 text-muted-foreground" />
      </div>
      
      <h2 className="text-lg font-semibold mb-2">
        {isConnectionError ? "Connection Issue" : "Couldn't Load Feed"}
      </h2>
      
      <p className="text-muted-foreground mb-6 max-w-xs">
        {getMessage()}
      </p>
      
      <Button 
        onClick={onRetry}
        disabled={isRetrying}
        size="lg"
        className="min-w-[200px] h-14 text-base"
      >
        <RefreshCw className={`h-5 w-5 mr-2 ${isRetrying ? 'animate-spin' : ''}`} />
        {isRetrying ? 'Reconnecting...' : 'Tap to Reload'}
      </Button>
      
      {retryCount > 0 && (
        <p className="text-xs text-muted-foreground mt-4">
          Attempt {retryCount + 1} • {isConnectionError ? 'Trying longer timeout...' : 'Retrying...'}
        </p>
      )}
      
      {retryCount > 2 && (
        <div className="mt-6 p-3 bg-muted/30 rounded-lg max-w-xs">
          <p className="text-xs text-muted-foreground">
            <strong>Tips:</strong><br />
            • Try refreshing the page<br />
            • Check your internet connection<br />
            • If using an email link, try opening in Safari/Chrome instead
          </p>
        </div>
      )}
    </div>
  );
}
