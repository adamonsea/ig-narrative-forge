import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Filter, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

interface FeedFiltersProps {
  slideCount: number;
  monthlyCount?: number;
  // Keyword filtering props
  onFilterClick?: () => void;
  selectedKeywords?: string[];
  onRemoveKeyword?: (keyword: string) => void;
  // Source filtering props
  selectedSources?: string[];
  onRemoveSource?: (source: string) => void;
  hasActiveFilters?: boolean;
}

export function FeedFilters({ 
  slideCount,
  monthlyCount,
  onFilterClick,
  selectedKeywords = [],
  onRemoveKeyword,
  selectedSources = [],
  onRemoveSource,
  hasActiveFilters = false
}: FeedFiltersProps) {
  const totalFilterCount = selectedKeywords.length + selectedSources.length;
  const [showTip, setShowTip] = useState(false);

  useEffect(() => {
    setShowTip(true)
  }, [])

  const handleFilterClick = () => {
    setShowTip(false)
    onFilterClick?.()
  }

  return (
    <div className="space-y-4">
      {/* Main filter controls */}
      <div className="flex items-center justify-center gap-4">
        {/* Filter button */}
        {onFilterClick && (
          <TooltipProvider>
            <Tooltip open={showTip}>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleFilterClick}
                  className={cn(
                    "relative",
                    hasActiveFilters && "border-primary text-primary"
                  )}
                >
                  <Filter className="w-4 h-4" />
                  {hasActiveFilters && (
                    <Badge className="absolute -top-2 -right-2 h-5 w-5 p-0 text-xs">
                      {totalFilterCount}
                    </Badge>
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom" align="center" className="z-[60] max-w-xs text-center">
                <div className="font-semibold">{(monthlyCount ?? 0).toString()} this month, pick a topic</div>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>

        )}
      </div>

      {/* Selected filters */}
      {(selectedKeywords.length > 0 || selectedSources.length > 0) && (
        <div className="flex flex-wrap items-center justify-center gap-2">
          <span className="text-xs text-muted-foreground">Filtering by:</span>
          {selectedKeywords.map((keyword) => (
            <Badge
              key={`keyword-${keyword}`}
              variant="secondary"
              className="flex items-center gap-1 pr-1"
            >
              <span className="capitalize">{keyword}</span>
              {onRemoveKeyword && (
                <button
                  onClick={() => onRemoveKeyword(keyword)}
                  className="ml-1 hover:bg-destructive/20 rounded-full p-0.5 transition-colors"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </Badge>
          ))}
          {selectedSources.map((source) => (
            <Badge
              key={`source-${source}`}
              variant="outline"
              className="flex items-center gap-1 pr-1"
            >
              <span className="capitalize">{source.split('.')[0]}</span>
              {onRemoveSource && (
                <button
                  onClick={() => onRemoveSource(source)}
                  className="ml-1 hover:bg-destructive/20 rounded-full p-0.5 transition-colors"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}