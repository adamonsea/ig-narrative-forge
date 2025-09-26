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

          {/* Keywords grid */}
          <div className="grid grid-cols-1 gap-2 max-h-80 overflow-y-auto">
            {availableKeywords.length > 0 ? (
              availableKeywords.map(({ keyword, count }) => {
                const isSelected = selectedKeywords.includes(keyword);
                return (
                  <button
                    key={keyword}
                    onClick={() => onKeywordToggle(keyword)}
                    className={cn(
                      "flex items-center justify-between p-3 rounded-lg border text-left transition-all",
                      "hover:bg-muted/50 active:scale-[0.98]",
                      isSelected && "bg-primary/10 border-primary text-primary"
                    )}
                  >
                    <span className="font-medium capitalize">{keyword}</span>
                    <Badge 
                      variant={isSelected ? "default" : "secondary"}
                      className="ml-2 text-xs"
                    >
                      {count > 999 ? 'topic' : count}
                    </Badge>
                  </button>
                );
              })
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                <Hash className="w-8 h-8 mx-auto mb-2 opacity-50" />
                <p>No keywords found in current stories</p>
              </div>
            )}
          </div>

          {/* Help text */}
          <p className="text-xs text-muted-foreground text-center">
            Keywords are extracted from story titles and content. Only keywords appearing 3+ times are shown.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
};