import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { AlertCircle, CheckCircle, Clock, Database, Activity, RotateCcw, Trash2, ArrowLeft } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface SystemHealth {
  overall_status: 'healthy' | 'unhealthy';
  timestamp: string;
  services: {
    database: {
      status: 'healthy' | 'unhealthy';
      error?: string;
    };
    job_queue: {
      status: 'healthy' | 'unhealthy';
      pending_jobs: number;
      error?: string;
    };
    error_rate: {
      status: 'healthy' | 'unhealthy' | 'unknown';
      recent_errors: number;
      error?: string;
    };
  };
}

interface JobRun {
  id: string;
  job_type: string;
  status: string;
  created_at: string;
  started_at?: string;
  completed_at?: string;
  error_message?: string;
  attempts: number;
}

interface ApiUsage {
  id: string;
  service_name: string;
  operation: string;
  cost_usd: number;
  tokens_used: number;
  created_at: string;
}

export const AdminPanel = () => {
  const [systemHealth, setSystemHealth] = useState<SystemHealth | null>(null);
  const [jobRuns, setJobRuns] = useState<JobRun[]>([]);
  const [apiUsage, setApiUsage] = useState<ApiUsage[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  const fetchSystemHealth = async () => {
    try {
      const { data, error } = await supabase.functions.invoke('health-check');
      if (error) throw error;
      setSystemHealth(data);
    } catch (error) {
      console.error('Failed to fetch system health:', error);
      toast({
        title: "Error",
        description: "Failed to fetch system health",
        variant: "destructive",
      });
    }
  };

  const fetchJobRuns = async () => {
    try {
      const { data, error } = await supabase
        .from('job_runs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(20);
      
      if (error) throw error;
      setJobRuns(data || []);
    } catch (error) {
      console.error('Failed to fetch job runs:', error);
    }
  };

  const fetchApiUsage = async () => {
    try {
      const { data, error } = await supabase
        .from('api_usage')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50);
      
      if (error) throw error;
      setApiUsage(data || []);
    } catch (error) {
      console.error('Failed to fetch API usage:', error);
    }
  };

  const triggerJobProcessor = async () => {
    try {
      const { error } = await supabase.functions.invoke('job-processor');
      if (error) throw error;
      
      toast({
        title: "Success",
        description: "Job processor triggered successfully",
      });
      
      // Refresh job runs
      fetchJobRuns();
    } catch (error) {
      console.error('Failed to trigger job processor:', error);
      toast({
        title: "Error",
        description: "Failed to trigger job processor",
        variant: "destructive",
      });
    }
  };

  const handleResetStuck = async () => {
    try {
      const response = await supabase.functions.invoke('reset-stuck-processing', {
        body: { action: 'reset_stuck_processing' }
      });
      
      if (response.error) throw response.error;
      
      toast({
        title: "Processing Reset",
        description: response.data?.message || "Stuck processing jobs have been reset successfully.",
      });
      
      // Refresh the data
      window.location.reload();
    } catch (error) {
      console.error('Error resetting stuck processing:', error);
      toast({
        title: "Reset Failed",
        description: "Failed to reset stuck processing jobs.",
        variant: "destructive",
      });
    }
  };

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      await Promise.all([
        fetchSystemHealth(),
        fetchJobRuns(),
        fetchApiUsage(),
      ]);
      setLoading(false);
    };

    loadData();
  }, []);

  const getStatusBadgeVariant = (status: string) => {
    switch (status) {
      case 'completed':
      case 'healthy':
      case 'up':
        return 'default';
      case 'failed':
      case 'unhealthy':
      case 'down':
        return 'destructive';
      case 'running':
      case 'pending':
        return 'secondary';
      default:
        return 'outline';
    }
  };

  const totalCost = apiUsage.reduce((sum, usage) => sum + Number(usage.cost_usd), 0);
  const totalTokens = apiUsage.reduce((sum, usage) => sum + usage.tokens_used, 0);

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-3xl font-bold">Admin Panel</h2>
        <Button onClick={() => window.location.reload()} variant="outline">
          Refresh Data
        </Button>
      </div>

      {/* System Health Overview */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">System Status</CardTitle>
            {systemHealth?.overall_status === 'healthy' ? (
              <CheckCircle className="h-4 w-4 text-green-600" />
            ) : (
              <AlertCircle className="h-4 w-4 text-red-600" />
            )}
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              <Badge variant={getStatusBadgeVariant(systemHealth?.overall_status || 'unknown')}>
                {String(systemHealth?.overall_status || 'Unknown')}
              </Badge>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pending Jobs</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{systemHealth?.services?.job_queue?.pending_jobs ?? 0}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total API Cost</CardTitle>
            <Database className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">${totalCost.toFixed(4)}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Tokens</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalTokens.toLocaleString()}</div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="jobs" className="space-y-4">
        <TabsList>
          <TabsTrigger value="jobs">Job Management</TabsTrigger>
          <TabsTrigger value="usage">API Usage</TabsTrigger>
          <TabsTrigger value="system">System Info</TabsTrigger>
        </TabsList>

        <TabsContent value="jobs" className="space-y-4">
          <div className="flex justify-between items-center">
            <h3 className="text-lg font-semibold">Recent Job Runs</h3>
            <div className="flex gap-2">
              <Button 
                onClick={handleResetStuck}
                variant="outline" 
                className="flex items-center gap-2"
              >
                <RotateCcw className="h-4 w-4" />
                Reset Stuck Processing
              </Button>
              
              <Button onClick={triggerJobProcessor}>
                Trigger Job Processor
              </Button>
            </div>
          </div>
          
          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left p-4">Job Type</th>
                      <th className="text-left p-4">Status</th>
                      <th className="text-left p-4">Created</th>
                      <th className="text-left p-4">Attempts</th>
                      <th className="text-left p-4">Error</th>
                    </tr>
                  </thead>
                  <tbody>
                    {jobRuns.map((job) => (
                      <tr key={job.id} className="border-b">
                        <td className="p-4 font-mono text-sm">{job.job_type}</td>
                        <td className="p-4">
                          <Badge variant={getStatusBadgeVariant(job.status)}>
                            {job.status}
                          </Badge>
                        </td>
                        <td className="p-4 text-sm text-muted-foreground">
                          {new Date(job.created_at).toLocaleString()}
                        </td>
                        <td className="p-4">{job.attempts}</td>
                        <td className="p-4 text-sm text-red-600 max-w-xs truncate">
                          {job.error_message || '-'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="usage" className="space-y-4">
          <h3 className="text-lg font-semibold">API Usage Tracking</h3>
          
          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left p-4">Service</th>
                      <th className="text-left p-4">Operation</th>
                      <th className="text-left p-4">Cost (USD)</th>
                      <th className="text-left p-4">Tokens</th>
                      <th className="text-left p-4">Timestamp</th>
                    </tr>
                  </thead>
                  <tbody>
                    {apiUsage.map((usage) => (
                      <tr key={usage.id} className="border-b">
                        <td className="p-4 font-medium">{usage.service_name}</td>
                        <td className="p-4 text-sm">{usage.operation}</td>
                        <td className="p-4 font-mono">${Number(usage.cost_usd).toFixed(4)}</td>
                        <td className="p-4">{usage.tokens_used.toLocaleString()}</td>
                        <td className="p-4 text-sm text-muted-foreground">
                          {new Date(usage.created_at).toLocaleString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="system" className="space-y-4">
          <h3 className="text-lg font-semibold">System Information</h3>
          
          {systemHealth && (
            <Card>
              <CardHeader>
                <CardTitle>Health Check Details</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm font-medium">Database</label>
                    <div className="mt-1">
                      <Badge variant={getStatusBadgeVariant(systemHealth.services.database.status)}>
                        {String(systemHealth.services.database.status)}
                      </Badge>
                    </div>
                  </div>
                  
                  <div>
                    <label className="text-sm font-medium">Job Queue</label>
                    <div className="mt-1">
                      <Badge variant={getStatusBadgeVariant(systemHealth.services.job_queue.status)}>
                        {String(systemHealth.services.job_queue.status)}
                      </Badge>
                    </div>
                  </div>
                  
                  <div>
                    <label className="text-sm font-medium">Recent Errors</label>
                    <div className="mt-1 text-lg font-semibold">
                      {systemHealth.services.error_rate.recent_errors}
                    </div>
                  </div>
                  
                  <div>
                    <label className="text-sm font-medium">Last Check</label>
                    <div className="mt-1 text-sm text-muted-foreground">
                      {new Date(systemHealth.timestamp).toLocaleString()}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
};