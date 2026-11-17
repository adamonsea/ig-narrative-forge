import { Loader2, RotateCcw, SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

export type StoryTypeFilter = "all" | "regular" | "parliamentary";
export type StorySort = "newest" | "oldest" | "source";

interface StoryFiltersProps {
  storyFilter: StoryTypeFilter;
  onStoryFilter: (f: StoryTypeFilter) => void;
  allLabel: string;
  regularCount: number;
  parliamentaryCount: number;
  sources: [string, number][];
  sourceFilter: string;
  onSourceFilter: (s: string) => void;
  sortMode: StorySort;
  onSortMode: (s: StorySort) => void;
  onRefresh: () => void;
  loading?: boolean;
}

/** One filter button: story type, source, sort and refresh in a small popover. */
export function StoryFilters({
  storyFilter, onStoryFilter, allLabel, regularCount, parliamentaryCount, sources, sourceFilter, onSourceFilter, sortMode, onSortMode, onRefresh, loading,
}: StoryFiltersProps) {
  const active = storyFilter !== "all" || sourceFilter !== "all" || sortMode !== "newest";
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative h-9 w-9" aria-label={active ? "Filters (on)" : "Filters"}>
          <SlidersHorizontal className="h-4 w-4" />
          {active && <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-primary" aria-hidden="true" />}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 space-y-4">
        {parliamentaryCount > 0 && (
          <div className="space-y-2">
            <p className="text-sm font-medium">Show</p>
            <div className="flex flex-wrap gap-2">
              {([
                ["all", allLabel],
                ["regular", `Regular (${regularCount})`],
                ["parliamentary", `Parliamentary (${parliamentaryCount})`],
              ] as [StoryTypeFilter, string][]).map(([key, label]) => (
                <Button key={key} size="sm" variant={storyFilter === key ? "default" : "outline"} className="text-sm" onClick={() => onStoryFilter(key)}>
                  {label}
                </Button>
              ))}
            </div>
          </div>
        )}
        {sources.length > 1 && (
          <div className="space-y-2">
            <p className="text-sm font-medium">Source</p>
            <Select value={sourceFilter} onValueChange={onSourceFilter}>
              <SelectTrigger className="text-sm"><SelectValue placeholder="All sources" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All sources</SelectItem>
                {sources.map(([label, count]) => (
                  <SelectItem key={label} value={label}>{label} ({count})</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
        <div className="space-y-2">
          <p className="text-sm font-medium">Order</p>
          <Select value={sortMode} onValueChange={(v) => onSortMode(v as StorySort)}>
            <SelectTrigger className="text-sm" aria-label="Sort stories"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="newest">Newest first</SelectItem>
              <SelectItem value="oldest">Oldest first</SelectItem>
              <SelectItem value="source">Source A–Z</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center justify-between border-t border-border pt-3">
          <Button
            variant="ghost"
            size="sm"
            className={cn("text-sm text-muted-foreground", !active && "invisible")}
            onClick={() => { onStoryFilter("all"); onSourceFilter("all"); onSortMode("newest"); }}
          >
            Clear
          </Button>
          <Button variant="outline" size="sm" className="text-sm" onClick={onRefresh}>
            {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RotateCcw className="mr-2 h-4 w-4" />}
            Refresh
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
