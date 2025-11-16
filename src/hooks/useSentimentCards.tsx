import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface SentimentCard {
  id: string;
  topic_id: string;
  keyword_phrase: string;
  content: {
    headline: string;
    statistics: string;
    key_quote?: string;
    external_sentiment?: string;
    summary: string;
  };
  sources: Array<{
    url: string;
    title: string;
    date: string;
    author?: string;
  }>;
  sentiment_score: number;
  confidence_score: number;
  analysis_date: string;
  card_type: string;
  is_published: boolean;
  is_visible: boolean;
  needs_review: boolean;
  created_at: string;
  updated_at: string;
  slides?: Array<{
    type: 'hero' | 'mention-count' | 'sentiment-score' | 'confidence-score' | 'forum-insight' | 'quote' | 'references';
    content: string;
    order: number;
    metadata?: Record<string, any>;
  }>;
  display_count?: number;
  last_shown_at?: string;
}

export const useSentimentCards = (topicId?: string) => {
  const [sentimentCards, setSentimentCards] = useState<SentimentCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Get count of cards needing review for notification purposes
  const getReviewCount = () => {
    return sentimentCards.filter(card => card.needs_review).length;
  };

  // Load sentiment cards for topic only - don't load anything without a topic ID
  const loadSentimentCards = async () => {
    try {
      setLoading(true);
      setError(null);

      // Don't load any cards if no topic ID is provided
      if (!topicId || topicId.trim() === '') {
        setSentimentCards([]);
        return;
      }

      const query = supabase
        .from('sentiment_cards')
        .select('*')
        .eq('is_published', true)
        .eq('is_visible', true)
        .eq('topic_id', topicId)
        .order('created_at', { ascending: false });

      const { data, error: fetchError } = await query;

      if (fetchError) {
        throw fetchError;
      }

      setSentimentCards((data || [])
        .map(card => ({
          ...card,
          content: card.content as any,
          sources: (Array.isArray(card.sources) ? card.sources : []) as any[],
          slides: (card.slides as any[]) || [],
          card_type: card.card_type || 'trend',
          sentiment_score: card.sentiment_score || 0,
          confidence_score: card.confidence_score || 0,
          analysis_date: card.analysis_date || card.created_at || '',
          is_published: card.is_published || false,
          is_visible: card.is_visible || false,
          needs_review: card.needs_review || false,
          created_at: card.created_at || '',
          updated_at: card.updated_at || card.created_at || '',
          display_count: card.display_count || 0,
          last_shown_at: card.last_shown_at || null
        }))
      );
    } catch (err) {
      console.error('Error loading sentiment cards:', err);
      setError(err instanceof Error ? err.message : 'Failed to load sentiment cards');
    } finally {
      setLoading(false);
    }
  };

  // Trigger sentiment analysis for a topic
  const triggerSentimentAnalysis = async (targetTopicId: string, forceAnalysis = false) => {
    try {
      const { data, error } = await supabase.functions.invoke('sentiment-detector', {
        body: {
          topic_id: targetTopicId,
          force_analysis: forceAnalysis
        }
      });

      if (error) {
        throw error;
      }

      // Reload cards after analysis
      await loadSentimentCards();
      
      return data;
    } catch (err) {
      console.error('Error triggering sentiment analysis:', err);
      throw err;
    }
  };

  // Load cards only when we have a valid topicId
  useEffect(() => {
    if (topicId && topicId.trim() !== '') {
      loadSentimentCards();
    } else {
      setSentimentCards([]);
      setLoading(false);
    }
  }, [topicId]);

  // Set up real-time subscription for sentiment cards
  useEffect(() => {
    if (!topicId) return;

    const channel = supabase
      .channel(`sentiment-cards-${topicId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'sentiment_cards',
          filter: `topic_id=eq.${topicId}`
        },
        () => {
          // Reload cards when changes occur
          loadSentimentCards();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [topicId]);

  return {
    sentimentCards,
    loading,
    error,
    reviewCount: getReviewCount(),
    refetch: loadSentimentCards,
    triggerAnalysis: triggerSentimentAnalysis
  };
};