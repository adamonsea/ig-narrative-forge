import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PlayCircle, Eye, ExternalLink, RotateCcw, Trash2 } from "lucide-react";

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
  onSlideQuantityChange,
  onToneOverrideChange,
  onWritingStyleOverrideChange,
  onApprove,
  onPreview,
  onDelete
}) => {
  const getRelevanceColor = (score: number | null) => {
    if (!score) return "text-muted-foreground";
    if (score >= 80) return "text-green-600";
    if (score >= 60) return "text-yellow-600";
    return "text-red-600";
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

  if (articles.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <RotateCcw className="w-5 h-5" />
            No Articles Available
          </CardTitle>
          <CardDescription>
            No articles found in the pipeline. Try running a scrape to import new content.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <div className="space-y-4 transition-all duration-300">
      {articles.map((article) => {
        const slideType = slideQuantities[article.id] || 'tabloid';
        const slideInfo = getSlideTypeInfo(slideType);
        const toneOverride = toneOverrides[article.id] || defaultTone;
        const writingStyleOverride = writingStyleOverrides[article.id] || defaultWritingStyle;
        
        const isProcessing = processingArticle === article.id;
        const isDeleting = deletingArticles.has(article.id);
        const isAnimatingAway = animatingArticles.has(article.id);
        
        return (
          <Card 
            key={article.id} 
            className={`transition-all duration-300 hover:shadow-md transform-gpu overflow-hidden ${
              isProcessing && isAnimatingAway
                ? 'animate-slide-out-right'  // Simplify: slide right for processing
                : isDeleting && isAnimatingAway
                ? 'animate-discard'          // Delete: discard animation only when actually deleting
                : 'animate-fade-in opacity-100 scale-100'
            }`}
            style={{
              animationFillMode: 'forwards'
            }}
          >
            <CardHeader className="pb-3">
              <div className="mobile-card-header justify-between items-start">
                <div className="flex-1 min-w-0 pr-3">
                  <CardTitle className="text-lg mb-3 leading-snug break-words hyphens-auto">
                    {article.title}
                  </CardTitle>
                  <div className="flex items-center gap-2 sm:gap-4 mobile-text-wrap text-muted-foreground flex-wrap">
                    <div>
                      <span className={getRelevanceColor(article.regional_relevance_score)}>
                        {article.regional_relevance_score || 0}% relevant
                      </span>
                    </div>
                    <div>
                      <span className={getQualityColor(article.content_quality_score)}>
                        {article.content_quality_score || 0}% quality
                      </span>
                    </div>
                    <div>
                      {article.word_count || 0} words
                    </div>
                    {article.author && (
                      <div>
                        by {article.author}
                      </div>
                    )}
                  </div>
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
                          <SelectItem value="short">
                            4 slides
                          </SelectItem>
                          <SelectItem value="tabloid">
                            6 slides
                          </SelectItem>
                          <SelectItem value="indepth">
                            8 slides
                          </SelectItem>
                          <SelectItem value="extensive">
                            12 slides
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    
                    <div className="text-xs">
                      <Select
                        value={toneOverrides[article.id] || defaultTone}
                        onValueChange={(value: 'formal' | 'conversational' | 'engaging') => 
                          onToneOverrideChange(article.id, value)
                        }
                      >
                        <SelectTrigger className="w-full sm:w-32 h-8">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="formal">
                            <div>
                              <div className="font-medium text-xs">Formal</div>
                            </div>
                          </SelectItem>
                          <SelectItem value="conversational">
                            <div>
                              <div className="font-medium text-xs">Conversational</div>
                            </div>
                          </SelectItem>
                          <SelectItem value="engaging">
                            <div>
                              <div className="font-medium text-xs">Engaging</div>
                            </div>
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    
                    <div className="text-xs">
                      <Select
                        value={writingStyleOverrides[article.id] || defaultWritingStyle}
                        onValueChange={(value: 'journalistic' | 'educational' | 'listicle' | 'story_driven') => 
                          onWritingStyleOverrideChange(article.id, value)
                        }
                      >
                        <SelectTrigger className="w-full sm:w-32 h-8">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="journalistic">
                            <div>
                              <div className="font-medium text-xs">Journalistic</div>
                            </div>
                          </SelectItem>
                          <SelectItem value="educational">
                            <div>
                              <div className="font-medium text-xs">Educational</div>
                            </div>
                          </SelectItem>
                          <SelectItem value="listicle">
                            <div>
                              <div className="font-medium text-xs">Listicle</div>
                            </div>
                          </SelectItem>
                          <SelectItem value="story_driven">
                            <div>
                              <div className="font-medium text-xs">Story-driven</div>
                            </div>
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    
                    <Button
                      onClick={() => onApprove(article.id, slideType, toneOverrides[article.id] || defaultTone, writingStyleOverrides[article.id] || defaultWritingStyle)}
                      disabled={processingArticle === article.id}
                      size="sm"
                      className="w-full sm:w-auto"
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
              </div>
            </CardHeader>
          </Card>
        );
      })}
    </div>
  );
};