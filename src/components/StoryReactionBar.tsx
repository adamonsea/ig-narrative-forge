import { ThumbsUp, ThumbsDown } from 'lucide-react';
import { useStoryReactions } from '@/hooks/useStoryReactions';
import { cn } from '@/lib/utils';
import { motion } from 'framer-motion';

interface StoryReactionBarProps {
  storyId: string;
  topicId: string;
  className?: string;
}

// Boost low counts with a believable offset for new feeds
const getDisplayCount = (count: number, hasVoted: boolean): string | null => {
  if (!hasVoted) return null; // Hide until user votes
  // Add a small boost for low-traffic feeds to look more established
  const boost = count < 10 ? Math.floor(Math.random() * 5) + 3 : 0;
  return String(count + boost);
};

export const StoryReactionBar = ({ storyId, topicId, className }: StoryReactionBarProps) => {
  const { counts, react, isLoading } = useStoryReactions(storyId, topicId);
  const disabled = isLoading;
  const hasVoted = counts.userReaction !== null;
  
  const thumbsUpDisplay = getDisplayCount(counts.thumbsUp, hasVoted);
  const thumbsDownDisplay = getDisplayCount(counts.thumbsDown, hasVoted);

  return (
    <div className={cn('flex items-center gap-2 relative z-10', className)} aria-busy={isLoading}>
      {/* Thumbs Up */}
      <motion.button
        type="button"
        whileTap={{ scale: 0.9 }}
        onClick={() => react('like')}
        disabled={disabled}
        className={cn(
          'flex items-center gap-1 px-2 py-1 rounded-full transition-colors cursor-pointer',
          'hover:bg-primary/10 active:bg-primary/20',
          'disabled:opacity-50 disabled:cursor-not-allowed',
          counts.userReaction === 'like' ? 'text-primary bg-primary/10' : 'text-muted-foreground'
        )}
        aria-label="Like this story"
      >
        <ThumbsUp
          className={cn('w-4 h-4 transition-all', counts.userReaction === 'like' && 'fill-current')}
        />
        {thumbsUpDisplay && (
          <span className="text-xs font-medium tabular-nums">{thumbsUpDisplay}</span>
        )}
      </motion.button>

      {/* Thumbs Down */}
      <motion.button
        type="button"
        whileTap={{ scale: 0.9 }}
        onClick={() => react('discard')}
        disabled={disabled}
        className={cn(
          'flex items-center gap-1 px-2 py-1 rounded-full transition-colors cursor-pointer',
          'hover:bg-destructive/10 active:bg-destructive/20',
          'disabled:opacity-50 disabled:cursor-not-allowed',
          counts.userReaction === 'discard'
            ? 'text-destructive bg-destructive/10'
            : 'text-muted-foreground'
        )}
        aria-label="Dislike this story"
      >
        <ThumbsDown
          className={cn('w-4 h-4 transition-all', counts.userReaction === 'discard' && 'fill-current')}
        />
        {thumbsDownDisplay && (
          <span className="text-xs font-medium tabular-nums">{thumbsDownDisplay}</span>
        )}
      </motion.button>
    </div>
  );
};
