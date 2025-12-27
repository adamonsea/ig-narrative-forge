import { ThumbsUp, ThumbsDown } from 'lucide-react';
import { useStoryReactions } from '@/hooks/useStoryReactions';
import { cn } from '@/lib/utils';
import { motion } from 'framer-motion';

interface StoryReactionBarProps {
  storyId: string;
  topicId: string;
  className?: string;
}

// Boost low counts with a believable offset for new feeds (stable + tapered)
const getDisplayCount = (count: number, hasVoted: boolean, seed: string): string | null => {
  if (!hasVoted) return null; // Hide until user votes

  // Taper fake boost as organic engagement grows; stop completely around ~50 votes/story.
  const maxBoost = count >= 50 ? 0 : Math.min(15, Math.max(2, Math.round((50 - count) * 0.15) + 2));
  if (maxBoost === 0) return String(count);

  // Stable pseudo-random boost (prevents numbers changing on re-render)
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  const boost = 1 + (h % maxBoost);

  return String(count + boost);
};

export const StoryReactionBar = ({ storyId, topicId, className }: StoryReactionBarProps) => {
  const { counts, react, isLoading } = useStoryReactions(storyId, topicId);
  const disabled = isLoading;
  const hasVoted = counts.userReaction !== null;
  
  const thumbsUpDisplay = getDisplayCount(counts.thumbsUp, hasVoted, `${storyId}:like`);
  const thumbsDownDisplay = getDisplayCount(counts.thumbsDown, hasVoted, `${storyId}:discard`);

  return (
    <div
      className={cn('flex items-center gap-2 relative z-50 pointer-events-auto', className)}
      aria-busy={isLoading}
    >
      {/* Thumbs Up */}
      <motion.button
        type="button"
        whileTap={{ scale: 0.9 }}
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          react('like');
        }}
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
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          react('discard');
        }}
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
