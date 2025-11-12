import { useParams, useNavigate, Link } from "react-router-dom";
import { useEffect, useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { format, parseISO } from "date-fns";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Calendar, CalendarDays, ExternalLink } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { BriefingsArchiveSEO } from "@/components/seo/BriefingsArchiveSEO";

interface Topic {
  id: string;
  name: string;
  slug: string;
  branding_config?: any;
}

interface Roundup {
  id: string;
  topic_id: string;
  roundup_type: 'daily' | 'weekly';
  period_start: string;
  period_end: string;
  story_ids: string[];
  stats?: any;
  is_published: boolean;
  created_at: string;
}

export default function BriefingsArchive() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  
  const [topic, setTopic] = useState<Topic | null>(null);
  const [dailyRoundups, setDailyRoundups] = useState<Roundup[]>([]);
  const [weeklyRoundups, setWeeklyRoundups] = useState<Roundup[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'daily' | 'weekly'>('daily');

  useEffect(() => {
    const fetchData = async () => {
      if (!slug) {
        navigate('/');
        return;
      }

      try {
        // Fetch topic
        const { data: topicData, error: topicError } = await supabase
          .from('topics')
          .select('id, name, slug, branding_config')
          .eq('slug', slug)
          .eq('is_public', true)
          .eq('is_active', true)
          .single();

        if (topicError || !topicData) {
          console.error('Topic fetch error:', topicError);
          navigate('/');
          return;
        }

        setTopic(topicData);

        // Fetch all daily roundups
        const { data: dailyData, error: dailyError } = await supabase
          .from('topic_roundups')
          .select('id, topic_id, roundup_type, period_start, period_end, story_ids, stats, is_published, created_at')
          .eq('topic_id', topicData.id)
          .eq('roundup_type', 'daily')
          .eq('is_published', true)
          .order('period_start', { ascending: false });

        if (!dailyError && dailyData) {
          setDailyRoundups(dailyData as Roundup[]);
        }

        // Fetch all weekly roundups
        const { data: weeklyData, error: weeklyError } = await supabase
          .from('topic_roundups')
          .select('id, topic_id, roundup_type, period_start, period_end, story_ids, stats, is_published, created_at')
          .eq('topic_id', topicData.id)
          .eq('roundup_type', 'weekly')
          .eq('is_published', true)
          .order('period_start', { ascending: false });

        if (!weeklyError && weeklyData) {
          setWeeklyRoundups(weeklyData as Roundup[]);
        }

        setLoading(false);
      } catch (error) {
        console.error('Fetch error:', error);
        setLoading(false);
      }
    };

    fetchData();
  }, [slug, navigate]);

  // Group daily roundups by month
  const groupedDailyRoundups = useMemo(() => {
    const groups = new Map<string, Roundup[]>();
    dailyRoundups.forEach(roundup => {
      const monthKey = format(parseISO(roundup.period_start), 'MMMM yyyy');
      if (!groups.has(monthKey)) {
        groups.set(monthKey, []);
      }
      groups.get(monthKey)?.push(roundup);
    });
    return Array.from(groups.entries());
  }, [dailyRoundups]);

  // Group weekly roundups by year
  const groupedWeeklyRoundups = useMemo(() => {
    const groups = new Map<string, Roundup[]>();
    weeklyRoundups.forEach(roundup => {
      const yearKey = format(parseISO(roundup.period_start), 'yyyy');
      if (!groups.has(yearKey)) {
        groups.set(yearKey, []);
      }
      groups.get(yearKey)?.push(roundup);
    });
    return Array.from(groups.entries());
  }, [weeklyRoundups]);

  if (loading) {
    return (
      <div className="min-h-screen feed-background">
        <div className="container mx-auto px-4 py-8">
          <Skeleton className="w-32 h-10 mb-6" />
          <Skeleton className="w-64 h-8 mb-4" />
          <div className="space-y-4">
            {[...Array(5)].map((_, i) => (
              <Skeleton key={i} className="w-full h-24 rounded-lg" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (!topic) {
    return (
      <div className="min-h-screen feed-background">
        <div className="container mx-auto px-4 py-8">
          <Button
            variant="ghost"
            onClick={() => navigate(`/feed/${slug}`)}
            className="mb-6"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Feed
          </Button>
          <div className="text-center space-y-4">
            <h1 className="text-3xl font-bold">Topic Not Found</h1>
            <p className="text-muted-foreground">
              This topic doesn't exist or is not publicly available.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen feed-background">
      <BriefingsArchiveSEO
        topicName={topic.name}
        topicSlug={slug || ''}
        dailyCount={dailyRoundups.length}
        weeklyCount={weeklyRoundups.length}
      />

      {/* Header */}
      <div className="bg-background border-b border-border">
        <div className="container mx-auto px-4 py-6">
          <Button
            variant="ghost"
            asChild
            className="mb-4"
          >
            <Link to={`/feed/${slug}`}>
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Feed
            </Link>
          </Button>
          
          <div className="space-y-2">
            <h1 className="text-3xl md:text-4xl font-bold">News Briefings</h1>
            <p className="text-muted-foreground">
              Browse all daily and weekly briefings for {topic.name}
            </p>
          </div>
        </div>
      </div>

      {/* Tabs for Daily/Weekly */}
      <div className="container mx-auto px-4 py-8">
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'daily' | 'weekly')}>
          <TabsList className="grid w-full max-w-md mx-auto grid-cols-2 mb-8">
            <TabsTrigger value="daily" className="flex items-center gap-2">
              <Calendar className="w-4 h-4" />
              Daily ({dailyRoundups.length})
            </TabsTrigger>
            <TabsTrigger value="weekly" className="flex items-center gap-2">
              <CalendarDays className="w-4 h-4" />
              Weekly ({weeklyRoundups.length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="daily">
            {groupedDailyRoundups.length === 0 ? (
              <div className="text-center py-12">
                <p className="text-muted-foreground">No daily briefings available yet.</p>
              </div>
            ) : (
              <div className="space-y-8">
                {groupedDailyRoundups.map(([monthKey, roundups]) => (
                  <div key={monthKey}>
                    <h2 className="text-xl font-semibold mb-4 text-muted-foreground">{monthKey}</h2>
                    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                      {roundups.map((roundup) => {
                        const date = format(parseISO(roundup.period_start), 'yyyy-MM-dd');
                        const formattedDate = format(parseISO(roundup.period_start), 'EEE MMM d');
                        const storyCount = roundup.story_ids?.length || 0;

                        return (
                          <Link
                            key={roundup.id}
                            to={`/feed/${slug}/daily/${date}`}
                          >
                            <Card className="hover:bg-accent/50 transition-colors cursor-pointer h-full">
                              <CardHeader className="pb-3">
                                <CardTitle className="text-base flex items-start justify-between gap-2">
                                  <span>{formattedDate}</span>
                                  <ExternalLink className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                                </CardTitle>
                                <CardDescription>
                                  {storyCount} {storyCount === 1 ? 'story' : 'stories'}
                                </CardDescription>
                              </CardHeader>
                            </Card>
                          </Link>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="weekly">
            {groupedWeeklyRoundups.length === 0 ? (
              <div className="text-center py-12">
                <p className="text-muted-foreground">No weekly briefings available yet.</p>
              </div>
            ) : (
              <div className="space-y-8">
                {groupedWeeklyRoundups.map(([yearKey, roundups]) => (
                  <div key={yearKey}>
                    <h2 className="text-xl font-semibold mb-4 text-muted-foreground">{yearKey}</h2>
                    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                      {roundups.map((roundup) => {
                        const weekStart = format(parseISO(roundup.period_start), 'yyyy-MM-dd');
                        const startDate = parseISO(roundup.period_start);
                        const endDate = parseISO(roundup.period_end);
                        const startDay = format(startDate, 'd');
                        const endDay = format(endDate, 'd');
                        const monthYear = format(startDate, 'MMM');
                        const startDayOfWeek = format(startDate, 'EEE');
                        const endDayOfWeek = format(endDate, 'EEE');
                        const formattedDate = `${monthYear} ${startDay}-${endDay} (${startDayOfWeek}-${endDayOfWeek})`;
                        const storyCount = roundup.story_ids?.length || 0;

                        return (
                          <Link
                            key={roundup.id}
                            to={`/feed/${slug}/weekly/${weekStart}`}
                          >
                            <Card className="hover:bg-accent/50 transition-colors cursor-pointer h-full">
                              <CardHeader className="pb-3">
                                <CardTitle className="text-base flex items-start justify-between gap-2">
                                  <span>{formattedDate}</span>
                                  <ExternalLink className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                                </CardTitle>
                                <CardDescription>
                                  {storyCount} {storyCount === 1 ? 'story' : 'stories'}
                                </CardDescription>
                              </CardHeader>
                            </Card>
                          </Link>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
