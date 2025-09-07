import { useState } from 'react';
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { 
  AlertCircle, 
  ChevronDown, 
  ChevronUp, 
  ExternalLink,
  Clock,
  Merge,
  X
} from "lucide-react";

interface SimilarArticle {
  id: string;
  title: string;
  similarity_score: number;
  detection_reason: string[];
  source_url: string;
  created_at: string;
}

interface SimilarArticleIndicatorProps {
  articleId: string;
  similarArticles: SimilarArticle[];
  onMerge?: (originalId: string, duplicateId: string) => void;
  onIgnore?: (articleId: string, similarId: string) => void;
  onBulkDelete?: (keywords: string[]) => void;
}

export const SimilarArticleIndicator = ({
  articleId,
  similarArticles,
  onMerge,
  onIgnore,
  onBulkDelete
}: SimilarArticleIndicatorProps) => {
  const [isExpanded, setIsExpanded] = useState(false);

  if (similarArticles.length === 0) return null;

  const highSimilarity = similarArticles.filter(a => a.similarity_score > 0.8);
  const mediumSimilarity = similarArticles.filter(a => a.similarity_score > 0.6 && a.similarity_score <= 0.8);

  const getSimilarityColor = (score: number) => {
    if (score > 0.8) return 'text-red-600 bg-red-50 border-red-200';
    if (score > 0.6) return 'text-orange-600 bg-orange-50 border-orange-200';
    return 'text-yellow-600 bg-yellow-50 border-yellow-200';
  };

  const getSimilarityLabel = (score: number) => {
    if (score > 0.8) return 'Very Similar';
    if (score > 0.6) return 'Similar';
    return 'Somewhat Similar';
  };

  const extractCommonKeywords = () => {
    const allReasons = similarArticles.flatMap(a => a.detection_reason);
    const reasonCounts = new Map<string, number>();
    
    allReasons.forEach(reason => {
      reasonCounts.set(reason, (reasonCounts.get(reason) || 0) + 1);
    });
    
    return Array.from(reasonCounts.entries())
      .filter(([_, count]) => count > 1)
      .map(([reason]) => reason);
  };

  const handleBulkDeleteSimilar = () => {
    const commonKeywords = extractCommonKeywords();
    if (commonKeywords.length > 0 && onBulkDelete) {
      onBulkDelete(commonKeywords);
    }
  };

  return (
    <div className="border border-orange-200 rounded-lg p-3 bg-orange-50/50 dark:bg-orange-950/20">
      <Collapsible open={isExpanded} onOpenChange={setIsExpanded}>
        <CollapsibleTrigger asChild>
          <Button
            variant="ghost"
            className="w-full justify-between p-0 h-auto text-left"
          >
            <div className="flex items-center gap-2">
              <AlertCircle className="h-4 w-4 text-orange-600" />
              <span className="font-medium text-sm">
                {similarArticles.length} Similar Article{similarArticles.length !== 1 ? 's' : ''} Found
              </span>
              {highSimilarity.length > 0 && (
                <Badge variant="destructive" className="text-xs px-2 py-0">
                  {highSimilarity.length} very similar
                </Badge>
              )}
            </div>
            {isExpanded ? (
              <ChevronUp className="h-4 w-4" />
            ) : (
              <ChevronDown className="h-4 w-4" />
            )}
          </Button>
        </CollapsibleTrigger>

        <CollapsibleContent className="space-y-3 mt-3">
          {/* Action buttons */}
          <div className="flex gap-2 flex-wrap">
            <Button
              size="sm"
              variant="outline"
              onClick={handleBulkDeleteSimilar}
              className="text-xs"
            >
              <X className="h-3 w-3 mr-1" />
              Delete All Similar
            </Button>
          </div>

          {/* Similar articles list */}
          <div className="space-y-2 max-h-60 overflow-y-auto">
            {similarArticles.map((similar) => (
              <Card key={similar.id} className="border border-gray-200">
                <CardContent className="p-3">
                  <div className="space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <h4 className="text-sm font-medium line-clamp-2 mb-1">
                          {similar.title}
                        </h4>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <Clock className="h-3 w-3" />
                          <span>{new Date(similar.created_at).toLocaleDateString()}</span>
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-1">
                        <Badge 
                          className={`text-xs ${getSimilarityColor(similar.similarity_score)}`}
                        >
                          {Math.round(similar.similarity_score * 100)}% 
                        </Badge>
                        <span className="text-xs text-muted-foreground">
                          {getSimilarityLabel(similar.similarity_score)}
                        </span>
                      </div>
                    </div>

                    {/* Detection reasons */}
                    <div className="flex flex-wrap gap-1">
                      {similar.detection_reason.map((reason, idx) => (
                        <Badge key={idx} variant="secondary" className="text-xs px-2 py-0">
                          {reason}
                        </Badge>
                      ))}
                    </div>

                    {/* Action buttons */}
                    <div className="flex gap-2 pt-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => window.open(similar.source_url, '_blank')}
                        className="text-xs h-7"
                      >
                        <ExternalLink className="h-3 w-3 mr-1" />
                        View
                      </Button>
                      {onMerge && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => onMerge(articleId, similar.id)}
                          className="text-xs h-7"
                        >
                          <Merge className="h-3 w-3 mr-1" />
                          Merge
                        </Button>
                      )}
                      {onIgnore && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => onIgnore(articleId, similar.id)}
                          className="text-xs h-7"
                        >
                          <X className="h-3 w-3 mr-1" />
                          Ignore
                        </Button>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
};