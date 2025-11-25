import { TrendingUp } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

interface AverageDailyStoriesBadgeProps {
  average: number;
}

export const AverageDailyStoriesBadge = ({ average }: AverageDailyStoriesBadgeProps) => {
  // Only show if average is greater than 5
  if (average <= 5) return null;
  
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge variant="outline" className="gap-1 text-xs font-normal border-emerald-500 text-emerald-600 dark:text-emerald-400">
            <TrendingUp className="w-3 h-3" />
            {average.toFixed(1)}/day
          </Badge>
        </TooltipTrigger>
        <TooltipContent>
          <p>Average daily stories published from this source</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};
