import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Filter, MapPin, X, Hash, Globe, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

interface FeedFiltersProps {
  slideCount: number;
  monthlyCount?: number;
  topicName?: string;
  filteredStoryCount?: number;
  // Keyword filtering props
  onFilterClick?: () => void;
  selectedKeywords?: string[];
  onRemoveKeyword?: (keyword: string) => void;
  // Source filtering props
  selectedSources?: string[];
  onRemoveSource?: (source: string) => void;
  // Location filtering props
  selectedLocations?: string[];
  onRemoveLocation?: (location: string) => void;
  // MP filtering props
  selectedMPs?: string[];
  onRemoveMP?: (mpName: string) => void;
  hasActiveFilters?: boolean;
}

export function FeedFilters({ 
  slideCount,
  monthlyCount,
  topicName,
  filteredStoryCount,
  onFilterClick,
  selectedKeywords = [],
  onRemoveKeyword,
  selectedSources = [],
  onRemoveSource,
  selectedLocations = [],
  onRemoveLocation,
  selectedMPs = [],
  onRemoveMP,
  hasActiveFilters = false
}: FeedFiltersProps) {
  const totalFilterCount = selectedKeywords.length + selectedSources.length + selectedLocations.length + selectedMPs.length;
  const displayCount = hasActiveFilters && filteredStoryCount !== undefined ? filteredStoryCount : totalFilterCount;
  const [showTip, setShowTip] = useState(false);

  useEffect(() => {
    const dismissed = localStorage.getItem('eezee_filter_tip_dismissed');
    setShowTip(!dismissed);
  }, []);

  const handleFilterClick = () => {
    localStorage.setItem('eezee_filter_tip_dismissed', '1');
    setShowTip(false);
    onFilterClick?.();
  };

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
                  {hasActiveFilters && filteredStoryCount !== undefined && (
                    <Badge className="absolute -top-2 -right-2 h-5 w-5 p-0 text-xs">
                      {filteredStoryCount}
                    </Badge>
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom" align="center" className="z-[60] max-w-xs text-center">
                <div className="font-semibold">{(monthlyCount ?? 0).toString()} this month{topicName ? `, ${topicName}` : ''}</div>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>

        )}
      </div>

      {/* Selected filters */}
      {(selectedKeywords.length > 0 || selectedSources.length > 0 || selectedLocations.length > 0 || selectedMPs.length > 0) && (
        <div className="flex flex-wrap items-center justify-center gap-2">
          <span className="text-xs text-muted-foreground">Filtering by:</span>
          {selectedKeywords.map((keyword) => {
            // Smart sentence case: capitalize first letter only if word is all lowercase
            const displayText = keyword === keyword.toLowerCase() 
              ? keyword.charAt(0).toUpperCase() + keyword.slice(1)
              : keyword;
            
            return (
              <Badge
                key={`keyword-${keyword}`}
                className="flex items-center gap-1 pr-1 bg-blue-50 text-blue-700 border border-blue-200 dark:bg-blue-950/40 dark:text-blue-200 dark:border-blue-800/60"
              >
                <Hash className="w-3 h-3" />
                <span>{displayText}</span>
                {onRemoveKeyword && (
                  <button
                    onClick={() => onRemoveKeyword(keyword)}
                    className="ml-1 hover:bg-blue-200/50 dark:hover:bg-blue-800/50 rounded-full p-0.5 transition-colors"
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
              </Badge>
            );
          })}
          {selectedLocations.map((location) => {
            // Smart sentence case: capitalize first letter only if word is all lowercase
            const displayText = location === location.toLowerCase() 
              ? location.charAt(0).toUpperCase() + location.slice(1)
              : location;
            
            return (
              <Badge
                key={`location-${location}`}
                className="flex items-center gap-1 pr-1 bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-200 dark:border-emerald-800/60"
              >
                <MapPin className="w-3 h-3" />
                <span>{displayText}</span>
                {onRemoveLocation && (
                  <button
                    onClick={() => onRemoveLocation(location)}
                    className="ml-1 hover:bg-emerald-200/50 dark:hover:bg-emerald-800/50 rounded-full p-0.5 transition-colors"
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
              </Badge>
            );
          })}
          {selectedSources.map((source) => {
            // Title case for source display
            const displayName = source.split('.')[0]
              .split(' ')
              .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
              .join(' ');
            
            return (
              <Badge
                key={`source-${source}`}
                className="flex items-center gap-1 pr-1 bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-950/40 dark:text-amber-200 dark:border-amber-800/60"
              >
                <Globe className="w-3 h-3" />
                <span>{displayName}</span>
                {onRemoveSource && (
                  <button
                    onClick={() => onRemoveSource(source)}
                    className="ml-1 hover:bg-amber-200/50 dark:hover:bg-amber-800/50 rounded-full p-0.5 transition-colors"
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
              </Badge>
            );
          })}
          {selectedMPs.map((mpName) => (
            <Badge
              key={`mp-${mpName}`}
              className="flex items-center gap-1 pr-1 bg-purple-50 text-purple-700 border border-purple-200 dark:bg-purple-950/40 dark:text-purple-200 dark:border-purple-800/60"
            >
              <Users className="w-3 h-3" />
              <span>{mpName}</span>
              {onRemoveMP && (
                <button
                  onClick={() => onRemoveMP(mpName)}
                  className="ml-1 hover:bg-purple-200/50 dark:hover:bg-purple-800/50 rounded-full p-0.5 transition-colors"
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