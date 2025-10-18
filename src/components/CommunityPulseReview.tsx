import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Eye, EyeOff, Trash2, RefreshCw, Loader2, AlertCircle, MessageSquare } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { CommunityPulseSlides } from "@/components/CommunityPulseSlides";
import type { PulseKeyword } from "@/hooks/useCommunityPulseKeywords";

interface CommunityKeywordData {
  id: string;
  topic_id: string;
  keyword: string;
  total_mentions: number;
  positive_mentions: number;
  negative_mentions: number;
  representative_quote: string;
  most_active_thread_url: string;
  most_active_thread_title: string;
  set_number: number;
  is_visible: boolean;
  created_at: string;
  updated_at: string;
}

interface CommunityPulseReviewProps {
  topicId: string;
}

export const CommunityPulseReview = ({ topicId }: CommunityPulseReviewProps) => {
  const [keywords, setKeywords] = useState<CommunityKeywordData[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [processingIds, setProcessingIds] = useState<Set<string>>(new Set());
  const [globalEnabled, setGlobalEnabled] = useState(true);
  const { toast } = useToast();

  // Load all keywords for this topic
  const loadKeywords = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('community_pulse_keywords')
        .select('*')
        .eq('topic_id', topicId)
        .order('set_number', { ascending: true })
        .order('total_mentions', { ascending: false }) as { data: any[] | null; error: any };

      if (error) throw error;
      setKeywords(data || []);
    } catch (error) {
      console.error('Error loading community keywords:', error);
      toast({
        title: "Error",
        description: "Failed to load community pulse keywords",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  // Load topic's global community intelligence setting
  const loadTopicSettings = async () => {
    try {
      const { data, error } = await supabase
        .from('topics')
        .select('community_intelligence_enabled')
        .eq('id', topicId)
        .single();

      if (error) throw error;
      setGlobalEnabled(data?.community_intelligence_enabled ?? true);
    } catch (error) {
      console.error('Error loading topic settings:', error);
    }
  };

  // Toggle global community intelligence
  const handleGlobalToggle = async (enabled: boolean) => {
    try {
      const { error } = await supabase
        .from('topics')
        .update({ community_intelligence_enabled: enabled })
        .eq('id', topicId);

      if (error) throw error;
      
      setGlobalEnabled(enabled);
      toast({
        title: enabled ? "Enabled" : "Disabled",
        description: `Community intelligence ${enabled ? 'enabled' : 'disabled'} for this feed`,
      });
    } catch (error) {
      console.error('Error toggling global setting:', error);
      toast({
        title: "Error",
        description: "Failed to update setting",
        variant: "destructive"
      });
    }
  };

  // Toggle keyword visibility
  const handleToggleVisibility = async (keywordId: string, currentVisibility: boolean) => {
    setProcessingIds(prev => new Set([...prev, keywordId]));
    try {
      const { error } = await supabase
        .from('community_pulse_keywords')
        .update({ is_visible: !currentVisibility })
        .eq('id', keywordId);

      if (error) throw error;
      
      toast({
        title: currentVisibility ? "Hidden" : "Shown",
        description: `Keyword ${currentVisibility ? 'hidden from' : 'shown in'} feed`,
      });
      await loadKeywords();
    } catch (error) {
      console.error('Error toggling visibility:', error);
      toast({
        title: "Error",
        description: "Failed to update visibility",
        variant: "destructive"
      });
    } finally {
      setProcessingIds(prev => {
        const newSet = new Set(prev);
        newSet.delete(keywordId);
        return newSet;
      });
    }
  };

  // Delete a keyword
  const handleDelete = async (keywordId: string) => {
    if (!confirm('Are you sure you want to delete this keyword?')) return;
    
    setProcessingIds(prev => new Set([...prev, keywordId]));
    try {
      const { error } = await supabase
        .from('community_pulse_keywords')
        .delete()
        .eq('id', keywordId);

      if (error) throw error;
      
      toast({
        title: "Deleted",
        description: "Keyword removed from community pulse",
      });
      await loadKeywords();
    } catch (error) {
      console.error('Error deleting keyword:', error);
      toast({
        title: "Error",
        description: "Failed to delete keyword",
        variant: "destructive"
      });
    } finally {
      setProcessingIds(prev => {
        const newSet = new Set(prev);
        newSet.delete(keywordId);
        return newSet;
      });
    }
  };

  // Refresh community pulse (trigger Reddit analysis)
  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      const { data, error } = await supabase.functions.invoke('reddit-community-processor', {
        body: { topic_ids: [topicId] }
      });

      if (error) throw error;

      toast({
        title: "Community Pulse Refreshed",
        description: data?.message || "Successfully analyzed Reddit communities for new insights",
      });

      await loadKeywords();
    } catch (error) {
      console.error('Error refreshing community pulse:', error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to refresh community insights",
        variant: "destructive"
      });
    } finally {
      setRefreshing(false);
    }
  };

  // Load keywords on mount
  useEffect(() => {
    loadKeywords();
    loadTopicSettings();
  }, [topicId]);

  // Set up real-time subscription
  useEffect(() => {
    const channel = supabase
      .channel(`community-pulse-review-${topicId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'community_pulse_keywords',
          filter: `topic_id=eq.${topicId}`
        },
        () => loadKeywords()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [topicId]);

  // Group keywords by set
  const set1Keywords = keywords.filter(k => k.set_number === 1);
  const set2Keywords = keywords.filter(k => k.set_number === 2);
  const set3Keywords = keywords.filter(k => k.set_number === 3);

  const renderKeywordSet = (setKeywords: CommunityKeywordData[]) => {
    if (setKeywords.length === 0) {
      return (
        <div className="text-center py-8 text-muted-foreground">
          <AlertCircle className="h-12 w-12 mx-auto mb-4 opacity-50" />
          <p>No keywords in this set yet</p>
          <p className="text-sm mt-2">Click "Refresh Now" to gather insights</p>
        </div>
      );
    }

    // Convert to PulseKeyword format for preview
    const pulseKeywords: PulseKeyword[] = setKeywords.map(kw => ({
      id: kw.id,
      keyword: kw.keyword,
      totalMentions: kw.total_mentions,
      positiveMentions: kw.positive_mentions,
      negativeMentions: kw.negative_mentions,
      quote: kw.representative_quote,
      setNumber: kw.set_number
    }));

    const mostActiveThread = setKeywords[0] ? {
      url: setKeywords[0].most_active_thread_url,
      title: setKeywords[0].most_active_thread_title
    } : undefined;

    return (
      <div className="space-y-4">
        {/* Preview */}
        <div className={`${!globalEnabled ? 'opacity-50' : ''}`}>
          <CommunityPulseSlides
            keywords={pulseKeywords}
            timeframe="48h"
            mostActiveThreadUrl={mostActiveThread?.url}
            mostActiveThreadTitle={mostActiveThread?.title}
          />
        </div>

        {/* Individual keyword controls */}
        <div className="space-y-2 mt-4">
          {setKeywords.map(keyword => (
            <Card key={keyword.id} className="overflow-hidden">
              <CardContent className="p-4">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold">{keyword.keyword}</span>
                      <Badge variant="secondary" className="text-xs">
                        {keyword.total_mentions} mentions
                      </Badge>
                      {!keyword.is_visible && (
                        <Badge variant="outline" className="text-xs">
                          Hidden
                        </Badge>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground mt-1 line-clamp-1">
                      {keyword.representative_quote}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleToggleVisibility(keyword.id, keyword.is_visible)}
                      disabled={processingIds.has(keyword.id)}
                    >
                      {keyword.is_visible ? (
                        <>
                          <EyeOff className="h-4 w-4 mr-1" />
                          Hide
                        </>
                      ) : (
                        <>
                          <Eye className="h-4 w-4 mr-1" />
                          Show
                        </>
                      )}
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() => handleDelete(keyword.id)}
                      disabled={processingIds.has(keyword.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  };

  if (loading) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        Loading community pulse...
      </div>
    );
  }

  const totalKeywords = keywords.length;
  const totalSets = Math.max(
    ...keywords.map(k => k.set_number),
    0
  );

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <MessageSquare className="h-5 w-5" />
                Community Intelligence
              </CardTitle>
              <CardDescription className="mt-2">
                Review and manage Reddit community insights that appear in your feed
              </CardDescription>
            </div>
            <div className="flex flex-col items-end gap-3">
              <div className="flex items-center gap-2">
                <Label htmlFor="global-toggle" className="text-sm">
                  {globalEnabled ? 'Enabled' : 'Disabled'}
                </Label>
                <Switch
                  id="global-toggle"
                  checked={globalEnabled}
                  onCheckedChange={handleGlobalToggle}
                />
              </div>
              <Button
                onClick={handleRefresh}
                disabled={refreshing}
                size="sm"
                variant="outline"
              >
                {refreshing ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Analyzing...
                  </>
                ) : (
                  <>
                    <RefreshCw className="w-4 h-4 mr-2" />
                    Refresh Now
                  </>
                )}
              </Button>
            </div>
          </div>
          {totalKeywords > 0 && (
            <div className="flex gap-2 mt-4">
              <Badge variant="secondary">
                {totalKeywords} keywords across {totalSets} sets
              </Badge>
              <Badge variant="outline">
                Last updated: {new Date(keywords[0]?.updated_at).toLocaleDateString()}
              </Badge>
            </div>
          )}
        </CardHeader>
      </Card>

      {totalKeywords === 0 ? (
        <Card>
          <CardContent className="p-8 text-center">
            <MessageSquare className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
            <p className="text-muted-foreground mb-2">No community pulse data yet</p>
            <p className="text-sm text-muted-foreground">
              Click "Refresh Now" to analyze Reddit discussions and generate insights
            </p>
          </CardContent>
        </Card>
      ) : (
        <Tabs defaultValue="set1" className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="set1">
              Set 1 ({set1Keywords.length})
            </TabsTrigger>
            <TabsTrigger value="set2">
              Set 2 ({set2Keywords.length})
            </TabsTrigger>
            <TabsTrigger value="set3">
              Set 3 ({set3Keywords.length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="set1" className="mt-4">
            {renderKeywordSet(set1Keywords)}
          </TabsContent>

          <TabsContent value="set2" className="mt-4">
            {renderKeywordSet(set2Keywords)}
          </TabsContent>

          <TabsContent value="set3" className="mt-4">
            {renderKeywordSet(set3Keywords)}
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
};