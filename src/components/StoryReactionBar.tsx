import { ThumbsUp, ThumbsDown } from 'lucide-react';
import { useStoryReactions } from '@/hooks/useStoryReactions';
import { cn } from '@/lib/utils';
import { motion } from 'framer-motion';
import { useRef, useMemo, useEffect } from 'react';
import type { ReactionCounts } from '@/hooks/useStoriesReactionsBatch';

interface StoryReactionBarProps {
  storyId: string;
  topicId: string;
  className?: string;
  onMoreLikeThis?: (storyId: string) => void;
  /** Pre-fetched counts from batch hook - skips individual fetch if provided */
  prefetchedCounts?: ReactionCounts;
  /** Callback to update batch counts after reaction */
  onCountsChange?: (storyId: string, counts: ReactionCounts) => void;
}

// Inflation adds a fixed base to make numbers look busier
const INFLATION_BASE_UP = 47;
const INFLATION_BASE_DOWN = 23;

export const StoryReactionBar = ({ 
  storyId, 
  topicId, 
  className, 
  onMoreLikeThis,
  prefetchedCounts,
  onCountsChange
}: StoryReactionBarProps) => {
  // Always use individual hook for reaction logic
  const individualHook = useStoryReactions(storyId, topicId);
  const { react, isReacting, counts: hookCounts } = individualHook;
  
  // Track if we just reacted to sync counts to parent
  const justReactedRef = useRef(false);
  
  // Use prefetched counts initially, but switch to hook counts after any reaction
  const hasReactedEver = useRef(false);
  if (hookCounts.userReaction !== null || justReactedRef.current) {
    hasReactedEver.current = true;
  }
  
  // After a reaction, prefer hook counts (they're updated optimistically)
  const counts = hasReactedEver.current ? hookCounts : (prefetchedCounts ?? hookCounts);
  
  // Sync counts to parent batch map after reaction completes
  useEffect(() => {
    if (justReactedRef.current && !isReacting && onCountsChange) {
      onCountsChange(storyId, hookCounts);
      justReactedRef.current = false;
    }
  }, [hookCounts, isReacting, onCountsChange, storyId]);
  
  // Wrap react to track when we're reacting
  const handleReaction = (type: 'like' | 'discard') => {
    justReactedRef.current = true;
    react(type);
  };
  
  // Only show loading if using individual fetch AND it's loading
  const isLoading = !prefetchedCounts && individualHook.isLoading;
  
  // Disable during initial load AND during active reaction to prevent race conditions
  const disabled = isLoading || isReacting;
  
  const isLiked = counts.userReaction === 'like';
  const isDisliked = counts.userReaction === 'discard';
  const hasReacted = isLiked || isDisliked;

  // Capture the initial counts when user first reacts to use as baseline
  const baselineRef = useRef<{ thumbsUp: number; thumbsDown: number } | null>(null);
  
  // Set baseline on first reaction
  if (hasReacted && !baselineRef.current) {
    baselineRef.current = {
      thumbsUp: counts.thumbsUp,
      thumbsDown: counts.thumbsDown,
    };
  }
  
  // Reset baseline if user un-reacts completely
  if (!hasReacted) {
    baselineRef.current = null;
  }

  // Calculate displayed numbers: base inflation + relative change from baseline
  const displayNumbers = useMemo(() => {
    if (!hasReacted || !baselineRef.current) {
      return { thumbsUp: 0, thumbsDown: 0 };
    }
    
    const baseline = baselineRef.current;
    const deltaUp = counts.thumbsUp - baseline.thumbsUp;
    const deltaDown = counts.thumbsDown - baseline.thumbsDown;
    
    return {
      thumbsUp: INFLATION_BASE_UP + deltaUp,
      thumbsDown: INFLATION_BASE_DOWN + deltaDown,
    };
  }, [hasReacted, counts.thumbsUp, counts.thumbsDown]);

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
          handleReaction('like');
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
            {displayNumbers.thumbsUp}
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
          handleReaction('discard');
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
            {displayNumbers.thumbsDown}
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
