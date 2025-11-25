import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { RefreshCw, Users, Bell, Smartphone } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { LineChart, Line, ResponsiveContainer } from "recharts";
import { toast } from "sonner";

interface AudienceProgressCardProps {
  topicId: string;
}

const MILESTONES = [50, 100, 250, 500, 1000, 2500, 5000];

const getMilestoneData = (readerCount: number) => {
  const nextMilestone = MILESTONES.find(m => m > readerCount) || MILESTONES[MILESTONES.length - 1];
  const prevMilestone = [...MILESTONES].reverse().find(m => m <= readerCount) || 0;
  const progress = ((readerCount - prevMilestone) / (nextMilestone - prevMilestone)) * 100;
  const remaining = nextMilestone - readerCount;
  
  return { nextMilestone, prevMilestone, progress, remaining };
};

const getTierInfo = (readerCount: number, remaining: number, nextMilestone: number) => {
  if (readerCount < 50) {
    return {
      tier: "FOUNDING MEMBER",
      color: "bg-amber-500/10 text-amber-600 border-amber-500/20",
      message: `You're 1 of only ${readerCount} founding members`
    };
  }
  
  if (remaining <= nextMilestone * 0.2) {
    return {
      tier: "NEAR MILESTONE",
      color: "bg-purple-500/10 text-purple-600 border-purple-500/20",
      message: `Just ${remaining} readers away from ${nextMilestone}!`
    };
  }
  
  if (readerCount >= 500) {
    return {
      tier: "ESTABLISHED",
      color: "bg-green-500/10 text-green-600 border-green-500/20",
      message: `Join ${readerCount.toLocaleString()} engaged readers`
    };
  }
  
  if (readerCount >= 50 && readerCount < 150) {
    return {
      tier: "EARLY ADOPTER",
      color: "bg-blue-500/10 text-blue-600 border-blue-500/20",
      message: `Part of ${readerCount} early adopters`
    };
  }
  
  return {
    tier: "GROWING",
    color: "bg-slate-500/10 text-slate-600 border-slate-500/20",
    message: `${readerCount} readers and counting`
  };
};

export function AudienceProgressCard({ topicId }: AudienceProgressCardProps) {
  const { data: metrics, refetch: refetchMetrics } = useQuery({
    queryKey: ['audience-progress', topicId],
    queryFn: async () => {
      // Get total unique readers
      const { data: readers, error: readersError } = await supabase
        .from('story_interactions')
        .select('visitor_id')
        .eq('topic_id', topicId)
        .neq('visitor_id', '');
      
      if (readersError) throw readersError;
      
      const uniqueReaders = new Set(readers?.map(r => r.visitor_id) || []).size;
      
      // Get weekly growth
      const weekAgo = new Date();
      weekAgo.setDate(weekAgo.getDate() - 7);
      
      const { data: weeklyReaders, error: weeklyError } = await supabase
        .from('story_interactions')
        .select('visitor_id')
        .eq('topic_id', topicId)
        .gte('created_at', weekAgo.toISOString())
        .neq('visitor_id', '');
      
      if (weeklyError) throw weeklyError;
      
      const weeklyGrowth = new Set(weeklyReaders?.map(r => r.visitor_id) || []).size;
      
      // Get daily data for sparkline (last 14 days)
      const { data: dailyData, error: dailyError } = await supabase
        .from('story_interactions')
        .select('created_at, visitor_id')
        .eq('topic_id', topicId)
        .gte('created_at', new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString())
        .order('created_at', { ascending: true });
      
      if (dailyError) throw dailyError;
      
      // Group by day
      const dailyMap = new Map<string, Set<string>>();
      dailyData?.forEach(item => {
        const day = item.created_at.split('T')[0];
        if (!dailyMap.has(day)) dailyMap.set(day, new Set());
        dailyMap.get(day)!.add(item.visitor_id);
      });
      
      const sparklineData = Array.from(dailyMap.entries())
        .map(([day, visitors]) => ({ day, count: visitors.size }))
        .slice(-14);
      
      return {
        uniqueReaders,
        weeklyGrowth,
        sparklineData,
        subscribers: 0, // Subscriber tracking to be added
        pwaInstalls: 0, // PWA installs tracking to be added
        avgDaily: sparklineData.length > 0 
          ? (sparklineData.reduce((sum, d) => sum + d.count, 0) / sparklineData.length).toFixed(1)
          : '0'
      };
    }
  });

  const handleRegenerate = async () => {
    try {
      toast.loading("Regenerating social proof card...");
      
      const { error } = await supabase.functions.invoke('generate-social-proof-cards', {
        body: { topicId }
      });
      
      if (error) throw error;
      
      toast.dismiss();
      toast.success("Social proof card regenerated!");
      refetchMetrics();
    } catch (error) {
      toast.dismiss();
      toast.error("Failed to regenerate card");
      console.error(error);
    }
  };

  if (!metrics) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Audience Build
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="animate-pulse space-y-4">
            <div className="h-24 bg-muted rounded" />
            <div className="h-16 bg-muted rounded" />
          </div>
        </CardContent>
      </Card>
    );
  }

  const { nextMilestone, prevMilestone, progress, remaining } = getMilestoneData(metrics.uniqueReaders);
  const tierInfo = getTierInfo(metrics.uniqueReaders, remaining, nextMilestone);
  
  // Calculate what readers see (actual + 15 if under 100)
  const displayCount = metrics.uniqueReaders >= 100 ? metrics.uniqueReaders : metrics.uniqueReaders + 15;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Audience Build
          </CardTitle>
          <Button 
            variant="outline" 
            size="sm" 
            onClick={handleRegenerate}
            className="gap-2"
          >
            <RefreshCw className="h-4 w-4" />
            Regenerate
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Milestone Progress */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <Badge variant="outline" className={tierInfo.color}>
              {tierInfo.tier}
            </Badge>
            <div className="text-right">
              <div className="text-sm text-muted-foreground">
                {metrics.uniqueReaders} / {nextMilestone} readers
              </div>
              {displayCount !== metrics.uniqueReaders && (
                <div className="text-xs text-muted-foreground/70">
                  Displays as {displayCount} in feeds
                </div>
              )}
            </div>
          </div>
          
          <Progress value={progress} className="h-3" />
          
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground italic">
              "{tierInfo.message}"
            </span>
            <span className="font-medium text-primary">
              {remaining} away!
            </span>
          </div>
        </div>

        {/* Sparkline Chart */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">📈 Daily Readers (14 days)</span>
            <span className="text-xs text-muted-foreground">Avg: {metrics.avgDaily}/day</span>
          </div>
          
          <div className="h-12 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={metrics.sparklineData}>
                <Line 
                  type="monotone" 
                  dataKey="count" 
                  stroke="hsl(var(--primary))" 
                  strokeWidth={2}
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
          
          <div className="text-sm text-muted-foreground">
            This week: <span className="font-medium text-foreground">+{metrics.weeklyGrowth}</span>
          </div>
        </div>

        {/* Engagement Metrics */}
        <div className="flex gap-4 pt-2 border-t">
          <div className="flex items-center gap-2 text-sm">
            <Bell className="h-4 w-4 text-muted-foreground" />
            <span className="font-medium">{metrics.subscribers}</span>
            <span className="text-muted-foreground">Subscribers</span>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <Smartphone className="h-4 w-4 text-muted-foreground" />
            <span className="font-medium">{metrics.pwaInstalls}</span>
            <span className="text-muted-foreground">PWA Installs</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
