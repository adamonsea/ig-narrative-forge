import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type SortOption = "newest" | "oldest";

interface FeedFiltersProps {
  sortBy: SortOption;
  setSortBy: (sort: SortOption) => void;
  slideCount: number;
}

export function FeedFilters({ 
  sortBy, 
  setSortBy, 
  slideCount 
}: FeedFiltersProps) {
  return (
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
    </div>
  );
}