import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface ParliamentaryDigestVote {
  id: string;
  mp_name: string | null;
  party: string | null;
  constituency: string | null;
  vote_title: string | null;
  vote_direction: string | null;
  vote_date: string | null;
  vote_url: string | null;
  vote_outcome: string | null;
  vote_category: string | null;
  is_rebellion: boolean | null;
}

interface UseParliamentaryDigestCardsResult {
  votes: ParliamentaryDigestVote[];
  loading: boolean;
  hasData: boolean;
}

export const useParliamentaryDigestCards = (
  topicId: string | undefined,
  topicType: string | undefined,
  parliamentaryTrackingEnabled: boolean | undefined
): UseParliamentaryDigestCardsResult => {
  const [votes, setVotes] = useState<ParliamentaryDigestVote[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // Only fetch for regional topics with tracking enabled
    if (!topicId || topicType !== 'regional' || !parliamentaryTrackingEnabled) {
      setVotes([]);
      return;
    }

    const fetchDigestVotes = async () => {
      setLoading(true);
      try {
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

        // Fetch minor votes (not major, not yet in weekly roundup)
        const { data, error } = await supabase
          .from('parliamentary_mentions')
          .select('id, mp_name, party, constituency, vote_title, vote_direction, vote_date, vote_url, vote_outcome, vote_category, is_rebellion')
          .eq('topic_id', topicId)
          .eq('mention_type', 'vote')
          .eq('is_major_vote', false)
          .eq('is_weekly_roundup', false)
          .gte('vote_date', sevenDaysAgo.toISOString().split('T')[0])
          .order('vote_date', { ascending: false })
          .limit(15);

        if (error) {
          console.error('Error fetching parliamentary digest votes:', error);
          setVotes([]);
          return;
        }

        setVotes(data || []);
      } catch (err) {
        console.error('Failed to fetch parliamentary digest cards:', err);
        setVotes([]);
      } finally {
        setLoading(false);
      }
    };

    fetchDigestVotes();
  }, [topicId, topicType, parliamentaryTrackingEnabled]);

  return {
    votes,
    loading,
    hasData: votes.length > 0
  };
};
