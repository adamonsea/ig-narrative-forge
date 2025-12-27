import { ThumbsUp, ThumbsDown } from 'lucide-react';
import { ThumbsUp, ThumbsDown } from 'lucide-react';
import { useStoryReactions } from '@/hooks/useStoryReactions';
import { cn } from '@/lib/utils';
import { motion } from 'framer-motion';

interface StoryReactionBarProps {
  storyId: string;
  topicId: string;
  className?: string;
  onMoreLikeThis?: (storyId: string) => void;
}

export const StoryReactionBar = ({ storyId, topicId, className, onMoreLikeThis }: StoryReactionBarProps) => {
  const { counts, react, isLoading, isReacting } = useStoryReactions(storyId, topicId);
  const disabled = isReacting;
  
  const isLiked = counts.userReaction === 'like';
  const isDisliked = counts.userReaction === 'discard';

  const thumbsUpDisplay = String(counts.thumbsUp);
  const thumbsDownDisplay = String(counts.thumbsDown);

  return (
    <div
      className={cn('flex items-center gap-2 relative z-50 pointer-events-auto', className)}
      aria-busy={isLoading || isReacting}
    >
      {/* Thumbs Up */}
      <motion.button
        type="button"
        whileTap={{ scale: 0.9 }}
        onPointerDownCapture={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          react('like');
        }}
        disabled={disabled}
        aria-pressed={isLiked}
        className={cn(
          'flex items-center gap-1 px-2 py-1 rounded-full transition-colors cursor-pointer',
          'hover:bg-primary/10 active:bg-primary/20',
          'disabled:opacity-50 disabled:cursor-not-allowed',
          isLiked ? 'text-primary bg-primary/10' : 'text-muted-foreground'
        )}
        aria-label="Like this story"
      >
        <ThumbsUp
          className="w-4 h-4"
          fill={isLiked ? 'currentColor' : 'none'}
        />
        <span className="text-xs font-medium tabular-nums">{thumbsUpDisplay}</span>
      </motion.button>

      {/* Thumbs Down */}
      <motion.button
        type="button"
        whileTap={{ scale: 0.9 }}
        onPointerDownCapture={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          react('discard');
        }}
        disabled={disabled}
        aria-pressed={isDisliked}
        className={cn(
          'flex items-center gap-1 px-2 py-1 rounded-full transition-colors cursor-pointer',
          'hover:bg-destructive/10 active:bg-destructive/20',
          'disabled:opacity-50 disabled:cursor-not-allowed',
          isDisliked ? 'text-destructive bg-destructive/10' : 'text-muted-foreground'
        )}
        aria-label="Dislike this story"
      >
        <ThumbsDown
          className="w-4 h-4"
          fill={isDisliked ? 'currentColor' : 'none'}
        />
        <span className="text-xs font-medium tabular-nums">{thumbsDownDisplay}</span>
      </motion.button>

      {isLiked && onMoreLikeThis && (
        <button
          type="button"
          onPointerDownCapture={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onMoreLikeThis(storyId);
          }}
          className={cn(
            'text-xs font-medium px-2 py-1 rounded-full transition-colors',
            'text-primary hover:bg-primary/10'
          )}
        >
          More like this
        </button>
      )}

    </div>
  );
};
