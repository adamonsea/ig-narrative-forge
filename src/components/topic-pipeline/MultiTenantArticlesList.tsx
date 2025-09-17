import React, { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { ExternalLink, Eye, Trash2, ArrowRight, FileText, RefreshCw, PlayCircle, Shield } from "lucide-react";
import { MultiTenantArticle } from "@/hooks/useMultiTenantTopicPipeline";
import { getCurrentnessTag, getCurrentnessColor } from "@/lib/dateUtils";

interface MultiTenantArticlesListProps {
  articles: MultiTenantArticle[];
  processingArticle: string | null;
  deletingArticles: Set<string>;
  animatingArticles: Set<string>;
  
  // Configuration defaults (from topic settings)
  defaultSlideQuantity?: 'short' | 'tabloid' | 'indepth' | 'extensive';
  defaultTone?: 'formal' | 'conversational' | 'engaging';
  defaultWritingStyle?: 'journalistic' | 'educational' | 'listicle' | 'story_driven';
  
  // Individual overrides (user selections per article)
  slideQuantityOverrides?: Record<string, 'short' | 'tabloid' | 'indepth' | 'extensive'>;
  toneOverrides?: Record<string, 'formal' | 'conversational' | 'engaging'>;  
  writingStyleOverrides?: Record<string, 'journalistic' | 'educational' | 'listicle' | 'story_driven'>;
  
  onSlideQuantityChange: (articleId: string, quantity: 'short' | 'tabloid' | 'indepth' | 'extensive') => void;
  onToneOverrideChange: (articleId: string, tone: 'formal' | 'conversational' | 'engaging') => void;
  onWritingStyleOverrideChange: (articleId: string, style: 'journalistic' | 'educational' | 'listicle' | 'story_driven') => void;
  
  onPreview?: (article: MultiTenantArticle) => void;
  onApprove: (article: MultiTenantArticle, slideType?: 'short' | 'tabloid' | 'indepth' | 'extensive', tone?: 'formal' | 'conversational' | 'engaging', writingStyle?: 'journalistic' | 'educational' | 'listicle' | 'story_driven') => void;
  onDelete: (articleId: string, articleTitle: string) => void;
  onDiscardAndSuppress?: (articleId: string, topicId: string, articleUrl: string, articleTitle: string) => void;
  onBulkDelete?: (articleIds: string[]) => void;
  onPromote?: (articleId: string) => void;
  topicId?: string;
  onRefresh?: () => void;
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
  onRefresh
}: MultiTenantArticlesListProps) {
  const [selectedArticles, setSelectedArticles] = useState<Set<string>>(new Set());
  const [bulkDeleteRelevanceThreshold, setBulkDeleteRelevanceThreshold] = useState(25);
  const [showBulkActions, setShowBulkActions] = useState(false);

  // Helper functions
  const getRelevanceColor = (score: number) => {
    if (score >= 50) return "text-green-600 bg-green-50 border-green-200";
    if (score >= 25) return "text-yellow-600 bg-yellow-50 border-yellow-200";
    return "text-red-600 bg-red-50 border-red-200";
  };

  const getRelevanceLabel = (score: number) => {
    if (score >= 50) return `${score}% (High)`;
    if (score >= 25) return `${score}% (Medium)`;
    return `${score}% (Low)`;
  };

  const getQualityColor = (score: number) => {
    if (score >= 80) return "text-green-600";
    if (score >= 60) return "text-yellow-600";
    return "text-red-600";
  };

  const getSlideTypeInfo = (type: string) => {
    const types = {
      short: { slides: 3, desc: 'Quick' },
      tabloid: { slides: 6, desc: 'Standard' },
      indepth: { slides: 8, desc: 'Detailed' },
      extensive: { slides: 12, desc: 'Full' }
    };
    return types[type as keyof typeof types];
  };

  // Bulk action handlers
  const handleBulkDelete = () => {
    if (selectedArticles.size === 0) return;
    onBulkDelete?.(Array.from(selectedArticles));
    setSelectedArticles(new Set());
    setShowBulkActions(false);
  };

  const handleBulkDeleteByRelevance = () => {
    const lowRelevanceIds = articles
      .filter(article => article.regional_relevance_score < bulkDeleteRelevanceThreshold)
      .map(article => article.id);
    
    if (lowRelevanceIds.length === 0) return;
    onBulkDelete?.(lowRelevanceIds);
  };

  const handleSelectAll = () => {
    const allIds = new Set(articles.map(a => a.id));
    setSelectedArticles(allIds);
    setShowBulkActions(true);
  };

  const handleDeselectAll = () => {
    setSelectedArticles(new Set());
    setShowBulkActions(false);
  };

  const renderArticleCard = (article: MultiTenantArticle) => {
    // Default snippets to 'short' (3 slides) instead of 'tabloid' (6 slides)
    const defaultType = article.is_snippet ? 'short' : defaultSlideQuantity;
    const slideType = slideQuantityOverrides[article.id] || defaultType;
    const slideInfo = getSlideTypeInfo(slideType);
    const toneOverride = toneOverrides[article.id] || defaultTone;
    const writingStyleOverride = writingStyleOverrides[article.id] || defaultWritingStyle;
    const isProcessing = processingArticle === article.id;
    const isDeleting = deletingArticles.has(article.id);
    const isAnimating = animatingArticles.has(article.id);
    
    return (
      <Card 
        key={article.id} 
        className={`transition-all duration-300 hover:shadow-md ${
          isAnimating ? 'animate-fade-out opacity-0 transform translate-x-4' : 'animate-fade-in'
        }`}
      >
        <div className="flex items-center justify-between p-4">
          <div className="flex items-center gap-2">
            <Checkbox
              checked={selectedArticles.has(article.id)}
              onCheckedChange={(checked) => {
                const newSelected = new Set(selectedArticles);
                if (checked) {
                  newSelected.add(article.id);
                } else {
                  newSelected.delete(article.id);
                }
                setSelectedArticles(newSelected);
                setShowBulkActions(newSelected.size > 0);
              }}
              className="mr-2"
            />
            <span className="text-sm text-muted-foreground">
              Relevance: {article.regional_relevance_score}%
            </span>
            <div 
              className={`px-2 py-1 rounded text-xs font-medium border ${getRelevanceColor(article.regional_relevance_score)}`}
            >
              {getRelevanceLabel(article.regional_relevance_score)}
            </div>
            <span className="text-xs text-muted-foreground">
              {article.word_count} words
              {article.is_snippet && (
                <Badge variant="outline" className="ml-2 text-xs bg-blue-50 text-blue-700 border-blue-200">
                  Snippet
                </Badge>
              )}
            </span>
            {article.author && (
              <span className="text-xs text-muted-foreground">
                by {article.author}
              </span>
            )}
          </div>
          
          <div className="flex gap-2">
            {onPreview && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => onPreview(article)}
              >
                <Eye className="w-4 h-4" />
              </Button>
            )}
            <Button
              size="sm"
              variant="outline"
              onClick={() => window.open(article.url, '_blank')}
            >
              <ExternalLink className="w-4 h-4" />
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => onDelete(article.id, article.title)}
              disabled={isDeleting}
            >
              <Trash2 className="w-4 h-4" />
            </Button>
            {onDiscardAndSuppress && topicId && (
              <Button
                size="sm"
                variant="destructive"
                onClick={() => onDiscardAndSuppress(article.id, topicId, article.url, article.title)}
                disabled={isDeleting}
                title="Discard and permanently suppress from future scrapes"
              >
                <Shield className="w-4 h-4" />
              </Button>
            )}
          </div>
        </div>

        <div className="px-4 pb-2">
          <h3 className="font-medium text-sm leading-tight mb-2 line-clamp-2">
            {article.title}
          </h3>
          
          {/* Currentness Tag */}
          <div className="mb-2">
            <div 
              className={`inline-flex px-2 py-1 rounded text-xs font-medium border ${getCurrentnessColor(article.published_at, article.created_at)}`}
            >
              {getCurrentnessTag(article.published_at, article.created_at)}
            </div>
          </div>
          
          {/* Keywords */}
          <div className="flex flex-wrap gap-1 mb-3">
            {(article.keyword_matches || []).slice(0, 4).map((keyword, idx) => (
              <Badge key={idx} variant="secondary" className="text-xs">
                {keyword}
              </Badge>
            ))}
          </div>
        </div>

        <div className="p-4 pt-0 border-t bg-muted/20">
          <div className="flex items-center justify-between">
            <div className="flex gap-2">
              {/* Slide Quantity */}
              <Select
                value={slideType}
                onValueChange={(value: 'short' | 'tabloid' | 'indepth' | 'extensive') => 
                  onSlideQuantityChange(article.id, value)
                }
              >
                <SelectTrigger className="w-16 h-8">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="short">3</SelectItem>
                  <SelectItem value="tabloid">6</SelectItem>
                  <SelectItem value="indepth">8</SelectItem>
                  <SelectItem value="extensive">12</SelectItem>
                </SelectContent>
              </Select>
              
              {/* Tone */}
              <Select
                value={toneOverride}
                onValueChange={(value: 'formal' | 'conversational' | 'engaging') => 
                  onToneOverrideChange(article.id, value)
                }
              >
                <SelectTrigger className="w-24 h-8">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="formal">Formal</SelectItem>
                  <SelectItem value="conversational">Conversational</SelectItem>
                  <SelectItem value="engaging">Engaging</SelectItem>
                </SelectContent>
              </Select>

              {/* Writing Style */}
              <Select
                value={writingStyleOverride}
                onValueChange={(value: 'journalistic' | 'educational' | 'listicle' | 'story_driven') => 
                  onWritingStyleOverrideChange(article.id, value)
                }
              >
                <SelectTrigger className="w-28 h-8">
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

            {article.processing_status === 'processed' ? (
              <Button
                onClick={() => onPromote?.(article.id)}
                disabled={isProcessing || isDeleting}
                className="bg-blue-600 text-white hover:bg-blue-700"
                size="sm"
              >
                <ArrowRight className="w-4 h-4 mr-1" />
                Promote to Published
              </Button>
            ) : (
              <Button
                onClick={() => onApprove(
                  article, 
                  slideType, 
                  toneOverride, 
                  writingStyleOverride
                )}
                disabled={isProcessing || isDeleting}
                className="bg-green-600 text-white hover:bg-green-700"
                size="sm"
              >
                <PlayCircle className="w-4 h-4 mr-1" />
                Simplify
              </Button>
            )}
          </div>
        </div>
      </Card>
    );
  };

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
          No new articles have been discovered yet. Click "Gather Content" to search for fresh content.
        </p>
        <div className="flex gap-3">
          <Button onClick={onRefresh} variant="outline" className="gap-2">
            <RefreshCw className="w-4 h-4" />
            Gather Content
          </Button>
          <Button onClick={onRefresh} variant="outline" className="gap-2">
            <RefreshCw className="w-4 h-4" />
            Refresh
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Bulk action toolbar */}
      {(showBulkActions || selectedArticles.size > 0) && (
        <Card className="p-4 bg-muted/20 border-primary/20">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div className="flex items-center gap-4">
              <span className="text-sm font-medium">
                {selectedArticles.size} article{selectedArticles.size !== 1 ? 's' : ''} selected
              </span>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={handleSelectAll}>
                  Select All ({articles.length})
                </Button>
                <Button size="sm" variant="outline" onClick={handleDeselectAll}>
                  Deselect All
                </Button>
              </div>
            </div>
            
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <Label className="text-sm">Delete articles below:</Label>
                <Select value={bulkDeleteRelevanceThreshold.toString()} onValueChange={(value) => setBulkDeleteRelevanceThreshold(Number(value))}>
                  <SelectTrigger className="w-24">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="10">10%</SelectItem>
                    <SelectItem value="25">25%</SelectItem>
                    <SelectItem value="50">50%</SelectItem>
                    <SelectItem value="75">75%</SelectItem>
                  </SelectContent>
                </Select>
                <Button size="sm" variant="destructive" onClick={handleBulkDeleteByRelevance}>
                  Delete {articles.filter(a => a.regional_relevance_score < bulkDeleteRelevanceThreshold).length} Low Relevance
                </Button>
              </div>
              
              <Button 
                size="sm" 
                variant="destructive" 
                onClick={handleBulkDelete}
                disabled={selectedArticles.size === 0}
              >
                Delete Selected ({selectedArticles.size})
              </Button>
            </div>
          </div>
        </Card>
      )}
      
      {articles.map((article) => renderArticleCard(article))}
    </div>
  );
}