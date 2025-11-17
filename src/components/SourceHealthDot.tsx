import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

interface SourceHealthDotProps {
  isActive: boolean;
  consecutiveFailures: number;
  totalFailures: number;
  lastStoryDate: string | null;
  storiesPublished7d: number;
  storiesGathered7d: number;
  lastFailureReason?: string | null;
  isBlacklisted?: boolean;
}

export const SourceHealthDot = ({
  isActive,
  consecutiveFailures,
  totalFailures,
  lastStoryDate,
  storiesPublished7d,
  storiesGathered7d,
  lastFailureReason,
  isBlacklisted
}: SourceHealthDotProps) => {
  
  const getHealthStatus = () => {
    if (!isActive) {
      return {
        color: "bg-muted",
        icon: "⚪",
        label: "Disabled",
        description: "Source is currently disabled"
      };
    }
    
    if (consecutiveFailures >= 3 || isBlacklisted) {
      return {
        color: "bg-destructive",
        icon: "🔴",
        label: "Connection Issues",
        description: lastFailureReason || `${consecutiveFailures} consecutive failures`
      };
    }
    
    if (!lastStoryDate) {
      return {
        color: "bg-muted",
        icon: "⚪",
        label: "No Stories Yet",
        description: "No stories have been published from this source"
      };
    }
    
    const daysSinceLastStory = Math.floor(
      (Date.now() - new Date(lastStoryDate).getTime()) / (1000 * 60 * 60 * 24)
    );
    
    if (daysSinceLastStory > 7) {
      return {
        color: "bg-yellow-500",
        icon: "🟡",
        label: "Stale",
        description: `Last story published ${daysSinceLastStory} days ago`
      };
    }
    
    // Check if articles are gathering but not publishing
    if (storiesGathered7d > 0 && storiesPublished7d === 0) {
      return {
        color: "bg-yellow-500",
        icon: "🟡",
        label: "Gathering Only",
        description: `${storiesGathered7d} articles gathered but not published in last 7 days`
      };
    }
    
    if (storiesPublished7d === 0 && storiesGathered7d === 0) {
      return {
        color: "bg-yellow-500",
        icon: "🟡",
        label: "No Activity",
        description: "No articles gathered or published in last 7 days"
      };
    }
    
    return {
      color: "bg-green-500",
      icon: "🟢",
      label: "Healthy",
      description: `${storiesGathered7d} gathered • ${storiesPublished7d} published (7d)`
    };
  };
  
  const status = getHealthStatus();
  
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div 
            className={`w-3 h-3 rounded-full ${status.color} cursor-help transition-transform hover:scale-110`}
            aria-label={status.label}
          />
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-xs">
          <div className="space-y-1">
            <p className="font-semibold text-sm">{status.icon} {status.label}</p>
            <p className="text-xs text-muted-foreground">{status.description}</p>
            {totalFailures > 0 && (
              <p className="text-xs text-muted-foreground">
                Total failures: {totalFailures}
              </p>
            )}
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};
