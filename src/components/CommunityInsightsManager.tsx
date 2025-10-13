import { useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { format, parseISO } from "date-fns";
import { MessageSquare, TrendingUp, AlertCircle, CheckCircle } from "lucide-react";
import { useCommunityInsights } from "@/hooks/useCommunityInsights";

interface CommunityInsightsManagerProps {
  topicId: string;
}

export const CommunityInsightsManager = ({ topicId }: CommunityInsightsManagerProps) => {
  const { insights, loading, error, lastUpdated } = useCommunityInsights(topicId, {
    limit: 50,
    refreshIntervalMs: 0 // No auto-refresh, manual only
  });

  const getInsightIcon = (type: string) => {
    switch (type) {
      case 'sentiment':
        return <TrendingUp className="h-4 w-4 text-blue-500" />;
      case 'concern':
        return <AlertCircle className="h-4 w-4 text-orange-500" />;
      case 'validation':
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      default:
        return <MessageSquare className="h-4 w-4" />;
    }
  };

  const getInsightBadgeColor = (type: string) => {
    switch (type) {
      case 'sentiment':
        return 'bg-blue-100 text-blue-700 border-blue-200';
      case 'concern':
        return 'bg-orange-100 text-orange-700 border-orange-200';
      case 'validation':
        return 'bg-green-100 text-green-700 border-green-200';
      default:
        return 'bg-gray-100 text-gray-700 border-gray-200';
    }
  };

  const groupedInsights = insights.reduce((acc, insight) => {
    if (!acc[insight.insight_type]) {
      acc[insight.insight_type] = [];
    }
    acc[insight.insight_type].push(insight);
    return acc;
  }, {} as Record<string, typeof insights>);

  if (loading && insights.length === 0) {
    return (
      <div className="p-8 text-center text-muted-foreground">
        Loading community insights...
      </div>
    );
  }

  if (error) {
    return (
      <Card>
        <CardContent className="p-8 text-center">
          <p className="text-destructive">{error}</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <MessageSquare className="h-5 w-5" />
            Community Insights Overview
          </CardTitle>
          <CardDescription>
            Insights extracted from relevant Reddit communities
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="flex items-center gap-3 p-4 rounded-lg border bg-blue-50/50">
              <TrendingUp className="h-8 w-8 text-blue-500" />
              <div>
                <div className="text-2xl font-bold text-blue-700">
                  {groupedInsights.sentiment?.length || 0}
                </div>
                <p className="text-sm text-muted-foreground">Sentiment Insights</p>
              </div>
            </div>
            
            <div className="flex items-center gap-3 p-4 rounded-lg border bg-orange-50/50">
              <AlertCircle className="h-8 w-8 text-orange-500" />
              <div>
                <div className="text-2xl font-bold text-orange-700">
                  {groupedInsights.concern?.length || 0}
                </div>
                <p className="text-sm text-muted-foreground">Concerns</p>
              </div>
            </div>
            
            <div className="flex items-center gap-3 p-4 rounded-lg border bg-green-50/50">
              <CheckCircle className="h-8 w-8 text-green-500" />
              <div>
                <div className="text-2xl font-bold text-green-700">
                  {groupedInsights.validation?.length || 0}
                </div>
                <p className="text-sm text-muted-foreground">Validations</p>
              </div>
            </div>
          </div>

          {lastUpdated && (
            <p className="text-xs text-muted-foreground mt-4">
              Last updated: {format(parseISO(lastUpdated), 'MMM d, yyyy HH:mm')}
            </p>
          )}
        </CardContent>
      </Card>

      {insights.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center">
            <MessageSquare className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
            <p className="text-muted-foreground mb-2">
              No community insights generated yet.
            </p>
            <p className="text-sm text-muted-foreground">
              Click "Refresh Insights" in the Advanced Tools tab to analyze Reddit communities.
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">
              All Insights ({insights.length})
            </CardTitle>
            <CardDescription>
              Recent insights from community discussions
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {insights.map((insight) => (
                <div
                  key={insight.id}
                  className="border rounded-lg p-4 space-y-2 hover:bg-accent/50 transition-colors"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-2">
                      {getInsightIcon(insight.insight_type)}
                      <Badge className={getInsightBadgeColor(insight.insight_type)}>
                        {insight.insight_type}
                      </Badge>
                      {insight.confidence_score && (
                        <Badge variant="outline" className="text-xs">
                          {Math.round(insight.confidence_score * 100)}% confident
                        </Badge>
                      )}
                    </div>
                    <span className="text-xs text-muted-foreground whitespace-nowrap">
                      {format(parseISO(insight.created_at), 'MMM d, HH:mm')}
                    </span>
                  </div>

                  <p className="text-sm leading-relaxed">{insight.content}</p>

                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span>Source: {insight.source_identifier}</span>
                    {insight.metadata && insight.metadata.comment_count && (
                      <span>• {insight.metadata.comment_count} comments</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};
