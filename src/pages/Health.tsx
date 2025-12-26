import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { supabase } from '@/integrations/supabase/client';
import { 
  CheckCircle2, 
  XCircle, 
  AlertTriangle, 
  RefreshCw, 
  Database, 
  Users, 
  FileText, 
  Radio,
  Clock,
  Activity
} from 'lucide-react';
import { BRAND } from '@/lib/constants/branding';

interface ServiceStatus {
  status: 'healthy' | 'degraded' | 'unhealthy' | 'checking';
  message?: string;
  latency?: number;
}

interface HealthData {
  database: ServiceStatus;
  auth: ServiceStatus;
  storyPipeline: ServiceStatus;
  sources: ServiceStatus;
  lastChecked: Date | null;
}

const StatusIcon = ({ status }: { status: ServiceStatus['status'] }) => {
  switch (status) {
    case 'healthy':
      return <CheckCircle2 className="h-5 w-5 text-green-500" />;
    case 'degraded':
      return <AlertTriangle className="h-5 w-5 text-yellow-500" />;
    case 'unhealthy':
      return <XCircle className="h-5 w-5 text-red-500" />;
    case 'checking':
      return <RefreshCw className="h-5 w-5 text-muted-foreground animate-spin" />;
  }
};

const StatusBadge = ({ status }: { status: ServiceStatus['status'] }) => {
  const variants: Record<ServiceStatus['status'], string> = {
    healthy: 'bg-green-500/10 text-green-600 border-green-500/20',
    degraded: 'bg-yellow-500/10 text-yellow-600 border-yellow-500/20',
    unhealthy: 'bg-red-500/10 text-red-600 border-red-500/20',
    checking: 'bg-muted text-muted-foreground border-border',
  };
  
  const labels: Record<ServiceStatus['status'], string> = {
    healthy: 'Operational',
    degraded: 'Degraded',
    unhealthy: 'Outage',
    checking: 'Checking...',
  };

  return (
    <Badge variant="outline" className={variants[status]}>
      {labels[status]}
    </Badge>
  );
};

const ServiceCard = ({ 
  title, 
  icon: Icon, 
  service 
}: { 
  title: string; 
  icon: React.ElementType; 
  service: ServiceStatus;
}) => (
  <div className="flex items-center justify-between p-4 rounded-lg border bg-card">
    <div className="flex items-center gap-3">
      <div className="p-2 rounded-md bg-muted">
        <Icon className="h-5 w-5 text-muted-foreground" />
      </div>
      <div>
        <p className="font-medium">{title}</p>
        {service.message && (
          <p className="text-sm text-muted-foreground">{service.message}</p>
        )}
        {service.latency !== undefined && service.status !== 'checking' && (
          <p className="text-xs text-muted-foreground">{service.latency}ms response</p>
        )}
      </div>
    </div>
    <div className="flex items-center gap-2">
      <StatusBadge status={service.status} />
      <StatusIcon status={service.status} />
    </div>
  </div>
);

