import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { supabase } from '@/integrations/supabase/client';
import { 
  Activity, 
  CheckCircle, 
  AlertTriangle, 
  Clock, 
  TrendingUp,
  RefreshCw,
  Zap
} from 'lucide-react';

interface ScrapingStats {
  totalSources: number;
  activeSources: number;
  recentScrapes: number;
  successRate: number;
  avgResponseTime: number;
  recentArticles: number;
  qualityImprovement: number;
}

interface RecentActivity {
  id: string;
  created_at: string;
  level: string;
  message: string;
  context: any;
}

export const ScrapingStatusMonitor = () => {
  const [stats, setStats] = useState<ScrapingStats>({
    totalSources: 0,
    activeSources: 0,
    recentScrapes: 0,
    successRate: 0,
    avgResponseTime: 0,
    recentArticles: 0,
    qualityImprovement: 0
  });
  
  const [recentActivity, setRecentActivity] = useState<RecentActivity[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadStats();
    loadRecentActivity();
    
    // Refresh every 30 seconds
    const interval = setInterval(() => {
      loadStats();
      loadRecentActivity();
    }, 30000);
    
    return () => clearInterval(interval);
  }, []);

  const loadStats = async () => {
    try {
      // Get sources stats
      const { data: sources } = await supabase
        .from('content_sources')
        .select('*');

      // Get recent articles (last 24 hours)
      const { data: recentArticles } = await supabase
        .from('articles')
        .select('content_quality_score, created_at')
        .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());

      // Get older articles for comparison (previous 24 hours)
      const { data: olderArticles } = await supabase
        .from('articles')
        .select('content_quality_score')
        .lt('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
        .gte('created_at', new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString());

      if (sources) {
        const activeSources = sources.filter(s => s.is_active);
        const totalScrapes = sources.reduce((sum, s) => sum + (s.articles_scraped || 0), 0);
        const avgSuccessRate = sources.reduce((sum, s) => sum + (s.success_rate || 0), 0) / sources.length;
        const avgResponseTime = sources.reduce((sum, s) => sum + (s.avg_response_time_ms || 0), 0) / sources.length;

        // Calculate quality improvement
        const recentAvgQuality = recentArticles?.length > 0 
          ? recentArticles.reduce((sum, a) => sum + (a.content_quality_score || 0), 0) / recentArticles.length
          : 0;
        
        const olderAvgQuality = olderArticles?.length > 0
          ? olderArticles.reduce((sum, a) => sum + (a.content_quality_score || 0), 0) / olderArticles.length
          : 0;

        const qualityImprovement = olderAvgQuality > 0 
          ? ((recentAvgQuality - olderAvgQuality) / olderAvgQuality) * 100
          : 0;

        setStats({
          totalSources: sources.length,
          activeSources: activeSources.length,
          recentScrapes: totalScrapes,
          successRate: avgSuccessRate,
          avgResponseTime: avgResponseTime,
          recentArticles: recentArticles?.length || 0,
          qualityImprovement
        });
      }
    } catch (error) {
      console.error('Error loading stats:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadRecentActivity = async () => {
    try {
      const { data } = await supabase
        .from('system_logs')
        .select('*')
        .eq('function_name', 'universal-scraper')
        .order('created_at', { ascending: false })
        .limit(10);

      if (data) {
        setRecentActivity(data);
      }
    } catch (error) {
      console.error('Error loading recent activity:', error);
    }
  };

  const getStatusColor = (level: string) => {
    switch (level) {
      case 'info': return 'text-green-600';
      case 'warn': return 'text-yellow-600';
      case 'error': return 'text-red-600';
      default: return 'text-muted-foreground';
    }
  };

  const getStatusIcon = (level: string) => {
    switch (level) {
      case 'info': return <CheckCircle className="w-4 h-4" />;
      case 'warn': return <AlertTriangle className="w-4 h-4" />;
      case 'error': return <AlertTriangle className="w-4 h-4" />;
      default: return <Activity className="w-4 h-4" />;
    }
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="flex items-center justify-center">
            <RefreshCw className="w-6 h-6 animate-spin" />
            <span className="ml-2">Loading scraping status...</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Enhanced Scraping Performance</h3>
          <p className="text-sm text-muted-foreground">
            Universal scraper with site-specific optimizations
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => { loadStats(); loadRecentActivity(); }}>
          <RefreshCw className="w-4 h-4 mr-2" />
          Refresh
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Active Sources</p>
                <p className="text-2xl font-bold">{stats.activeSources}</p>
              </div>
              <Activity className="w-8 h-8 text-green-600" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Success Rate</p>
                <p className="text-2xl font-bold">{stats.successRate.toFixed(1)}%</p>
              </div>
              <TrendingUp className="w-8 h-8 text-blue-600" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Avg Response</p>
                <p className="text-2xl font-bold">{Math.round(stats.avgResponseTime)}ms</p>
              </div>
              <Zap className="w-8 h-8 text-yellow-600" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Recent Articles</p>
                <p className="text-2xl font-bold">{stats.recentArticles}</p>
              </div>
              <Clock className="w-8 h-8 text-purple-600" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Quality Improvement Banner */}
      {stats.qualityImprovement !== 0 && (
        <Card className={stats.qualityImprovement > 0 ? 'border-green-200 bg-green-50' : 'border-red-200 bg-red-50'}>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <TrendingUp className={`w-6 h-6 ${stats.qualityImprovement > 0 ? 'text-green-600' : 'text-red-600'}`} />
              <div>
                <p className="font-semibold">
                  Content Quality {stats.qualityImprovement > 0 ? 'Improved' : 'Declined'} by {Math.abs(stats.qualityImprovement).toFixed(1)}%
                </p>
                <p className="text-sm text-muted-foreground">
                  Enhanced extraction is {stats.qualityImprovement > 0 ? 'working better' : 'under monitoring'} compared to previous 24 hours
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Recent Activity */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Recent Scraping Activity</CardTitle>
        </CardHeader>
        <CardContent>
          {recentActivity.length > 0 ? (
            <div className="space-y-3">
              {recentActivity.map((activity, index) => (
                <div key={activity.id}>
                  <div className="flex items-start gap-3">
                    <div className={getStatusColor(activity.level)}>
                      {getStatusIcon(activity.level)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-medium truncate">
                          {activity.message}
                        </p>
                        <span className="text-xs text-muted-foreground ml-2">
                          {new Date(activity.created_at).toLocaleTimeString()}
                        </span>
                      </div>
                      {activity.context && (
                        <div className="mt-1 flex gap-2 flex-wrap">
                          {activity.context.method && (
                            <Badge variant="outline" className="text-xs">
                              {activity.context.method}
                            </Badge>
                          )}
                          {activity.context.articlesFound && (
                            <Badge variant="outline" className="text-xs">
                              {activity.context.articlesFound} found
                            </Badge>
                          )}
                          {activity.context.stored && (
                            <Badge variant="outline" className="text-xs">
                              {activity.context.stored} stored
                            </Badge>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                  {index < recentActivity.length - 1 && <Separator className="mt-3" />}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-muted-foreground text-center py-4">
              No recent scraping activity
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
};