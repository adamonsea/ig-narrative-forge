import { useState, useEffect } from 'react';
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
  TrendingUp
} from "lucide-react";

interface DashboardData {
  overview: {
    active_schedules: number;
    average_success_rate: number;
    jobs_last_24h: number;
    articles_last_7d: number;
    attribution_issues: number;
  };
  jobs_by_status: Record<string, number>;
  articles_per_day: Record<string, number>;
  next_runs: any[];
  health_status: 'healthy' | 'warning' | 'critical';
}

interface AttributionIssue {
  id: string;
  extracted_publication: string;
  source_url: string;
  detected_domain: string;
  validation_status: string;
  created_at: string;
  articles: { id: string; title: string } | null;
}

export const ScheduleMonitor = () => {
  const [dashboardData, setDashboardData] = useState<DashboardData | null>(null);
  const [attributionIssues, setAttributionIssues] = useState<AttributionIssue[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('dashboard');
  const { toast } = useToast();

  const fetchDashboardData = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('scrape-monitor', {
        body: { action: 'dashboard' }
      });

      if (error) throw error;
      setDashboardData(data);
    } catch (error: any) {
      toast({
        title: "Error",
        description: `Failed to fetch dashboard data: ${error.message}`,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const fetchAttributionIssues = async () => {
    try {
      const { data, error } = await supabase.functions.invoke('scrape-monitor', {
        body: { action: 'attribution-issues' }
      });

      if (error) throw error;
      setAttributionIssues(data.issues || []);
    } catch (error: any) {
      toast({
        title: "Error", 
        description: `Failed to fetch attribution issues: ${error.message}`,
        variant: "destructive",
      });
    }
  };

  const validateAttribution = async (attributionId: string, isValid: boolean, reason?: string) => {
    try {
      const { error } = await supabase.functions.invoke('scrape-monitor', {
        body: { 
          action: 'validate-attribution',
          attributionId,
          isValid,
          reason
        }
      });

      if (error) throw error;

      toast({
        title: "Success",
        description: `Attribution ${isValid ? 'validated' : 'rejected'} successfully`,
      });

      fetchAttributionIssues();
    } catch (error: any) {
      toast({
        title: "Error",
        description: `Failed to validate attribution: ${error.message}`,
        variant: "destructive",
      });
    }
  };

  const runManualScheduler = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('automated-scheduler');
      
      if (error) throw error;
      
      toast({
        title: "Success",
        description: `Manual scheduler run completed. ${data.successful_scrapes} sources processed successfully.`,
      });

      fetchDashboardData();
    } catch (error: any) {
      toast({
        title: "Error",
        description: `Scheduler run failed: ${error.message}`,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboardData();
    fetchAttributionIssues();
  }, []);

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
          <h2 className="text-3xl font-bold">Scraping Monitor</h2>
          <p className="text-muted-foreground">Monitor automated scraping schedules and source attribution</p>
        </div>
        <div className="flex gap-2">
          <Button 
            onClick={fetchDashboardData} 
            variant="outline" 
            size="sm"
            disabled={loading}
          >
            <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          <Button 
            onClick={runManualScheduler}
            disabled={loading}
          >
            <Activity className="w-4 h-4 mr-2" />
            Run Scheduler
          </Button>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="dashboard">Dashboard</TabsTrigger>
          <TabsTrigger value="attribution">Attribution Issues</TabsTrigger>
          <TabsTrigger value="schedules">Schedule Health</TabsTrigger>
        </TabsList>

        <TabsContent value="dashboard" className="space-y-4">
          {dashboardData && (
            <>
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Active Schedules</CardTitle>
                    <Calendar className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{dashboardData.overview.active_schedules}</div>
                    <div className="flex items-center mt-1">
                      {getHealthBadge(dashboardData.health_status)}
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Success Rate</CardTitle>
                    <TrendingUp className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{dashboardData.overview.average_success_rate}%</div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Jobs (24h)</CardTitle>
                    <Activity className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{dashboardData.overview.jobs_last_24h}</div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Articles (7d)</CardTitle>
                    <CheckCircle className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{dashboardData.overview.articles_last_7d}</div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Attribution Issues</CardTitle>
                    <AlertTriangle className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold text-destructive">
                      {dashboardData.overview.attribution_issues}
                    </div>
                  </CardContent>
                </Card>
              </div>

              <Card>
                <CardHeader>
                  <CardTitle>Next Scheduled Runs</CardTitle>
                  <CardDescription>Upcoming automated scraping jobs</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {dashboardData.next_runs.map((run, index) => (
                      <div key={run.id} className="flex items-center justify-between p-2 rounded border">
                        <div>
                          <p className="font-medium">{run.content_sources?.source_name}</p>
                          <p className="text-sm text-muted-foreground">{run.content_sources?.feed_url}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-medium">
                            {new Date(run.next_run_at).toLocaleString()}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {new Date(run.next_run_at) > new Date() ? 'Scheduled' : 'Overdue'}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </>
          )}
        </TabsContent>

        <TabsContent value="attribution" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Source Attribution Issues</CardTitle>
              <CardDescription>Articles with source attribution problems requiring review</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {attributionIssues.map((issue) => (
                  <div key={issue.id} className="border rounded p-4 space-y-3">
                    <div>
                      <h4 className="font-medium">{issue.articles?.title || 'Unknown Article'}</h4>
                      <p className="text-sm text-muted-foreground mt-1">
                        Detected as: <span className="font-medium">{issue.extracted_publication}</span>
                      </p>
                      <p className="text-sm text-muted-foreground">
                        Source URL: <span className="font-mono">{issue.source_url}</span>
                      </p>
                      <p className="text-sm text-muted-foreground">
                        Domain: <span className="font-mono">{issue.detected_domain}</span>
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <Button 
                        size="sm" 
                        onClick={() => validateAttribution(issue.id, true)}
                      >
                        <CheckCircle className="w-4 h-4 mr-2" />
                        Validate
                      </Button>
                      <Button 
                        size="sm" 
                        variant="destructive"
                        onClick={() => validateAttribution(issue.id, false, 'Manual review rejected')}
                      >
                        <XCircle className="w-4 h-4 mr-2" />
                        Reject
                      </Button>
                    </div>
                  </div>
                ))}
                
                {attributionIssues.length === 0 && (
                  <div className="text-center py-8 text-muted-foreground">
                    <CheckCircle className="w-12 h-12 mx-auto mb-4" />
                    <p>No attribution issues found!</p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="schedules" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Schedule Health Monitor</CardTitle>
              <CardDescription>Monitor the health of automated scraping schedules</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground">Schedule health monitoring will be displayed here</p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};