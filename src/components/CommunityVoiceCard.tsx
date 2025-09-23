import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Users, MessageCircle, TrendingUp } from "lucide-react";

interface CommunityInsight {
  id: string;
  insight_type: 'sentiment' | 'concern' | 'validation';
  content: string;
  confidence_score: number;
  source_identifier: string;
  created_at: string;
}

interface CommunityVoiceCardProps {
  insights: CommunityInsight[];
  topicName: string;
}

export const CommunityVoiceCard = ({ insights, topicName }: CommunityVoiceCardProps) => {
  if (!insights || insights.length === 0) {
    return null;
  }

  // Group insights by type for cleaner display
  const sentimentInsights = insights.filter(i => i.insight_type === 'sentiment');
  const concernInsights = insights.filter(i => i.insight_type === 'concern');
  const validationInsights = insights.filter(i => i.insight_type === 'validation');

  const getInsightIcon = (type: string) => {
    switch (type) {
      case 'sentiment': return <MessageCircle className="w-4 h-4" />;
      case 'concern': return <TrendingUp className="w-4 h-4" />;
      case 'validation': return <Users className="w-4 h-4" />;
      default: return <MessageCircle className="w-4 h-4" />;
    }
  };

  const getInsightColor = (type: string) => {
    switch (type) {
      case 'sentiment': return 'bg-blue-50 text-blue-700 dark:bg-blue-950/20 dark:text-blue-300';
      case 'concern': return 'bg-orange-50 text-orange-700 dark:bg-orange-950/20 dark:text-orange-300';
      case 'validation': return 'bg-green-50 text-green-700 dark:bg-green-950/20 dark:text-green-300';
      default: return 'bg-gray-50 text-gray-700 dark:bg-gray-950/20 dark:text-gray-300';
    }
  };

  return (
    <Card className="border-border/30 bg-gradient-to-br from-slate-50/50 to-slate-100/50 dark:from-slate-950/50 dark:to-slate-900/50 backdrop-blur-sm">
      <CardContent className="p-6">
        <div className="flex items-center gap-2 mb-4">
          <Users className="w-5 h-5 text-community" />
          <h3 className="font-semibold text-lg">Community Voice</h3>
          <Badge variant="secondary" className="text-xs">
            Recent discussions
          </Badge>
        </div>

        <div className="space-y-4">
          {/* Display up to 3 most relevant insights */}
          {insights.slice(0, 3).map((insight, index) => (
            <div key={insight.id} className="space-y-2">
              <div className="flex items-center gap-2">
                {getInsightIcon(insight.insight_type)}
                <Badge 
                  variant="outline" 
                  className={`text-xs ${getInsightColor(insight.insight_type)}`}
                >
                  {insight.insight_type === 'sentiment' && 'Local feeling'}
                  {insight.insight_type === 'concern' && 'Community concern'}
                  {insight.insight_type === 'validation' && 'Discussion topic'}
                </Badge>
                <span className="text-xs text-muted-foreground">
                  r/{insight.source_identifier}
                </span>
              </div>
              
              <p className="text-sm text-foreground/90 leading-relaxed">
                {insight.content}
              </p>
              
              {index < insights.slice(0, 3).length - 1 && (
                <div className="border-b border-border/20 mt-3" />
              )}
            </div>
          ))}
        </div>

        <div className="mt-4 pt-3 border-t border-border/20">
          <p className="text-xs text-muted-foreground">
            Based on {insights.length} community discussion{insights.length !== 1 ? 's' : ''} • 
            Updated {new Date(insights[0]?.created_at).toLocaleDateString()}
          </p>
        </div>
      </CardContent>
    </Card>
  );
};