export default function Health() {
  const [health, setHealth] = useState<HealthData>({
    database: { status: 'checking' },
    auth: { status: 'checking' },
    storyPipeline: { status: 'checking' },
    sources: { status: 'checking' },
    lastChecked: null,
  });
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [stats, setStats] = useState<{
    totalTopics: number;
    totalStories: number;
    activeSources: number;
    latestStoryTime: string | null;
  } | null>(null);

  const checkHealth = async () => {
    setIsRefreshing(true);
    const startTime = Date.now();

    // Check database connectivity
    const dbStart = Date.now();
    try {
      const { data, error } = await supabase
        .from('topics')
        .select('id', { count: 'exact', head: true });
      
      const dbLatency = Date.now() - dbStart;
      
      if (error) {
        setHealth(prev => ({
          ...prev,
          database: { 
            status: 'unhealthy', 
            message: error.message,
            latency: dbLatency 
          }
        }));
      } else {
        setHealth(prev => ({
          ...prev,
          database: { 
            status: dbLatency > 2000 ? 'degraded' : 'healthy',
            message: dbLatency > 2000 ? 'Slow response time' : 'Connected',
            latency: dbLatency 
          }
        }));
      }
    } catch (err) {
      setHealth(prev => ({
        ...prev,
        database: { 
          status: 'unhealthy', 
          message: 'Connection failed' 
        }
      }));
    }

    // Check auth service
    const authStart = Date.now();
    try {
      const { data, error } = await supabase.auth.getSession();
      const authLatency = Date.now() - authStart;
      
      setHealth(prev => ({
        ...prev,
        auth: { 
          status: error ? 'unhealthy' : (authLatency > 2000 ? 'degraded' : 'healthy'),
          message: error ? error.message : 'Service available',
          latency: authLatency 
        }
      }));
    } catch (err) {
      setHealth(prev => ({
        ...prev,
        auth: { 
          status: 'unhealthy', 
          message: 'Auth service unreachable' 
        }
      }));
    }

    // Check story pipeline (recent stories)
    try {
      const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const { data: recentStories, error } = await supabase
        .from('stories')
        .select('id, created_at')
        .gte('created_at', oneDayAgo)
        .order('created_at', { ascending: false })
        .limit(1);
      
      if (error) {
        setHealth(prev => ({
          ...prev,
          storyPipeline: { status: 'unhealthy', message: error.message }
        }));
      } else if (!recentStories || recentStories.length === 0) {
        setHealth(prev => ({
          ...prev,
          storyPipeline: { 
            status: 'degraded', 
            message: 'No stories in last 24 hours' 
          }
        }));
      } else {
        const latestTime = new Date(recentStories[0].created_at);
        const hoursAgo = Math.round((Date.now() - latestTime.getTime()) / (1000 * 60 * 60));
        setHealth(prev => ({
          ...prev,
          storyPipeline: { 
            status: 'healthy', 
            message: `Latest story ${hoursAgo}h ago` 
          }
        }));
      }
    } catch (err) {
      setHealth(prev => ({
        ...prev,
        storyPipeline: { status: 'unhealthy', message: 'Check failed' }
      }));
    }

    // Check content sources
    try {
      const { data: sources, error } = await supabase
        .from('content_sources')
        .select('id, is_active, consecutive_failures')
        .eq('is_active', true);
      
      if (error) {
        setHealth(prev => ({
          ...prev,
          sources: { status: 'unhealthy', message: error.message }
        }));
      } else {
        const totalActive = sources?.length || 0;
        const failingSources = sources?.filter(s => (s.consecutive_failures || 0) >= 3).length || 0;
        
        if (totalActive === 0) {
          setHealth(prev => ({
            ...prev,
            sources: { status: 'unhealthy', message: 'No active sources' }
          }));
        } else if (failingSources > totalActive * 0.3) {
          setHealth(prev => ({
            ...prev,
            sources: { 
              status: 'degraded', 
              message: `${failingSources} of ${totalActive} sources failing` 
            }
          }));
        } else {
          setHealth(prev => ({
            ...prev,
            sources: { 
              status: 'healthy', 
              message: `${totalActive} active sources` 
            }
          }));
        }
      }
    } catch (err) {
      setHealth(prev => ({
        ...prev,
        sources: { status: 'unhealthy', message: 'Check failed' }
      }));
    }

    // Fetch stats
    try {
      const [topicsRes, storiesRes, sourcesRes, latestStoryRes] = await Promise.all([
        supabase.from('topics').select('id', { count: 'exact', head: true }),
        supabase.from('stories').select('id', { count: 'exact', head: true }),
        supabase.from('content_sources').select('id', { count: 'exact', head: true }).eq('is_active', true),
        supabase.from('stories').select('created_at').order('created_at', { ascending: false }).limit(1),
      ]);

      setStats({
        totalTopics: topicsRes.count || 0,
        totalStories: storiesRes.count || 0,
        activeSources: sourcesRes.count || 0,
        latestStoryTime: latestStoryRes.data?.[0]?.created_at || null,
      });
    } catch (err) {
      console.error('Failed to fetch stats:', err);
    }

    setHealth(prev => ({ ...prev, lastChecked: new Date() }));
    setIsRefreshing(false);
  };

  useEffect(() => {
    checkHealth();
    
    // Auto-refresh every 30 seconds
    const interval = setInterval(checkHealth, 30000);
    return () => clearInterval(interval);
  }, []);

  const overallStatus = (): ServiceStatus['status'] => {
    const statuses = [health.database.status, health.auth.status, health.storyPipeline.status, health.sources.status];
    if (statuses.some(s => s === 'unhealthy')) return 'unhealthy';
    if (statuses.some(s => s === 'degraded')) return 'degraded';
    if (statuses.some(s => s === 'checking')) return 'checking';
    return 'healthy';
  };

  const formatTime = (date: Date | null) => {
    if (!date) return 'Never';
    return date.toLocaleTimeString();
  };

  const formatLatestStory = (isoString: string | null) => {
    if (!isoString) return 'No stories yet';
    const date = new Date(isoString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);
    
    if (diffMins < 60) return `${diffMins} minutes ago`;
    if (diffHours < 24) return `${diffHours} hours ago`;
    return `${diffDays} days ago`;
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="container max-w-4xl mx-auto py-12 px-4">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold tracking-tight mb-2">
            {BRAND.name} System Status
          </h1>
          <p className="text-muted-foreground">
            Real-time health monitoring for all platform services
          </p>
        </div>

        {/* Overall Status */}
        <Card className="mb-8">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className={`p-3 rounded-full ${
                  overallStatus() === 'healthy' ? 'bg-green-500/10' :
                  overallStatus() === 'degraded' ? 'bg-yellow-500/10' :
                  overallStatus() === 'unhealthy' ? 'bg-red-500/10' :
                  'bg-muted'
                }`}>
                  <Activity className={`h-8 w-8 ${
                    overallStatus() === 'healthy' ? 'text-green-500' :
                    overallStatus() === 'degraded' ? 'text-yellow-500' :
                    overallStatus() === 'unhealthy' ? 'text-red-500' :
                    'text-muted-foreground'
                  }`} />
                </div>
                <div>
                  <h2 className="text-xl font-semibold">
                    {overallStatus() === 'healthy' && 'All Systems Operational'}
                    {overallStatus() === 'degraded' && 'Partial Service Degradation'}
                    {overallStatus() === 'unhealthy' && 'Service Disruption Detected'}
                    {overallStatus() === 'checking' && 'Checking Systems...'}
                  </h2>
                  <p className="text-sm text-muted-foreground flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    Last checked: {formatTime(health.lastChecked)}
                  </p>
                </div>
              </div>
              <Button 
                variant="outline" 
                size="sm" 
                onClick={checkHealth}
                disabled={isRefreshing}
              >
                <RefreshCw className={`h-4 w-4 mr-2 ${isRefreshing ? 'animate-spin' : ''}`} />
                Refresh
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Services Grid */}
        <Card className="mb-8">
          <CardHeader>
            <CardTitle>Service Status</CardTitle>
            <CardDescription>Current status of all platform components</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <ServiceCard 
              title="Database" 
              icon={Database} 
              service={health.database} 
            />
            <ServiceCard 
              title="Authentication" 
              icon={Users} 
              service={health.auth} 
            />
            <ServiceCard 
              title="Story Pipeline" 
              icon={FileText} 
              service={health.storyPipeline} 
            />
            <ServiceCard 
              title="Content Sources" 
              icon={Radio} 
              service={health.sources} 
            />
          </CardContent>
        </Card>

        {/* Stats */}
        {stats && (
          <Card>
            <CardHeader>
              <CardTitle>Platform Metrics</CardTitle>
              <CardDescription>Current content statistics</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="text-center p-4 rounded-lg bg-muted/50">
                  <p className="text-2xl font-bold">{stats.totalTopics}</p>
                  <p className="text-sm text-muted-foreground">Topics</p>
                </div>
                <div className="text-center p-4 rounded-lg bg-muted/50">
                  <p className="text-2xl font-bold">{stats.totalStories.toLocaleString()}</p>
                  <p className="text-sm text-muted-foreground">Stories</p>
                </div>
                <div className="text-center p-4 rounded-lg bg-muted/50">
                  <p className="text-2xl font-bold">{stats.activeSources}</p>
                  <p className="text-sm text-muted-foreground">Active Sources</p>
                </div>
                <div className="text-center p-4 rounded-lg bg-muted/50">
                  <p className="text-2xl font-bold text-sm">{formatLatestStory(stats.latestStoryTime)}</p>
                  <p className="text-sm text-muted-foreground">Latest Story</p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Footer */}
        <div className="text-center mt-8 text-sm text-muted-foreground">
          <p>
            Having issues? Check the{' '}
            <a 
              href="https://supabase.com/dashboard/project/fpoywkjgdapgjtdeooak/settings/infrastructure" 
              target="_blank" 
              rel="noopener noreferrer"
              className="underline hover:text-foreground"
            >
              Supabase Dashboard
            </a>
            {' '}for detailed infrastructure status.
          </p>
        </div>
      </div>
    </div>
  );
}
