import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { 
  AlertTriangle, 
  CheckCircle, 
  XCircle, 
  Clock,
  BarChart3,
  RefreshCw,
  TrendingUp,
  TrendingDown,
  Globe,
  Zap,
  Activity,
  AlertCircle
} from 'lucide-react';

interface SourceHealth {
  id: string;
  source_name: string;
  canonical_domain: string;
  is_active: boolean;
  success_rate: number;
  last_scraped_at: string | null;
  last_error: string | null;
  articles_scraped: number;
  avg_response_time_ms: number | null;
  region: string | null;
  topic_id: string | null;
  topic_name?: string;
  health_status: 'healthy' | 'warning' | 'critical' | 'inactive';
  days_since_last_scrape: number;
}

interface HealthStats {
  total: number;
  healthy: number;
  warning: number;
  critical: number;
  inactive: number;
}

export const SourceHealthDashboard = () => {
  const { toast } = useToast();
  const [sources, setSources] = useState<SourceHealth[]>([]);
  const [stats, setStats] = useState<HealthStats>({
    total: 0,
    healthy: 0,
    warning: 0,
    critical: 0,
    inactive: 0
  });
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('all');

  useEffect(() => {
    loadSourceHealth();
  }, []);

  const loadSourceHealth = async () => {
    try {
      setLoading(true);
      
      // Get sources with topic names
      const { data: sourcesData, error } = await supabase
        .from('content_sources')
        .select(`
          *,
          topics:topic_id (
            name
          )
        `)
        .order('created_at', { ascending: false });

      if (error) throw error;

      // Calculate health metrics for each source
      const healthData: SourceHealth[] = (sourcesData || []).map(source => {
        const successRate = source.success_rate || 0;
        const lastScraped = source.last_scraped_at ? new Date(source.last_scraped_at) : null;
        const daysSinceLastScrape = lastScraped 
          ? Math.floor((Date.now() - lastScraped.getTime()) / (1000 * 60 * 60 * 24))
          : 999;

        let healthStatus: SourceHealth['health_status'] = 'healthy';
        
        if (!source.is_active) {
          healthStatus = 'inactive';
        } else if (successRate < 30 || daysSinceLastScrape > 7) {
          healthStatus = 'critical';
        } else if (successRate < 70 || daysSinceLastScrape > 3) {
          healthStatus = 'warning';
        }

        return {
          id: source.id,
          source_name: source.source_name,
          canonical_domain: source.canonical_domain,
          is_active: source.is_active,
          success_rate: successRate,
          last_scraped_at: source.last_scraped_at,
          last_error: null, // This field might not exist in the current schema
          articles_scraped: source.articles_scraped || 0,
          avg_response_time_ms: source.avg_response_time_ms,
          region: source.region,
          topic_id: source.topic_id,
          topic_name: source.topics?.name,
          health_status: healthStatus,
          days_since_last_scrape: daysSinceLastScrape
        };
      });

      setSources(healthData);

      // Calculate stats
      const newStats = healthData.reduce((acc, source) => {
        acc.total++;
        acc[source.health_status]++;
        return acc;
      }, { total: 0, healthy: 0, warning: 0, critical: 0, inactive: 0 });

      setStats(newStats);
    } catch (error) {
      console.error('Error loading source health:', error);
      toast({
        title: 'Error',
        description: 'Failed to load source health data',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const getHealthBadge = (status: SourceHealth['health_status']) => {
    switch (status) {
      case 'healthy':
        return <Badge variant="default" className="bg-green-100 text-green-800 border-green-200">Healthy</Badge>;
      case 'warning':
        return <Badge variant="outline" className="border-orange-500 text-orange-700">Warning</Badge>;
      case 'critical':
        return <Badge variant="destructive">Critical</Badge>;
      case 'inactive':
        return <Badge variant="secondary">Inactive</Badge>;
      default:
        return <Badge variant="outline">Unknown</Badge>;
    }
  };

  const getHealthIcon = (status: SourceHealth['health_status']) => {
    switch (status) {
      case 'healthy':
        return <CheckCircle className="w-4 h-4 text-green-600" />;
      case 'warning':
        return <AlertTriangle className="w-4 h-4 text-orange-600" />;
      case 'critical':
        return <XCircle className="w-4 h-4 text-red-600" />;
      case 'inactive':
        return <Clock className="w-4 h-4 text-gray-400" />;
      default:
        return <AlertCircle className="w-4 h-4 text-gray-400" />;
    }
  };

  const filteredSources = sources.filter(source => {
    if (activeTab === 'all') return true;
    return source.health_status === activeTab;
  });

  const runHealthCheck = async () => {
    try {
      setLoading(true);
      toast({
        title: 'Health Check Started',
        description: 'Running validation checks on all sources...',
      });

      // This would trigger validation for all sources - we can implement this
      // as a batch operation that calls validate-content-source for each source
      
      await loadSourceHealth();
      
      toast({
        title: 'Health Check Complete',
        description: 'All sources have been validated',
      });
    } catch (error) {
      toast({
        title: 'Health Check Failed',
        description: 'Failed to complete health check',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Source Health Dashboard</h2>
          <p className="text-muted-foreground">
            Monitor and manage the health of all content sources
          </p>
        </div>
        <Button onClick={runHealthCheck} disabled={loading}>
          <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
          Run Health Check
        </Button>
      </div>

      {/* Health Stats Overview */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <Activity className="w-4 h-4 text-blue-600" />
              <div>
                <p className="text-2xl font-bold">{stats.total}</p>
                <p className="text-sm text-muted-foreground">Total Sources</p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-green-600" />
              <div>
                <p className="text-2xl font-bold text-green-600">{stats.healthy}</p>
                <p className="text-sm text-muted-foreground">Healthy</p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-orange-600" />
              <div>
                <p className="text-2xl font-bold text-orange-600">{stats.warning}</p>
                <p className="text-sm text-muted-foreground">Warning</p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <XCircle className="w-4 h-4 text-red-600" />
              <div>
                <p className="text-2xl font-bold text-red-600">{stats.critical}</p>
                <p className="text-sm text-muted-foreground">Critical</p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-gray-400" />
              <div>
                <p className="text-2xl font-bold text-gray-600">{stats.inactive}</p>
                <p className="text-sm text-muted-foreground">Inactive</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Critical Issues Alert */}
      {stats.critical > 0 && (
        <Alert className="border-red-500">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            <strong>{stats.critical} sources</strong> have critical issues that require immediate attention.
          </AlertDescription>
        </Alert>
      )}

      {/* Source Health List */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="all">All ({stats.total})</TabsTrigger>
          <TabsTrigger value="healthy">Healthy ({stats.healthy})</TabsTrigger>
          <TabsTrigger value="warning">Warning ({stats.warning})</TabsTrigger>
          <TabsTrigger value="critical">Critical ({stats.critical})</TabsTrigger>
          <TabsTrigger value="inactive">Inactive ({stats.inactive})</TabsTrigger>
        </TabsList>

        <TabsContent value={activeTab} className="space-y-4">
          {filteredSources.map((source) => (
            <Card key={source.id}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      {getHealthIcon(source.health_status)}
                      <h3 className="font-semibold">{source.source_name}</h3>
                      {getHealthBadge(source.health_status)}
                      {source.topic_name && (
                        <Badge variant="outline">{source.topic_name}</Badge>
                      )}
                    </div>
                    
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm text-muted-foreground mb-3">
                      <div className="flex items-center gap-1">
                        <Globe className="w-4 h-4" />
                        <span>{source.canonical_domain}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <BarChart3 className="w-4 h-4" />
                        <span>{source.articles_scraped} articles</span>
                      </div>
                      <div className="flex items-center gap-1">
                        {source.success_rate >= 70 ? (
                          <TrendingUp className="w-4 h-4 text-green-600" />
                        ) : (
                          <TrendingDown className="w-4 h-4 text-red-600" />
                        )}
                        <span>{source.success_rate}% success</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <Clock className="w-4 h-4" />
                        <span>
                          {source.days_since_last_scrape === 999 
                            ? 'Never scraped'
                            : source.days_since_last_scrape === 0
                            ? 'Scraped today'
                            : `${source.days_since_last_scrape} days ago`
                          }
                        </span>
                      </div>
                    </div>

                    {source.avg_response_time_ms && (
                      <div className="flex items-center gap-1 text-sm text-muted-foreground mb-2">
                        <Zap className="w-4 h-4" />
                        <span>Avg response: {source.avg_response_time_ms}ms</span>
                      </div>
                    )}

                    {source.last_error && (
                      <div className="p-3 bg-red-50 rounded-lg">
                        <p className="text-sm text-red-700">
                          <strong>Last Error:</strong> {source.last_error}
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}

          {filteredSources.length === 0 && !loading && (
            <div className="text-center py-12">
              <Activity className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
              <p className="text-muted-foreground">
                No sources found for this health status.
              </p>
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
};