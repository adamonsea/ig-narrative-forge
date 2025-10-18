import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface PulseKeyword {
  id: string;
  keyword: string;
  totalMentions: number;
  positiveMentions: number;
  negativeMentions: number;
  quote: string;
  threadUrl?: string;
  threadTitle?: string;
  setNumber: number;
}

export interface CommunityPulseData {
  keywords: PulseKeyword[];
  mostActiveThread?: {
    url: string;
    title: string;
  };
  lastUpdated?: string;
}

export function useCommunityPulseKeywords(topicId: string, setNumber: number = 1) {
  const [data, setData] = useState<CommunityPulseData>({ keywords: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    let mounted = true;

    async function fetchPulseKeywords() {
      try {
        setLoading(true);
        
        const { data: keywords, error: fetchError } = await supabase
          .from('community_pulse_keywords')
          .select('*')
          .eq('topic_id', topicId)
          .eq('set_number', setNumber)
          .order('created_at', { ascending: false })
          .limit(3);

        if (fetchError) throw fetchError;

        if (!mounted) return;

        if (keywords && keywords.length > 0) {
          const formattedKeywords: PulseKeyword[] = keywords.map((kw: any) => ({
            id: kw.id,
            keyword: kw.keyword,
            totalMentions: kw.total_mentions || 0,
            positiveMentions: kw.positive_mentions || 0,
            negativeMentions: kw.negative_mentions || 0,
            quote: kw.representative_quote || '',
            threadUrl: kw.most_active_thread_url,
            threadTitle: kw.most_active_thread_title,
            setNumber: kw.set_number || 1
          }));

          setData({
            keywords: formattedKeywords,
            mostActiveThread: keywords[0]?.most_active_thread_url ? {
              url: keywords[0].most_active_thread_url,
              title: keywords[0].most_active_thread_title || ''
            } : undefined,
            lastUpdated: keywords[0]?.created_at
          });
        } else {
          setData({ keywords: [] });
        }
      } catch (err) {
        if (!mounted) return;
        setError(err instanceof Error ? err : new Error('Failed to fetch pulse keywords'));
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    }

    fetchPulseKeywords();

    // Set up realtime subscription
    const channel = supabase
      .channel(`pulse-keywords-${topicId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'community_pulse_keywords',
          filter: `topic_id=eq.${topicId}`
        },
        () => {
          fetchPulseKeywords();
        }
      )
      .subscribe();

    return () => {
      mounted = false;
      channel.unsubscribe();
    };
  }, [topicId, setNumber]);

  return { data, loading, error };
}
