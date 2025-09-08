import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { PlayCircle, Eye, ExternalLink, Trash2, Info, AlertTriangle, FileText, RefreshCw } from "lucide-react";
import { MultiTenantArticle } from "@/hooks/useMultiTenantTopicPipeline";

interface MultiTenantArticlesListProps {
  articles: MultiTenantArticle[];
  processingArticle: string | null;
  deletingArticles: Set<string>;
  onPreview: (article: MultiTenantArticle) => void;
  onApprove: (articleId: string) => void;
  onDelete: (articleId: string, articleTitle: string) => void;
  topicKeywords?: string[];
  topicLandmarks?: string[];
  onRefresh?: () => void;
}

export const MultiTenantArticlesList: React.FC<MultiTenantArticlesListProps> = ({
  articles,
  processingArticle,
  deletingArticles,
  onPreview,
  onApprove,
  onDelete,
  topicKeywords = [],
  topicLandmarks = [],
  onRefresh
}) => {
  // Separate articles by relevance threshold
  const aboveThresholdArticles = articles.filter(article => 
    article.regional_relevance_score >= 25
  );
  const belowThresholdArticles = articles.filter(article => 
    article.regional_relevance_score < 25
  );

  const getRelevanceColor = (score: number) => {
    if (score >= 50) return "text-green-600";
    if (score >= 25) return "text-yellow-600";
    return "text-red-600";
  };

  const getRelevanceLabel = (score: number) => {
    if (score >= 50) return `${score}% relevant (High)`;
    if (score >= 25) return `${score}% relevant (Medium)`;
    if (score >= 20) return `${score}% relevant (Low)`;
    return `${score}% relevant (Very Low)`;
  };

  const getQualityColor = (score: number) => {
    if (score >= 80) return "text-green-600";
    if (score >= 60) return "text-yellow-600";
    return "text-red-600";
  };

  const renderArticleCard = (article: MultiTenantArticle) => {
    const isProcessing = processingArticle === article.id;
    const isDeleting = deletingArticles.has(article.id);
    
    return (
      <Card 
        key={article.id} 
        className={`transition-all duration-300 hover:shadow-md transform-gpu overflow-hidden ${
          isProcessing ? 'opacity-50' : isDeleting ? 'animate-pulse' : 'animate-fade-in opacity-100 scale-100'
        }`}
      >
        <CardHeader className="pb-3">
          <div className="flex justify-between items-start">
            <div className="flex-1 min-w-0 pr-3">
              <CardTitle className="text-lg mb-3 leading-snug break-words hyphens-auto flex items-start gap-2">
                {article.title}
                <Badge variant="outline" className="text-xs bg-blue-100 text-blue-800 border-blue-300">
                  Multi-Tenant
                </Badge>
              </CardTitle>
              
              {/* Keywords */}
              <div className="flex flex-wrap gap-1 mb-3 items-center">
                {(article.keyword_matches || []).slice(0, 3).map((keyword, idx) => (
                  <Badge 
                    key={idx} 
                    variant="secondary"
                    className="text-xs px-2 py-1 bg-blue-100 text-blue-800 border-blue-200"
                  >
                    {keyword}
                  </Badge>
                ))}
                
                {/* Scoring Details Tooltip */}
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Info className="w-3 h-3 text-muted-foreground cursor-help ml-1" />
                    </TooltipTrigger>
                    <TooltipContent side="bottom" className="max-w-xs">
                      <div className="space-y-1 text-xs">
                        <div className="flex justify-between">
                          <span>Relevance:</span>
                          <span className={getRelevanceColor(article.regional_relevance_score)}>
                            {article.regional_relevance_score}%
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span>Quality:</span>
                          <span className={getQualityColor(article.content_quality_score)}>
                            {article.content_quality_score}%
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span>Word Count:</span>
                          <span>{article.word_count}</span>
                        </div>
                        {article.author && (
                          <div className="flex justify-between">
                            <span>Author:</span>
                            <span>{article.author}</span>
                          </div>
                        )}
                      </div>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
             
             <div className="flex items-center gap-2 text-sm text-muted-foreground flex-wrap">
               <span className={getRelevanceColor(article.regional_relevance_score)}>
                 {getRelevanceLabel(article.regional_relevance_score)}
               </span>
               <span className="text-muted-foreground">
                 {article.word_count} words
               </span>
               {article.author && (
                 <span className="text-muted-foreground">
                   by {article.author}
                 </span>
               )}
               {article.regional_relevance_score < 25 && (
                 <Badge variant="destructive" className="text-xs">
                   Below Threshold
                 </Badge>
                )}
              </div>
            </div>
            
            <div className="flex flex-col gap-2 min-w-0">
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => onPreview(article)}
                  className="w-full sm:w-auto"
                >
                  <Eye className="w-4 h-4" />
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => window.open(article.url, '_blank')}
                  className="w-full sm:w-auto"
                >
                  <ExternalLink className="w-4 h-4" />
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => onDelete(article.id, article.title)}
                  disabled={deletingArticles.has(article.id)}
                  className="w-full sm:w-auto"
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
              
              <Button
                onClick={() => onApprove(article.id)}
                disabled={isProcessing || isDeleting}
                className="bg-success text-success-foreground hover:bg-success/90 w-full"
                size="sm"
              >
                <PlayCircle className="w-4 h-4 mr-2" />
                {isProcessing ? 'Processing...' : 'Approve'}
              </Button>
            </div>
          </div>
        </CardHeader>
      </Card>
    );
  };

  if (articles.length === 0) {
    return (
      <div className="text-center py-12">
        <div className="text-muted-foreground mb-4">
          <FileText className="w-12 h-12 mx-auto mb-2 opacity-50" />
          <p className="text-lg font-medium">No Multi-Tenant Articles</p>
          <p className="text-sm">Articles from the new scraping system will appear here</p>
        </div>
        {onRefresh && (
          <Button onClick={onRefresh} variant="outline">
            <RefreshCw className="w-4 h-4 mr-2" />
            Refresh
          </Button>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Above Threshold Articles */}
      {aboveThresholdArticles.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold text-green-600">
              High Quality Articles ({aboveThresholdArticles.length})
            </h3>
            <Badge variant="default" className="bg-green-100 text-green-800">
              Multi-Tenant
            </Badge>
          </div>
          <div className="space-y-4">
            {aboveThresholdArticles.map(renderArticleCard)}
          </div>
        </div>
      )}

      {/* Below Threshold Articles */}
      {belowThresholdArticles.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold text-yellow-600">
              Low Relevance Articles ({belowThresholdArticles.length})
            </h3>
            <Badge variant="outline" className="bg-yellow-100 text-yellow-800">
              Below 25% threshold
            </Badge>
          </div>
          <div className="space-y-4">
            {belowThresholdArticles.map(renderArticleCard)}
          </div>
        </div>
      )}
    </div>
  );
};