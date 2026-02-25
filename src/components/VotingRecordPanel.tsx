import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Landmark, ThumbsUp, ThumbsDown, ExternalLink, Eye, Calendar, ChevronDown, ChevronUp, RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { format } from "date-fns";
import { ParliamentaryInsightCard } from "@/components/ParliamentaryInsightCard";
import type { ParliamentaryVote } from "@/hooks/useParliamentaryInsightCards";

interface VotingRecord {
  id: string;
  mp_name: string;
  constituency: string;
  party: string;
  vote_title: string;
  vote_date: string;
  vote_direction: 'aye' | 'no' | 'abstain';
  vote_url: string;
  vote_category: string;
  vote_outcome: string;
  is_rebellion: boolean;
  aye_count: number;
  no_count: number;
  national_relevance_score: number;
  local_impact_summary: string;
  is_major_vote: boolean;
  vote_context?: string | null;
}

interface VotingRecordPanelProps {
  topicId: string;
  topicSlug: string;
}

const getPartyBorderColor = (party: string): string => {
  const p = party.toLowerCase();
  if (p.includes('labour')) return 'border-l-red-500';
  if (p.includes('conservative')) return 'border-l-blue-600';
  if (p.includes('liberal democrat')) return 'border-l-amber-500';
  if (p.includes('green')) return 'border-l-green-600';
  if (p.includes('snp')) return 'border-l-yellow-400';
  if (p.includes('plaid')) return 'border-l-emerald-600';
  if (p.includes('reform')) return 'border-l-purple-600';
  return 'border-l-muted-foreground';
};

