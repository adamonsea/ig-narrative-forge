import { ThumbsUp, ThumbsDown } from 'lucide-react';
import { useStoryReactions } from '@/hooks/useStoryReactions';
import { cn } from '@/lib/utils';
import { motion } from 'framer-motion';

interface StoryReactionBarProps {
  storyId: string;
  topicId: string;
  className?: string;
}

export const StoryReactionBar = ({ storyId, topicId, className }: StoryReactionBarProps) => {
  const { counts, react, isLoading } = useStoryReactions(storyId, topicId);

  if (isLoading) {
    return (
      <div className={cn('flex items-center gap-4 text-muted-foreground', className)}>
        <span className="text-sm opacity-50">Loading...</span>
      </div>
    );
  }

  return (
    <div className={cn('flex items-center gap-4', className)}>
      {/* Thumbs Up */}
      <motion.button
        whileTap={{ scale: 0.9 }}
        onClick={() => react('like')}
        className={cn(
          'flex items-center gap-1.5 px-3 py-1.5 rounded-full transition-colors',
          'hover:bg-primary/10',
          counts.userReaction === 'like'
            ? 'text-primary bg-primary/10'
            : 'text-muted-foreground'
        )}
        aria-label="Like this story"
      >
        <ThumbsUp
          className={cn(
            'w-4 h-4 transition-all',
            counts.userReaction === 'like' && 'fill-current'
          )}
        />
        <span className="text-sm font-medium tabular-nums">{counts.thumbsUp}</span>
      </motion.button>

      {/* Thumbs Down */}
      <motion.button
        whileTap={{ scale: 0.9 }}
        onClick={() => react('discard')}
        className={cn(
          'flex items-center gap-1.5 px-3 py-1.5 rounded-full transition-colors',
          'hover:bg-destructive/10',
          counts.userReaction === 'discard'
            ? 'text-destructive bg-destructive/10'
            : 'text-muted-foreground'
        )}
        aria-label="Dislike this story"
      >
        <ThumbsDown
          className={cn(
            'w-4 h-4 transition-all',
            counts.userReaction === 'discard' && 'fill-current'
          )}
        />
        <span className="text-sm font-medium tabular-nums">{counts.thumbsDown}</span>
      </motion.button>
    </div>
  );
};
