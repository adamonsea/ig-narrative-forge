import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Hash, Globe, MapPin, Building, ChevronDown, ChevronUp } from "lucide-react";
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
  availableLandmarks: KeywordCount[];
  selectedLandmarks: string[];
  onLandmarkToggle: (landmark: string) => void;
  availableOrganizations?: KeywordCount[];
  selectedOrganizations?: string[];
  onOrganizationToggle?: (organization: string) => void;
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
  availableLandmarks,
  selectedLandmarks,
  onLandmarkToggle,
  availableOrganizations = [],
  selectedOrganizations = [],
  onOrganizationToggle,
  availableSources,
  selectedSources,
  onSourceToggle,
  onClearAll
}: FilterModalProps) => {
  const totalSelected = selectedKeywords.length + selectedLandmarks.length + selectedOrganizations.length + selectedSources.length;

  const [showAllKeywords, setShowAllKeywords] = useState(false);
  const [showAllLandmarks, setShowAllLandmarks] = useState(false);
  const [showAllOrganizations, setShowAllOrganizations] = useState(false);
  const [showAllSources, setShowAllSources] = useState(false);

  // Keywords processing
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

  // Landmarks processing
  const sortedLandmarks = useMemo(
    () => [...availableLandmarks].sort((a, b) => b.count - a.count),
    [availableLandmarks]
  );
  const displayedLandmarks = showAllLandmarks ? sortedLandmarks : sortedLandmarks.slice(0, 10);
  const hasMoreLandmarks = sortedLandmarks.length > 10;

  // Organizations processing
  const sortedOrganizations = useMemo(
    () => [...availableOrganizations].sort((a, b) => b.count - a.count),
    [availableOrganizations]
  );
  const displayedOrganizations = showAllOrganizations ? sortedOrganizations : sortedOrganizations.slice(0, 10);
  const hasMoreOrganizations = sortedOrganizations.length > 10;

  // Sources processing
  const sortedSources = useMemo(
    () => [...availableSources].sort((a, b) => b.count - a.count),
    [availableSources]
  );
  const displayedSources = showAllSources ? sortedSources : sortedSources.slice(0, 10);
  const hasMoreSources = sortedSources.length > 10;

  const numTabs = 2 + (availableLandmarks.length > 0 ? 1 : 0) + (availableOrganizations.length > 0 ? 1 : 0);

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
          <TabsList className={cn(
            "grid w-full",
            numTabs === 2 && "grid-cols-2",
            numTabs === 3 && "grid-cols-3",
            numTabs === 4 && "grid-cols-4"
          )}>
            <TabsTrigger value="keywords" className="flex items-center gap-2">
              <Hash className="w-4 h-4" />
              <span className="hidden sm:inline">Keywords</span>
              {selectedKeywords.length > 0 && (
                <Badge variant="secondary" className="ml-1 h-5 px-1.5 text-xs">
                  {selectedKeywords.length}
                </Badge>
              )}
            </TabsTrigger>
            {availableLandmarks.length > 0 && (
              <TabsTrigger value="landmarks" className="flex items-center gap-2">
                <MapPin className="w-4 h-4" />
                <span className="hidden sm:inline">Locations</span>
                {selectedLandmarks.length > 0 && (
                  <Badge variant="secondary" className="ml-1 h-5 px-1.5 text-xs">
                    {selectedLandmarks.length}
                  </Badge>
                )}
              </TabsTrigger>
            )}
            {availableOrganizations.length > 0 && onOrganizationToggle && (
              <TabsTrigger value="organizations" className="flex items-center gap-2">
                <Building className="w-4 h-4" />
                <span className="hidden sm:inline">Orgs</span>
                {selectedOrganizations.length > 0 && (
                  <Badge variant="secondary" className="ml-1 h-5 px-1.5 text-xs">
                    {selectedOrganizations.length}
                  </Badge>
                )}
              </TabsTrigger>
            )}
            <TabsTrigger value="sources" className="flex items-center gap-2">
              <Globe className="w-4 h-4" />
              <span className="hidden sm:inline">Sources</span>
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
                            ? "bg-blue-600 text-white shadow-sm dark:bg-blue-500" 
                            : "bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-100 dark:bg-blue-950/40 dark:text-blue-200 dark:border-blue-800/60"
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

          <TabsContent value="landmarks" className="mt-4 space-y-4">
            {sortedLandmarks.length > 0 ? (
              <>
                <div className="flex flex-wrap gap-2">
                  {displayedLandmarks.map(({ keyword, count }) => {
                    const isSelected = selectedLandmarks.includes(keyword);
                    return (
                      <button
                        key={keyword}
                        onClick={() => onLandmarkToggle(keyword)}
                        className={cn(
                          "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition-all",
                          "hover:scale-105 active:scale-95",
                          isSelected 
                            ? "bg-emerald-600 text-white shadow-sm dark:bg-emerald-500" 
                            : "bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100 dark:bg-emerald-950/40 dark:text-emerald-200 dark:border-emerald-800/60"
                        )}
                      >
                        <span>{keyword}</span>
                        <span className="text-xs opacity-70">({count})</span>
                      </button>
                    );
                  })}
                </div>
                {hasMoreLandmarks && (
                  <div className="flex justify-center">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setShowAllLandmarks(!showAllLandmarks)}
                      className="text-xs"
                    >
                      {showAllLandmarks ? (
                        <>
                          <ChevronUp className="w-3 h-3 mr-1" />
                          Show less
                        </>
                      ) : (
                        <>
                          <ChevronDown className="w-3 h-3 mr-1" />
                          Show {sortedLandmarks.length - 10} more locations
                        </>
                      )}
                    </Button>
                  </div>
                )}
              </>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                <MapPin className="w-8 h-8 mx-auto mb-2 opacity-50" />
                <p>No locations found</p>
              </div>
            )}
            <p className="text-xs text-muted-foreground text-center">
              Click locations to filter stories. Numbers show story count.
            </p>
          </TabsContent>

          {availableOrganizations.length > 0 && onOrganizationToggle && (
            <TabsContent value="organizations" className="mt-4 space-y-4">
              {sortedOrganizations.length > 0 ? (
                <>
                  <div className="flex flex-wrap gap-2">
                    {displayedOrganizations.map(({ keyword, count }) => {
                      const isSelected = selectedOrganizations.includes(keyword);
                      return (
                        <button
                          key={keyword}
                          onClick={() => onOrganizationToggle(keyword)}
                          className={cn(
                            "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition-all",
                            "hover:scale-105 active:scale-95",
                            isSelected 
                              ? "bg-purple-600 text-white shadow-sm dark:bg-purple-500" 
                              : "bg-purple-50 text-purple-700 border border-purple-200 hover:bg-purple-100 dark:bg-purple-950/40 dark:text-purple-200 dark:border-purple-800/60"
                          )}
                        >
                          <span>{keyword}</span>
                          <span className="text-xs opacity-70">({count})</span>
                        </button>
                      );
                    })}
                  </div>
                  {hasMoreOrganizations && (
                    <div className="flex justify-center">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setShowAllOrganizations(!showAllOrganizations)}
                        className="text-xs"
                      >
                        {showAllOrganizations ? (
                          <>
                            <ChevronUp className="w-3 h-3 mr-1" />
                            Show less
                          </>
                        ) : (
                          <>
                            <ChevronDown className="w-3 h-3 mr-1" />
                            Show {sortedOrganizations.length - 10} more organizations
                          </>
                        )}
                      </Button>
                    </div>
                  )}
                </>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <Building className="w-8 h-8 mx-auto mb-2 opacity-50" />
                  <p>No organizations found</p>
                </div>
              )}
              <p className="text-xs text-muted-foreground text-center">
                Click organizations to filter stories. Numbers show story count.
              </p>
            </TabsContent>
          )}

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
                            ? "bg-amber-600 text-white shadow-sm dark:bg-amber-500" 
                            : "bg-amber-50 text-amber-700 border border-amber-200 hover:bg-amber-100 dark:bg-amber-950/40 dark:text-amber-200 dark:border-amber-800/60"
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