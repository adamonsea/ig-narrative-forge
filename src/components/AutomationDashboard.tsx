import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { Bot, Clock, Zap, Activity, Users, TrendingUp, AlertCircle, CheckCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { GlobalAutomationSettings } from "./GlobalAutomationSettings";

interface AutomationStatus {
  enabled: boolean;
  next_run_at?: string;
  last_run_at?: string;
  topics_processing: number;
  queue_size: number;
  success_rate: number;
}

interface TopicAutomationInfo {
  id: string;
  name: string;
  is_active: boolean;
  auto_simplify_enabled: boolean;
  last_articles_count: number;
  last_run_at?: string;
  next_run_at?: string;
  success_status: 'success' | 'warning' | 'error';
}

export const AutomationDashboard = () => {
  const [status, setStatus] = useState<AutomationStatus>({
    enabled: false,
    topics_processing: 0,
    queue_size: 0,
    success_rate: 100
  });
  const [topicStatus, setTopicStatus] = useState<TopicAutomationInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [runningTest, setRunningTest] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    loadAutomationStatus();
    loadTopicStatus();
    
    // Refresh every 30 seconds
    const interval = setInterval(() => {
      loadAutomationStatus();
      loadTopicStatus();
    }, 30000);

    return () => clearInterval(interval);
  }, []);

  const loadAutomationStatus = async () => {
    try {
      const { data: globalSettings } = await supabase
        .from('scheduler_settings')
        .select('*')
        .eq('setting_key', 'automation_enabled')
        .single();

      const { data: queueSize } = await supabase
        .from('content_generation_queue')
        .select('id', { count: 'exact' })
        .eq('status', 'pending');

      setStatus({
        enabled: (globalSettings?.setting_value as any)?.enabled || false,
        topics_processing: 0, // TODO: Get from system logs
        queue_size: queueSize?.length || 0,
        success_rate: 95 // TODO: Calculate from recent runs
      });

    } catch (error) {
      console.error('Error loading automation status:', error);
    }
  };

  const loadTopicStatus = async () => {
    try {
      const { data: topics, error } = await supabase
        .from('topics')
        .select(`
          id,
          name,
          is_active,
          auto_simplify_enabled,
          topic_automation_settings (
            is_active,
            last_run_at,
            next_run_at
          )
        `)
        .eq('is_active', true)
        .order('name');

      if (error) throw error;

      const topicInfo: TopicAutomationInfo[] = topics?.map(topic => ({
        id: topic.id,
        name: topic.name,
        is_active: topic.topic_automation_settings?.[0]?.is_active || false,
        auto_simplify_enabled: topic.auto_simplify_enabled || false,
        last_articles_count: 0, // TODO: Get from recent scrape results
        last_run_at: topic.topic_automation_settings?.[0]?.last_run_at,
        next_run_at: topic.topic_automation_settings?.[0]?.next_run_at,
        success_status: 'success' // TODO: Determine from recent results
      })) || [];

      setTopicStatus(topicInfo);
    } catch (error) {
      console.error('Error loading topic status:', error);
    } finally {
      setLoading(false);
    }
  };

  const runTestAutomation = async () => {
    setRunningTest(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const { data, error } = await supabase.functions.invoke('eezee-automation-service', {
        body: {
          userId: user.id,
          dryRun: true,
          forceRun: true
        }
      });

      if (error) throw error;

      const result = data.user_results?.[0];
      const topicsToProcess = result?.topicsToScrape?.length || 0;

      toast({
        title: "Test Complete",
        description: `${topicsToProcess} topics ready for automation. ${result?.articlesGathered || 0} articles would be processed.`
      });

    } catch (error) {
      console.error('Error running test automation:', error);
      toast({
        title: "Test Failed", 
        description: "Failed to run automation test",
        variant: "destructive"
      });
    } finally {
      setRunningTest(false);
    }
  };

  const getStatusIcon = (successStatus: string) => {
    switch (successStatus) {
      case 'success':
        return <CheckCircle className="w-4 h-4 text-green-600" />;
      case 'warning':
        return <AlertCircle className="w-4 h-4 text-yellow-600" />;
      case 'error':
        return <AlertCircle className="w-4 h-4 text-red-600" />;
      default:
        return <Clock className="w-4 h-4 text-gray-400" />;
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <Card key={i}>
              <CardContent className="p-6">
                <div className="animate-pulse">
                  <div className="h-4 bg-gray-200 rounded w-3/4 mb-2"></div>
                  <div className="h-8 bg-gray-200 rounded w-1/2"></div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Status Overview */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center gap-2">
              <Bot className="w-5 h-5" />
              <div>
                <p className="text-sm font-medium">Service Status</p>
                <div className="flex items-center gap-2 mt-1">
                  <Badge variant={status.enabled ? "default" : "secondary"}>
                    {status.enabled ? "Active" : "Paused"}
                  </Badge>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center gap-2">
              <Activity className="w-5 h-5" />
              <div>
                <p className="text-sm font-medium">Processing Queue</p>
                <p className="text-2xl font-bold">{status.queue_size}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center gap-2">
              <Users className="w-5 h-5" />
              <div>
                <p className="text-sm font-medium">Active Topics</p>
                <p className="text-2xl font-bold">{topicStatus.filter(t => t.is_active).length}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center gap-2">
              <TrendingUp className="w-5 h-5" />
              <div>
                <p className="text-sm font-medium">Success Rate</p>
                <div className="flex items-center gap-2 mt-1">
                  <Progress value={status.success_rate} className="flex-1" />
                  <span className="text-sm font-medium">{status.success_rate}%</span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Main Dashboard */}
      <Tabs defaultValue="overview" className="space-y-4">
        <div className="flex items-center justify-between">
          <TabsList>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="topics">Topics</TabsTrigger>
            <TabsTrigger value="settings">Settings</TabsTrigger>
          </TabsList>
          
          <Button 
            onClick={runTestAutomation}
            disabled={runningTest}
            variant="outline"
            className="flex items-center gap-2"
          >
            <Zap className="w-4 h-4" />
            {runningTest ? "Testing..." : "Test Automation"}
          </Button>
        </div>

        <TabsContent value="overview" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Next Automation Run</CardTitle>
            </CardHeader>
            <CardContent>
              {status.enabled ? (
                <div className="space-y-2">
                  <p className="text-sm text-muted-foreground">
                    Automation runs every 12 hours automatically
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Check system logs for recent activity
                  </p>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Automation is currently paused. Enable in settings to start automatic content gathering.
                </p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="topics" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Topic Automation Status</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {topicStatus.map((topic) => (
                  <div key={topic.id} className="flex items-center justify-between p-3 border rounded-lg">
                    <div className="flex items-center gap-3">
                      {getStatusIcon(topic.success_status)}
                      <div>
                        <p className="font-medium">{topic.name}</p>
                        <p className="text-sm text-muted-foreground">
                          {topic.is_active ? 'Active' : 'Paused'} • 
                          {topic.auto_simplify_enabled ? ' Auto-simplify enabled' : ' Manual approval'}
                        </p>
                      </div>
                    </div>
                    <div className="text-right text-sm text-muted-foreground">
                      {topic.next_run_at && (
                        <p>Next: {new Date(topic.next_run_at).toLocaleString()}</p>
                      )}
                    </div>
                  </div>
                ))}
                
                {topicStatus.length === 0 && (
                  <p className="text-center text-muted-foreground py-8">
                    No active topics found. Create topics to start automation.
                  </p>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="settings">
          <GlobalAutomationSettings />
        </TabsContent>
      </Tabs>
    </div>
  );
};