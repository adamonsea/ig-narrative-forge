import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Hash, Globe, ChevronDown, ChevronUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { useState, useMemo } from "react";

interface KeywordCount {
  keyword: string;
  count: number;
}

interface SourceCount {
  source_name: string;
  source_domain: string;
  count: number;
}

interface FilterModalProps {
  isOpen: boolean;
  onClose: () => void;
  availableKeywords: KeywordCount[];
  selectedKeywords: string[];
  onKeywordToggle: (keyword: string) => void;
  availableSources: SourceCount[];
  selectedSources: string[];
  onSourceToggle: (sourceDomain: string) => void;
  onClearAll: () => void;
}

export const FilterModal = ({
  isOpen,
  onClose,
  availableKeywords,
  selectedKeywords,
  onKeywordToggle,
  availableSources,
  selectedSources,
  onSourceToggle,
  onClearAll
}: FilterModalProps) => {
  const totalSelected = selectedKeywords.length + selectedSources.length;

  const [showAllKeywords, setShowAllKeywords] = useState(false);
  const [showAllSources, setShowAllSources] = useState(false);

  const sortedKeywords = useMemo(
    () => [...availableKeywords].sort((a, b) => b.count - a.count),
    [availableKeywords]
  );
  const filteredKeywords = useMemo(
    () => sortedKeywords.filter(({ keyword }) => keyword.length > 2),
    [sortedKeywords]
  );
  const displayedKeywords = showAllKeywords ? filteredKeywords : filteredKeywords.slice(0, 10);
  const hasMoreKeywords = filteredKeywords.length > 10;

  const sortedSources = useMemo(
    () => [...availableSources].sort((a, b) => b.count - a.count),
    [availableSources]
  );
  const displayedSources = showAllSources ? sortedSources : sortedSources.slice(0, 10);
  const hasMoreSources = sortedSources.length > 10;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between">
            <span>Filter Stories</span>
            {totalSelected > 0 && (
              <Button variant="outline" size="sm" onClick={onClearAll}>
                Clear all ({totalSelected})
              </Button>
            )}
          </DialogTitle>
        </DialogHeader>
        
        <Tabs defaultValue="keywords" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="keywords" className="flex items-center gap-2">
              <Hash className="w-4 h-4" />
              Keywords
              {selectedKeywords.length > 0 && (
                <Badge variant="secondary" className="ml-1 h-5 px-1.5 text-xs">
                  {selectedKeywords.length}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="sources" className="flex items-center gap-2">
              <Globe className="w-4 h-4" />
              Sources
              {selectedSources.length > 0 && (
                <Badge variant="secondary" className="ml-1 h-5 px-1.5 text-xs">
                  {selectedSources.length}
                </Badge>
              )}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="keywords" className="mt-4 space-y-4">
            {filteredKeywords.length > 0 ? (
              <>
                <div className="flex flex-wrap gap-2">
                  {displayedKeywords.map(({ keyword, count }) => {
                    const isSelected = selectedKeywords.includes(keyword);
                    return (
                      <button
                        key={keyword}
                        onClick={() => onKeywordToggle(keyword)}
                        className={cn(
                          "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition-all",
                          "hover:scale-105 active:scale-95",
                          isSelected 
                            ? "bg-primary text-primary-foreground shadow-sm" 
                            : "bg-muted hover:bg-muted/80 text-muted-foreground hover:text-foreground"
                        )}
                      >
                        <span className="capitalize">{keyword}</span>
                        <span className="text-xs opacity-70">({count})</span>
                      </button>
                    );
                  })}
                </div>
                {hasMoreKeywords && (
                  <div className="flex justify-center">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setShowAllKeywords(!showAllKeywords)}
                      className="text-xs"
                    >
                      {showAllKeywords ? (
                        <>
                          <ChevronUp className="w-3 h-3 mr-1" />
                          Show less
                        </>
                      ) : (
                        <>
                          <ChevronDown className="w-3 h-3 mr-1" />
                          Show {filteredKeywords.length - 10} more keywords
                        </>
                      )}
                    </Button>
                  </div>
                )}
              </>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                <Hash className="w-8 h-8 mx-auto mb-2 opacity-50" />
                <p>No keywords found</p>
              </div>
            )}
            <p className="text-xs text-muted-foreground text-center">
              Click keywords to filter stories. Numbers show story count.
            </p>
          </TabsContent>

          <TabsContent value="sources" className="mt-4 space-y-4">
            {sortedSources.length > 0 ? (
              <>
                <div className="flex flex-wrap gap-2">
                  {displayedSources.map(({ source_name, source_domain, count }) => {
                    const isSelected = selectedSources.includes(source_domain);
                    return (
                      <button
                        key={source_domain}
                        onClick={() => onSourceToggle(source_domain)}
                        className={cn(
                          "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition-all",
                          "hover:scale-105 active:scale-95",
                          isSelected 
                            ? "bg-primary text-primary-foreground shadow-sm" 
                            : "bg-muted hover:bg-muted/80 text-muted-foreground hover:text-foreground"
                        )}
                      >
                        <span className="capitalize">{source_name}</span>
                        <span className="text-xs opacity-70">({count})</span>
                      </button>
                    );
                  })}
                </div>
                {hasMoreSources && (
                  <div className="flex justify-center">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setShowAllSources(!showAllSources)}
                      className="text-xs"
                    >
                      {showAllSources ? (
                        <>
                          <ChevronUp className="w-3 h-3 mr-1" />
                          Show less
                        </>
                      ) : (
                        <>
                          <ChevronDown className="w-3 h-3 mr-1" />
                          Show {sortedSources.length - 10} more sources
                        </>
                      )}
                    </Button>
                  </div>
                )}
              </>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                <Globe className="w-8 h-8 mx-auto mb-2 opacity-50" />
                <p>No sources found</p>
              </div>
            )}
            <p className="text-xs text-muted-foreground text-center">
              Click sources to filter stories. Numbers show story count.
            </p>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
};
