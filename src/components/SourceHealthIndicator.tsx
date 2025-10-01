import { AlertTriangle, XCircle, CheckCircle, RefreshCw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface SourceHealthIndicatorProps {
  consecutiveFailures: number;
  totalFailures: number;
  lastFailureAt?: string | null;
  lastFailureReason?: string | null;
  isActive: boolean;
  onTest?: () => void;
  onReactivate?: () => void;
  testing?: boolean;
}

export const SourceHealthIndicator = ({
  consecutiveFailures,
  totalFailures,
  lastFailureAt,
  lastFailureReason,
  isActive,
  onTest,
  onReactivate,
  testing = false
}: SourceHealthIndicatorProps) => {
  // Determine health status
  const getHealthStatus = () => {
    if (!isActive) return 'disabled';
    if (consecutiveFailures === 0) return 'healthy';
    if (consecutiveFailures === 1) return 'warning';
    if (consecutiveFailures === 2) return 'critical';
    return 'failed'; // 3+ consecutive failures
  };

  const status = getHealthStatus();

  // Red wash intensity based on consecutive failures
  const getRedWashClass = () => {
    if (!isActive) return 'bg-muted/50';
    if (consecutiveFailures === 0) return '';
    if (consecutiveFailures === 1) return 'bg-destructive/10';
    if (consecutiveFailures === 2) return 'bg-destructive/20';
    return 'bg-destructive/30'; // 3+ failures
  };

  const getIcon = () => {
    if (!isActive) return <XCircle className="w-4 h-4" />;
    if (consecutiveFailures === 0) return <CheckCircle className="w-4 h-4" />;
    if (consecutiveFailures < 3) return <AlertTriangle className="w-4 h-4" />;
    return <XCircle className="w-4 h-4" />;
  };

  const getBadgeVariant = () => {
    if (!isActive) return 'outline';
    if (consecutiveFailures === 0) return 'default';
    if (consecutiveFailures < 3) return 'secondary';
    return 'destructive';
  };

  const getStatusText = () => {
    if (!isActive) return 'Auto-disabled';
    if (consecutiveFailures === 0) return 'Healthy';
    if (consecutiveFailures === 1) return `1 failure`;
    if (consecutiveFailures === 2) return `2 consecutive failures`;
    return `${consecutiveFailures} consecutive failures`;
  };

  const formatLastFailure = (date: string) => {
    const d = new Date(date);
    const now = new Date();
    const diffHours = Math.floor((now.getTime() - d.getTime()) / (1000 * 60 * 60));
    
    if (diffHours < 1) return 'Just now';
    if (diffHours < 24) return `${diffHours}h ago`;
    const diffDays = Math.floor(diffHours / 24);
    return `${diffDays}d ago`;
  };

  return (
    <TooltipProvider>
      <div className={cn("relative rounded-md p-3", getRedWashClass())}>
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Tooltip>
              <TooltipTrigger asChild>
                <Badge variant={getBadgeVariant()} className="flex items-center gap-1.5">
                  {getIcon()}
                  <span>{getStatusText()}</span>
                </Badge>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="max-w-xs">
                <div className="space-y-2">
                  <div className="font-semibold">Source Health Status</div>
                  <div className="text-sm space-y-1">
                    <p>Total failures: {totalFailures || 0}</p>
                    <p>Consecutive: {consecutiveFailures || 0}</p>
                    {lastFailureAt && (
                      <p>Last failure: {formatLastFailure(lastFailureAt)}</p>
                    )}
                    {lastFailureReason && (
                      <p className="text-xs text-muted-foreground mt-2">
                        Reason: {lastFailureReason}
                      </p>
                    )}
                    {!isActive && (
                      <p className="text-xs text-destructive mt-2">
                        ⚠️ Auto-disabled after 3 consecutive failures
                      </p>
                    )}
                  </div>
                </div>
              </TooltipContent>
            </Tooltip>
          </div>

          <div className="flex gap-2">
            {onTest && (
              <Button
                variant="ghost"
                size="sm"
                onClick={onTest}
                disabled={testing}
                className="h-7"
              >
                {testing ? (
                  <>
                    <RefreshCw className="w-3 h-3 mr-1 animate-spin" />
                    Testing
                  </>
                ) : (
                  <>
                    <RefreshCw className="w-3 h-3 mr-1" />
                    Test
                  </>
                )}
              </Button>
            )}
            
            {!isActive && onReactivate && (
              <Button
                variant="outline"
                size="sm"
                onClick={onReactivate}
                className="h-7"
              >
                Reactivate
              </Button>
            )}
          </div>
        </div>
      </div>
    </TooltipProvider>
  );
};
