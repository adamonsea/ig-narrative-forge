import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { supabase } from "@/integrations/supabase/client";
import { AlertCircle, CheckCircle, AlertTriangle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

interface TopicHealthIndicatorProps {
  topicId: string;
  topicName: string;
}

interface HealthMetrics {
  status: 'healthy' | 'warning' | 'critical';
  activeSources: number;
  inactiveSources: number;
  criticalSourcesInactive: number;
  failingSources: number;
  staleSources: number;
  articlesThisWeek: number;
  articlesLastWeek: number;
  flowDropPercentage: number;
}

export const TopicHealthIndicator = ({ topicId, topicName }: TopicHealthIndicatorProps) => {
  const [health, setHealth] = useState<HealthMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const checkHealth = async () => {
    try {
      setRefreshing(true);

      // Get sources for this topic
      const { data: topicSources } = await supabase
        .from('topic_sources')
        .select(`
          source_id,
          content_sources (
            id,
            source_name,
            is_active,
            is_critical,
            consecutive_failures,
            last_scraped_at
          )
        `)
        .eq('topic_id', topicId)
        .eq('is_active', true);

      const sources = topicSources?.map(ts => ts.content_sources).filter(Boolean) || [];
      
      const activeSources = sources.filter(s => s.is_active).length;
      const inactiveSources = sources.filter(s => !s.is_active).length;
      const criticalSourcesInactive = sources.filter(s => s.is_critical && !s.is_active).length;
      const failingSources = sources.filter(s => s.is_active && s.consecutive_failures >= 3).length;

      // Check for stale sources (not scraped in 48+ hours)
      const now = new Date();
      const staleSources = sources.filter(s => {
        if (!s.last_scraped_at || !s.is_active) return false;
        const hoursSinceLastScrape = (now.getTime() - new Date(s.last_scraped_at).getTime()) / (1000 * 60 * 60);
        return hoursSinceLastScrape > 48;
      }).length;

      // Check article flow
      const oneWeekAgo = new Date();
      oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
      const twoWeeksAgo = new Date();
      twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14);

      const { count: thisWeekArticles } = await supabase
        .from('topic_articles')
        .select('id', { count: 'exact', head: true })
        .eq('topic_id', topicId)
        .gte('created_at', oneWeekAgo.toISOString());

      const { count: lastWeekArticles } = await supabase
        .from('topic_articles')
        .select('id', { count: 'exact', head: true })
        .eq('topic_id', topicId)
        .gte('created_at', twoWeeksAgo.toISOString())
        .lt('created_at', oneWeekAgo.toISOString());

      const flowDropPercentage = lastWeekArticles && lastWeekArticles > 0
        ? ((lastWeekArticles - (thisWeekArticles || 0)) / lastWeekArticles) * 100
        : 0;

      // Determine overall health status
      let status: 'healthy' | 'warning' | 'critical' = 'healthy';

      if (
        criticalSourcesInactive > 0 ||
        sources.length === 0 ||
        (sources.length > 0 && activeSources === 0) ||
        flowDropPercentage >= 75
      ) {
        status = 'critical';
      } else if (
        failingSources > 0 ||
        staleSources > 0 ||
        flowDropPercentage >= 50
      ) {
        status = 'warning';
      }

      setHealth({
        status,
        activeSources,
        inactiveSources,
        criticalSourcesInactive,
        failingSources,
        staleSources,
        articlesThisWeek: thisWeekArticles || 0,
        articlesLastWeek: lastWeekArticles || 0,
        flowDropPercentage: Math.round(flowDropPercentage)
      });

    } catch (error) {
      console.error('Error checking topic health:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    checkHealth();
    // Refresh every 5 minutes
    const interval = setInterval(checkHealth, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [topicId]);

  if (loading || !health) {
    return (
      <Card className="border-border/50">
        <CardContent className="p-4">
          <div className="flex items-center gap-2 text-muted-foreground">
            <RefreshCw className="w-4 h-4 animate-spin" />
            <span className="text-sm">Checking health...</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  const getStatusIcon = () => {
    switch (health.status) {
      case 'healthy':
        return <CheckCircle className="w-5 h-5 text-green-500" />;
      case 'warning':
        return <AlertTriangle className="w-5 h-5 text-yellow-500" />;
      case 'critical':
        return <AlertCircle className="w-5 h-5 text-destructive" />;
    }
  };

  const getStatusText = () => {
    switch (health.status) {
      case 'healthy':
        return 'All systems operational';
      case 'warning':
        return 'Some issues detected';
      case 'critical':
        return 'Critical issues require attention';
    }
  };

  const getStatusBadge = () => {
    switch (health.status) {
      case 'healthy':
        return <Badge variant="default" className="bg-green-500/10 text-green-700 hover:bg-green-500/20">🟢 Healthy</Badge>;
      case 'warning':
        return <Badge variant="default" className="bg-yellow-500/10 text-yellow-700 hover:bg-yellow-500/20">🟡 Warning</Badge>;
      case 'critical':
        return <Badge variant="destructive">🔴 Critical</Badge>;
    }
  };

  const issues = [];
  if (health.criticalSourcesInactive > 0) {
    issues.push(`${health.criticalSourcesInactive} critical source(s) inactive`);
  }
  if (health.failingSources > 0) {
    issues.push(`${health.failingSources} source(s) with failures`);
  }
  if (health.staleSources > 0) {
    issues.push(`${health.staleSources} source(s) not scraped in 48h`);
  }
  if (health.flowDropPercentage >= 50) {
    issues.push(`Article flow down ${health.flowDropPercentage}%`);
  }
  if (health.activeSources === 0 && health.inactiveSources > 0) {
    issues.push('All sources inactive');
  }

  return (
    <Card className="border-border/50">
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {getStatusIcon()}
            <div>
              <div className="flex items-center gap-2 mb-1">
                <h3 className="font-semibold text-sm">Topic Health</h3>
                {getStatusBadge()}
              </div>
              <p className="text-xs text-muted-foreground">{getStatusText()}</p>
            </div>
          </div>

          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={checkHealth}
                  disabled={refreshing}
                  className="h-8 w-8 p-0"
                >
                  <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Refresh health check</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>

        {/* Health Details */}
        <div className="mt-4 space-y-2 text-xs">
          <div className="flex justify-between items-center">
            <span className="text-muted-foreground">Active Sources:</span>
            <span className="font-medium">{health.activeSources} / {health.activeSources + health.inactiveSources}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-muted-foreground">Articles This Week:</span>
            <span className="font-medium">{health.articlesThisWeek}</span>
          </div>
          {health.articlesLastWeek > 0 && (
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground">vs Last Week:</span>
              <span className={`font-medium ${health.flowDropPercentage > 0 ? 'text-destructive' : 'text-green-600'}`}>
                {health.flowDropPercentage > 0 ? '-' : '+'}{Math.abs(health.flowDropPercentage)}%
              </span>
            </div>
          )}
        </div>

        {/* Issues List */}
        {issues.length > 0 && (
          <div className="mt-4 pt-4 border-t border-border/50">
            <p className="text-xs font-semibold mb-2 text-muted-foreground">Issues:</p>
            <ul className="space-y-1">
              {issues.map((issue, index) => (
                <li key={index} className="text-xs flex items-start gap-2">
                  <span className="text-destructive mt-0.5">•</span>
                  <span className="text-muted-foreground">{issue}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