export const VotingRecordPanel = ({ topicId, topicSlug }: VotingRecordPanelProps) => {
  const [votes, setVotes] = useState<VotingRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [isTopicOwner, setIsTopicOwner] = useState(false);
  const [previewVote, setPreviewVote] = useState<VotingRecord | null>(null);
  const [lastCollectionAt, setLastCollectionAt] = useState<string | null>(null);
  const { toast } = useToast();
  const { user } = useAuth();

  const checkTopicOwnership = async () => {
    if (!user) return;
    try {
      const { data, error } = await supabase
        .from('topics')
        .select('created_by, parliamentary_last_collection_at')
        .eq('id', topicId)
        .single();
      
      if (!error && data) {
        setIsTopicOwner(data.created_by === user.id);
        setLastCollectionAt(data.parliamentary_last_collection_at);
      }
    } catch (error) {
      console.error('Error checking topic ownership:', error);
    }
  };

  const loadVotes = async () => {
    try {
      const fourteenDaysAgo = new Date();
      fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);

      const { data, error } = await supabase
        .from('parliamentary_mentions')
        .select('id, mp_name, constituency, party, vote_title, vote_date, vote_direction, vote_url, vote_category, vote_outcome, is_rebellion, aye_count, no_count, national_relevance_score, local_impact_summary, is_major_vote, vote_context')
        .eq('topic_id', topicId)
        .eq('mention_type', 'vote')
        .gte('vote_date', fourteenDaysAgo.toISOString().split('T')[0])
        .order('vote_date', { ascending: false });

      if (error) throw error;
      setVotes((data || []) as VotingRecord[]);
    } catch (error) {
      console.error('Error loading voting records:', error);
    } finally {
      setLoading(false);
    }
  };

  const toggleFeatureInFeed = async (voteId: string, currentValue: boolean) => {
    try {
      const { error } = await supabase
        .from('parliamentary_mentions')
        .update({ is_major_vote: !currentValue })
        .eq('id', voteId);

      if (error) throw error;

      setVotes(prev => prev.map(v => 
        v.id === voteId ? { ...v, is_major_vote: !currentValue } : v
      ));

      toast({
        title: !currentValue ? "Featured in feed" : "Removed from feed",
        description: !currentValue 
          ? "This vote will appear as a featured card in the feed"
          : "This vote will only appear in the weekly digest",
      });
    } catch (error) {
      console.error('Error toggling feature:', error);
      toast({ title: "Error", description: "Failed to update", variant: "destructive" });
    }
  };

  const triggerCollection = async () => {
    try {
      toast({ title: "Collecting...", description: "Fetching latest votes from Parliament" });

      const { data: topic } = await supabase
        .from('topics')
        .select('region')
        .eq('id', topicId)
        .single();

      if (!topic?.region) throw new Error('Topic region not configured');

      const { error } = await supabase.functions.invoke('uk-parliament-collector', {
        body: { topicId, region: topic.region, mode: 'daily', forceRefresh: true }
      });

      if (error) throw error;

      toast({ title: "Collection started", description: "Refreshing in a few seconds..." });
      setTimeout(() => { loadVotes(); checkTopicOwnership(); }, 5000);
    } catch (error) {
      console.error('Collection error:', error);
      toast({ title: "Failed", description: error instanceof Error ? error.message : "Unknown error", variant: "destructive" });
    }
  };

  useEffect(() => {
    checkTopicOwnership();
    loadVotes();
  }, [topicId, user]);

  // Group votes by date
  const votesByDate = votes.reduce<Record<string, VotingRecord[]>>((acc, vote) => {
    const dateKey = vote.vote_date || 'Unknown';
    if (!acc[dateKey]) acc[dateKey] = [];
    acc[dateKey].push(vote);
    return acc;
  }, {});

  const featuredCount = votes.filter(v => v.is_major_vote).length;
  const rebellionCount = votes.filter(v => v.is_rebellion).length;

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <Landmark className="w-5 h-5" />
          <h3 className="text-lg font-semibold">Parliamentary Review</h3>
        </div>
        <p className="text-sm text-muted-foreground">Loading votes...</p>
      </div>
    );
  }

  // Convert vote to preview format
  const toPreviewFormat = (vote: VotingRecord): ParliamentaryVote => ({
    id: vote.id,
    mp_name: vote.mp_name,
    party: vote.party,
    constituency: vote.constituency,
    vote_title: vote.vote_title,
    vote_direction: vote.vote_direction,
    vote_date: vote.vote_date,
    vote_url: vote.vote_url,
    vote_outcome: vote.vote_outcome,
    aye_count: vote.aye_count,
    no_count: vote.no_count,
    is_rebellion: vote.is_rebellion,
    local_impact_summary: vote.local_impact_summary,
    vote_category: vote.vote_category,
    created_at: new Date().toISOString(),
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <Landmark className="w-5 h-5" />
            Parliamentary Review
          </h3>
          <p className="text-sm text-muted-foreground">
            {votes.length} votes in the last 14 days · {featuredCount} featured · {rebellionCount} rebellions
          </p>
        </div>
        {isTopicOwner && (
          <Button variant="outline" size="sm" onClick={triggerCollection} className="gap-1.5">
            <RefreshCw className="w-3.5 h-3.5" />
            Refresh
          </Button>
        )}
      </div>

      {/* Last collection info */}
      {lastCollectionAt && (
        <p className="text-xs text-muted-foreground">
          Last collected: {format(new Date(lastCollectionAt), 'MMM d, yyyy HH:mm')}
        </p>
      )}

      {/* Preview modal */}
      {previewVote && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-medium text-muted-foreground">Feed Preview</h4>
            <Button variant="ghost" size="sm" onClick={() => setPreviewVote(null)}>
              Close preview
            </Button>
          </div>
          <div className="max-w-md mx-auto">
            <ParliamentaryInsightCard 
              votes={[toPreviewFormat(previewVote)]} 
              topicSlug={topicSlug} 
            />
          </div>
        </div>
      )}

      {/* Vote list grouped by date */}
      {votes.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center">
            <Landmark className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
            <p className="text-muted-foreground">No votes collected yet.</p>
            {isTopicOwner && (
              <Button variant="outline" className="mt-4" onClick={triggerCollection}>
                Collect Now
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {Object.entries(votesByDate)
            .sort(([a], [b]) => b.localeCompare(a))
            .map(([dateKey, dateVotes]) => (
              <div key={dateKey} className="space-y-3">
                {/* Date header */}
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Calendar className="w-3.5 h-3.5" />
                  <span className="font-medium">
                    {dateKey !== 'Unknown' ? format(new Date(dateKey), 'EEEE, MMMM d, yyyy') : 'Unknown date'}
                  </span>
                  <span className="text-xs">({dateVotes.length} vote{dateVotes.length > 1 ? 's' : ''})</span>
                </div>

                {/* Votes for this date */}
                <div className="space-y-2">
                  {dateVotes.map(vote => (
                    <Card 
                      key={vote.id} 
                      className={`border-l-4 ${getPartyBorderColor(vote.party)} overflow-hidden`}
                    >
                      <CardContent className="p-4">
                        <div className="flex items-start gap-3">
                          {/* Vote direction icon */}
                          <div className="mt-0.5">
                            {vote.vote_direction === 'aye' 
                              ? <ThumbsUp className="w-4 h-4 text-green-500" />
                              : vote.vote_direction === 'no'
                              ? <ThumbsDown className="w-4 h-4 text-red-500" />
                              : null
                            }
                          </div>

                          {/* Content */}
                          <div className="flex-1 min-w-0 space-y-2">
                            {/* Title */}
                            <h4 className="font-medium text-sm leading-snug line-clamp-2">
                              {vote.vote_title}
                            </h4>

                            {/* MP + meta */}
                            <div className="flex items-center gap-2 flex-wrap text-xs text-muted-foreground">
                              <span className="font-medium text-foreground">{vote.mp_name}</span>
                              <span>·</span>
                              <span>{vote.party}</span>
                              <span>·</span>
                              <span className="uppercase font-medium">
                                {vote.vote_direction}
                              </span>
                            </div>

                            {/* Badges */}
                            <div className="flex items-center gap-2 flex-wrap">
                              <Badge variant="outline" className="text-[10px]">
                                {vote.vote_category}
                              </Badge>
                              <Badge variant={vote.vote_outcome === 'passed' ? 'default' : 'secondary'} className="text-[10px]">
                                {vote.vote_outcome} ({vote.aye_count}-{vote.no_count})
                              </Badge>
                              {vote.is_rebellion && (
                                <Badge variant="destructive" className="text-[10px]">
                                  🔥 Rebellion
                                </Badge>
                              )}
                            </div>

                            {/* Local impact summary */}
                            {vote.local_impact_summary && (
                              <p className="text-xs text-muted-foreground line-clamp-1">
                                {vote.local_impact_summary}
                              </p>
                            )}
                          </div>

                          {/* Actions */}
                          {isTopicOwner && (
                            <div className="flex flex-col items-end gap-2 shrink-0">
                              {/* Feature toggle */}
                              <div className="flex items-center gap-2">
                                <span className="text-[10px] text-muted-foreground">
                                  {vote.is_major_vote ? 'Featured' : 'Digest only'}
                                </span>
                                <Switch
                                  checked={vote.is_major_vote}
                                  onCheckedChange={() => toggleFeatureInFeed(vote.id, vote.is_major_vote)}
                                />
                              </div>

                              {/* Preview + Link */}
                              <div className="flex items-center gap-1">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-7 px-2 text-xs"
                                  onClick={() => setPreviewVote(previewVote?.id === vote.id ? null : vote)}
                                >
                                  <Eye className="w-3 h-3 mr-1" />
                                  Preview
                                </Button>
                                {vote.vote_url && (
                                  <Button variant="ghost" size="sm" className="h-7 px-2" asChild>
                                    <a href={vote.vote_url} target="_blank" rel="noopener noreferrer">
                                      <ExternalLink className="w-3 h-3" />
                                    </a>
                                  </Button>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            ))}
        </div>
      )}
    </div>
  );
};
