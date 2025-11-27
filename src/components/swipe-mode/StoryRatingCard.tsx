import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Heart, ThumbsDown } from 'lucide-react';
import { Progress } from '@/components/ui/progress';

interface StoryRatingCardProps {
  storyId: string;
}

interface SwipeStats {
  likeCount: number;
  discardCount: number;
  total: number;
}

export const StoryRatingCard = ({ storyId }: StoryRatingCardProps) => {
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
        }
      } catch (error) {
        console.error('Error fetching story swipe stats:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchStats();
  }, [storyId]);

  if (loading || !stats || stats.total === 0) {
    return null;
  }

  const approvalRate = stats.total > 0 
    ? Math.round((stats.likeCount / stats.total) * 100) 
    : 0;

  return (
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
        <ThumbsDown className="w-5 h-5 text-muted-foreground" />
      </div>
    </div>
  );
};
