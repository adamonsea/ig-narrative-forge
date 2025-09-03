import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PlayCircle, Eye, ExternalLink, RotateCcw, Trash2, Bot } from "lucide-react";

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

interface ArticlesListProps {
  articles: Article[];
  processingArticle: string | null;
  slideQuantities: { [key: string]: 'short' | 'tabloid' | 'indepth' | 'extensive' };
  deletingArticles: Set<string>;
  aiProvider: 'openai' | 'deepseek';
  toneOverrides: { [key: string]: 'formal' | 'conversational' | 'engaging' };
  onSlideQuantityChange: (articleId: string, quantity: 'short' | 'tabloid' | 'indepth' | 'extensive') => void;
  onToneOverrideChange: (articleId: string, tone: 'formal' | 'conversational' | 'engaging') => void;
  onApprove: (articleId: string, slideType: 'short' | 'tabloid' | 'indepth' | 'extensive', aiProvider: 'openai' | 'deepseek', tone: 'formal' | 'conversational' | 'engaging') => void;
  onPreview: (article: Article) => void;
  onDelete: (articleId: string, articleTitle: string) => void;
  onAiProviderChange: (provider: 'openai' | 'deepseek') => void;
  defaultTone: 'formal' | 'conversational' | 'engaging';
}

export const ArticlesList: React.FC<ArticlesListProps> = ({
  articles,
  processingArticle,
  slideQuantities,
  deletingArticles,
  aiProvider,
  toneOverrides,
  defaultTone,
  onSlideQuantityChange,
  onToneOverrideChange,
  onApprove,
  onPreview,
  onDelete,
  onAiProviderChange
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

  const getWritingStyleInfo = (style: string) => {
    const styles = {
      journalistic: { label: 'Journalistic', desc: 'Traditional news structure' },
      educational: { label: 'Educational', desc: 'Clear explanations with examples' },
      listicle: { label: 'Listicle', desc: 'Numbered points and structure' },
      story_driven: { label: 'Story-driven', desc: 'Narrative with characters' }
    };
    
    return styles[style as keyof typeof styles];
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
    <div className="space-y-4">
      {/* AI Provider Selection */}
      <Card className="bg-gradient-to-r from-purple-50 to-indigo-50 dark:from-purple-950/20 dark:to-indigo-950/20 border-purple-200 dark:border-purple-800">
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
            <div className="flex items-center gap-2">
              <Bot className="h-5 w-5 text-purple-600" />
              <label className="text-sm font-medium">AI Provider:</label>
            </div>
            <Select value={aiProvider} onValueChange={onAiProviderChange}>
              <SelectTrigger className="w-full sm:w-[200px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="openai">OpenAI GPT-4</SelectItem>
                <SelectItem value="deepseek">DeepSeek V3</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Choose the AI model for content generation
            </p>
          </div>
        </CardContent>
      </Card>

      {articles.map((article) => {
        const slideType = slideQuantities[article.id] || 'tabloid';
        const slideInfo = getSlideTypeInfo(slideType);
        const toneOverride = toneOverrides[article.id] || defaultTone;
        
        return (
          <Card key={article.id} className="transition-all duration-200 hover:shadow-md">
            <CardHeader className="pb-3">
              <div className="mobile-card-header justify-between items-start">
                <div className="flex-1 min-w-0">
                  <CardTitle className="text-lg mb-2 line-clamp-2">
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
                    
                    <Button
                      onClick={() => onApprove(article.id, slideType, aiProvider, toneOverrides[article.id] || defaultTone)}
                      disabled={processingArticle === article.id}
                      size="sm"
                      className="w-full sm:w-auto"
                    >
                      {processingArticle === article.id ? (
                        "Processing..."
                      ) : (
                        <>
                          <PlayCircle className="w-4 h-4 mr-1" />
                          Generate
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