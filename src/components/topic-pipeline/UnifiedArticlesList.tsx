import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { PlayCircle, Eye, ExternalLink, Trash2, Info, AlertTriangle, FileText, RefreshCw, CheckSquare, Square, Shield } from "lucide-react";
import { SimilarArticleIndicator } from "@/components/SimilarArticleIndicator";
import { SimpleBulkDeleteDialog } from "@/components/ui/simple-bulk-delete-dialog";
import { MultiTenantArticle } from "@/hooks/useMultiTenantTopicPipeline";

interface UnifiedArticlesListProps {
  articles: MultiTenantArticle[];
  processingArticle: string | null;
  deletingArticles: Set<string>;
  animatingArticles: Set<string>;
  slideQuantities: { [key: string]: 'short' | 'tabloid' | 'indepth' | 'extensive' };
  toneOverrides: { [key: string]: 'formal' | 'conversational' | 'engaging' | 'satirical' };
  writingStyleOverrides: { [key: string]: 'journalistic' | 'educational' | 'listicle' | 'story_driven' };
  onSlideQuantityChange: (articleId: string, quantity: 'short' | 'tabloid' | 'indepth' | 'extensive') => void;
  onToneOverrideChange: (articleId: string, tone: 'formal' | 'conversational' | 'engaging' | 'satirical') => void;
  onWritingStyleOverrideChange: (articleId: string, style: 'journalistic' | 'educational' | 'listicle' | 'story_driven') => void;
  onPreview: (article: MultiTenantArticle) => void;
  onApprove: (articleId: string, slideType: 'short' | 'tabloid' | 'indepth' | 'extensive', tone: 'formal' | 'conversational' | 'engaging' | 'satirical', writingStyle: 'journalistic' | 'educational' | 'listicle' | 'story_driven') => void;
  onDelete: (articleId: string, articleTitle: string) => void;
  onDiscardAndSuppress?: (articleId: string, topicId: string, articleUrl: string, articleTitle: string) => void;
  onBulkDelete: (articleIds: string[]) => void;
  defaultTone: 'formal' | 'conversational' | 'engaging' | 'satirical';
  defaultWritingStyle: 'journalistic' | 'educational' | 'listicle' | 'story_driven';
  topicKeywords?: string[];
  topicLandmarks?: string[];
  topicId?: string;
  onRefresh?: () => void;
}

