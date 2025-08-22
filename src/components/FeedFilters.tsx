import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Settings } from "lucide-react";

type SortOption = "newest" | "oldest";
type FilterOption = "all" | "with-visuals" | "without-visuals";

interface FeedFiltersProps {
  sortBy: SortOption;
  setSortBy: (sort: SortOption) => void;
  filterBy: FilterOption;
  setFilterBy: (filter: FilterOption) => void;
  slideCount: number;
}

export function FeedFilters({ 
  sortBy, 
  setSortBy, 
  filterBy, 
  setFilterBy, 
  slideCount 
}: FeedFiltersProps) {
  const clearFilters = () => {
    setSortBy("newest");
    setFilterBy("all");
  };

  const hasActiveFilters = sortBy !== "newest" || filterBy !== "all";

  return (
    <div className="flex items-center justify-center gap-4">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="sm" className="flex items-center gap-2">
            <Settings className="w-4 h-4" />
            Filters
            {hasActiveFilters && (
              <Badge variant="secondary" className="text-xs ml-1">
                Active
              </Badge>
            )}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent className="w-64 p-4 bg-background border shadow-lg z-50" align="center">
          <div className="space-y-4">
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

            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">Filter:</span>
              <Select value={filterBy} onValueChange={(value: FilterOption) => setFilterBy(value)}>
                <SelectTrigger className="w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-background border shadow-lg z-50">
                  <SelectItem value="all">All stories</SelectItem>
                  <SelectItem value="with-visuals">With visuals</SelectItem>
                  <SelectItem value="without-visuals">Text only</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {hasActiveFilters && (
              <div className="pt-2 border-t">
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={clearFilters}
                  className="w-full text-xs"
                >
                  Clear filters
                </Button>
              </div>
            )}
          </div>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}