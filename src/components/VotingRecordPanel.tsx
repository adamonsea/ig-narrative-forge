import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ExternalLink, Vote, Calendar, Star } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { format } from "date-fns";

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
  vote_outcome: 'passed' | 'rejected';
  is_rebellion: boolean;
  aye_count: number;
  no_count: number;
  national_relevance_score: number;
  local_impact_summary: string;
  is_weekly_roundup: boolean;
  is_major_vote: boolean;
  story_id: string | null;
  created_at: string;
}

interface TrackedMP {
  mp_id: number;
  mp_name: string;
  mp_party: string;
  constituency: string;
  is_primary: boolean;
  tracking_enabled: boolean;
}

interface VotingRecordPanelProps {
  topicId: string;
  topicSlug: string;
}

export const VotingRecordPanel = ({ topicId, topicSlug }: VotingRecordPanelProps) => {
  const [votes, setVotes] = useState<VotingRecord[]>([]);
  const [trackedMPs, setTrackedMPs] = useState<TrackedMP[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterType, setFilterType] = useState<'all' | 'daily' | 'weekly' | 'rebellions' | 'major'>('all');
  const [sortBy, setSortBy] = useState<'date' | 'rebellion' | 'category' | 'mp'>('date');
  const [isTopicOwner, setIsTopicOwner] = useState(false);
  const { toast } = useToast();
  const { user } = useAuth();

  // Check if we're in summer recess (typically July 25 - September 2)
  const isInSummerRecess = () => {
    const now = new Date();
    const year = now.getFullYear();
    const recessStart = new Date(year, 6, 25); // July 25
    const recessEnd = new Date(year, 8, 2); // September 2
    return now >= recessStart && now <= recessEnd;
  };

  const checkTopicOwnership = async () => {
    if (!user) return;
    try {
      const { data, error } = await supabase
        .from('topics')
        .select('created_by')
        .eq('id', topicId)
        .single();
      
      if (!error && data) {
        setIsTopicOwner(data.created_by === user.id);
      }
    } catch (error) {
      console.error('Error checking topic ownership:', error);
    }
  };

  const loadTrackedMPs = async () => {
    try {
      const { data, error } = await supabase
        .from('topic_tracked_mps')
        .select('*')
        .eq('topic_id', topicId)
        .eq('tracking_enabled', true)
        .order('is_primary', { ascending: false });

      if (error) throw error;
      setTrackedMPs(data || []);
    } catch (error) {
      console.error('Error loading tracked MPs:', error);
    }
  };

  const loadVotes = async () => {
    try {
      let query = supabase
        .from('parliamentary_mentions')
        .select('*')
        .eq('topic_id', topicId)
        .eq('mention_type', 'vote')
        .order('vote_date', { ascending: false })
        .limit(100);

      // Apply filters
      if (filterType === 'daily') {
        query = query.eq('is_weekly_roundup', false);
      } else if (filterType === 'weekly') {
        query = query.eq('is_weekly_roundup', true);
      } else if (filterType === 'rebellions') {
        query = query.eq('is_rebellion', true);
      } else if (filterType === 'major') {
        query = query.eq('is_major_vote', true);
      }

      const { data, error } = await query;

      if (error) throw error;

      let sortedData = data || [];

      // Apply sorting
      if (sortBy === 'rebellion') {
        sortedData = [...sortedData].sort((a, b) => {
          if (a.is_rebellion && !b.is_rebellion) return -1;
          if (!a.is_rebellion && b.is_rebellion) return 1;
          return new Date(b.vote_date).getTime() - new Date(a.vote_date).getTime();
        });
      } else if (sortBy === 'category') {
        sortedData = [...sortedData].sort((a, b) => {
          const catCompare = (a.vote_category || '').localeCompare(b.vote_category || '');
          if (catCompare !== 0) return catCompare;
          return new Date(b.vote_date).getTime() - new Date(a.vote_date).getTime();
        });
      } else if (sortBy === 'mp') {
        sortedData = [...sortedData].sort((a, b) => {
          const mpCompare = a.mp_name.localeCompare(b.mp_name);
          if (mpCompare !== 0) return mpCompare;
          return new Date(b.vote_date).getTime() - new Date(a.vote_date).getTime();
        });
      }

      setVotes(sortedData as VotingRecord[]);
    } catch (error) {
      console.error('Error loading voting records:', error);
      toast({
        title: "Error",
        description: "Failed to load voting records",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    checkTopicOwnership();
    loadTrackedMPs();
    loadVotes();
  }, [topicId, filterType, sortBy, user]);

  const rebellionCount = votes.filter(v => v.is_rebellion && !v.is_weekly_roundup).length;
  const weeklyRoundupCount = votes.filter(v => v.is_weekly_roundup).length;
  const majorVoteCount = votes.filter(v => v.is_major_vote).length;
  const totalVotes = votes.filter(v => !v.is_weekly_roundup).length;
  const uniqueMps = [...new Set(votes.map(v => v.mp_name))].length;

  const getCategoryColor = (category: string) => {
    const colors: Record<string, string> = {
      'Housing': 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300',
      'NHS': 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300',
      'Transport': 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300',
      'Education': 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-300',
      'Environment': 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300',
      'Justice': 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-300',
      'Economy': 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-300',
    };
    return colors[category] || 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-300';
  };

  const getPartyColors = (party: string): { border: string; bg: string } => {
    const partyLower = party.toLowerCase();
    
    if (partyLower.includes('liberal democrat') || partyLower.includes('lib dem')) {
      return { 
        border: 'border-l-4 border-amber-400', 
        bg: 'bg-amber-50/50 dark:bg-amber-950/20' 
      };
    }
    if (partyLower.includes('conservative') || partyLower.includes('tory')) {
      return { 
        border: 'border-l-4 border-blue-500', 
        bg: 'bg-blue-50/50 dark:bg-blue-950/20' 
      };
    }
    if (partyLower.includes('labour')) {
      return { 
        border: 'border-l-4 border-red-500', 
        bg: 'bg-red-50/50 dark:bg-red-950/20' 
      };
    }
    if (partyLower.includes('green')) {
      return { 
        border: 'border-l-4 border-green-500', 
        bg: 'bg-green-50/50 dark:bg-green-950/20' 
      };
    }
    if (partyLower.includes('reform')) {
      return { 
        border: 'border-l-4 border-purple-500', 
        bg: 'bg-purple-50/50 dark:bg-purple-950/20' 
      };
    }
    if (partyLower.includes('snp')) {
      return { 
        border: 'border-l-4 border-yellow-500', 
        bg: 'bg-yellow-50/50 dark:bg-yellow-950/20' 
      };
    }
    if (partyLower.includes('plaid')) {
      return { 
        border: 'border-l-4 border-emerald-600', 
        bg: 'bg-emerald-50/50 dark:bg-emerald-950/20' 
      };
    }
    
    // Default/Independent
    return { 
      border: 'border-l-4 border-gray-300', 
      bg: 'bg-gray-50/50 dark:bg-gray-950/20' 
    };
  };

  const getVoteDirectionBadge = (direction: string) => {
    if (direction === 'aye') return <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300">Aye</Badge>;
    if (direction === 'no') return <Badge variant="destructive">No</Badge>;
    return <Badge variant="outline">Abstain</Badge>;
  };

  const toggleMajorVote = async (voteId: string, currentValue: boolean) => {
    try {
      const { error } = await supabase
        .from('parliamentary_mentions')
        .update({ is_major_vote: !currentValue })
        .eq('id', voteId);

      if (error) throw error;

      // Update local state
      setVotes(prev => prev.map(v => 
        v.id === voteId ? { ...v, is_major_vote: !currentValue } : v
      ));

      toast({
        title: "Success",
        description: `Vote ${!currentValue ? 'marked as major' : 'unmarked as major'}`,
      });
    } catch (error) {
      console.error('Error toggling major vote:', error);
      toast({
        title: "Error",
        description: "Failed to update vote status",
        variant: "destructive"
      });
    }
  };

  const renderVoteCard = (vote: VotingRecord) => {
    const partyColors = getPartyColors(vote.party);
    
    return (
      <Card key={vote.id} className={`hover:shadow-md transition-shadow ${partyColors.border} ${partyColors.bg}`}>
        <CardHeader className="pb-4">
          <div className="space-y-3">
            {/* Title with inline indicators */}
            <CardTitle className="text-lg leading-tight flex items-start gap-2">
              {vote.is_major_vote && (
                <Star className="w-4 h-4 fill-amber-400 text-amber-400 flex-shrink-0 mt-0.5" />
              )}
              {vote.is_rebellion && <span className="text-base">🔥</span>}
              <span className="flex-1">{vote.vote_title}</span>
              {isTopicOwner && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 px-2 ml-auto flex-shrink-0"
                  onClick={() => toggleMajorVote(vote.id, vote.is_major_vote)}
                >
                  <Star className={`w-3 h-3 ${vote.is_major_vote ? 'fill-amber-400 text-amber-400' : ''}`} />
                </Button>
              )}
            </CardTitle>
          
          {/* MP Info - single clean line */}
          <div className="text-sm text-muted-foreground flex items-center gap-1.5 flex-wrap">
            <span className="font-medium text-foreground">{vote.mp_name}</span>
            <span>•</span>
            <span>{vote.party}</span>
            <span>•</span>
            <span>{vote.constituency}</span>
            <span>•</span>
            <span className="text-xs">{format(new Date(vote.vote_date), 'MMM d, yyyy')}</span>
          </div>
          
          {/* Vote direction and outcome - compact line */}
          <div className="flex items-center gap-3 text-sm">
            {getVoteDirectionBadge(vote.vote_direction)}
            <span className="text-muted-foreground">
              {vote.vote_outcome === 'passed' ? '✓' : '✗'} {vote.vote_outcome.charAt(0).toUpperCase() + vote.vote_outcome.slice(1)} ({vote.aye_count}-{vote.no_count})
            </span>
          </div>
        </div>
      </CardHeader>
      
      <CardContent className="pt-0 space-y-4">
        {/* Local impact */}
        <p className="text-sm text-muted-foreground leading-relaxed">
          {vote.local_impact_summary}
        </p>
        
        {/* Category as subtle text, links aligned right */}
        <div className="flex items-center justify-between text-xs pt-2 border-t">
          <span className="text-muted-foreground">{vote.vote_category}</span>
          <div className="flex gap-2">
            {vote.story_id && (
              <Button variant="ghost" size="sm" className="h-7 px-2" asChild>
                <a href={`/@${topicSlug}/${vote.story_id}`} target="_blank" rel="noopener noreferrer">
                  Story →
                </a>
              </Button>
            )}
            <Button variant="ghost" size="sm" className="h-7 px-2" asChild>
              <a href={vote.vote_url} target="_blank" rel="noopener noreferrer">
                Parliament.uk →
              </a>
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
    );
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold">Voting Record</h3>
          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary"></div>
        </div>
        <p className="text-muted-foreground">Loading voting records...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <Vote className="w-5 h-5" />
            Voting Record
          </h3>
          <p className="text-sm text-muted-foreground">
            Comprehensive MP voting tracker
          </p>
        </div>
      </div>

      {/* Tracked MPs Banner */}
      {trackedMPs.length > 0 && (
        <div className="p-4 bg-muted/50 rounded-lg border">
          <h3 className="font-medium mb-2 flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5">
              👥 Tracking {trackedMPs.length} MP{trackedMPs.length > 1 ? 's' : ''}
            </span>
          </h3>
          <div className="flex flex-wrap gap-2">
            {trackedMPs.map(mp => (
              <Badge 
                key={mp.mp_id} 
                variant={mp.is_primary ? "default" : "secondary"}
                className="flex items-center gap-1"
              >
                {mp.is_primary && <span className="text-xs">⭐</span>}
                {mp.mp_name} ({mp.constituency})
              </Badge>
            ))}
          </div>
        </div>
      )}

      {/* Summer Recess Banner */}
      {isInSummerRecess() && votes.length === 0 && (
        <Card className="bg-amber-50 dark:bg-amber-950 border-amber-200 dark:border-amber-800">
          <CardContent className="p-6">
            <div className="flex items-start gap-3">
              <Calendar className="w-5 h-5 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
              <div>
                <h4 className="font-semibold text-amber-900 dark:text-amber-100 mb-1">
                  Parliament in Summer Recess
                </h4>
                <p className="text-sm text-amber-800 dark:text-amber-200">
                  UK Parliament is currently in summer recess (July 25 - September 2). 
                  Voting will resume when Parliament returns in early September.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Stats */}
      <div className="grid grid-cols-5 gap-4">
        <Card>
          <CardContent className="p-4 text-center">
            <div className="text-2xl font-bold text-blue-500">{totalVotes}</div>
            <div className="text-xs text-muted-foreground">Total Votes</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <div className="text-2xl font-bold text-amber-500 flex items-center justify-center gap-1">
              <Star className="w-5 h-5 fill-amber-500" />
              {majorVoteCount}
            </div>
            <div className="text-xs text-muted-foreground">Major Votes</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <div className="text-2xl font-bold text-green-500">{uniqueMps}</div>
            <div className="text-xs text-muted-foreground">MPs Tracked</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <div className="text-2xl font-bold text-orange-500">{rebellionCount}</div>
            <div className="text-xs text-muted-foreground">Rebellions</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <div className="text-2xl font-bold text-purple-500">{weeklyRoundupCount}</div>
            <div className="text-xs text-muted-foreground">Roundups</div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <Select value={filterType} onValueChange={(v) => setFilterType(v as any)}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Filter by" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Votes ({votes.length})</SelectItem>
            <SelectItem value="major">⭐ Major Votes ({majorVoteCount})</SelectItem>
            <SelectItem value="daily">Daily Posts</SelectItem>
            <SelectItem value="weekly">Weekly Roundups</SelectItem>
            <SelectItem value="rebellions">Rebellions Only</SelectItem>
          </SelectContent>
        </Select>

        <Select value={sortBy} onValueChange={(v) => setSortBy(v as any)}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Sort by" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="date">Date (Newest)</SelectItem>
            <SelectItem value="mp">By MP</SelectItem>
            <SelectItem value="rebellion">Rebellions First</SelectItem>
            <SelectItem value="category">By Category</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Votes List */}
      {votes.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center">
            <Vote className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
            <p className="text-muted-foreground">
              {filterType === 'rebellions' 
                ? 'No rebellions found' 
                : 'No voting records found yet. Check back soon.'}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {votes.map(renderVoteCard)}
        </div>
      )}
    </div>
  );
};
