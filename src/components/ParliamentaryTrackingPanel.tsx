import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { ExternalLink, Vote, MessageSquare, Calendar, RefreshCw, Clock, Star, Link2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";

interface ParliamentaryMention {
  id: string;
  mention_type: string;
  mp_name: string | null;
  constituency: string | null;
  party: string | null;
  vote_title: string | null;
  vote_direction: string | null;
  vote_date: string | null;
  vote_url: string | null;
  debate_title: string | null;
  debate_excerpt: string | null;
  debate_date: string | null;
  hansard_url: string | null;
  region_mentioned: string | null;
  landmark_mentioned: string | null;
  relevance_score: number;
  created_at: string;
  story_id: string | null;
}

interface ParliamentaryTrackingPanelProps {
  topicId: string;
  region: string;
}

export const ParliamentaryTrackingPanel = ({ topicId, region }: ParliamentaryTrackingPanelProps) => {
  const [mentions, setMentions] = useState<ParliamentaryMention[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState("all");
  const { toast } = useToast();

  const loadMentions = async () => {
    try {
      const { data, error } = await supabase
        .from('parliamentary_mentions')
        .select('*')
        .eq('topic_id', topicId)
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) throw error;
      setMentions(data || []);
    } catch (error) {
      console.error('Error loading parliamentary mentions:', error);
      toast({
        title: "Error",
        description: "Failed to load parliamentary mentions",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const triggerRefresh = async () => {
    setRefreshing(true);
    try {
      const response = await supabase.functions.invoke('uk-parliament-collector', {
        body: { topicId, region }
      });

      if (response.error) throw response.error;

      toast({
        title: "Refresh Started",
        description: "Parliamentary data collection initiated",
      });

      // Reload mentions after a short delay
      setTimeout(loadMentions, 2000);
    } catch (error) {
      console.error('Error triggering refresh:', error);
      toast({
        title: "Error",
        description: "Failed to trigger parliamentary data refresh",
        variant: "destructive"
      });
    } finally {
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadMentions();
  }, [topicId]);

  const votes = mentions.filter(m => m.mention_type === 'vote');
  const debates = mentions.filter(m => m.mention_type === 'debate');

  const formatParliamentaryDate = (dateStr: string | null) => {
    if (!dateStr) return 'Unknown date';
    try {
      return format(new Date(dateStr), 'MMM d, yyyy');
    } catch {
      return 'Invalid date';
    }
  };

  const getRelevanceBadgeVariant = (score: number) => {
    if (score >= 70) return "default";
    if (score >= 50) return "secondary";
    return "outline";
  };

  const renderVoteCard = (vote: ParliamentaryMention) => (
    <Card key={vote.id} className="mb-4">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2">
            <Vote className="w-5 h-5 text-blue-500" />
            <div>
              <CardTitle className="text-lg leading-tight">{vote.vote_title}</CardTitle>
              <CardDescription className="mt-1">
                <span className="font-medium">{vote.mp_name}</span>
                {vote.constituency && ` • ${vote.constituency}`}
                {vote.party && ` • ${vote.party}`}
              </CardDescription>
            </div>
          </div>
          <Badge variant={getRelevanceBadgeVariant(vote.relevance_score)}>
            <Star className="w-3 h-3 mr-1" />
            {vote.relevance_score}%
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="space-y-3">
          <div className="flex items-center gap-4 text-sm text-muted-foreground">
            <div className="flex items-center gap-1">
              <Calendar className="w-4 h-4" />
              {formatParliamentaryDate(vote.vote_date)}
            </div>
            {vote.vote_direction && (
              <Badge 
                variant={vote.vote_direction === 'aye' ? 'default' : vote.vote_direction === 'no' ? 'destructive' : 'secondary'}
                className="text-xs"
              >
                Voted {vote.vote_direction}
              </Badge>
            )}
          </div>
          
          {vote.region_mentioned && (
            <div className="text-sm">
              <span className="font-medium">Region mentioned:</span> {vote.region_mentioned}
            </div>
          )}
          
          <div className="flex justify-between items-center gap-2">
            <span className="text-xs text-muted-foreground">
              Added {format(new Date(vote.created_at), 'MMM d, h:mm a')}
            </span>
            <div className="flex gap-2">
              {vote.story_id && (
                <Button variant="outline" size="sm" asChild>
                  <a href={`/@${topicId}/${vote.story_id}`} target="_blank" rel="noopener noreferrer">
                    <Link2 className="w-3 h-3 mr-1" />
                    View Story
                  </a>
                </Button>
              )}
              {vote.vote_url && (
                <Button variant="outline" size="sm" asChild>
                  <a href={vote.vote_url} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="w-3 h-3 mr-1" />
                    View Vote
                  </a>
                </Button>
              )}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );

  const renderDebateCard = (debate: ParliamentaryMention) => (
    <Card key={debate.id} className="mb-4">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2">
            <MessageSquare className="w-5 h-5 text-green-500" />
            <div>
              <CardTitle className="text-lg leading-tight">{debate.debate_title}</CardTitle>
              <CardDescription className="mt-1">
                <span className="font-medium">{debate.mp_name}</span>
                {debate.constituency && ` • ${debate.constituency}`}
                {debate.party && ` • ${debate.party}`}
              </CardDescription>
            </div>
          </div>
          <Badge variant={getRelevanceBadgeVariant(debate.relevance_score)}>
            <Star className="w-3 h-3 mr-1" />
            {debate.relevance_score}%
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="space-y-3">
          <div className="flex items-center gap-4 text-sm text-muted-foreground">
            <div className="flex items-center gap-1">
              <Calendar className="w-4 h-4" />
              {formatParliamentaryDate(debate.debate_date)}
            </div>
          </div>
          
          {debate.debate_excerpt && (
            <div className="text-sm bg-muted p-3 rounded-md">
              <span className="font-medium">Excerpt:</span>
              <p className="mt-1 italic">"{debate.debate_excerpt}"</p>
            </div>
          )}
          
          {(debate.region_mentioned || debate.landmark_mentioned) && (
            <div className="text-sm space-y-1">
              {debate.region_mentioned && (
                <div><span className="font-medium">Region mentioned:</span> {debate.region_mentioned}</div>
              )}
              {debate.landmark_mentioned && (
                <div><span className="font-medium">Landmark mentioned:</span> {debate.landmark_mentioned}</div>
              )}
            </div>
          )}
          
          <div className="flex justify-between items-center gap-2">
            <span className="text-xs text-muted-foreground">
              Added {format(new Date(debate.created_at), 'MMM d, h:mm a')}
            </span>
            <div className="flex gap-2">
              {debate.story_id && (
                <Button variant="outline" size="sm" asChild>
                  <a href={`/@${topicId}/${debate.story_id}`} target="_blank" rel="noopener noreferrer">
                    <Link2 className="w-3 h-3 mr-1" />
                    View Story
                  </a>
                </Button>
              )}
              {debate.hansard_url && (
                <Button variant="outline" size="sm" asChild>
                  <a href={debate.hansard_url} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="w-3 h-3 mr-1" />
                    View Hansard
                  </a>
                </Button>
              )}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold">Parliamentary Tracking</h3>
          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary"></div>
        </div>
        <p className="text-muted-foreground">Loading parliamentary mentions...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold flex items-center gap-2">
            Parliamentary Tracking
            <Badge variant="secondary" className="text-xs">Beta</Badge>
          </h3>
          <p className="text-muted-foreground">
            Track votes and debates mentioning {region} in UK Parliament
          </p>
        </div>
        <Button 
          variant="outline" 
          size="sm"
          onClick={triggerRefresh}
          disabled={refreshing}
        >
          {refreshing ? (
            <>
              <Clock className="w-4 h-4 mr-2 animate-spin" />
              Refreshing...
            </>
          ) : (
            <>
              <RefreshCw className="w-4 h-4 mr-2" />
              Refresh Data
            </>
          )}
        </Button>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-4 text-center">
            <div className="text-2xl font-bold text-blue-500">{votes.length}</div>
            <div className="text-sm text-muted-foreground">Votes</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <div className="text-2xl font-bold text-green-500">{debates.length}</div>
            <div className="text-sm text-muted-foreground">Debates</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <div className="text-2xl font-bold">{mentions.length}</div>
            <div className="text-sm text-muted-foreground">Total</div>
          </CardContent>
        </Card>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="all">All ({mentions.length})</TabsTrigger>
          <TabsTrigger value="votes">Votes ({votes.length})</TabsTrigger>
          <TabsTrigger value="debates">Debates ({debates.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="all" className="mt-6">
          {mentions.length === 0 ? (
            <Card>
              <CardContent className="p-8 text-center">
                <p className="text-muted-foreground">
                  No parliamentary mentions found yet. Try refreshing the data or check back later.
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              {mentions.map(mention => 
                mention.mention_type === 'vote' ? renderVoteCard(mention) : renderDebateCard(mention)
              )}
            </div>
          )}
        </TabsContent>

        <TabsContent value="votes" className="mt-6">
          {votes.length === 0 ? (
            <Card>
              <CardContent className="p-8 text-center">
                <Vote className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
                <p className="text-muted-foreground">No vote mentions found yet.</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              {votes.map(renderVoteCard)}
            </div>
          )}
        </TabsContent>

        <TabsContent value="debates" className="mt-6">
          {debates.length === 0 ? (
            <Card>
              <CardContent className="p-8 text-center">
                <MessageSquare className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
                <p className="text-muted-foreground">No debate mentions found yet.</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              {debates.map(renderDebateCard)}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
};