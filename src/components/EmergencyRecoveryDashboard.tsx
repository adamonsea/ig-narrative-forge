import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { AlertTriangle, CheckCircle, XCircle, Activity, RefreshCw } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { EmergencyRecoveryPanel } from './EmergencyRecoveryPanel';

interface TopicHealth {
  topic_id: string;
  topic_name: string;
  region: string;
  total_sources: number;
  active_sources: number;
  failing_sources: number;
  success_rate: number;
  last_successful_scrape: string;
  issues: string[];
}

export function EmergencyRecoveryDashboard() {
  const [topicHealthData, setTopicHealthData] = useState<TopicHealth[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    loadTopicHealth();
  }, []);

  const loadTopicHealth = async () => {
    try {
      setLoading(true);
      
      // Fetch comprehensive topic health data
      const { data: topics, error: topicsError } = await supabase
        .from('topics')
        .select(`
          id,
          name,
          region,
          is_active
        `)
        .eq('is_active', true);

      if (topicsError) throw topicsError;

      const healthData: TopicHealth[] = [];

      for (const topic of topics) {
        // Get source statistics for this topic
        const { data: sources, error: sourcesError } = await supabase
          .from('content_sources')
          .select('id, is_active, success_rate, last_scraped_at, articles_scraped')
          .eq('topic_id', topic.id);

        if (sourcesError) {
          console.error(`Failed to load sources for topic ${topic.id}:`, sourcesError);
          continue;
        }

        const totalSources = sources.length;
        const activeSources = sources.filter(s => s.is_active).length;
        const failingSources = sources.filter(s => (s.success_rate || 0) < 50).length;
        
        // Calculate overall success rate
        const avgSuccessRate = sources.length > 0 
          ? sources.reduce((sum, s) => sum + (s.success_rate || 0), 0) / sources.length
          : 0;

        // Find last successful scrape
        const lastSuccessfulScrape = sources
          .filter(s => s.last_scraped_at && (s.articles_scraped || 0) > 0)
          .sort((a, b) => new Date(b.last_scraped_at).getTime() - new Date(a.last_scraped_at).getTime())[0]?.last_scraped_at;

        // Identify issues
        const issues: string[] = [];
        if (totalSources === 0) issues.push('No sources configured');
        if (activeSources < totalSources * 0.5) issues.push('Many inactive sources');
        if (failingSources > totalSources * 0.3) issues.push('High failure rate');
        if (!lastSuccessfulScrape) issues.push('No recent successful scrapes');
        if (avgSuccessRate < 60) issues.push('Low overall success rate');

        healthData.push({
          topic_id: topic.id,
          topic_name: topic.name,
          region: topic.region,
          total_sources: totalSources,
          active_sources: activeSources,
          failing_sources: failingSources,
          success_rate: Math.round(avgSuccessRate),
          last_successful_scrape: lastSuccessfulScrape || '',
          issues
        });
      }

      setTopicHealthData(healthData);
    } catch (error) {
      console.error('Failed to load topic health:', error);
      toast({
        title: 'Error',
        description: 'Failed to load topic health data',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadTopicHealth();
    setRefreshing(false);
    toast({
      title: 'Refreshed',
      description: 'Topic health data has been updated',
    });
  };

  const getHealthStatus = (topic: TopicHealth) => {
    if (topic.issues.length === 0 && topic.success_rate > 80) return 'healthy';
    if (topic.issues.length <= 2 && topic.success_rate > 60) return 'warning';
    return 'critical';
  };

  const getHealthIcon = (status: string) => {
    switch (status) {
      case 'healthy':
        return <CheckCircle className="w-5 h-5 text-green-500" />;
      case 'warning':
        return <AlertTriangle className="w-5 h-5 text-yellow-500" />;
      case 'critical':
        return <XCircle className="w-5 h-5 text-red-500" />;
      default:
        return <Activity className="w-5 h-5 text-gray-500" />;
    }
  };

  const getHealthBadge = (status: string) => {
    const variants = {
      healthy: 'default',
      warning: 'secondary',
      critical: 'destructive'
    } as const;

    const labels = {
      healthy: 'Healthy',
      warning: 'Needs Attention',
      critical: 'Critical'
    };

    return (
      <Badge variant={variants[status as keyof typeof variants] || 'secondary'}>
        {labels[status as keyof typeof labels] || 'Unknown'}
      </Badge>
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <RefreshCw className="w-6 h-6 animate-spin mr-2" />
        Loading topic health data...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <h2 className="text-2xl font-bold">Recovery Dashboard</h2>
          <p className="text-muted-foreground">
            Monitor and fix topic health issues across all regions
          </p>
        </div>
        <Button onClick={handleRefresh} disabled={refreshing} variant="outline">
          <RefreshCw className={`w-4 h-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {/* Emergency Recovery Tools */}
      <EmergencyRecoveryPanel />

      {/* Topic Health Overview */}
      <div className="grid gap-4">
        {topicHealthData.map((topic) => {
          const status = getHealthStatus(topic);
          return (
            <Card key={topic.topic_id} className="w-full">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    {getHealthIcon(status)}
                    <div>
                      <CardTitle className="text-lg">{topic.topic_name}</CardTitle>
                      <p className="text-sm text-muted-foreground">{topic.region}</p>
                    </div>
                  </div>
                  {getHealthBadge(status)}
                </div>
              </CardHeader>
              
              <CardContent className="space-y-4">
                {/* Health Metrics */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="text-center">
                    <div className="text-2xl font-bold text-primary">{topic.total_sources}</div>
                    <div className="text-xs text-muted-foreground">Total Sources</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-green-600">{topic.active_sources}</div>
                    <div className="text-xs text-muted-foreground">Active</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-red-600">{topic.failing_sources}</div>
                    <div className="text-xs text-muted-foreground">Failing</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold">{topic.success_rate}%</div>
                    <div className="text-xs text-muted-foreground">Success Rate</div>
                  </div>
                </div>

                {/* Success Rate Progress */}
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span>Overall Health</span>
                    <span>{topic.success_rate}%</span>
                  </div>
                  <Progress value={topic.success_rate} className="h-2" />
                </div>

                {/* Issues List */}
                {topic.issues.length > 0 && (
                  <div className="bg-muted/50 rounded-lg p-3">
                    <h4 className="font-medium text-sm mb-2 flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4 text-orange-500" />
                      Issues ({topic.issues.length})
                    </h4>
                    <div className="space-y-1">
                      {topic.issues.map((issue, index) => (
                        <div key={index} className="text-sm text-muted-foreground flex items-center gap-2">
                          <div className="w-1 h-1 bg-orange-500 rounded-full" />
                          {issue}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Last Activity */}
                {topic.last_successful_scrape && (
                  <div className="text-xs text-muted-foreground">
                    Last successful scrape: {new Date(topic.last_successful_scrape).toLocaleString()}
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {topicHealthData.length === 0 && (
        <Card>
          <CardContent className="p-8 text-center">
            <Activity className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="font-medium mb-2">No Topics Found</h3>
            <p className="text-muted-foreground text-sm">
              No active topics to monitor. Create some topics to see their health status.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}