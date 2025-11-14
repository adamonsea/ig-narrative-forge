import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { TrendingUp, TrendingDown } from 'lucide-react';
import { format } from 'date-fns';

interface ComparisonCardProps {
  content: {
    headline: string;
    summary: string;
    statistics: string;
    chart_data?: {
      positive: Array<{ keyword: string; mentions: number; ratio: number }>;
      negative: Array<{ keyword: string; mentions: number; ratio: number }>;
    };
  };
  dataWindowStart?: string;
  dataWindowEnd?: string;
}

export const ComparisonCard = ({ content, dataWindowStart, dataWindowEnd }: ComparisonCardProps) => {
  const { chart_data } = content;
  
  if (!chart_data) return null;

  const maxMentions = Math.max(
    ...chart_data.positive.map(k => k.mentions),
    ...chart_data.negative.map(k => k.mentions)
  );

  return (
    <Card className="border-border/40 bg-card/50">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <CardTitle className="text-lg">{content.headline}</CardTitle>
            <p className="text-sm text-muted-foreground mt-1">{content.summary}</p>
          </div>
          {dataWindowStart && dataWindowEnd && (
            <Badge variant="outline" className="text-xs shrink-0">
              {format(new Date(dataWindowStart), 'MMM d')} - {format(new Date(dataWindowEnd), 'MMM d')}
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Positive Keywords */}
        {chart_data.positive.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm font-medium text-green-600">
              <TrendingUp className="w-4 h-4" />
              <span>Most Positive</span>
            </div>
            <div className="space-y-2">
              {chart_data.positive.map((kw, idx) => (
                <div key={idx} className="space-y-1">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-foreground truncate flex-1 min-w-0">{kw.keyword}</span>
                    <span className="text-muted-foreground text-xs shrink-0 ml-2">{kw.mentions} mentions</span>
                  </div>
                  <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-green-500 rounded-full transition-all"
                      style={{ width: `${(kw.mentions / maxMentions) * 100}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Negative Keywords */}
        {chart_data.negative.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm font-medium text-red-600">
              <TrendingDown className="w-4 h-4" />
              <span>Most Negative</span>
            </div>
            <div className="space-y-2">
              {chart_data.negative.map((kw, idx) => (
                <div key={idx} className="space-y-1">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-foreground truncate flex-1 min-w-0">{kw.keyword}</span>
                    <span className="text-muted-foreground text-xs shrink-0 ml-2">{kw.mentions} mentions</span>
                  </div>
                  <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-red-500 rounded-full transition-all"
                      style={{ width: `${(kw.mentions / maxMentions) * 100}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <p className="text-xs text-muted-foreground pt-2 border-t border-border/40">
          {content.statistics}
        </p>
      </CardContent>
    </Card>
  );
};
