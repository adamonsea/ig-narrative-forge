import { useRef, useMemo } from 'react';
import { motion, useMotionValue, useTransform, PanInfo, AnimatePresence } from 'framer-motion';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Calendar, ExternalLink, Heart, X } from 'lucide-react';
import { format } from 'date-fns';
import { useDeviceOptimizations, getAnimationPresets } from '@/lib/deviceUtils';

interface Story {
  id: string;
  title: string;
  author: string | null;
  cover_illustration_url: string | null;
  created_at: string;
  article: {
    source_url: string;
    published_at?: string | null;
  } | null;
}

interface PageTurnCardProps {
  story: Story;
  onSwipe: (direction: 'like' | 'discard') => void;
  onTap: () => void;
  exitDirection?: 'left' | 'right' | null;
  style?: React.CSSProperties;
}

export const PageTurnCard = ({ story, onSwipe, onTap, exitDirection, style }: PageTurnCardProps) => {
  const isDragging = useRef(false);
  const optimizations = useDeviceOptimizations();
  const animationPresets = useMemo(() => getAnimationPresets(), []);
  const x = useMotionValue(0);
  
  // Use less aggressive 3D rotation on old devices to reduce jank
  const rotateY = useTransform(
    x, 
    [-200, 0, 200], 
    optimizations.shouldReduceMotion ? [-5, 0, 5] : [-15, 0, 15]
  );
  const opacity = useTransform(x, [-200, -150, 0, 150, 200], [0.5, 1, 1, 1, 0.5]);

  // Overlay opacity for like/discard
  const likeOpacity = useTransform(x, [0, 100], [0, 1]);
  const discardOpacity = useTransform(x, [-100, 0], [1, 0]);

  const storyDate = story.article?.published_at 
    ? new Date(story.article.published_at)
    : new Date(story.created_at);

  const sourceDomain = story.article?.source_url 
    ? new URL(story.article.source_url).hostname.replace('www.', '')
    : null;

  const handleDragEnd = (_event: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
    const threshold = 100;
    
    if (Math.abs(info.offset.x) > threshold) {
      if (info.offset.x > 0) {
        onSwipe('like');
      } else {
        onSwipe('discard');
      }
    }
    
    isDragging.current = false;
  };

  return (
    <motion.div
      key={story.id}
      style={{
        x,
        ...(optimizations.shouldReduceMotion ? {} : { rotateY }), // Disable 3D on old devices
        opacity,
        perspective: 1000,
        transformStyle: 'preserve-3d',
        cursor: 'grab',
        // GPU acceleration hints for smoother animations
        willChange: 'transform',
        transform: 'translate3d(0, 0, 0)',
        WebkitTransform: 'translate3d(0, 0, 0)',
        backfaceVisibility: 'hidden',
        WebkitBackfaceVisibility: 'hidden',
        ...style
      }}
      drag="x"
      dragConstraints={{ left: 0, right: 0 }}
      dragElastic={animationPresets.dragElastic}
      dragTransition={animationPresets.dragTransition}
      onDragStart={() => { isDragging.current = true; }}
      onDragEnd={handleDragEnd}
      whileTap={{ cursor: 'grabbing' }}
      onTap={() => {
        if (!isDragging.current) {
          onTap();
        }
        isDragging.current = false;
      }}
      initial={{ scale: 0.9, y: 50, opacity: 0 }}
      animate={{ 
        scale: 1, 
        y: 0, 
        opacity: 1,
        transition: {
          type: "spring",
          ...animationPresets.spring
        }
      }}
      exit={
        exitDirection
          ? {
              x: exitDirection === 'left' ? -500 : 500,
              rotate: exitDirection === 'left' ? -20 : 20,
              opacity: 0,
              transition: { duration: 0.3, ease: 'easeInOut' }
            }
          : undefined
      }
      className="absolute inset-0 touch-none"
    >
      {/* Discard Overlay (Red) */}
      <motion.div
        style={{ opacity: discardOpacity }}
        className="absolute inset-0 bg-destructive/20 rounded-lg z-10 pointer-events-none flex items-center justify-center"
      >
        <div className="bg-destructive text-destructive-foreground rounded-full p-4">
          <X className="w-12 h-12" strokeWidth={3} />
        </div>
      </motion.div>

      {/* Like Overlay (Green) */}
      <motion.div
        style={{ opacity: likeOpacity }}
        className="absolute inset-0 bg-primary/20 rounded-lg z-10 pointer-events-none flex items-center justify-center"
      >
        <div className="bg-primary text-primary-foreground rounded-full p-4">
          <Heart className="w-12 h-12 fill-current" strokeWidth={3} />
        </div>
      </motion.div>

      {/* Story Card (matching existing design) */}
      <Card className="h-full shadow-2xl overflow-hidden border-2">
        {/* Cover Image */}
        {story.cover_illustration_url && (
          <div className="relative w-full aspect-[4/3] overflow-hidden bg-muted">
            <img
              src={story.cover_illustration_url}
              alt={story.title}
              className="w-full h-full object-cover"
              loading="eager"
            />
          </div>
        )}

        <CardContent className="p-6 space-y-4">
          {/* Title */}
          <h2 className="text-2xl font-semibold line-clamp-4 leading-tight">
            {story.title}
          </h2>

          {/* Author */}
          {story.author && (
            <p className="text-sm text-muted-foreground">
              by {story.author}
            </p>
          )}

          {/* Date */}
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Calendar className="w-4 h-4" />
            <time dateTime={storyDate.toISOString()}>
              {format(storyDate, 'MMM d, yyyy')}
            </time>
          </div>

          {/* Source Badge */}
          {sourceDomain && (
            <Badge variant="secondary" className="text-xs">
              <ExternalLink className="w-3 h-3 mr-1" />
              {sourceDomain}
            </Badge>
          )}

          {/* Tap to read hint */}
          <p className="text-xs text-muted-foreground text-center pt-4 border-t">
            Tap to read full story • Swipe to like or pass
          </p>
        </CardContent>
      </Card>
    </motion.div>
  );
};
