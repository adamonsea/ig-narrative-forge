import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { AlertCircle, Trash2 } from "lucide-react";
import { useCommunityInsights, CommunityInsight } from "@/hooks/useCommunityInsights";
import { CommunityPulseCard } from "@/components/CommunityPulseCard";

interface CommunityInsightsReviewProps {
  topicId: string;
  topicName?: string;
}

export const CommunityInsightsReview = ({ topicId, topicName }: CommunityInsightsReviewProps) => {
  const { toast } = useToast();
  const { insights, loading, refresh, lastUpdated } = useCommunityInsights(topicId, { limit: 50 });
  const [processingIds, setProcessingIds] = useState<Set<string>>(new Set());
  const [fetchedTopicName, setFetchedTopicName] = useState<string>("");

  // Fetch topic name if not provided
  useEffect(() => {
    const fetchTopicName = async () => {
      if (topicName) {
        setFetchedTopicName(topicName);
        return;
      }
      
      try {
        const { data, error } = await supabase
          .from("topics")
          .select("name")
          .eq("id", topicId)
          .single();
        
        if (error) throw error;
        if (data) setFetchedTopicName(data.name);
      } catch (error) {
        console.error("Error fetching topic name:", error);
      }
    };
    
    fetchTopicName();
  }, [topicId, topicName]);

  const handleDelete = async (insightId: string) => {
    if (processingIds.has(insightId)) return;

    setProcessingIds(prev => new Set(prev).add(insightId));
    try {
      const { error } = await supabase
        .from("community_insights")
        .delete()
        .eq("id", insightId);

      if (error) throw error;

      toast({
        title: "Insight deleted",
        description: "The community insight has been removed.",
      });
      refresh();
    } catch (error) {
      console.error("Error deleting insight:", error);
      toast({
        title: "Error",
        description: "Failed to delete insight. Please try again.",
        variant: "destructive",
      });
    } finally {
      setProcessingIds(prev => {
        const next = new Set(prev);
        next.delete(insightId);
        return next;
      });
    }
  };

  const renderInsightCard = (insight: CommunityInsight) => {
    const isProcessing = processingIds.has(insight.id);

    return (
      <div key={insight.id} className="space-y-3">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-2">
              <Badge variant="outline" className="text-xs">
                {insight.insight_type}
              </Badge>
              <Badge variant="secondary" className="text-xs">
                {insight.source_type}
              </Badge>
              {insight.confidence_score && (
                <Badge variant="outline" className="text-xs">
                  {insight.confidence_score}% confidence
                </Badge>
              )}
            </div>
            <p className="text-sm text-muted-foreground mb-3">{insight.content}</p>
            <p className="text-xs text-muted-foreground">
              Source: {insight.source_identifier} • {new Date(insight.created_at).toLocaleString()}
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Button
              size="sm"
              variant="ghost"
              onClick={() => handleDelete(insight.id)}
              disabled={isProcessing}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
    );
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Community Intelligence</CardTitle>
          <CardDescription>Loading insights...</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const sentimentInsights = insights.filter(i => i.insight_type === "sentiment");
  const concernInsights = insights.filter(i => i.insight_type === "concern");
  const validationInsights = insights.filter(i => i.insight_type === "validation");

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          Community Intelligence
          <Badge variant="secondary">{insights.length} insights</Badge>
        </CardTitle>
        <CardDescription>
          Review community insights from monitored subreddits
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {insights.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <AlertCircle className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>No community insights available yet.</p>
            <p className="text-sm mt-2">
              Insights will appear here after the community intelligence processor runs.
            </p>
          </div>
        ) : (
          <>
            {/* Preview Section */}
            <div>
              <h3 className="text-sm font-medium mb-3">Feed Preview</h3>
              <p className="text-xs text-muted-foreground mb-4">
                This is how the community pulse card will appear in the public feed
              </p>
              <CommunityPulseCard 
                topicName={fetchedTopicName || "Topic"} 
                insights={insights}
                lastUpdated={lastUpdated}
              />
            </div>

            {/* Insights List */}
            <Tabs defaultValue="all" className="w-full">
              <TabsList>
                <TabsTrigger value="all">
                  All ({insights.length})
                </TabsTrigger>
                <TabsTrigger value="sentiment">
                  Sentiment ({sentimentInsights.length})
                </TabsTrigger>
                <TabsTrigger value="concern">
                  Concerns ({concernInsights.length})
                </TabsTrigger>
                <TabsTrigger value="validation">
                  Validation ({validationInsights.length})
                </TabsTrigger>
              </TabsList>

              <TabsContent value="all" className="space-y-4 mt-4">
                {insights.map(renderInsightCard)}
              </TabsContent>

              <TabsContent value="sentiment" className="space-y-4 mt-4">
                {sentimentInsights.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    No sentiment insights found
                  </p>
                ) : (
                  sentimentInsights.map(renderInsightCard)
                )}
              </TabsContent>

              <TabsContent value="concern" className="space-y-4 mt-4">
                {concernInsights.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    No concern insights found
                  </p>
                ) : (
                  concernInsights.map(renderInsightCard)
                )}
              </TabsContent>

              <TabsContent value="validation" className="space-y-4 mt-4">
                {validationInsights.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    No validation insights found
                  </p>
                ) : (
                  validationInsights.map(renderInsightCard)
                )}
              </TabsContent>
            </Tabs>
          </>
        )}
      </CardContent>
    </Card>
  );
};
