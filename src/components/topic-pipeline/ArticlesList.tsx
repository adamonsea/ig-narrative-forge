import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { PlayCircle, Eye, ExternalLink, RotateCcw, Trash2, Info, AlertTriangle } from "lucide-react";
import { SimilarArticleIndicator } from "@/components/SimilarArticleIndicator";
import { BulkDeleteDialog } from "@/components/BulkDeleteDialog";
import { useEnhancedDuplicateDetection } from "@/hooks/useEnhancedDuplicateDetection";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useEffect } from "react";

interface Article {
  id: string;
  title: string;
  body: string;
  source_url: string;
  published_at: string | null;
  created_at: string;
  processing_status: string;
  content_quality_score: number | null;
  regional_relevance_score: number | null;
  keyword_overlap_score?: number;
  matched_keywords?: string[];
  topic_matches?: string[];
  boosted_relevance_score?: number;
  is_low_score?: boolean;
  word_count: number | null;
  author?: string;
  summary?: string;
  import_metadata?: any;
}

// Updated ArticlesList interface with writing style support
interface ArticlesListProps {
  articles: Article[];
  processingArticle: string | null;
  slideQuantities: { [key: string]: 'short' | 'tabloid' | 'indepth' | 'extensive' };
  deletingArticles: Set<string>;
  animatingArticles: Set<string>;
  toneOverrides: { [key: string]: 'formal' | 'conversational' | 'engaging' };
  writingStyleOverrides: { [key: string]: 'journalistic' | 'educational' | 'listicle' | 'story_driven' };
  onSlideQuantityChange: (articleId: string, quantity: 'short' | 'tabloid' | 'indepth' | 'extensive') => void;
  onToneOverrideChange: (articleId: string, tone: 'formal' | 'conversational' | 'engaging') => void;
  onWritingStyleOverrideChange: (articleId: string, style: 'journalistic' | 'educational' | 'listicle' | 'story_driven') => void;
  onApprove: (articleId: string, slideType: 'short' | 'tabloid' | 'indepth' | 'extensive', tone: 'formal' | 'conversational' | 'engaging', writingStyle: 'journalistic' | 'educational' | 'listicle' | 'story_driven') => void;
  onPreview: (article: Article) => void;
  onDelete: (articleId: string, articleTitle: string) => void;
  defaultTone: 'formal' | 'conversational' | 'engaging';
  defaultWritingStyle: 'journalistic' | 'educational' | 'listicle' | 'story_driven';
  topicKeywords?: string[];
  topicLandmarks?: string[];
  onRefresh?: () => void;
}

