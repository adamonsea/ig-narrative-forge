import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Heart, ThumbsDown, Gamepad2 } from 'lucide-react';
import { Progress } from '@/components/ui/progress';

interface StoryRatingCardProps {
  storyId: string;
  topicSlug?: string;
}

interface SwipeStats {
  likeCount: number;
  discardCount: number;
  total: number;
}

export const StoryRatingCard = ({ storyId, topicSlug }: StoryRatingCardProps) => {
  const [stats, setStats] = useState<SwipeStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const { data, error } = await supabase.rpc('get_story_swipe_stats', {
          p_story_id: storyId
        });

        if (error) throw error;

        if (data && data[0]) {
          setStats({
            likeCount: Number(data[0].like_count) || 0,
            discardCount: Number(data[0].discard_count) || 0,
            total: Number(data[0].total_count) || 0
          });
        } else {
          // No data returned, set empty stats
          setStats({ likeCount: 0, discardCount: 0, total: 0 });
        }
      } catch (error) {
        console.error('Error fetching story swipe stats:', error);
        setStats({ likeCount: 0, discardCount: 0, total: 0 });
      } finally {
        setLoading(false);
      }
    };

    fetchStats();

    // Subscribe to realtime updates for this story's swipes
    const channel = supabase
      .channel(`story-swipes-${storyId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'story_swipes',
          filter: `story_id=eq.${storyId}`
        },
        () => {
          // Refetch on any change
          fetchStats();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [storyId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-6 py-3 px-4 bg-muted/50 rounded-lg animate-pulse">
        <div className="h-5 w-16 bg-muted rounded" />
        <div className="flex-1 max-w-32 h-2 bg-muted rounded" />
        <div className="h-5 w-16 bg-muted rounded" />
      </div>
    );
  }

  // Always show the card, even with no ratings
  const hasRatings = stats && stats.total > 0;
  const approvalRate = hasRatings 
    ? Math.round((stats.likeCount / stats.total) * 100) 
    : 0;

  const cardContent = !hasRatings ? (
    <div className="flex items-center justify-center gap-4 py-3 px-4 bg-muted/50 rounded-lg">
      <Gamepad2 className="w-4 h-4 text-muted-foreground" />
      <span className="text-sm text-muted-foreground">Be the first to rate this story in Play Mode</span>
    </div>
  ) : (
    <div className="flex items-center justify-center gap-6 py-3 px-4 bg-muted/50 rounded-lg">
      <div className="flex items-center gap-2">
        <Heart className="w-5 h-5 text-rose-500 fill-rose-500" />
        <span className="text-lg font-semibold text-foreground">{stats.likeCount}</span>
      </div>
      
      <div className="flex-1 max-w-32">
        <Progress 
          value={approvalRate} 
          className="h-2 bg-muted"
        />
        <p className="text-xs text-muted-foreground text-center mt-1">
          {approvalRate}% approval
        </p>
      </div>
      
      <div className="flex items-center gap-2">
        <span className="text-lg font-semibold text-foreground">{stats.discardCount}</span>
        <ThumbsDown className="w-4 h-4 text-muted-foreground" />
      </div>
    </div>
  );

  if (topicSlug) {
    return (
      <Link 
        to={`/play/${topicSlug}`} 
        className="block hover:opacity-80 transition-opacity"
      >
        {cardContent}
      </Link>
    );
  }

  return cardContent;
};
