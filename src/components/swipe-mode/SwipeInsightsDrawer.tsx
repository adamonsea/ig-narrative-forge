import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { BarChart3, Users, Heart, ThumbsDown, TrendingUp, Loader2 } from 'lucide-react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';

interface SwipeInsightsDrawerProps {
  topicId: string;
  topicName: string;
}

interface TopStory {
  story_id: string;
  title: string;
  likes: number;
  dislikes: number;
}

interface InsightsData {
  totalReaders: number;
  totalLikes: number;
  totalDiscards: number;
  approvalRate: number;
  topStories: TopStory[];
}

export const SwipeInsightsDrawer = ({ topicId, topicName }: SwipeInsightsDrawerProps) => {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [insights, setInsights] = useState<InsightsData | null>(null);

  const fetchInsights = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase.rpc('get_swipe_insights', {
        p_topic_id: topicId
      });

      if (error) throw error;

      if (data && data[0]) {
        const topStoriesRaw = data[0].top_stories;
        const topStories: TopStory[] = Array.isArray(topStoriesRaw) 
          ? topStoriesRaw.map((s: any) => ({
              story_id: s.story_id,
              title: s.title,
              likes: Number(s.likes) || 0,
              dislikes: Number(s.dislikes) || 0
            }))
          : [];
        setInsights({
          totalReaders: Number(data[0].total_readers) || 0,
          totalLikes: Number(data[0].total_likes) || 0,
          totalDiscards: Number(data[0].total_discards) || 0,
          approvalRate: Number(data[0].approval_rate) || 0,
          topStories
        });
      }
    } catch (error) {
      console.error('Error fetching swipe insights:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) {
      fetchInsights();
    }
  }, [open, topicId]);

  const pieData = insights ? [
    { name: 'Loved', value: insights.totalLikes, color: 'hsl(var(--chart-1))' },
    { name: 'Passed', value: insights.totalDiscards, color: 'hsl(var(--muted))' }
  ] : [];

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="sm" className="gap-2">
          <BarChart3 className="w-4 h-4" />
        </Button>
      </SheetTrigger>
      <SheetContent className="w-full sm:max-w-md overflow-y-auto">
        <SheetHeader className="pb-4">
          <SheetTitle className="flex items-center gap-2">
            <BarChart3 className="w-5 h-5" />
            Game Mode Insights
          </SheetTitle>
          <p className="text-sm text-muted-foreground">{topicName}</p>
        </SheetHeader>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
          </div>
        ) : !insights || (insights.totalLikes === 0 && insights.totalDiscards === 0) ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <BarChart3 className="w-12 h-12 text-muted-foreground mb-4" />
            <p className="text-muted-foreground">No swipe data yet</p>
            <p className="text-sm text-muted-foreground">Stats will appear once readers start swiping</p>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Summary Cards */}
            <div className="grid grid-cols-2 gap-3">
              <Card>
                <CardContent className="p-4 text-center">
                  <Users className="w-5 h-5 mx-auto mb-2 text-primary" />
                  <div className="text-2xl font-bold">{insights.totalReaders}</div>
                  <p className="text-xs text-muted-foreground">Active Readers</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4 text-center">
                  <TrendingUp className="w-5 h-5 mx-auto mb-2 text-emerald-500" />
                  <div className="text-2xl font-bold">{insights.approvalRate}%</div>
                  <p className="text-xs text-muted-foreground">Approval Rate</p>
                </CardContent>
              </Card>
            </div>

            {/* Love vs Pass Donut */}
            <Card>
              <CardContent className="p-4">
                <h3 className="text-sm font-medium mb-3">Reader Sentiment</h3>
                <div className="h-40">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={pieData}
                        cx="50%"
                        cy="50%"
                        innerRadius={40}
                        outerRadius={60}
                        paddingAngle={2}
                        dataKey="value"
                      >
                        {pieData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip 
                        contentStyle={{ 
                          backgroundColor: 'hsl(var(--popover))',
                          border: '1px solid hsl(var(--border))',
                          borderRadius: '8px'
                        }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="flex justify-center gap-6 mt-2">
                  <div className="flex items-center gap-2">
                    <Heart className="w-4 h-4 text-rose-500 fill-rose-500" />
                    <span className="text-sm font-medium">{insights.totalLikes} loved</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <ThumbsDown className="w-4 h-4 text-muted-foreground" />
                    <span className="text-sm font-medium">{insights.totalDiscards} passed</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Top Stories */}
            {insights.topStories.length > 0 && (
              <Card>
                <CardContent className="p-4">
                  <h3 className="text-sm font-medium mb-3">Most Loved Stories</h3>
                  <div className="space-y-3">
                    {insights.topStories.map((story, index) => {
                      const total = story.likes + story.dislikes;
                      const approval = total > 0 ? Math.round((story.likes / total) * 100) : 0;
                      return (
                        <div key={story.story_id} className="space-y-1">
                          <div className="flex items-start gap-2">
                            <Badge variant="outline" className="shrink-0 w-6 h-6 rounded-full p-0 flex items-center justify-center text-xs">
                              {index + 1}
                            </Badge>
                            <p className="text-sm line-clamp-2 flex-1">{story.title}</p>
                          </div>
                          <div className="flex items-center gap-2 ml-8">
                            <Progress value={approval} className="h-1.5 flex-1" />
                            <span className="text-xs text-muted-foreground w-16">
                              {story.likes} ❤️ {story.dislikes} 👎
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
};
