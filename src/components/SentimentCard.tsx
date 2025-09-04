import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { TrendingUp, TrendingDown, Minus, Clock, ExternalLink } from "lucide-react";
import { format, parseISO } from "date-fns";

interface SentimentCardProps {
  id: string;
  keywordPhrase: string;
  content: {
    headline: string;
    statistics: string;
    key_quote?: string;
    external_sentiment?: string;
    summary: string;
  };
  sources: Array<{
    url: string;
    title: string;
    date: string;
    author?: string;
  }>;
  sentimentScore: number;
  confidenceScore: number;
  analysisDate: string;
  cardType: 'quote' | 'trend' | 'comparison' | 'timeline';
}

export const SentimentCard = ({
  keywordPhrase,
  content,
  sources,
  sentimentScore,
  analysisDate,
  cardType
}: SentimentCardProps) => {
  const getSentimentIcon = () => {
    if (sentimentScore > 20) return <TrendingUp className="h-4 w-4 text-green-600" />;
    if (sentimentScore < -20) return <TrendingDown className="h-4 w-4 text-red-600" />;
    return <Minus className="h-4 w-4 text-yellow-600" />;
  };

  const getSentimentColor = () => {
    if (sentimentScore > 20) return "bg-green-50 border-green-200";
    if (sentimentScore < -20) return "bg-red-50 border-red-200";
    return "bg-yellow-50 border-yellow-200";
  };

  const formatDate = (dateString: string) => {
    try {
      return format(parseISO(dateString), 'MMM d');
    } catch {
      return 'Recent';
    }
  };

  return (
    <Card className={`p-4 transition-all duration-200 hover:shadow-md ${getSentimentColor()}`}>
      {/* Header with sentiment label */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Sentiment
          </span>
          {getSentimentIcon()}
        </div>
        <div className="flex items-center gap-1 text-xs text-muted-foreground">
          <Clock className="h-3 w-3" />
          {formatDate(analysisDate)}
        </div>
      </div>

      {/* Main content */}
      <div className="space-y-3">
        <div>
          <h3 className="font-semibold text-foreground leading-tight">
            {content.headline}
          </h3>
          <p className="text-sm text-muted-foreground mt-1">
            {content.statistics}
          </p>
        </div>

        {content.key_quote && (
          <blockquote className="border-l-3 border-primary/20 pl-3 py-1">
            <p className="text-sm italic text-foreground/80">
              "{content.key_quote}"
            </p>
          </blockquote>
        )}

        {content.external_sentiment && (
          <div className="bg-background/60 rounded-md p-2">
            <p className="text-xs text-muted-foreground">
              {content.external_sentiment}
            </p>
          </div>
        )}

        <p className="text-sm text-foreground/90 leading-relaxed">
          {content.summary}
        </p>
      </div>

      {/* Sources */}
      {sources.length > 0 && (
        <div className="mt-4 pt-3 border-t border-border/50">
          <div className="flex items-center gap-2 text-xs text-muted-foreground mb-2">
            <span>Sources:</span>
            <span>{sources.length} article{sources.length > 1 ? 's' : ''}</span>
          </div>
          <div className="space-y-1">
            {sources.slice(0, 2).map((source, index) => (
              <div key={index} className="flex items-center gap-2">
                <a
                  href={source.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-primary hover:underline flex items-center gap-1 truncate"
                >
                  <ExternalLink className="h-3 w-3 flex-shrink-0" />
                  <span className="truncate">{source.title}</span>
                </a>
              </div>
            ))}
            {sources.length > 2 && (
              <p className="text-xs text-muted-foreground">
                +{sources.length - 2} more source{sources.length > 3 ? 's' : ''}
              </p>
            )}
          </div>
        </div>
      )}

      {/* Keyword badge - positioned at bottom center like tooltip */}
      <div className="flex justify-center mt-4">
        <Badge variant="secondary" className="text-xs px-2 py-1">
          {keywordPhrase}
        </Badge>
      </div>
    </Card>
  );
};