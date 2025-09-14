import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PlayCircle, Eye, ExternalLink, Trash2, FileText, RefreshCw, RotateCcw } from "lucide-react";
import { MultiTenantArticle } from "@/hooks/useMultiTenantTopicPipeline";

interface MultiTenantArticlesListProps {
  articles: MultiTenantArticle[];
  processingArticle: string | null;
  deletingArticles: Set<string>;
  slideQuantities: { [key: string]: 'short' | 'tabloid' | 'indepth' | 'extensive' };
  toneOverrides: { [key: string]: 'formal' | 'conversational' | 'engaging' };
  writingStyleOverrides: { [key: string]: 'journalistic' | 'educational' | 'listicle' | 'story_driven' };
  onSlideQuantityChange: (articleId: string, quantity: 'short' | 'tabloid' | 'indepth' | 'extensive') => void;
  onToneOverrideChange: (articleId: string, tone: 'formal' | 'conversational' | 'engaging') => void;
  onWritingStyleOverrideChange: (articleId: string, style: 'journalistic' | 'educational' | 'listicle' | 'story_driven') => void;
  onPreview: (article: MultiTenantArticle) => void;
  onApprove: (articleId: string, slideType: 'short' | 'tabloid' | 'indepth' | 'extensive', tone: 'formal' | 'conversational' | 'engaging', writingStyle: 'journalistic' | 'educational' | 'listicle' | 'story_driven') => void;
  onDelete: (articleId: string, articleTitle: string) => void;
  onBulkDelete: (articleIds: string[]) => void;
  defaultTone: 'formal' | 'conversational' | 'engaging';
  defaultWritingStyle: 'journalistic' | 'educational' | 'listicle' | 'story_driven';
  topicKeywords?: string[];
  topicLandmarks?: string[];
  onRefresh?: () => void;
}

export const MultiTenantArticlesList: React.FC<MultiTenantArticlesListProps> = ({
  articles,
  processingArticle,
  deletingArticles,
  slideQuantities,
  toneOverrides,
  writingStyleOverrides,
  onSlideQuantityChange,
  onToneOverrideChange,
  onWritingStyleOverrideChange,
  onPreview,
  onApprove,
  onDelete,
  onBulkDelete,
  defaultTone,
  defaultWritingStyle,
  topicKeywords = [],
  topicLandmarks = [],
  onRefresh
}) => {

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

  const renderArticleCard = (article: MultiTenantArticle) => {
    const slideType = slideQuantities[article.id] || 'tabloid';
    const slideInfo = getSlideTypeInfo(slideType);
    const toneOverride = toneOverrides[article.id] || defaultTone;
    const writingStyleOverride = writingStyleOverrides[article.id] || defaultWritingStyle;
    const isProcessing = processingArticle === article.id;
    const isDeleting = deletingArticles.has(article.id);
    
    // Hide card during processing/deleting animation to prevent flicker
    if (isProcessing || isDeleting) {
      return null;
    }
    
    return (
      <Card 
        key={article.id} 
        className="transition-all duration-300 hover:shadow-md"
      >
        <CardHeader className="pb-3">
          <div className="flex justify-between items-start">
            <div className="flex-1 min-w-0 pr-3">
              <CardTitle className="text-lg leading-snug break-words hyphens-auto mb-2">
                {article.title}
              </CardTitle>
              
              {/* Keywords */}
              <div className="flex flex-wrap gap-1 mb-2">
                {(article.keyword_matches || []).slice(0, 5).map((keyword, idx) => (
                  <Badge 
                    key={idx} 
                    variant="secondary"
                    className="text-xs"
                  >
                    {keyword}
                  </Badge>
                ))}
              </div>
             
             <div className="flex items-center gap-2 text-sm text-muted-foreground">
               <span className={getRelevanceColor(article.regional_relevance_score)}>
                 {article.regional_relevance_score}%
               </span>
               <span>{article.word_count} words</span>
               {article.author && <span>by {article.author}</span>}
             </div>
            </div>
            
            <div className="flex flex-col gap-2">
              <div className="flex gap-1">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => onPreview(article)}
                >
                  <Eye className="w-4 h-4" />
                </Button>
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
                  disabled={deletingArticles.has(article.id)}
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
              
              <div className="flex gap-1 text-xs">
                <Select
                  value={slideType}
                  onValueChange={(value: 'short' | 'tabloid' | 'indepth' | 'extensive') => 
                    onSlideQuantityChange(article.id, value)
                  }
                >
                  <SelectTrigger className="w-20 h-7">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="short">4</SelectItem>
                    <SelectItem value="tabloid">6</SelectItem>
                    <SelectItem value="indepth">8</SelectItem>
                    <SelectItem value="extensive">12</SelectItem>
                  </SelectContent>
                </Select>
                
                <Select
                  value={toneOverride}
                  onValueChange={(value: 'formal' | 'conversational' | 'engaging') => 
                    onToneOverrideChange(article.id, value)
                  }
                >
                  <SelectTrigger className="w-24 h-7">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="formal">Formal</SelectItem>
                    <SelectItem value="conversational">Chat</SelectItem>
                    <SelectItem value="engaging">Engaging</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <Button
                onClick={() => onApprove(
                  article.id, 
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
          <p className="text-lg font-medium">No Articles</p>
          <p className="text-sm">Articles from active sources will appear here</p>
        </div>
        <div className="flex gap-2 justify-center">
          <Button 
            onClick={() => window.dispatchEvent(new CustomEvent('gatherAllSources'))}
            className="bg-primary hover:bg-primary/90"
          >
            <RotateCcw className="w-4 h-4 mr-2" />
            Gather All Sources
          </Button>
          {onRefresh && (
            <Button onClick={onRefresh} variant="outline">
              <RefreshCw className="w-4 h-4 mr-2" />
              Refresh
            </Button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {articles.map(renderArticleCard)}

      {/* Bulk Delete Dialog - Removed */}
    </div>
  );
};