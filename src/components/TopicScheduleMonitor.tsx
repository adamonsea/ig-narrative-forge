import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from '@/hooks/use-toast';
import { 
  Clock, 
  CheckCircle, 
  XCircle, 
  AlertTriangle, 
  Activity,
  RefreshCw,
  Calendar,
  TrendingUp,
  Zap,
  Settings
} from "lucide-react";

interface TopicScheduleData {
  sources: Array<{
    id: string;
    source_name: string;
    feed_url: string;
    is_active: boolean;
    last_scraped_at?: string;
    articles_scraped: number;
    success_rate: number;
    credibility_score: number;
  }>;
  recent_articles: number;
  total_sources: number;
  active_sources: number;
  health_status: 'healthy' | 'warning' | 'critical';
}

interface TopicScheduleMonitorProps {
  topicId: string;
  topicName: string;
}

export const TopicScheduleMonitor: React.FC<TopicScheduleMonitorProps> = ({ 
  topicId, 
  topicName 
}) => {
  const [data, setData] = useState<TopicScheduleData | null>(null);
  const [loading, setLoading] = useState(false);
  const [rescanning, setRescanning] = useState<string | null>(null);
  const { toast } = useToast();

  const fetchTopicData = async () => {
    setLoading(true);
    try {
      // Get topic sources using the new junction table approach
      const { data: sources, error: sourcesError } = await supabase.rpc('get_topic_sources', {
        p_topic_id: topicId
      });

      if (sourcesError) throw sourcesError;

      // Transform RPC result to match expected format
      const transformedSources = (sources || []).map((source: any) => ({
        id: source.source_id,
        source_name: source.source_name,
        feed_url: source.feed_url,
        is_active: source.is_active,
        last_scraped_at: source.last_scraped_at,
        articles_scraped: source.articles_scraped,
        success_rate: source.credibility_score, // Use credibility as proxy for success rate
        credibility_score: source.credibility_score
      }));

      // Get recent articles count (last 7 days) - check both legacy and multi-tenant systems
      const weekAgo = new Date();
      weekAgo.setDate(weekAgo.getDate() - 7);
      
      // Count legacy articles
      const { count: legacyArticleCount } = await supabase
        .from('articles')
        .select('id', { count: 'exact' })
        .eq('topic_id', topicId)
        .gte('created_at', weekAgo.toISOString());

      // Count multi-tenant articles
      const { count: multiTenantArticleCount } = await supabase
        .from('topic_articles')
        .select('id', { count: 'exact' })
        .eq('topic_id', topicId)
        .gte('created_at', weekAgo.toISOString());

      const totalArticleCount = (legacyArticleCount || 0) + (multiTenantArticleCount || 0);

      const activeSources = transformedSources?.filter(s => s.is_active).length || 0;
      const totalSources = transformedSources?.length || 0;
      
      // Determine health status
      let healthStatus: 'healthy' | 'warning' | 'critical' = 'healthy';
      if (activeSources === 0) {
        healthStatus = 'critical';
      } else if (activeSources < totalSources / 2) {
        healthStatus = 'warning';
      }

      setData({
        sources: transformedSources || [],
        recent_articles: totalArticleCount,
        total_sources: totalSources,
        active_sources: activeSources,
        health_status: healthStatus
      });
    } catch (error: any) {
      toast({
        title: "Error",
        description: `Failed to fetch topic data: ${error.message}`,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleRescanSource = async (sourceId: string, feedUrl: string) => {
    setRescanning(sourceId);
    try {
      const { data: result, error } = await supabase.functions.invoke('topic-aware-scraper', {
        body: {
          feedUrl,
          topicId,
          sourceId
        }
      });

      if (error) throw error;

      toast({
        title: "Success",
        description: `Re-scan completed: ${result.articlesStored} articles stored`,
      });

      fetchTopicData(); // Refresh data
    } catch (error: any) {
      toast({
        title: "Error",
        description: `Re-scan failed: ${error.message}`,
        variant: "destructive",
      });
    } finally {
      setRescanning(null);
    }
  };

  const handleRescanAllSources = async () => {
    if (!data) return;
    
    setLoading(true);
    try {
      const activeSources = data.sources.filter(s => s.is_active);
      const promises = activeSources.map(source => 
        supabase.functions.invoke('topic-aware-scraper', {
          body: {
            feedUrl: source.feed_url,
            topicId,
            sourceId: source.id
          }
        })
      );

      const results = await Promise.allSettled(promises);
      const successful = results.filter(r => r.status === 'fulfilled').length;
      
      toast({
        title: "Bulk Re-scan Complete",
        description: `${successful}/${activeSources.length} sources processed successfully`,
      });

      fetchTopicData();
    } catch (error: any) {
      toast({
        title: "Error",
        description: `Bulk re-scan failed: ${error.message}`,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const toggleSourceStatus = async (sourceId: string, currentStatus: boolean) => {
    try {
      const { error } = await supabase
        .from('content_sources')
        .update({ is_active: !currentStatus })
        .eq('id', sourceId);

      if (error) throw error;

      toast({
        title: "Success",
        description: `Source ${!currentStatus ? 'activated' : 'deactivated'}`,
      });

      fetchTopicData();
    } catch (error: any) {
      toast({
        title: "Error",
        description: `Failed to update source: ${error.message}`,
        variant: "destructive",
      });
    }
  };

  useEffect(() => {
    fetchTopicData();
  }, [topicId]);

  const getHealthBadge = (status: string) => {
    const variants = {
      healthy: 'default',
      warning: 'secondary', 
      critical: 'destructive'
    } as const;
    
    const icons = {
      healthy: CheckCircle,
      warning: AlertTriangle,
      critical: XCircle
    };

    const Icon = icons[status as keyof typeof icons] || Activity;
    
    return (
      <Badge variant={variants[status as keyof typeof variants] || 'secondary'}>
        <Icon className="w-3 h-3 mr-1" />
        {status}
      </Badge>
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-2xl font-bold">Automation & Scraping</h3>
          <p className="text-muted-foreground">Manage automated content collection for "{topicName}"</p>
        </div>
        <div className="flex gap-2">
            <Button 
              onClick={fetchTopicData} 
              variant="outline" 
              size="sm"
              disabled={loading}
            >
              <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
            <Button 
              onClick={async () => {
                try {
                  const { data } = await supabase.functions.invoke('cleanup-stale-source-errors');
                  toast({
                    title: "Status Cleanup Complete",
                    description: `Cleared stale errors for ${data?.errors_cleared || 0} sources`,
                  });
                  fetchTopicData(); // Refresh data
                } catch (error) {
                  console.error('Cleanup failed:', error);
                }
              }}
              variant="outline"
              size="sm"
            >
              Fix Status
            </Button>
          <Button 
            onClick={handleRescanAllSources}
            disabled={loading || !data?.active_sources}
          >
            <Zap className="w-4 h-4 mr-2" />
            Re-scan All Sources
          </Button>
        </div>
      </div>

      {data && (
        <>
          {/* Stats Overview */}
          <div className="grid gap-4 md:grid-cols-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total Sources</CardTitle>
                <Settings className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{data.total_sources}</div>
                <div className="flex items-center mt-1">
                  {getHealthBadge(data.health_status)}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Active Sources</CardTitle>
                <Activity className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-green-600">{data.active_sources}</div>
                <p className="text-xs text-muted-foreground">
                  {data.active_sources === data.total_sources ? 'All active' : `${data.total_sources - data.active_sources} inactive`}
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Articles (7d)</CardTitle>
                <TrendingUp className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{data.recent_articles}</div>
                <p className="text-xs text-muted-foreground">Last 7 days</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Avg Success Rate</CardTitle>
                <CheckCircle className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {data.sources.length > 0 
                    ? Math.round(data.sources.reduce((sum, s) => sum + s.success_rate, 0) / data.sources.length)
                    : 0}%
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Sources Management */}
          <Card>
            <CardHeader>
              <CardTitle>Topic Sources</CardTitle>
              <CardDescription>
                Manage content sources specific to this topic
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {data.sources.map((source) => (
                  <div key={source.id} className="flex items-center justify-between p-4 border rounded-lg">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <h4 className="font-medium">{source.source_name}</h4>
                        <Badge variant={source.is_active ? "default" : "secondary"}>
                          {source.is_active ? "Active" : "Inactive"}
                        </Badge>
                        <Badge variant="outline">
                          Score: {source.credibility_score}
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground">{source.feed_url}</p>
                      <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                        <span>Articles: {source.articles_scraped}</span>
                        <span>Success: {source.success_rate}%</span>
                        {source.last_scraped_at && (
                          <span>Last: {new Date(source.last_scraped_at).toLocaleDateString()}</span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => toggleSourceStatus(source.id, source.is_active)}
                      >
                        {source.is_active ? 'Disable' : 'Enable'}
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => handleRescanSource(source.id, source.feed_url)}
                        disabled={rescanning === source.id || !source.is_active}
                      >
                        {rescanning === source.id ? (
                          <>
                            <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                            Scanning...
                          </>
                        ) : (
                          <>
                            <Zap className="w-4 h-4 mr-2" />
                            Re-scan
                          </>
                        )}
                      </Button>
                    </div>
                  </div>
                ))}
                
                {data.sources.length === 0 && (
                  <div className="text-center py-8 text-muted-foreground">
                    <Settings className="w-12 h-12 mx-auto mb-4 opacity-50" />
                    <p>No sources configured for this topic yet.</p>
                    <p className="text-sm">Add sources in the "Sources" tab to start collecting content.</p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </>
      )}

      {!data && loading && (
        <Card>
          <CardContent className="flex items-center justify-center p-8">
            <div className="flex items-center gap-2">
              <RefreshCw className="h-6 w-6 animate-spin" />
              <span>Loading automation data...</span>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};