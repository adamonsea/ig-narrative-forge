import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

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
}

interface UseParliamentaryMentionsProps {
  topicId: string;
  enabled?: boolean;
}

export const useParliamentaryMentions = ({ topicId, enabled = true }: UseParliamentaryMentionsProps) => {
  const [mentions, setMentions] = useState<ParliamentaryMention[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchMentions = async () => {
    if (!enabled || !topicId) return;
    
    setLoading(true);
    setError(null);
    
    try {
      const { data, error: fetchError } = await supabase
        .from('parliamentary_mentions')
        .select('*')
        .eq('topic_id', topicId)
        .gte('relevance_score', 30) // Only show relevant mentions
        .order('created_at', { ascending: false })
        .limit(10);

      if (fetchError) throw fetchError;
      
      setMentions(data || []);
    } catch (err) {
      console.error('Error fetching parliamentary mentions:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch parliamentary mentions');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMentions();
  }, [topicId, enabled]);

  return {
    mentions,
    loading,
    error,
    refetch: fetchMentions
  };
};