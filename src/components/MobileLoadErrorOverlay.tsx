import { RefreshCw, WifiOff, AlertCircle, Copy } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { isGmailWebView, isInAppBrowser } from '@/lib/deviceUtils';

interface MobileLoadErrorOverlayProps {
  error: string;
  onRetry: () => void;
  retryCount?: number;
  isRetrying?: boolean;
}

/**
 * Mobile-optimized error overlay for when feeds fail to load
 * Designed for touch interaction and poor network conditions
 * Includes special handling for Gmail and other in-app browsers
 */
export function MobileLoadErrorOverlay({ 
  error, 
  onRetry, 
  retryCount = 0,
  isRetrying = false 
}: MobileLoadErrorOverlayProps) {
  const { toast } = useToast();
  const isGmail = isGmailWebView();
  const isInApp = isInAppBrowser();
  
  const isConnectionError = error.toLowerCase().includes('timeout') || 
                           error.toLowerCase().includes('network') ||
                           error.toLowerCase().includes('fetch') ||
                           error.toLowerCase().includes('aborted');

  const Icon = isConnectionError ? WifiOff : AlertCircle;
  
  const getMessage = () => {
    if (isGmail) {
      return "Gmail's browser can be slow to load. Tap below to retry, or open in Safari/Chrome for the best experience.";
    }
    if (isInApp && isConnectionError) {
      return "In-app browsers can be slower. Try tapping reload, or open in your regular browser.";
    }
    if (isConnectionError) {
      if (retryCount > 2) {
        return "Connection is slow. Try switching to WiFi or moving to a better signal area.";
      }
      return "Having trouble connecting. Your network might be slow.";
    }
    return "Something went wrong loading the feed.";
  };

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      toast({
        title: "Link copied!",
        description: "Paste in Safari or Chrome for the best experience",
      });
    } catch {
      // Fallback for browsers that don't support clipboard API
      toast({
        title: "Copy the URL from the address bar",
        description: "Then paste in Safari or Chrome",
      });
    }
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] px-6 py-12 text-center">
      <div className="mb-6 p-4 rounded-full bg-muted/50">
        <Icon className="h-12 w-12 text-muted-foreground" />
      </div>
      
      <h2 className="text-lg font-semibold mb-2">
        {isGmail ? "Gmail Browser Issue" : isConnectionError ? "Connection Issue" : "Couldn't Load Feed"}
      </h2>
      
      <p className="text-muted-foreground mb-6 max-w-xs">
        {getMessage()}
      </p>
      
      <div className="flex flex-col gap-3 w-full max-w-xs">
        <Button 
          onClick={onRetry}
          disabled={isRetrying}
          size="lg"
          className="w-full h-14 text-base"
        >
          <RefreshCw className={`h-5 w-5 mr-2 ${isRetrying ? 'animate-spin' : ''}`} />
          {isRetrying ? 'Reconnecting...' : 'Tap to Reload'}
        </Button>
        
        {/* Show copy link button for in-app browsers */}
        {isInApp && (
          <Button 
            onClick={handleCopyLink}
            variant="outline"
            size="lg"
            className="w-full h-12 text-base"
          >
            <Copy className="h-4 w-4 mr-2" />
            Copy Link to Open in Browser
          </Button>
        )}
      </div>
      
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
            {isInApp ? (
              <>• Open this link in Safari or Chrome instead</>
            ) : (
              <>• If using an email link, try opening in Safari/Chrome instead</>
            )}
          </p>
        </div>
      )}
    </div>
  );
}
