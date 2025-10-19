import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Hash, Globe, ChevronDown, ChevronUp, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { useState, useMemo } from "react";

// Helper: Smart sentence case - only capitalize if word is all lowercase
const toSentenceCase = (text: string): string => {
  if (text === text.toLowerCase()) {
    return text.charAt(0).toUpperCase() + text.slice(1);
  }
  return text; // Preserve existing capitals (e.g., "NHS", "East Sussex")
};

// Helper: Title case for proper nouns
const toTitleCase = (text: string): string => {
  return text
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
};

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
  availableLandmarks?: KeywordCount[];
  selectedLandmarks?: string[];
  onLandmarkToggle?: (landmark: string) => void;
  availableOrganizations?: KeywordCount[];
  selectedOrganizations?: string[];
  onOrganizationToggle?: (organization: string) => void;
  availableSources: SourceCount[];
  selectedSources: string[];
  onSourceToggle: (sourceDomain: string) => void;
  availableMPs?: MPFilter[];
  selectedMPs?: string[];
  onMPToggle?: (mpName: string) => void;
  onClearAll: () => void;
  onClearMPs?: () => void;
}

interface MPFilter {
  mp_name: string;
  mp_party: string;
  constituency: string;
  count: number;
}

export const FilterModal = ({
  isOpen,
  onClose,
  availableKeywords,
  selectedKeywords,
  onKeywordToggle,
  availableLandmarks = [],
  selectedLandmarks = [],
  onLandmarkToggle,
  availableOrganizations = [],
  selectedOrganizations = [],
  onOrganizationToggle,
  availableSources,
  selectedSources,
  onSourceToggle,
  availableMPs = [],
  selectedMPs = [],
  onMPToggle,
  onClearAll,
  onClearMPs
}: FilterModalProps) => {
  const totalSelected = selectedKeywords.length + selectedLandmarks.length + selectedOrganizations.length + selectedSources.length + selectedMPs.length;

  const [showAllKeywords, setShowAllKeywords] = useState(false);
  const [showAllSources, setShowAllSources] = useState(false);

  // Merge keywords, organizations, and landmarks into one list
  const combinedKeywords = useMemo(() => {
    const items = [
      ...availableKeywords.filter(({ keyword }) => keyword.length > 2).map(item => ({ 
        ...item, 
        type: 'keyword' as const 
      })),
      ...availableOrganizations.map(item => ({ 
        ...item, 
        type: 'organization' as const 
      })),
      ...availableLandmarks.map(item => ({ 
        ...item, 
        type: 'landmark' as const 
      }))
    ];
    return items.sort((a, b) => b.count - a.count);
  }, [availableKeywords, availableOrganizations, availableLandmarks]);

  const displayedKeywords = showAllKeywords ? combinedKeywords : combinedKeywords.slice(0, 10);
  const hasMoreKeywords = combinedKeywords.length > 10;

  // Sources processing
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
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="keywords" className="flex items-center gap-2">
              <Hash className="w-4 h-4" />
              <span className="hidden sm:inline">Keywords</span>
              {(selectedKeywords.length + selectedLandmarks.length + selectedOrganizations.length) > 0 && (
                <Badge variant="secondary" className="ml-1 h-5 px-1.5 text-xs">
                  {selectedKeywords.length + selectedLandmarks.length + selectedOrganizations.length}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="sources" className="flex items-center gap-2">
              <Globe className="w-4 h-4" />
              <span className="hidden sm:inline">Sources</span>
              {selectedSources.length > 0 && (
                <Badge variant="secondary" className="ml-1 h-5 px-1.5 text-xs">
                  {selectedSources.length}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="mps" className="flex items-center gap-2">
              <Users className="w-4 h-4" />
              <span className="hidden sm:inline">MP Votes</span>
              {selectedMPs.length > 0 && (
                <Badge variant="secondary" className="ml-1 h-5 px-1.5 text-xs bg-purple-100 text-purple-700">
                  {selectedMPs.length}
                </Badge>
              )}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="keywords" className="mt-4">
            <ScrollArea className="h-[60vh]">
              <div className="space-y-4 pr-4">
                {combinedKeywords.length > 0 ? (
                  <>
                    <div className="flex flex-wrap gap-2">
                      {displayedKeywords.map((item) => {
                        const { keyword, count, type } = item;
                        const isSelected = 
                          type === 'keyword' ? selectedKeywords.includes(keyword) :
                          type === 'landmark' ? selectedLandmarks.includes(keyword) :
                          selectedOrganizations.includes(keyword);
                        
                        const handleClick = () => {
                          if (type === 'keyword') onKeywordToggle(keyword);
                          else if (type === 'landmark') onLandmarkToggle?.(keyword);
                          else onOrganizationToggle?.(keyword);
                        };

                        // Use blue for keywords and organizations, emerald for landmarks
                        const colorClass = type === 'landmark'
                          ? isSelected 
                            ? "bg-emerald-600 text-white shadow-sm dark:bg-emerald-500" 
                            : "bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100 dark:bg-emerald-950/40 dark:text-emerald-200 dark:border-emerald-800/60"
                          : isSelected 
                            ? "bg-blue-600 text-white shadow-sm dark:bg-blue-500" 
                            : "bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-100 dark:bg-blue-950/40 dark:text-blue-200 dark:border-blue-800/60";

                        return (
                          <button
                            key={`${type}-${keyword}`}
                            onClick={handleClick}
                            className={cn(
                              "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition-all",
                              "hover:scale-105 active:scale-95",
                              colorClass
                            )}
                          >
                            <span>{toSentenceCase(keyword)}</span>
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
                              Show {combinedKeywords.length - 10} more
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
                  Click to filter stories. Blue = keywords/organizations, Green = places.
                </p>
              </div>
            </ScrollArea>
          </TabsContent>

          <TabsContent value="sources" className="mt-4">
            <ScrollArea className="h-[60vh]">
              <div className="space-y-4 pr-4">
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
                                ? "bg-amber-600 text-white shadow-sm dark:bg-amber-500" 
                                : "bg-amber-50 text-amber-700 border border-amber-200 hover:bg-amber-100 dark:bg-amber-950/40 dark:text-amber-200 dark:border-amber-800/60"
                            )}
                          >
                            <span>{toTitleCase(source_name)}</span>
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
              </div>
            </ScrollArea>
          </TabsContent>
          
          <TabsContent value="mps" className="mt-4">
            <ScrollArea className="h-[60vh]">
              <div className="space-y-4 pr-4">
                {availableMPs.length > 0 ? (
                  <>
                    <p className="text-sm text-muted-foreground">
                      Filter by MP voting records (last 30 days)
                    </p>
                    <div className="flex flex-col gap-2">
                      {availableMPs.map((mp) => {
                        const isSelected = selectedMPs.includes(mp.mp_name);
                        return (
                          <button
                            key={mp.mp_name}
                            onClick={() => onMPToggle?.(mp.mp_name)}
                            className={cn(
                              "flex flex-col items-start p-3 rounded-lg text-left transition-all",
                              "hover:scale-[1.02] active:scale-[0.98]",
                              isSelected 
                                ? "bg-purple-600 text-white shadow-sm dark:bg-purple-500" 
                                : "bg-purple-50 text-purple-900 border border-purple-200 hover:bg-purple-100 dark:bg-purple-950/40 dark:text-purple-100 dark:border-purple-800/60"
                            )}
                          >
                            <span className="font-medium">{mp.mp_name}</span>
                            <span className={cn("text-xs", isSelected ? "opacity-90" : "opacity-75")}>
                              {mp.mp_party} • {mp.constituency}
                            </span>
                            <span className={cn("text-xs mt-1", isSelected ? "opacity-90" : "opacity-75")}>
                              {mp.count} vote{mp.count !== 1 ? 's' : ''} this month
                            </span>
                          </button>
                        );
                      })}
                    </div>
                    {selectedMPs.length > 0 && (
                      <Button variant="ghost" size="sm" onClick={onClearMPs}>
                        Clear MP filters
                      </Button>
                    )}
                  </>
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    <Users className="w-8 h-8 mx-auto mb-2 opacity-50" />
                    <p>No parliamentary votes recorded yet</p>
                  </div>
                )}
                <p className="text-xs text-muted-foreground text-center">
                  Filter stories by your MP's voting activity in Parliament.
                </p>
              </div>
            </ScrollArea>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
};