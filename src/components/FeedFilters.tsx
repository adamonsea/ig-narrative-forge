import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";

type SortOption = "newest" | "oldest";
type FilterOption = "all" | "with-visuals" | "without-visuals";

interface FeedFiltersProps {
  sortBy: SortOption;
  setSortBy: (sort: SortOption) => void;
  filterBy: FilterOption;
  setFilterBy: (filter: FilterOption) => void;
  storyCount: number;
}

export function FeedFilters({ 
  sortBy, 
  setSortBy, 
  filterBy, 
  setFilterBy, 
  storyCount 
}: FeedFiltersProps) {
  const clearFilters = () => {
    setSortBy("newest");
    setFilterBy("all");
  };

  const hasActiveFilters = sortBy !== "newest" || filterBy !== "all";

  return (
    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6 p-4 bg-muted/30 rounded-lg">
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">Sort:</span>
          <Select value={sortBy} onValueChange={(value: SortOption) => setSortBy(value)}>
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="newest">Newest first</SelectItem>
              <SelectItem value="oldest">Oldest first</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">Filter:</span>
          <Select value={filterBy} onValueChange={(value: FilterOption) => setFilterBy(value)}>
            <SelectTrigger className="w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All stories</SelectItem>
              <SelectItem value="with-visuals">With visuals</SelectItem>
              <SelectItem value="without-visuals">Text only</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {hasActiveFilters && (
          <Button 
            variant="outline" 
            size="sm" 
            onClick={clearFilters}
            className="text-xs"
          >
            Clear filters
          </Button>
        )}
      </div>

      <div className="flex items-center gap-2">
        <Badge variant="secondary" className="text-xs">
          {storyCount} {storyCount === 1 ? "story" : "stories"}
        </Badge>
      </div>
    </div>
  );
}