export const UnifiedArticlesList: React.FC<UnifiedArticlesListProps> = ({
  articles,
  processingArticle,
  deletingArticles,
  animatingArticles,
  slideQuantities,
  toneOverrides,
  writingStyleOverrides,
  onSlideQuantityChange,
  onToneOverrideChange,
  onWritingStyleOverrideChange,
  onPreview,
  onApprove,
  onDelete,
  onDiscardAndSuppress,
  onBulkDelete,
  defaultTone,
  defaultWritingStyle,
  topicKeywords = [],
  topicLandmarks = [],
  topicId,
  onRefresh
}) => {
  const [selectedArticles, setSelectedArticles] = useState<Set<string>>(new Set());
  const [showBulkDeleteDialog, setShowBulkDeleteDialog] = useState(false);

  // Filter out articles that are being animated away (immediate removal from UI)
  const visibleArticles = articles.filter(article => !animatingArticles.has(article.id));

  // Bulk selection handlers
  const handleSelectAll = () => {
    if (selectedArticles.size === visibleArticles.length) {
      setSelectedArticles(new Set());
    } else {
      setSelectedArticles(new Set(visibleArticles.map(a => a.id)));
    }
  };

  const handleSelectArticle = (articleId: string) => {
    const newSelected = new Set(selectedArticles);
    if (newSelected.has(articleId)) {
      newSelected.delete(articleId);
    } else {
      newSelected.add(articleId);
    }
    setSelectedArticles(newSelected);
  };

  const handleBulkDeleteConfirm = () => {
    const selectedIds = Array.from(selectedArticles);
    onBulkDelete(selectedIds);
    setSelectedArticles(new Set());
    setShowBulkDeleteDialog(false);
  };

  // Separate articles by relevance threshold (matching legacy design)
  const aboveThresholdArticles = visibleArticles.filter(article => 
    article.regional_relevance_score >= 25
  );
  const belowThresholdArticles = visibleArticles.filter(article => 
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

  const getSlideTypeInfo = (type: string) => {
    const types = {
      short: { slides: 4, desc: 'Quick read' },
      tabloid: { slides: 6, desc: 'Standard' },
      indepth: { slides: 8, desc: 'Detailed' },
      extensive: { slides: 12, desc: 'Comprehensive' }
    };
    
    return types[type as keyof typeof types];
  };

  const getRelevantKeywords = (article: MultiTenantArticle) => {
    // Use keyword matches from the article
    return (article.keyword_matches || []).slice(0, 5).map(keyword => ({
      text: keyword,
      type: 'keyword' as const
    }));
  };

  const renderArticleCard = (article: MultiTenantArticle) => {
    const slideType = slideQuantities[article.id] || 'tabloid';
    const slideInfo = getSlideTypeInfo(slideType);
    const toneOverride = toneOverrides[article.id] || defaultTone;
    const writingStyleOverride = writingStyleOverrides[article.id] || defaultWritingStyle;
    const isProcessing = processingArticle === article.id;
    const isDeleting = deletingArticles.has(article.id);
    const isAnimatingAway = animatingArticles.has(article.id);
    const isSelected = selectedArticles.has(article.id);
    
    return (
      <Card 
        key={article.id} 
        className={`transition-all duration-300 hover:shadow-md transform-gpu overflow-hidden ${
          isProcessing && isAnimatingAway
            ? 'animate-slide-out-right'
            : isDeleting && isAnimatingAway
            ? 'animate-discard'
            : isSelected 
            ? 'border-primary bg-primary/5' 
            : 'animate-fade-in opacity-100 scale-100'
        }`}
        style={{
          animationFillMode: 'forwards'
        }}
      >
        <CardHeader className="pb-3">
          <div className="flex justify-between items-start">
            <div className="flex-1 min-w-0 pr-3">
              <div className="flex items-start gap-2 mb-3">
                <Checkbox
                  checked={isSelected}
                  onCheckedChange={() => handleSelectArticle(article.id)}
                  className="mt-1"
                />
                <CardTitle className="text-lg leading-snug break-words hyphens-auto flex items-start gap-2 flex-1">
                  {article.title}
                </CardTitle>
              </div>
              
              {/* Keywords matching legacy design */}
              <div className="flex flex-wrap gap-1 mb-3 items-center">
                {getRelevantKeywords(article).map((keyword, idx) => (
                  <Badge 
                    key={idx} 
                    variant="secondary"
                    className="text-xs px-2 py-1 bg-blue-100 text-blue-800 border-blue-200"
                  >
                    {keyword.text}
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
                  <Eye className="w-4 h-4 sm:mr-0" />
                  <span className="ml-2 sm:hidden">Preview</span>
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => window.open(article.url, '_blank')}
                  className="w-full sm:w-auto"
                >
                  <ExternalLink className="w-4 h-4 sm:mr-0" />
                  <span className="ml-2 sm:hidden">Source</span>
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => onDelete(article.id, article.title)}
                  disabled={deletingArticles.has(article.id)}
                  className="w-full sm:w-auto"
                >
                  <Trash2 className="w-4 h-4 sm:mr-0" />
                  <span className="ml-2 sm:hidden">Delete</span>
                </Button>
                {onDiscardAndSuppress && topicId && (
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={() => onDiscardAndSuppress(article.id, topicId, article.url, article.title)}
                    disabled={deletingArticles.has(article.id)}
                    className="w-full sm:w-auto"
                  >
                    <Shield className="w-4 h-4 sm:mr-0" />
                    <span className="ml-2 sm:hidden">Suppress</span>
                  </Button>
                )}
              </div>
              
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                <div className="text-xs">
                  <Select
                    value={slideType}
                    onValueChange={(value: 'short' | 'tabloid' | 'indepth' | 'extensive') => 
                      onSlideQuantityChange(article.id, value)
                    }
                  >
                    <SelectTrigger className="w-full sm:w-28 h-8">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="short">4 slides</SelectItem>
                      <SelectItem value="tabloid">6 slides</SelectItem>
                      <SelectItem value="indepth">8 slides</SelectItem>
                      <SelectItem value="extensive">12 slides</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                
                <div className="text-xs">
                  <Select
                    value={toneOverride}
                    onValueChange={(value: 'formal' | 'conversational' | 'engaging' | 'satirical') => 
                      onToneOverrideChange(article.id, value)
                    }
                  >
                    <SelectTrigger className="w-full sm:w-32 h-8">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="formal">Formal</SelectItem>
                      <SelectItem value="conversational">Conversational</SelectItem>
                      <SelectItem value="engaging">Engaging</SelectItem>
                      <SelectItem value="satirical">Satirical ⚡</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                
                <div className="text-xs">
                  <Select
                    value={writingStyleOverride}
                    onValueChange={(value: 'journalistic' | 'educational' | 'listicle' | 'story_driven') => 
                      onWritingStyleOverrideChange(article.id, value)
                    }
                  >
                    <SelectTrigger className="w-full sm:w-32 h-8">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="journalistic">Journalistic</SelectItem>
                      <SelectItem value="educational">Educational</SelectItem>
                      <SelectItem value="listicle">Listicle</SelectItem>
                      <SelectItem value="story_driven">Story-driven</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

                <Button
                  onClick={() => onApprove(
                    article.id, 
                    slideType, 
                    toneOverride, 
                    writingStyleOverride
                  )}
                  disabled={isProcessing || isDeleting}
                  className={`w-full ${
                    isProcessing 
                      ? 'bg-blue-500 text-white animate-pulse' 
                      : 'bg-success text-success-foreground hover:bg-success/90'
                  }`}
                  size="sm"
                >
                  {isProcessing ? (
                    <>
                      <div className="w-4 h-4 mr-2 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      Processing...
                    </>
                  ) : (
                    <>
                      <PlayCircle className="w-4 h-4 mr-2" />
                      {article.processing_status === 'processed' 
                        ? 'Approve'
                        : 'Simplify'
                      }
                    </>
                  )}
                </Button>
            </div>
          </div>
        </CardHeader>
      </Card>
    );
  };

  if (visibleArticles.length === 0) {
    return (
      <div className="text-center py-12">
        <div className="text-muted-foreground mb-4">
          <FileText className="w-12 h-12 mx-auto mb-2 opacity-50" />
          <p className="text-lg font-medium">No Articles Found</p>
          <p className="text-sm">Articles will appear here when scraped</p>
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
      {/* Bulk Operations Toolbar */}
      {visibleArticles.length > 0 && (
        <div className="flex items-center justify-between bg-muted/50 p-4 rounded-lg">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <Checkbox
                checked={selectedArticles.size === visibleArticles.length && visibleArticles.length > 0}
                onCheckedChange={handleSelectAll}
              />
              <span className="text-sm font-medium">
                Select All ({selectedArticles.size} of {visibleArticles.length})
              </span>
            </div>
            
            {selectedArticles.size > 0 && (
              <Button
                variant="destructive"
                size="sm"
                onClick={() => setShowBulkDeleteDialog(true)}
              >
                <Trash2 className="w-4 h-4 mr-2" />
                Delete Selected ({selectedArticles.size})
              </Button>
            )}
          </div>
        </div>
      )}

      {/* Above Threshold Articles */}
      {aboveThresholdArticles.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold text-green-600">
              High Quality Articles ({aboveThresholdArticles.length})
            </h3>
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

      {/* Bulk Delete Dialog */}
      <SimpleBulkDeleteDialog
        isOpen={showBulkDeleteDialog}
        onClose={() => setShowBulkDeleteDialog(false)}
        onConfirm={handleBulkDeleteConfirm}
        selectedCount={selectedArticles.size}
      />
    </div>
  );
};