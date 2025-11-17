import { useState, useEffect } from 'react';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Clock, CheckCircle, Timer } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

interface SourceCooldownIndicatorProps {
  lastScrapedAt: string | null;
  scrapeFrequencyHours: number | null;
  compact?: boolean;
  showProgress?: boolean;
}

export const SourceCooldownIndicator = ({ 
  lastScrapedAt, 
  scrapeFrequencyHours,
  compact = false,
  showProgress = false
}: SourceCooldownIndicatorProps) => {
  const [currentTime, setCurrentTime] = useState(Date.now());

  // Update countdown every minute
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTime(Date.now());
    }, 60000); // Update every minute

    return () => clearInterval(interval);
  }, []);

  if (!lastScrapedAt || !scrapeFrequencyHours) {
    return (
      <Badge variant="outline" className="gap-1">
        <CheckCircle className="h-3 w-3" />
        {compact ? 'Ready' : 'Ready to scrape'}
      </Badge>
    );
  }

  const lastScraped = new Date(lastScrapedAt).getTime();
  const cooldownMs = scrapeFrequencyHours * 60 * 60 * 1000;
  const nextAvailableTime = lastScraped + cooldownMs;
  const timeUntilAvailable = nextAvailableTime - currentTime;
  const timeSinceLastScrape = currentTime - lastScraped;
  const cooldownProgress = Math.min((timeSinceLastScrape / cooldownMs) * 100, 100);

  const isOnCooldown = timeUntilAvailable > 0;

  if (!isOnCooldown) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Badge variant="outline" className="gap-1 border-primary/50 bg-primary/5">
              <CheckCircle className="h-3 w-3 text-primary" />
              {compact ? 'Ready' : 'Ready to scrape'}
            </Badge>
          </TooltipTrigger>
          <TooltipContent>
            <p className="text-sm">
              Last scraped {formatDistanceToNow(new Date(lastScrapedAt), { addSuffix: true })}
            </p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  const hoursRemaining = Math.floor(timeUntilAvailable / (1000 * 60 * 60));
  const minutesRemaining = Math.floor((timeUntilAvailable % (1000 * 60 * 60)) / (1000 * 60));

  const displayTime = hoursRemaining > 0 
    ? `${hoursRemaining}h ${minutesRemaining}m`
    : `${minutesRemaining}m`;

  // Determine severity based on remaining time
  const isLongCooldown = hoursRemaining >= 6;
  const badgeVariant = isLongCooldown ? "secondary" : "outline";

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="flex flex-col gap-1">
            <Badge variant={badgeVariant} className="gap-1">
              {isLongCooldown ? (
                <Clock className="h-3 w-3" />
              ) : (
                <Timer className="h-3 w-3" />
              )}
              {compact ? displayTime : `Available in ${displayTime}`}
            </Badge>
            {showProgress && (
              <Progress value={cooldownProgress} className="h-1" />
            )}
          </div>
        </TooltipTrigger>
        <TooltipContent>
          <div className="text-sm space-y-1">
            <p>Last scraped: {formatDistanceToNow(new Date(lastScrapedAt), { addSuffix: true })}</p>
            <p>Cooldown: {scrapeFrequencyHours}h between scrapes</p>
            <p className="text-muted-foreground">
              Available at {new Date(nextAvailableTime).toLocaleTimeString()}
            </p>
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};
