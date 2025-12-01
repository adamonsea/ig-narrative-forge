import { Card } from '@/components/ui/card';
import { TrendingUp, TrendingDown } from 'lucide-react';
import { KeywordSparkline } from './KeywordSparkline';

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
  topicId?: string;
}

// Single sentiment card component with sparkline
const SentimentKeywordCard = ({ 
  keyword, 
  mentions, 
  maxMentions, 
  isPositive,
  topicId
}: { 
  keyword: string; 
  mentions: number; 
  maxMentions: number; 
  isPositive: boolean;
  topicId?: string;
}) => {
  const percentage = Math.round((mentions / maxMentions) * 100);
  
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <span className="text-base font-medium text-foreground truncate">{keyword}</span>
          {topicId && (
            <KeywordSparkline 
              topicId={topicId} 
              keyword={keyword} 
              sentimentDirection={isPositive ? 'positive' : 'negative'}
            />
          )}
        </div>
        <span className="text-2xl font-bold text-foreground shrink-0 ml-2">{mentions}</span>
      </div>
      <div className="h-8 bg-muted rounded-lg overflow-hidden">
        <div 
          className={`h-full rounded-lg transition-all ${isPositive ? 'bg-primary' : 'bg-destructive'}`}
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
};

export const ComparisonCard = ({ content, topicId }: ComparisonCardProps) => {
  const { chart_data } = content;
  
  if (!chart_data) return null;

  const maxMentions = Math.max(
    ...chart_data.positive.map(k => k.mentions),
    ...chart_data.negative.map(k => k.mentions),
    1 // Prevent division by zero
  );

  // Split into two separate cards
  return (
    <div className="space-y-4 w-full max-w-2xl">
      {/* Positive Card */}
      {chart_data.positive.length > 0 && (
        <Card className="p-6 space-y-4">
          <div className="flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-primary" />
            <h3 className="text-lg font-semibold text-foreground">Positive Coverage</h3>
          </div>
          <div className="space-y-4">
            {chart_data.positive.slice(0, 3).map((kw, idx) => (
              <SentimentKeywordCard
                key={idx}
                keyword={kw.keyword}
                mentions={kw.mentions}
                maxMentions={maxMentions}
                isPositive={true}
                topicId={topicId}
              />
            ))}
          </div>
        </Card>
      )}

      {/* Negative Card */}
      {chart_data.negative.length > 0 && (
        <Card className="p-6 space-y-4">
          <div className="flex items-center gap-2">
            <TrendingDown className="w-5 h-5 text-destructive" />
            <h3 className="text-lg font-semibold text-foreground">Negative Coverage</h3>
          </div>
          <div className="space-y-4">
            {chart_data.negative.slice(0, 3).map((kw, idx) => (
              <SentimentKeywordCard
                key={idx}
                keyword={kw.keyword}
                mentions={kw.mentions}
                maxMentions={maxMentions}
                isPositive={false}
                topicId={topicId}
              />
            ))}
          </div>
        </Card>
      )}
    </div>
  );
};