export const ArticlesList: React.FC<ArticlesListProps> = ({
  articles,
  processingArticle,
  slideQuantities,
  deletingArticles,
  animatingArticles,
  toneOverrides,
  writingStyleOverrides,
  defaultTone,
  defaultWritingStyle,
  topicKeywords = [],
  topicLandmarks = [],
  onRefresh,
  onSlideQuantityChange,
  onToneOverrideChange,
  onWritingStyleOverrideChange,
  onApprove,
  onPreview,
  onDelete
}) => {
  const { toast } = useToast();
  const { 
    similarArticles, 
    updateFingerprints, 
    bulkDeleteArticles,
    checkAgainstRecentDeletions 
  } = useEnhancedDuplicateDetection();

  // Update fingerprints when articles change
  useEffect(() => {
    if (articles.length > 0) {
      updateFingerprints(articles);
    }
  }, [articles]); // Remove updateFingerprints to prevent infinite loop

  // Separate articles by threshold
  const aboveThresholdArticles = articles.filter(article => 
    !article.is_low_score && (article.regional_relevance_score || 0) >= 25
  );
  const belowThresholdArticles = articles.filter(article => 
    article.is_low_score || (article.regional_relevance_score || 0) < 25
  );

  const handleBulkDeleteLowRelevance = async () => {
    try {
      const articlesToDelete = belowThresholdArticles.map(article => article.id);
      
      if (articlesToDelete.length === 0) return;

      const { error } = await supabase
        .from('articles')
        .update({ processing_status: 'discarded' })
        .in('id', articlesToDelete);

      if (error) throw error;

      toast({
        title: 'Low Relevance Articles Deleted',
        description: `Removed ${articlesToDelete.length} low relevance articles`,
      });

      onRefresh?.();
    } catch (error) {
      console.error('Bulk delete failed:', error);
      toast({
        title: 'Delete Failed',
        description: 'Failed to delete low relevance articles',
        variant: 'destructive',
      });
    }
  };

  const getRelevanceColor = (score: number | null) => {
    if (!score) return "text-muted-foreground";
    if (score >= 50) return "text-green-600";
    if (score >= 25) return "text-yellow-600";
    return "text-red-600";
  };

  const getRelevanceLabel = (score: number | null, boostedScore?: number) => {
    const displayScore = boostedScore || score;
    if (!displayScore) return "0% relevant";
    if (displayScore >= 50) return `${displayScore}% relevant (High)`;
    if (displayScore >= 25) return `${displayScore}% relevant (Medium)`;
    if (displayScore >= 20) return `${displayScore}% relevant (Low)`;
    return `${displayScore}% relevant (Very Low)`;
  };

  const getQualityColor = (score: number | null) => {
    if (!score) return "text-muted-foreground";
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

  const extractRelevantKeywords = (content: string, title: string = ''): string[] => {
    if (!content && !title) return [];
    
    const combinedText = `${title} ${content}`.toLowerCase();
    
    // Combine all topic-related keywords to match against
    const allTopicKeywords = [...topicKeywords, ...topicLandmarks].map(k => k.toLowerCase());
    
    if (allTopicKeywords.length === 0) return [];
    
    // Find matching topic keywords in the article content
    const matchedKeywords = allTopicKeywords.filter(keyword => {
      // Check for exact word match or phrase match
      return combinedText.includes(keyword.toLowerCase());
    });
    
    // Sort by keyword length (longer keywords first) and take top 3
    return matchedKeywords
      .sort((a, b) => b.length - a.length)
      .slice(0, 3);
  };

  // Extract relevant keywords from article content and topic matches
  const getRelevantKeywords = (article: Article) => {
    const keywords = [];
    
    // Add matched topic keywords with standard styling
    if (article.matched_keywords && article.matched_keywords.length > 0) {
      keywords.push(...article.matched_keywords.slice(0, 3).map(keyword => ({ 
        text: keyword, 
        type: 'keyword' as const 
      })));
    }
    
    // Add topic name/description matches with special styling
    if (article.topic_matches && article.topic_matches.length > 0) {
      keywords.push(...article.topic_matches.slice(0, 2).map(match => ({ 
        text: match, 
        type: 'topic' as const 
      })));
    }
    
    // Fallback to extracted keywords if no matches
    if (keywords.length === 0) {
      const extractedKeywords = extractRelevantKeywords(article.body || '', article.title);
      keywords.push(...extractedKeywords.slice(0, 3).map(keyword => ({ 
        text: keyword, 
        type: 'common' as const 
      })));
    }
    
    return keywords.slice(0, 5); // Limit total keywords displayed
  };

  const handleBulkDelete = async (keywords: string[]) => {
    try {
      await bulkDeleteArticles({ keywords });
      onRefresh?.();
    } catch (error) {
      console.error('Bulk delete failed:', error);
    }
  };

  const handleMergeSimilar = async (originalId: string, duplicateId: string) => {
    // Implementation would call merge API
    console.log('Merge articles:', originalId, duplicateId);
    onRefresh?.();
  };

  const handleIgnoreSimilar = (articleId: string, similarId: string) => {
    // Implementation would mark as ignored
    console.log('Ignore similar:', articleId, similarId);
  };

  const renderArticleCard = (article: Article) => {
    const slideType = slideQuantities[article.id] || 'tabloid';
    const slideInfo = getSlideTypeInfo(slideType);
    const toneOverride = toneOverrides[article.id] || defaultTone;
    const writingStyleOverride = writingStyleOverrides[article.id] || defaultWritingStyle;
    
    const isProcessing = processingArticle === article.id;
    const isDeleting = deletingArticles.has(article.id);
    const isAnimatingAway = animatingArticles.has(article.id);
    const currentSimilarArticles = similarArticles.get(article.id) || [];
    const isSimilarToDeleted = checkAgainstRecentDeletions(article);
    
    return (
      <Card 
        key={article.id} 
        className={`transition-all duration-300 hover:shadow-md transform-gpu overflow-hidden ${
          isProcessing && isAnimatingAway
            ? 'animate-slide-out-right'
            : isDeleting && isAnimatingAway
            ? 'animate-discard'
            : isSimilarToDeleted
            ? 'border-orange-200 bg-orange-50/30 dark:bg-orange-950/10'
            : ''
        }`}
        style={{
          animationFillMode: 'forwards',
          visibility: (isProcessing || isDeleting) && isAnimatingAway ? 'hidden' : 'visible'
        }}
      >
        <CardHeader className="pb-3">
          <div className="mobile-card-header justify-between items-start">
            <div className="flex-1 min-w-0 pr-3">
              <CardTitle className="text-lg mb-3 leading-snug break-words hyphens-auto flex items-start gap-2">
                {article.title}
                {isSimilarToDeleted && (
                  <Badge variant="outline" className="text-xs bg-orange-100 text-orange-800 border-orange-300">
                    <AlertTriangle className="h-3 w-3 mr-1" />
                    Similar to deleted
                  </Badge>
                )}
              </CardTitle>
              
               {/* Enhanced Keywords with Type-based Styling */}
               <div className="flex flex-wrap gap-1 mb-3 items-center">
                 {getRelevantKeywords(article).map((keyword, idx) => (
                   <Badge 
                     key={idx} 
                     variant={keyword.type === 'topic' ? 'default' : 'secondary'} 
                     className={`text-xs px-2 py-1 ${
                       keyword.type === 'topic' 
                         ? 'bg-emerald-100 text-emerald-800 border-emerald-200' 
                         : keyword.type === 'keyword'
                         ? 'bg-blue-100 text-blue-800 border-blue-200'
                         : 'bg-secondary text-secondary-foreground'
                     }`}
                   >
                     {keyword.text}
                     {keyword.type === 'topic' && <span className="ml-1">🎯</span>}
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
                           <span className={getRelevanceColor(article.boosted_relevance_score || article.regional_relevance_score)}>
                             {article.boosted_relevance_score || article.regional_relevance_score || 0}%
                           </span>
                         </div>
                         <div className="flex justify-between">
                           <span>Quality:</span>
                           <span className={getQualityColor(article.content_quality_score)}>
                             {article.content_quality_score || 0}%
                           </span>
                         </div>
                         {(article as any).keyword_overlap_score !== undefined && (
                           <div className="flex justify-between">
                             <span>Keywords:</span>
                             <span className={(article as any).keyword_overlap_score < 30 ? "text-red-600" : "text-green-600"}>
                               {(article as any).keyword_overlap_score}%
                             </span>
                           </div>
                         )}
                         <div className="flex justify-between">
                           <span>Word Count:</span>
                           <span>{article.word_count || 0}</span>
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
                 <span className={getRelevanceColor(article.boosted_relevance_score || article.regional_relevance_score)}>
                   {getRelevanceLabel(article.regional_relevance_score, article.boosted_relevance_score)}
                 </span>
                 <span className="text-muted-foreground">
                   {article.word_count || 0} words
                 </span>
                 {article.author && (
                   <span className="text-muted-foreground">
                     by {article.author}
                   </span>
                 )}
                 {article.regional_relevance_score && article.regional_relevance_score < 25 && (
                   <Badge variant="destructive" className="text-xs">
                     Below Threshold
                   </Badge>
                  )}
                </div>

                {/* Similar Articles Indicator */}
                {currentSimilarArticles.length > 0 && (
                  <div className="mt-3">
                    <SimilarArticleIndicator
                      articleId={article.id}
                      similarArticles={currentSimilarArticles}
                      onMerge={handleMergeSimilar}
                      onIgnore={handleIgnoreSimilar}
                      onBulkDelete={handleBulkDelete}
                    />
                  </div>
                )}
             </div>
            
            <div className="mobile-header-actions min-w-0">
              <div className="mobile-button-group">
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
                  onClick={() => window.open(article.source_url, '_blank')}
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
                    onValueChange={(value: 'formal' | 'conversational' | 'engaging') => 
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
                className="w-full sm:w-auto bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white shadow-md"
                size="sm"
                onClick={() => onApprove(article.id, slideType, toneOverride, writingStyleOverride)}
                disabled={isProcessing}
              >
                {processingArticle === article.id ? (
                  "Processing..."
                ) : (
                  <>
                    <PlayCircle className="w-4 h-4 mr-1" />
                    Simplify
                  </>
                )}
              </Button>
            </div>
          </div>
        </CardHeader>
      </Card>
    );
  };

  if (articles.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <RotateCcw className="w-5 h-5" />
              No Articles Available
            </div>
            <BulkDeleteDialog onSuccess={onRefresh} />
          </CardTitle>
          <CardDescription>
            No articles found in the pipeline. Run a scrape to gather fresh content from all your sources.
          </CardDescription>
        </CardHeader>
        <CardContent className="text-center py-6">
          <Button 
            onClick={() => window.dispatchEvent(new CustomEvent('gatherAllSources'))}
            className="bg-primary hover:bg-primary/90"
          >
            <RotateCcw className="w-4 h-4 mr-2" />
            Gather All Sources
          </Button>
          <p className="text-sm text-muted-foreground mt-2">
            This will check all your active sources for new content
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4 transition-all duration-300">
      {/* Bulk actions header */}
      <div className="flex justify-between items-center">
        <div className="text-sm text-muted-foreground">
          {articles.length} article{articles.length !== 1 ? 's' : ''} in pipeline
          {aboveThresholdArticles.length > 0 && belowThresholdArticles.length > 0 && (
            <span className="ml-2">
              ({aboveThresholdArticles.length} above threshold, {belowThresholdArticles.length} below)
            </span>
          )}
        </div>
        <BulkDeleteDialog onSuccess={onRefresh} />
      </div>

      {/* Above Threshold Articles */}
      {aboveThresholdArticles.map(article => renderArticleCard(article))}

      {/* Below Threshold Articles in Accordion */}
      {belowThresholdArticles.length > 0 && (
        <div className="mt-6">
          <Accordion type="single" collapsible className="w-full">
            <AccordionItem value="low-relevance" className="border-orange-200">
              <AccordionTrigger className="hover:no-underline">
                <div className="flex items-center justify-between w-full pr-4">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4 text-orange-500" />
                    <span className="text-sm font-medium text-orange-700">
                      Low Relevance Articles ({belowThresholdArticles.length})
                    </span>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleBulkDeleteLowRelevance();
                    }}
                    className="text-xs text-red-600 border-red-200 hover:bg-red-50"
                  >
                    <Trash2 className="h-3 w-3 mr-1" />
                    Delete All
                  </Button>
                </div>
              </AccordionTrigger>
              <AccordionContent>
                <div className="space-y-3 pt-2">
                  <div className="text-xs text-muted-foreground bg-orange-50 p-3 rounded border-orange-200 border">
                    These articles scored below the relevance threshold and are hidden by default. 
                    Review them manually or delete all at once if they're not relevant.
                  </div>
                  {belowThresholdArticles.map(article => (
                    <div key={article.id} className="opacity-75">
                      {renderArticleCard(article)}
                    </div>
                  ))}
                </div>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </div>
      )}
    </div>
  );
};