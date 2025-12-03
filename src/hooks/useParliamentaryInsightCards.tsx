import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface ParliamentaryVote {
  id: string;
  mp_name: string | null;
  party: string | null;
  constituency: string | null;
  vote_title: string | null;
  vote_direction: string | null;
  vote_date: string | null;
  vote_url: string | null;
  vote_outcome: string | null;
  aye_count: number | null;
  no_count: number | null;
  is_rebellion: boolean | null;
  vote_category: string | null;
  local_impact_summary: string | null;
  created_at: string;
}

interface UseParliamentaryInsightCardsResult {
  votes: ParliamentaryVote[];
  loading: boolean;
  hasData: boolean;
}

export const useParliamentaryInsightCards = (
  topicId: string | undefined,
  topicType: string | undefined,
  parliamentaryTrackingEnabled: boolean | undefined
): UseParliamentaryInsightCardsResult => {
  const [votes, setVotes] = useState<ParliamentaryVote[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // Only fetch for regional topics with tracking enabled
    if (!topicId || topicType !== 'regional' || !parliamentaryTrackingEnabled) {
      setVotes([]);
      return;
    }

    const fetchVotes = async () => {
      setLoading(true);
      try {
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

        const { data, error } = await supabase
          .from('parliamentary_mentions')
          .select('id, mp_name, party, constituency, vote_title, vote_direction, vote_date, vote_url, vote_outcome, aye_count, no_count, is_rebellion, vote_category, local_impact_summary, created_at')
          .eq('topic_id', topicId)
          .eq('mention_type', 'vote')
          .gte('created_at', thirtyDaysAgo.toISOString())
          .order('vote_date', { ascending: false })
          .limit(10);

        if (error) {
          console.error('Error fetching parliamentary votes for insight card:', error);
          setVotes([]);
          return;
        }

        setVotes(data || []);
      } catch (err) {
        console.error('Failed to fetch parliamentary insight cards:', err);
        setVotes([]);
      } finally {
        setLoading(false);
      }
    };

    fetchVotes();
  }, [topicId, topicType, parliamentaryTrackingEnabled]);

  return {
    votes,
    loading,
    hasData: votes.length > 0
  };
};
