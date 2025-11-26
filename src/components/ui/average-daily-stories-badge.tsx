import { TrendingUp } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";


interface AverageDailyStoriesBadgeProps {
  average: number;
  todayCount?: number;
}

export const AverageDailyStoriesBadge = ({ average, todayCount }: AverageDailyStoriesBadgeProps) => {
  // Show if average is greater than 1 (at least 1 story per day)
  if (average <= 1) return null;
  
  const roundedAverage = Math.round(average);
  const showTodayCount = todayCount !== undefined && todayCount > roundedAverage;
  
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge variant="outline" className="gap-1 text-xs font-normal border-emerald-500 text-emerald-600 dark:text-emerald-400">
            <TrendingUp className="w-3 h-3" />
            {showTodayCount ? `${todayCount} new today` : `Av. ${roundedAverage}/day`}
          </Badge>
        </TooltipTrigger>
        <TooltipContent>
          <p>{showTodayCount ? 'Stories published today' : 'Average daily stories published'}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};
