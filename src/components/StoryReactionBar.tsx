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

// Inflation multiplier to make numbers look busier
const INFLATION_MULTIPLIER = 12;
const INFLATION_BASE = 8;

export const StoryReactionBar = ({ storyId, topicId, className, onMoreLikeThis }: StoryReactionBarProps) => {
  const { counts, react, isLoading, isReacting } = useStoryReactions(storyId, topicId);
  const disabled = isReacting;
  
  const isLiked = counts.userReaction === 'like';
  const isDisliked = counts.userReaction === 'discard';
  const hasReacted = isLiked || isDisliked;

  // Inflated display numbers (only shown after user reacts)
  const inflatedThumbsUp = counts.thumbsUp * INFLATION_MULTIPLIER + INFLATION_BASE;
  const inflatedThumbsDown = counts.thumbsDown * INFLATION_MULTIPLIER + Math.floor(INFLATION_BASE / 2);

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
        {hasReacted && (
          <motion.span 
            initial={{ opacity: 0, width: 0 }}
            animate={{ opacity: 1, width: 'auto' }}
            className="text-xs font-medium tabular-nums"
          >
            {inflatedThumbsUp}
          </motion.span>
        )}
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
        {hasReacted && (
          <motion.span 
            initial={{ opacity: 0, width: 0 }}
            animate={{ opacity: 1, width: 'auto' }}
            className="text-xs font-medium tabular-nums"
          >
            {inflatedThumbsDown}
          </motion.span>
        )}
      </motion.button>

      {/* More like this - appears after any reaction */}
      {hasReacted && onMoreLikeThis && (
        <motion.button
          type="button"
          initial={{ opacity: 0, x: -10 }}
          animate={{ opacity: 1, x: 0 }}
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
        </motion.button>
      )}
    </div>
  );
};