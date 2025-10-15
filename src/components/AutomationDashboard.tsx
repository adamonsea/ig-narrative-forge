import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AlertCircle, Bot, CheckCircle, Clock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface TopicAutomationInfo {
  id: string;
  name: string;
  slug: string;
  is_active: boolean;
  auto_simplify_enabled: boolean;
  last_run_at?: string;
  next_run_at?: string;
}

export const AutomationDashboard = () => {
  const [topicStatus, setTopicStatus] = useState<TopicAutomationInfo[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadTopicStatus();

    const interval = setInterval(() => {
      loadTopicStatus();
    }, 30000);

    return () => clearInterval(interval);
  }, []);

  const loadTopicStatus = async () => {
    try {
      const { data: topics, error } = await supabase
        .from('topics')
        .select(`
          id,
          name,
          slug,
          auto_simplify_enabled,
          topic_automation_settings (
            is_active,
            last_run_at,
            next_run_at
          )
        `)
        .order('name');

      if (error) throw error;

      const topicInfo: TopicAutomationInfo[] = topics?.map(topic => ({
        id: topic.id,
        name: topic.name,
        slug: topic.slug,
        is_active: topic.topic_automation_settings?.[0]?.is_active || false,
        auto_simplify_enabled: topic.auto_simplify_enabled || false,
        last_run_at: topic.topic_automation_settings?.[0]?.last_run_at,
        next_run_at: topic.topic_automation_settings?.[0]?.next_run_at
      })) || [];

      setTopicStatus(topicInfo);
    } catch (error) {
      console.error('Error loading topic automation status:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Topic Automation Overview</CardTitle>
          <CardDescription>
            Automation is now managed per topic. Use each topic dashboard to trigger gathering runs and control auto-simplification.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground">
          <div className="flex items-center gap-2">
            <Bot className="w-4 h-4 text-primary" />
            <span>Run "Gather All" from inside a topic to fetch fresh content across its connected sources.</span>
          </div>
          <div className="flex items-center gap-2">
            <CheckCircle className="w-4 h-4 text-green-500" />
            <span>Enable auto-simplify from the topic settings panel when you want qualifying articles processed automatically.</span>
          </div>
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-blue-500" />
            <span>Review automation activity and fine-tune quality thresholds directly within the topic configuration.</span>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Topic Status</CardTitle>
          <CardDescription>Monitor automation signals for the topics you manage.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {loading ? (
            <div className="flex items-center justify-center py-6">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            </div>
          ) : topicStatus.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No topics found. Create a topic to configure gathering and auto-simplification.
            </p>
          ) : (
            topicStatus.map((topic) => (
              <div
                key={topic.id}
                className="flex flex-col gap-3 rounded-lg border p-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    {topic.auto_simplify_enabled ? (
                      <CheckCircle className="w-4 h-4 text-green-500" />
                    ) : (
                      <AlertCircle className="w-4 h-4 text-amber-500" />
                    )}
                    <span className="font-medium">{topic.name}</span>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 text-xs sm:text-sm text-muted-foreground">
                    <Badge variant={topic.is_active ? "default" : "secondary"}>
                      {topic.is_active ? "Automation Active" : "Automation Paused"}
                    </Badge>
                    <Badge variant={topic.auto_simplify_enabled ? "default" : "secondary"}>
                      {topic.auto_simplify_enabled ? "Auto-simplify On" : "Auto-simplify Off"}
                    </Badge>
                    {topic.next_run_at ? (
                      <span>Next run: {new Date(topic.next_run_at).toLocaleString()}</span>
                    ) : topic.last_run_at ? (
                      <span>Last run: {new Date(topic.last_run_at).toLocaleString()}</span>
                    ) : null}
                  </div>
                </div>
                <Button variant="outline" size="sm" asChild>
                  <Link to={`/dashboard/topic/${topic.slug}`}>
                    Manage Topic
                  </Link>
                </Button>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
};
