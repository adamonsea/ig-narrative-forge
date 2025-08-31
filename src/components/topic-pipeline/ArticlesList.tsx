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

interface ArticlesListProps {
  articles: Article[];
  processingArticle: string | null;
  slideQuantities: { [key: string]: 'short' | 'tabloid' | 'indepth' };
  deletingArticles: Set<string>;
  onSlideQuantityChange: (articleId: string, quantity: 'short' | 'tabloid' | 'indepth') => void;
  onApprove: (articleId: string, slideType: 'short' | 'tabloid' | 'indepth') => void;
  onPreview: (article: Article) => void;
  onDelete: (articleId: string, articleTitle: string) => void;
}

export const ArticlesList: React.FC<ArticlesListProps> = ({
  articles,
  processingArticle,
  slideQuantities,
  deletingArticles,
  onSlideQuantityChange,
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
      indepth: { slides: 8, desc: 'Detailed' }
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
    <div className="space-y-4">
      {articles.map((article) => {
        const slideType = slideQuantities[article.id] || 'tabloid';
        const slideInfo = getSlideTypeInfo(slideType);
        
        return (
          <Card key={article.id} className="transition-all duration-200 hover:shadow-md">
            <CardHeader className="pb-3">
              <div className="flex justify-between items-start gap-4">
                <div className="flex-1 min-w-0">
                  <CardTitle className="text-lg mb-2 line-clamp-2">
                    {article.title}
                  </CardTitle>
                  <div className="flex items-center gap-4 text-sm text-muted-foreground flex-wrap">
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
                
                <div className="flex flex-col gap-2 min-w-0">
                  <div className="flex gap-2">
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
                      onClick={() => window.open(article.source_url, '_blank')}
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
                  
                  <div className="flex items-center gap-2">
                    <div className="text-xs">
                      <Select
                        value={slideType}
                        onValueChange={(value: 'short' | 'tabloid' | 'indepth') => 
                          onSlideQuantityChange(article.id, value)
                        }
                      >
                        <SelectTrigger className="w-28 h-8">
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
                        </SelectContent>
                      </Select>
                    </div>
                    
                    <Button
                      onClick={() => onApprove(article.id, slideType)}
                      disabled={processingArticle === article.id}
                      size="sm"
                      className="min-w-0"
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