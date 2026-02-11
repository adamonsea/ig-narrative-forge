import React, { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { ExternalLink, Eye, Trash2, FileText, RefreshCw, PlayCircle, Shield, CheckCircle, Loader2, Copy, Settings2, CheckSquare } from "lucide-react";
import { MultiTenantArticle } from "@/hooks/useMultiTenantTopicPipeline";
import { getCurrentnessTag, getCurrentnessColor } from "@/lib/dateUtils";
import { DuplicateInfo } from "@/lib/titleSimilarity";

interface MultiTenantArticlesListProps {
  articles: MultiTenantArticle[];
  processingArticle: string | null;
  deletingArticles: Set<string>;
  animatingArticles: Set<string>;
  
  defaultSlideQuantity?: 'short' | 'tabloid' | 'indepth' | 'extensive';
  defaultTone?: 'formal' | 'conversational' | 'engaging' | 'satirical' | 'rhyming_couplet';
  defaultWritingStyle?: 'journalistic' | 'educational' | 'listicle' | 'story_driven';
  
  slideQuantityOverrides?: Record<string, 'short' | 'tabloid' | 'indepth' | 'extensive'>;
  toneOverrides?: Record<string, 'formal' | 'conversational' | 'engaging' | 'satirical' | 'rhyming_couplet'>;  
  writingStyleOverrides?: Record<string, 'journalistic' | 'educational' | 'listicle' | 'story_driven'>;
  
  onSlideQuantityChange: (articleId: string, quantity: 'short' | 'tabloid' | 'indepth' | 'extensive') => void;
  onToneOverrideChange: (articleId: string, tone: 'formal' | 'conversational' | 'engaging' | 'satirical' | 'rhyming_couplet') => void;
  onWritingStyleOverrideChange: (articleId: string, style: 'journalistic' | 'educational' | 'listicle' | 'story_driven') => void;
  
  onPreview?: (article: MultiTenantArticle) => void;
  onApprove: (article: MultiTenantArticle, slideType?: 'short' | 'tabloid' | 'indepth' | 'extensive', tone?: 'formal' | 'conversational' | 'engaging' | 'satirical' | 'rhyming_couplet', writingStyle?: 'journalistic' | 'educational' | 'listicle' | 'story_driven') => void;
  onDelete: (articleId: string, articleTitle: string) => void;
  onDiscardAndSuppress?: (articleId: string, topicId: string, articleUrl: string, articleTitle: string) => void;
  onBulkDelete?: (articleIds: string[]) => void;
  onPromote?: (articleId: string) => void;
  topicId?: string;
  onRefresh?: () => void;
  duplicateMap?: Map<string, DuplicateInfo>;
  
  hasMoreArticles?: boolean;
  totalArticlesCount?: number | null;
  loadingMore?: boolean;
  onLoadMore?: () => void;
}

export default function MultiTenantArticlesList({
  articles,
  processingArticle,
  deletingArticles,
  animatingArticles,
  defaultSlideQuantity = 'tabloid',
  defaultTone = 'conversational',
  defaultWritingStyle = 'journalistic',
  slideQuantityOverrides = {},
  toneOverrides = {},
  writingStyleOverrides = {},
  onSlideQuantityChange,
  onToneOverrideChange,
  onWritingStyleOverrideChange,
  onPreview,
  onApprove,
  onDelete,
  onDiscardAndSuppress,
  onBulkDelete,
  onPromote,
  topicId,
  onRefresh,
  duplicateMap,
  hasMoreArticles = false,
  totalArticlesCount = null,
  loadingMore = false,
  onLoadMore
}: MultiTenantArticlesListProps) {
  const [selectedArticles, setSelectedArticles] = useState<Set<string>>(new Set());
  const [bulkDeleteRelevanceThreshold, setBulkDeleteRelevanceThreshold] = useState(25);
  const [selectMode, setSelectMode] = useState(false);
  const [bulkDeleteCount, setBulkDeleteCount] = useState<number | null>(null);
  const [expandedConfig, setExpandedConfig] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (articles.length === 0) {
      setSelectedArticles(new Set());
      setSelectMode(false);
      setBulkDeleteCount(null);
    }
  }, [articles.length]);

  const getRelevanceColor = (score: number) => {
    if (score >= 50) return "text-green-600 bg-green-50 border-green-200";
    if (score >= 25) return "text-yellow-600 bg-yellow-50 border-yellow-200";
    return "text-red-600 bg-red-50 border-red-200";
  };

  const getRelevanceLabel = (score: number) => {
    if (score >= 50) return `${score}%`;
    if (score >= 25) return `${score}%`;
    return `${score}%`;
  };

  const handleBulkDelete = () => {
    if (selectedArticles.size === 0) return;
    setBulkDeleteCount(selectedArticles.size);
    onBulkDelete?.(Array.from(selectedArticles));
    setSelectedArticles(new Set());
    setSelectMode(false);
    setTimeout(() => setBulkDeleteCount(null), 3000);
  };

  const handleBulkDeleteByRelevance = () => {
    const lowRelevanceIds = articles
      .filter(article => article.regional_relevance_score < bulkDeleteRelevanceThreshold)
      .map(article => article.id);
    if (lowRelevanceIds.length === 0) return;
    setBulkDeleteCount(lowRelevanceIds.length);
    onBulkDelete?.(lowRelevanceIds);
    setTimeout(() => setBulkDeleteCount(null), 3000);
  };

  const handleSelectAll = () => {
    setSelectedArticles(new Set(articles.map(a => a.id)));
  };

  const handleDeselectAll = () => {
    setSelectedArticles(new Set());
  };

  const toggleConfig = (articleId: string) => {
    setExpandedConfig(prev => {
      const next = new Set(prev);
      next.has(articleId) ? next.delete(articleId) : next.add(articleId);
      return next;
    });
  };

  const getSourceDomain = (url: string) => {
    try {
      return new URL(url).hostname.replace('www.', '');
    } catch {
      return '';
    }
  };

  const renderArticleCard = (article: MultiTenantArticle) => {
    const defaultType = article.is_snippet ? 'short' : defaultSlideQuantity;
    const slideType = slideQuantityOverrides[article.id] || defaultType;
    const toneOverride = toneOverrides[article.id] || defaultTone;
    const writingStyleOverride = writingStyleOverrides[article.id] || defaultWritingStyle;
    const isProcessing = processingArticle === article.id;
    const isDeleting = deletingArticles.has(article.id);
    const isAnimating = animatingArticles.has(article.id);
    const dupInfo = duplicateMap?.get(article.id);
    const showConfig = expandedConfig.has(article.id);
    
    return (
      <Card 
        key={article.id} 
        className={`transition-all duration-300 hover:shadow-md ${
          isAnimating ? 'animate-fade-out opacity-0 transform translate-x-4' : 'animate-fade-in'
        } ${dupInfo && !dupInfo.isDuplicateLeader ? 'ml-4 border-l-4 border-l-amber-400' : ''}`}
      >
        <div className="p-4 space-y-2.5">
          {/* Metadata line: source domain, relevance pill, currentness */}
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            {selectMode && (
              <Checkbox
                checked={selectedArticles.has(article.id)}
                onCheckedChange={(checked) => {
                  const newSelected = new Set(selectedArticles);
                  if (checked) newSelected.add(article.id);
                  else newSelected.delete(article.id);
                  setSelectedArticles(newSelected);
                }}
                className="mr-1"
              />
            )}
            <span className="truncate max-w-[140px]">{getSourceDomain(article.url)}</span>
            <div className={`px-1.5 py-0.5 rounded text-xs font-medium border ${getRelevanceColor(article.regional_relevance_score)}`}>
              {getRelevanceLabel(article.regional_relevance_score)}
            </div>
            {article.is_snippet && (
              <Badge variant="outline" className="text-[10px] h-4 px-1 bg-blue-50 text-blue-700 border-blue-200">
                Snippet
              </Badge>
            )}
            <div className={`px-1.5 py-0.5 rounded text-xs border ${getCurrentnessColor(article.published_at, article.created_at)}`}>
              {getCurrentnessTag(article.published_at, article.created_at)}
            </div>
            {dupInfo && (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Badge 
                      variant="outline"
                      className="text-[10px] h-4 px-1 bg-amber-50 text-amber-600 border-amber-200"
                    >
                      <Copy className="w-2.5 h-2.5 mr-0.5" />
                      {dupInfo.isDuplicateLeader ? `${dupInfo.similarCount}` : 'dup'}
                    </Badge>
                  </TooltipTrigger>
                  <TooltipContent className="max-w-xs">
                    <p className="font-semibold mb-1">
                      {dupInfo.isDuplicateLeader ? 'Similar articles:' : 'Similar to:'}
                    </p>
                    {dupInfo.similarTitles.map((t, i) => (
                      <p key={i} className="text-xs truncate">• {t}</p>
                    ))}
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
          </div>

          {/* Headline */}
          <h3 className="font-semibold text-base leading-tight line-clamp-2">
            {article.title}
          </h3>

          {/* Author */}
          {article.author && (
            <p className="text-sm text-muted-foreground">by {article.author}</p>
          )}

          {/* Keywords */}
          {(article.keyword_matches || []).length > 0 && (
            <div className="flex flex-wrap gap-1">
              {(article.keyword_matches || []).slice(0, 4).map((keyword, idx) => (
                <Badge key={idx} variant="secondary" className="text-xs">
                  {keyword}
                </Badge>
              ))}
            </div>
          )}

          {/* Configure expansion */}
          {showConfig && (
            <div className="flex gap-2 pt-1">
              <Select
                value={slideType}
                onValueChange={(value: 'short' | 'tabloid' | 'indepth' | 'extensive') => 
                  onSlideQuantityChange(article.id, value)
                }
              >
                <SelectTrigger className="w-16 h-7 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="short">3</SelectItem>
                  <SelectItem value="tabloid">6</SelectItem>
                  <SelectItem value="indepth">8</SelectItem>
                  <SelectItem value="extensive">12</SelectItem>
                </SelectContent>
              </Select>
              <Select
                value={toneOverride}
                onValueChange={(value: 'formal' | 'conversational' | 'engaging' | 'satirical' | 'rhyming_couplet') => 
                  onToneOverrideChange(article.id, value)
                }
              >
                <SelectTrigger className="w-24 h-7 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="formal">Formal</SelectItem>
                  <SelectItem value="conversational">Conversational</SelectItem>
                  <SelectItem value="engaging">Engaging</SelectItem>
                  <SelectItem value="satirical">Satirical</SelectItem>
                  <SelectItem value="rhyming_couplet">Rhyming</SelectItem>
                </SelectContent>
              </Select>
              <Select
                value={writingStyleOverride}
                onValueChange={(value: 'journalistic' | 'educational' | 'listicle' | 'story_driven') => 
                  onWritingStyleOverrideChange(article.id, value)
                }
              >
                <SelectTrigger className="w-28 h-7 text-xs">
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
          )}

          {/* Action bar */}
          <div className="flex items-center gap-1.5 pt-1 border-t border-border/40">
            <Button
              onClick={() => onApprove(article, slideType, toneOverride, writingStyleOverride)}
              disabled={isProcessing || isDeleting}
              size="sm"
              className="h-7 text-xs"
            >
              {isProcessing ? (
                <Loader2 className="w-3 h-3 mr-1 animate-spin" />
              ) : (
                <PlayCircle className="w-3 h-3 mr-1" />
              )}
              Simplify
            </Button>

            <Button
              size="sm"
              variant="ghost"
              onClick={() => toggleConfig(article.id)}
              className="h-7 w-7 p-0"
              title="Configure"
            >
              <Settings2 className="w-3.5 h-3.5" />
            </Button>

            <div className="ml-auto flex items-center gap-1">
              {onPreview && (
                <Button size="sm" variant="ghost" onClick={() => onPreview(article)} className="h-7 w-7 p-0" title="Preview">
                  <Eye className="w-3.5 h-3.5" />
                </Button>
              )}
              <Button size="sm" variant="ghost" onClick={() => window.open(article.url, '_blank')} className="h-7 w-7 p-0" title="Source">
                <ExternalLink className="w-3.5 h-3.5" />
              </Button>
              {onDiscardAndSuppress && topicId && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => onDiscardAndSuppress(article.id, topicId, article.url, article.title)}
                  disabled={isDeleting}
                  className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                  title="Suppress"
                >
                  <Shield className="w-3.5 h-3.5" />
                </Button>
              )}
              <Button
                size="sm"
                variant="ghost"
                onClick={() => onDelete(article.id, article.title)}
                disabled={isDeleting}
                className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                title="Delete"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </Button>
            </div>
          </div>
        </div>
      </Card>
    );
  };

  // Success message for bulk delete
  if (bulkDeleteCount !== null && articles.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
        <div className="w-16 h-16 rounded-full bg-green-50 flex items-center justify-center mb-4">
          <CheckCircle className="w-8 h-8 text-green-600" />
        </div>
        <h3 className="text-lg font-semibold text-foreground mb-2">
          Articles Deleted Successfully
        </h3>
        <p className="text-muted-foreground mb-6 max-w-md">
          {bulkDeleteCount} article{bulkDeleteCount !== 1 ? 's' : ''} deleted successfully.
        </p>
        <Button onClick={onRefresh} variant="outline" className="gap-2">
          <RefreshCw className="w-4 h-4" />
          Gather More Content
        </Button>
      </div>
    );
  }

  // Empty state
  if (articles.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
        <div className="w-16 h-16 rounded-full bg-muted/50 flex items-center justify-center mb-4">
          <FileText className="w-8 h-8 text-muted-foreground" />
        </div>
        <h3 className="text-lg font-semibold text-foreground mb-2">
          No Articles Available
        </h3>
        <p className="text-muted-foreground mb-6 max-w-md">
          No new articles have been discovered yet.
        </p>
        <Button onClick={onRefresh} variant="outline" className="gap-2">
          <RefreshCw className="w-4 h-4" />
          Refresh
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Header toolbar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant={selectMode ? "default" : "outline"}
            onClick={() => {
              setSelectMode(!selectMode);
              if (selectMode) {
                setSelectedArticles(new Set());
              }
            }}
            className="h-7 text-xs gap-1.5"
          >
            <CheckSquare className="w-3 h-3" />
            Select
          </Button>
          {totalArticlesCount !== null && totalArticlesCount > 0 && (
            <span className="text-xs text-muted-foreground">
              {articles.length} of {totalArticlesCount}
            </span>
          )}
        </div>
      </div>

      {/* Bulk action toolbar - only in select mode */}
      {selectMode && (
        <div className="flex items-center justify-between flex-wrap gap-3 p-3 rounded-lg border border-border/60 bg-muted/10">
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium">
              {selectedArticles.size} selected
            </span>
            <Button size="sm" variant="ghost" onClick={handleSelectAll} className="h-6 text-xs px-2">
              All ({articles.length})
            </Button>
            <Button size="sm" variant="ghost" onClick={handleDeselectAll} className="h-6 text-xs px-2">
              None
            </Button>
          </div>
          <div className="flex items-center gap-2">
            <Select value={bulkDeleteRelevanceThreshold.toString()} onValueChange={(value) => setBulkDeleteRelevanceThreshold(Number(value))}>
              <SelectTrigger className="w-16 h-7 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="10">10%</SelectItem>
                <SelectItem value="25">25%</SelectItem>
                <SelectItem value="50">50%</SelectItem>
                <SelectItem value="75">75%</SelectItem>
              </SelectContent>
            </Select>
            <Button size="sm" variant="destructive" onClick={handleBulkDeleteByRelevance} className="h-7 text-xs">
              Delete below ({articles.filter(a => a.regional_relevance_score < bulkDeleteRelevanceThreshold).length})
            </Button>
            <Button 
              size="sm" 
              variant="destructive" 
              onClick={handleBulkDelete}
              disabled={selectedArticles.size === 0}
              className="h-7 text-xs"
            >
              Delete selected ({selectedArticles.size})
            </Button>
          </div>
        </div>
      )}
      
      {articles.map((article) => renderArticleCard(article))}
      
      {/* Load more button */}
      {hasMoreArticles && onLoadMore && (
        <div className="pt-2">
          <Button 
            onClick={onLoadMore} 
            variant="outline" 
            className="w-full gap-2 h-8 text-xs"
            disabled={loadingMore}
          >
            {loadingMore ? (
              <>
                <Loader2 className="w-3 h-3 animate-spin" />
                Loading...
              </>
            ) : (
              <>
                <RefreshCw className="w-3 h-3" />
                Load More {totalArticlesCount !== null && articles.length < totalArticlesCount 
                  ? `(${totalArticlesCount - articles.length} remaining)` 
                  : ''}
              </>
            )}
          </Button>
        </div>
      )}
    </div>
  );
}
