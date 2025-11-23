import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface AutomatedInsightCard {
  id: string;
  topic_id: string;
  card_type: 'story_momentum' | 'this_time_last_month' | 'social_proof' | 'reading_streak';
  headline: string;
  insight_data: Record<string, any>;
  slides: Array<{
    type: string;
    content: string;
    word_count: number;
    metadata?: Record<string, any>;
  }>;
  relevance_score: number;
  display_frequency: number;
  display_count: number;
  last_shown_at: string | null;
  valid_until: string;
  is_published: boolean;
  is_visible: boolean;
  created_at: string;
  updated_at: string;
}

export const useAutomatedInsightCards = (topicId: string | undefined, insightsEnabled: boolean) => {
  return useQuery({
    queryKey: ['automated-insight-cards', topicId],
    queryFn: async () => {
      if (!topicId || !insightsEnabled) {
        return [];
      }

      const { data, error } = await supabase
        .from('automated_insight_cards')
        .select('*')
        .eq('topic_id', topicId)
        .eq('is_published', true)
        .eq('is_visible', true)
        .gt('valid_until', new Date().toISOString())
        .order('relevance_score', { ascending: false })
        .order('last_shown_at', { ascending: true, nullsFirst: true });

      if (error) {
        console.error('Error fetching insight cards:', error);
        throw error;
      }

      return (data || []) as AutomatedInsightCard[];
    },
    enabled: !!topicId && insightsEnabled,
    refetchInterval: 5 * 60 * 1000, // Refetch every 5 minutes
    staleTime: 2 * 60 * 1000, // Consider data stale after 2 minutes
  });
};

// Helper function to track card display
export const trackInsightCardDisplay = async (cardId: string) => {
  try {
    // Fetch current display_count first
    const { data: card, error: fetchError } = await supabase
      .from('automated_insight_cards')
      .select('display_count')
      .eq('id', cardId)
      .single();

    if (fetchError || !card) {
      console.error('Error fetching card:', fetchError);
      return;
    }

    // Update with incremented count
    const { error } = await supabase
      .from('automated_insight_cards')
      .update({
        display_count: (card.display_count || 0) + 1,
        last_shown_at: new Date().toISOString()
      })
      .eq('id', cardId);

    if (error) {
      console.error('Error tracking card display:', error);
    }
  } catch (err) {
    console.error('Error in trackInsightCardDisplay:', err);
  }
};
