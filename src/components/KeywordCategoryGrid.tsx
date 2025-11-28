import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { Sparkles, MapPin, Target, Search } from "lucide-react";

interface GeneratedKeyword {
  keyword: string;
  category: 'core' | 'local' | 'niche' | 'discovery';
  confidence: number;
  rationale: string;
  preSelected: boolean;
}

interface KeywordCategoryGridProps {
  keywords: GeneratedKeyword[];
  selectedKeywords: Set<string>;
  onToggleKeyword: (keyword: string) => void;
  searchFilter?: string;
}

const categoryConfig = {
  core: {
    icon: Sparkles,
    label: "Core Topics",
    color: "text-accent-green",
    bgColor: "bg-accent-green/10",
    borderColor: "border-accent-green/20",
  },
  local: {
    icon: MapPin,
    label: "Local Context",
    color: "text-accent-purple",
    bgColor: "bg-accent-purple/10",
    borderColor: "border-accent-purple/20",
  },
  niche: {
    icon: Target,
    label: "Niche Focus",
    color: "text-accent-cyan",
    bgColor: "bg-accent-cyan/10",
    borderColor: "border-accent-cyan/20",
  },
  discovery: {
    icon: Search,
    label: "Discovery",
    color: "text-accent-orange",
    bgColor: "bg-accent-orange/10",
    borderColor: "border-accent-orange/20",
  },
};

export const KeywordCategoryGrid = ({
  keywords,
  selectedKeywords,
  onToggleKeyword,
  searchFilter = '',
}: KeywordCategoryGridProps) => {
  const categories = ['core', 'local', 'niche', 'discovery'] as const;

  const filteredKeywordsByCategory = categories.map(category => {
    const categoryKeywords = keywords.filter(k => {
      const matchesCategory = k.category === category;
      const matchesSearch = searchFilter === '' || 
        k.keyword.toLowerCase().includes(searchFilter.toLowerCase());
      return matchesCategory && matchesSearch;
    });

    return {
      category,
      keywords: categoryKeywords,
      ...categoryConfig[category],
    };
  }).filter(group => group.keywords.length > 0);

  return (
    <div className="space-y-6">
      {filteredKeywordsByCategory.map(({ category, keywords: categoryKeywords, icon: Icon, label, color, bgColor, borderColor }) => (
        <div key={category} className="space-y-3">
          <div className="flex items-center gap-2">
            <Icon className={cn("w-4 h-4", color)} />
            <h4 className="font-semibold text-sm">{label}</h4>
            <Badge variant="secondary" className="text-xs">
              {categoryKeywords.length}
            </Badge>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {categoryKeywords.map((kw) => {
              const isSelected = selectedKeywords.has(kw.keyword);
              
              return (
                <TooltipProvider key={kw.keyword}>
                  <Tooltip delayDuration={300}>
                    <TooltipTrigger asChild>
                      <label
                        className={cn(
                          "flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-all duration-200",
                          "hover:shadow-sm",
                          isSelected ? cn(bgColor, borderColor, "shadow-sm") : "bg-background border-border/50",
                          "animate-in fade-in slide-in-from-bottom-2 duration-300"
                        )}
                      >
                        <Checkbox
                          checked={isSelected}
                          onCheckedChange={() => onToggleKeyword(kw.keyword)}
                          className="mt-0.5"
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-sm truncate">{kw.keyword}</span>
                            <span className={cn("text-xs", color)}>
                              {Math.round(kw.confidence * 100)}%
                            </span>
                          </div>
                          <p className="text-xs text-muted-foreground line-clamp-1 mt-0.5">
                            {kw.rationale}
                          </p>
                        </div>
                      </label>
                    </TooltipTrigger>
                    <TooltipContent side="top" className="max-w-xs">
                      <p className="text-sm">{kw.rationale}</p>
                      <div className="flex items-center gap-2 mt-2 text-xs text-muted-foreground">
                        <Badge variant="outline" className="text-xs">
                          {Math.round(kw.confidence * 100)}% match
                        </Badge>
                        <span>•</span>
                        <span className="capitalize">{category}</span>
                      </div>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              );
            })}
          </div>
        </div>
      ))}

      {filteredKeywordsByCategory.length === 0 && (
        <div className="text-center py-8 text-muted-foreground">
          <Search className="w-8 h-8 mx-auto mb-2 opacity-50" />
          <p>No keywords match your search</p>
        </div>
      )}
    </div>
  );
};
