import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { 
  BarChart3, 
  TrendingUp, 
  AlertTriangle, 
  CheckCircle2,
  RefreshCw,
  Calendar,
  Target,
  Users,
  FileText,
  Clock
} from 'lucide-react';

interface AnalyticsData {
  performance_metrics: {
    total_articles: number;
    total_stories: number;
    average_quality_score: number;
    processing_success_rate: number;
    regional_relevance_avg: number;
  };
  source_performance: Array<{
    source_name: string;
    articles_count: number;
    success_rate: number;
    avg_quality: number;
    last_scraped: string;
  }>;
  quality_trends: Array<{
    date: string;
    avg_quality: number;
    total_processed: number;
  }>;
  content_analysis: {
    top_keywords: Array<{ keyword: string; count: number }>;
    regional_distribution: Array<{ region: string; count: number }>;
    status_breakdown: Array<{ status: string; count: number }>;
  };
  recommendations: string[];
}

export const AnalyticsDashboard = () => {
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [timeframe, setTimeframe] = useState('7d');
  const { toast } = useToast();

  const loadAnalytics = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase.functions.invoke('analytics-dashboard', {
        body: { timeframe }
      });

      if (error) throw error;

      if (data.success) {
        setAnalytics(data.data);
      } else {
        throw new Error(data.error);
      }
    } catch (error) {
      console.error('Error loading analytics:', error);
      toast({
        title: "Error loading analytics",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAnalytics();
  }, [timeframe]);

  const getScoreColor = (score: number): string => {
    if (score >= 80) return 'text-green-600';
    if (score >= 60) return 'text-yellow-600';
    return 'text-red-600';
  };

  const getScoreBadgeVariant = (score: number): "default" | "secondary" | "destructive" | "outline" => {
    if (score >= 80) return 'default';
    if (score >= 60) return 'secondary';
    return 'destructive';
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!analytics) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        <AlertTriangle className="w-12 h-12 mx-auto mb-4 opacity-50" />
        <p>No analytics data available</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Analytics Dashboard</h2>
          <p className="text-muted-foreground">Performance insights and system metrics</p>
        </div>
        
        <div className="flex items-center gap-3">
          <select
            value={timeframe}
            onChange={(e) => setTimeframe(e.target.value)}
            className="px-3 py-2 border rounded-md text-sm"
          >
            <option value="1d">Last 24 Hours</option>
            <option value="7d">Last 7 Days</option>
            <option value="30d">Last 30 Days</option>
            <option value="90d">Last 90 Days</option>
          </select>
          
          <Button
            size="sm"
            variant="outline"
            onClick={loadAnalytics}
            disabled={loading}
          >
            <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </div>

      {/* Performance Metrics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <FileText className="w-4 h-4" />
              Articles
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{analytics.performance_metrics.total_articles}</div>
            <p className="text-xs text-muted-foreground">Total processed</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <BarChart3 className="w-4 h-4" />
              Stories
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{analytics.performance_metrics.total_stories}</div>
            <p className="text-xs text-muted-foreground">Generated</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Target className="w-4 h-4" />
              Quality Score
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${getScoreColor(analytics.performance_metrics.average_quality_score)}`}>
              {Math.round(analytics.performance_metrics.average_quality_score)}
            </div>
            <p className="text-xs text-muted-foreground">Average</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4" />
              Success Rate
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${getScoreColor(analytics.performance_metrics.processing_success_rate)}`}>
              {Math.round(analytics.performance_metrics.processing_success_rate)}%
            </div>
            <p className="text-xs text-muted-foreground">Processing</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Users className="w-4 h-4" />
              Regional Score
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${getScoreColor(analytics.performance_metrics.regional_relevance_avg)}`}>
              {Math.round(analytics.performance_metrics.regional_relevance_avg)}
            </div>
            <p className="text-xs text-muted-foreground">Relevance</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Source Performance */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="w-5 h-5" />
              Source Performance
            </CardTitle>
            <CardDescription>Performance metrics by content source</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {analytics.source_performance.map((source, index) => (
                <div key={index} className="flex items-center justify-between p-3 border rounded-lg">
                  <div className="flex-1">
                    <h4 className="font-medium">{source.source_name}</h4>
                    <div className="flex items-center gap-4 text-sm text-muted-foreground">
                      <span>{source.articles_count} articles</span>
                      <span>•</span>
                      <span>{source.success_rate}% success</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={getScoreBadgeVariant(source.success_rate)}>
                      {source.success_rate}%
                    </Badge>
                    <div className="text-xs text-muted-foreground">
                      {source.last_scraped === 'Never' ? 'Never' : 
                       new Date(source.last_scraped).toLocaleDateString()}
                    </div>
                  </div>
                </div>
              ))}
              
              {analytics.source_performance.length === 0 && (
                <div className="text-center py-8 text-muted-foreground">
                  <Clock className="w-8 h-8 mx-auto mb-2 opacity-50" />
                  <p>No source performance data available</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Content Analysis */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="w-5 h-5" />
              Content Analysis
            </CardTitle>
            <CardDescription>Keywords and regional distribution</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-6">
              {/* Top Keywords */}
              <div>
                <h4 className="font-medium mb-3">Top Keywords</h4>
                <div className="flex flex-wrap gap-2">
                  {analytics.content_analysis.top_keywords.slice(0, 10).map((keyword, index) => (
                    <Badge key={index} variant="outline">
                      {keyword.keyword} ({keyword.count})
                    </Badge>
                  ))}
                </div>
              </div>

              {/* Regional Distribution */}
              <div>
                <h4 className="font-medium mb-3">Regional Distribution</h4>
                <div className="space-y-2">
                  {analytics.content_analysis.regional_distribution.slice(0, 5).map((region, index) => (
                    <div key={index} className="flex items-center justify-between">
                      <span className="text-sm">{region.region}</span>
                      <Badge variant="secondary">{region.count}</Badge>
                    </div>
                  ))}
                </div>
              </div>

              {/* Status Breakdown */}
              <div>
                <h4 className="font-medium mb-3">Story Status</h4>
                <div className="space-y-2">
                  {analytics.content_analysis.status_breakdown.map((status, index) => (
                    <div key={index} className="flex items-center justify-between">
                      <span className="text-sm capitalize">{status.status.replace('_', ' ')}</span>
                      <Badge variant="outline">{status.count}</Badge>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Quality Trends */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="w-5 h-5" />
            Quality Trends
          </CardTitle>
          <CardDescription>Daily quality scores and processing volume</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {analytics.quality_trends.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-7 gap-2">
                {analytics.quality_trends.map((trend, index) => (
                  <div key={index} className="text-center p-3 border rounded-lg">
                    <div className="text-xs text-muted-foreground mb-1">
                      {new Date(trend.date).toLocaleDateString('en-US', { 
                        month: 'short', 
                        day: 'numeric' 
                      })}
                    </div>
                    <div className={`text-lg font-bold ${getScoreColor(trend.avg_quality)}`}>
                      {trend.avg_quality}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {trend.total_processed} processed
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                <BarChart3 className="w-8 h-8 mx-auto mb-2 opacity-50" />
                <p>No trend data available</p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Recommendations */}
      {analytics.recommendations.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5" />
              Recommendations
            </CardTitle>
            <CardDescription>AI-powered insights and optimization suggestions</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {analytics.recommendations.map((recommendation, index) => (
                <li key={index} className="flex items-start gap-2 p-3 bg-muted/50 rounded-lg">
                  <div className="w-2 h-2 rounded-full bg-primary mt-2 flex-shrink-0" />
                  <span className="text-sm">{recommendation}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
};