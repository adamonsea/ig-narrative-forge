import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { X, Hash } from "lucide-react";
import { cn } from "@/lib/utils";

interface KeywordCount {
  keyword: string;
  count: number;
}

interface KeywordFilterModalProps {
  isOpen: boolean;
  onClose: () => void;
  availableKeywords: KeywordCount[];
  selectedKeywords: string[];
  onKeywordToggle: (keyword: string) => void;
  onClearAll: () => void;
}

export const KeywordFilterModal = ({
  isOpen,
  onClose,
  availableKeywords,
  selectedKeywords,
  onKeywordToggle,
  onClearAll
}: KeywordFilterModalProps) => {
  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Hash className="w-4 h-4" />
            Filter by Keywords
          </DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4">
          {/* Clear all button */}
          {selectedKeywords.length > 0 && (
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">
                {selectedKeywords.length} keyword{selectedKeywords.length !== 1 ? 's' : ''} selected
              </span>
              <Button variant="outline" size="sm" onClick={onClearAll}>
                Clear all
              </Button>
            </div>
          )}

          {/* Keywords as minimalist pill-shaped tabs */}
          {availableKeywords.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {availableKeywords
                .filter(({ keyword }) => keyword.length > 2) // Filter out very short keywords
                .slice(0, 20) // Show top 20 keywords
                .map(({ keyword, count }) => {
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
                })
              }
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <Hash className="w-8 h-8 mx-auto mb-2 opacity-50" />
              <p>No keywords found in current stories</p>
              <p className="text-xs mt-2">Keywords will appear as stories are loaded</p>
            </div>
          )}

          {/* Help text */}
          <p className="text-xs text-muted-foreground text-center">
            Click keywords to filter stories. Numbers show how many stories contain each keyword.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
};