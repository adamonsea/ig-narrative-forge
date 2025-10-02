import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Filter, X } from "lucide-react";
import { cn } from "@/lib/utils";

interface FeedFiltersProps {
  slideCount: number;
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
  onFilterClick,
  selectedKeywords = [],
  onRemoveKeyword,
  selectedSources = [],
  onRemoveSource,
  hasActiveFilters = false
}: FeedFiltersProps) {
  const totalFilterCount = selectedKeywords.length + selectedSources.length;
  return (
    <div className="space-y-4">
      {/* Main filter controls */}
      <div className="flex items-center justify-center gap-4">
        {/* Filter button */}
        {onFilterClick && (
          <Button
            variant="outline"
            size="sm"
            onClick={onFilterClick}
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