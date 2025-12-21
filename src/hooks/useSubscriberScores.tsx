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
      const { data, error } = await supabase
        .from('subscriber_scores')
        .select('total_swipes, like_count, best_streak, sessions_played')
        .eq('topic_id', topicId)
        .eq('email', email)
        .single();

      if (error && error.code !== 'PGRST116') {
        console.error('Error fetching score:', error);
        return;
      }

      if (data) {
        setScore({
          totalSwipes: data.total_swipes,
          likeCount: data.like_count,
          bestStreak: data.best_streak,
          sessionsPlayed: data.sessions_played
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
      const { data, error } = await supabase
        .from('subscriber_scores')
        .select('email, total_swipes, like_count, best_streak')
        .eq('topic_id', topicId)
        .order('total_swipes', { ascending: false })
        .limit(10);

      if (error) {
        console.error('Error fetching leaderboard:', error);
        return;
      }

      const formattedLeaderboard = (data || []).map(entry => ({
        email: entry.email,
        displayName: maskEmail(entry.email),
        totalSwipes: entry.total_swipes,
        likeCount: entry.like_count,
        bestStreak: entry.best_streak
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
      // Try to upsert the score
      const { data: existing } = await supabase
        .from('subscriber_scores')
        .select('id, total_swipes, like_count, best_streak, sessions_played')
        .eq('topic_id', topicId)
        .eq('email', email)
        .single();

      if (existing) {
        // Update existing record
        const { error } = await supabase
          .from('subscriber_scores')
          .update({
            total_swipes: existing.total_swipes + sessionStats.totalSwipes,
            like_count: existing.like_count + sessionStats.likeCount,
            best_streak: Math.max(existing.best_streak, sessionStats.bestStreak),
            sessions_played: existing.sessions_played + 1,
            last_played_at: new Date().toISOString()
          })
          .eq('id', existing.id);

        if (error) console.error('Error updating score:', error);
      } else {
        // Insert new record
        const { error } = await supabase
          .from('subscriber_scores')
          .insert({
            topic_id: topicId,
            email,
            total_swipes: sessionStats.totalSwipes,
            like_count: sessionStats.likeCount,
            best_streak: sessionStats.bestStreak,
            sessions_played: 1
          });

        if (error) console.error('Error inserting score:', error);
      }

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

// Helper to mask email for privacy (show first 2 chars + domain)
function maskEmail(email: string): string {
  const [local, domain] = email.split('@');
  if (local.length <= 2) {
    return `${local}***@${domain}`;
  }
  return `${local.substring(0, 2)}***@${domain}`;
}
