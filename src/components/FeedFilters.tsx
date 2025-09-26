import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Filter, X } from "lucide-react";
import { cn } from "@/lib/utils";

type SortOption = "newest" | "oldest";

interface FeedFiltersProps {
  sortBy: SortOption;
  setSortBy: (sort: SortOption) => void;
  slideCount: number;
  // Keyword filtering props
  onFilterClick?: () => void;
  selectedKeywords?: string[];
  onRemoveKeyword?: (keyword: string) => void;
  hasActiveFilters?: boolean;
}

export function FeedFilters({ 
  sortBy, 
  setSortBy, 
  slideCount,
  onFilterClick,
  selectedKeywords = [],
  onRemoveKeyword,
  hasActiveFilters = false
}: FeedFiltersProps) {
  return (
    <div className="space-y-4">
      {/* Main filter controls */}
      <div className="flex items-center justify-center gap-4">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">Sort:</span>
          <Select value={sortBy} onValueChange={(value: SortOption) => setSortBy(value)}>
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-background border shadow-lg z-50">
              <SelectItem value="newest">Newest first</SelectItem>
              <SelectItem value="oldest">Oldest first</SelectItem>
            </SelectContent>
          </Select>
        </div>

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
                {selectedKeywords.length}
              </Badge>
            )}
          </Button>
        )}
      </div>

      {/* Selected keywords */}
      {selectedKeywords.length > 0 && (
        <div className="flex flex-wrap items-center justify-center gap-2">
          <span className="text-xs text-muted-foreground">Filtering by:</span>
          {selectedKeywords.map((keyword) => (
            <Badge
              key={keyword}
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
        </div>
      )}
    </div>
  );
}