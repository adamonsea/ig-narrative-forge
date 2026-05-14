import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useSubscriberStatus } from './useSubscriberStatus';

interface SubscriberScore {
  totalSwipes: number;
  likeCount: number;
  bestStreak: number;
  sessionsPlayed: number;
  rank?: number;
}

export const useSubscriberScores = (topicId: string | null) => {
  const { isVerifiedSubscriber, email } = useSubscriberStatus(topicId);
  const [score, setScore] = useState<SubscriberScore | null>(null);
  const [leaderboard, setLeaderboard] = useState<Array<{
    email: string;
    displayName: string;
    totalSwipes: number;
    likeCount: number;
    bestStreak: number;
  }>>([]);
  const [loading, setLoading] = useState(false);

  // Fetch current user's score
  const fetchScore = useCallback(async () => {
    if (!topicId || !email || !isVerifiedSubscriber) return;

    try {
      const { data, error } = await supabase.rpc('get_subscriber_score', {
        p_topic_id: topicId,
        p_email: email,
      });

      if (error) {
        console.error('Error fetching score:', error);
        return;
      }

      const row = Array.isArray(data) ? data[0] : data;
      if (row) {
        setScore({
          totalSwipes: row.total_swipes,
          likeCount: row.like_count,
          bestStreak: row.best_streak,
          sessionsPlayed: row.sessions_played,
        });
      }
    } catch (err) {
      console.error('Score fetch failed:', err);
    }
  }, [topicId, email, isVerifiedSubscriber]);

  // Fetch leaderboard
  const fetchLeaderboard = useCallback(async () => {
    if (!topicId) return;

    setLoading(true);
    try {
      const { data, error } = await supabase.rpc('get_subscriber_leaderboard', {
        p_topic_id: topicId,
      });

      if (error) {
        console.error('Error fetching leaderboard:', error);
        return;
      }

      const formattedLeaderboard = (data || []).map((entry: any) => ({
        email: entry.display_name,
        displayName: entry.display_name,
        totalSwipes: entry.total_swipes,
        likeCount: entry.like_count,
        bestStreak: entry.best_streak,
      }));

      setLeaderboard(formattedLeaderboard);
    } catch (err) {
      console.error('Leaderboard fetch failed:', err);
    } finally {
      setLoading(false);
    }
  }, [topicId]);

  // Update score after a play session
  const updateScore = useCallback(async (sessionStats: {
    totalSwipes: number;
    likeCount: number;
    bestStreak: number;
  }) => {
    if (!topicId || !email || !isVerifiedSubscriber) return;

    try {
      const { error } = await supabase.rpc('upsert_subscriber_score', {
        p_topic_id: topicId,
        p_email: email,
        p_total_swipes: sessionStats.totalSwipes,
        p_like_count: sessionStats.likeCount,
        p_best_streak: sessionStats.bestStreak,
      });

      if (error) console.error('Error upserting score:', error);

      // Refresh scores
      await fetchScore();
    } catch (err) {
      console.error('Score update failed:', err);
    }
  }, [topicId, email, isVerifiedSubscriber, fetchScore]);

  return {
    score,
    leaderboard,
    loading,
    isVerifiedSubscriber,
    fetchScore,
    fetchLeaderboard,
    updateScore
  };
};
