import { useRef, useMemo } from 'react';
import { motion, useMotionValue, useTransform, PanInfo } from 'framer-motion';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Calendar, ExternalLink, Heart, X, BookOpen } from 'lucide-react';
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
  const dragVelocity = useRef({ x: 0, y: 0 });
  
  // Device-adaptive effect values
  const liftScale = optimizations.shouldReduceMotion ? 1.01 : 1.03;
  const maxTilt = optimizations.shouldReduceMotion ? 5 : 12;
  const shadowDepth = optimizations.shouldReduceMotion ? 10 : 30;
  const exitVelocityMultiplier = optimizations.shouldReduceMotion ? 0.6 : 1.0;
  
  // Natural paper tilt (rotateZ) instead of flip
  const rotateZ = useTransform(
    x, 
    [-200, 0, 200], 
    [-maxTilt, 0, maxTilt]
  );
  
  // Subtle vertical lift as paper tilts
  const y = useTransform(x, [-200, 0, 200], [10, 0, 10]);
  
  // Shadow deepens as card lifts
  const boxShadow = useTransform(
    x,
    [-200, 0, 200],
    [
      `0 ${shadowDepth}px ${shadowDepth * 2}px -${shadowDepth / 2}px rgba(0,0,0,0.3)`,
      `0 10px 20px -5px rgba(0,0,0,0.1)`,
      `0 ${shadowDepth}px ${shadowDepth * 2}px -${shadowDepth / 2}px rgba(0,0,0,0.3)`
    ]
  );

  // Overlay opacity for like/discard with gradient effect
  const likeOpacity = useTransform(x, [0, 100], [0, 1]);
  const discardOpacity = useTransform(x, [-100, 0], [1, 0]);
  
  // Icon scale pulses near threshold
  const iconScale = useTransform(x, [-150, -100, 100, 150], [1.2, 1, 1, 1.2]);

  const storyDate = story.article?.published_at 
    ? new Date(story.article.published_at)
    : new Date(story.created_at);

  const sourceDomain = story.article?.source_url 
    ? new URL(story.article.source_url).hostname.replace('www.', '')
    : null;

  const handleDragEnd = (_event: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
    const threshold = 100;
    
    // Capture velocity for throw physics
    dragVelocity.current = { x: info.velocity.x, y: info.velocity.y };
    
    if (Math.abs(info.offset.x) > threshold) {
      if (info.offset.x > 0) {
        onSwipe('like');
      } else {
        onSwipe('discard');
      }
    }
    
    isDragging.current = false;
  };
  
  const handleReadStory = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!isDragging.current) {
      onTap();
    }
  };

  return (
    <motion.div
      key={story.id}
      style={{
        x,
        y,
        rotateZ,
        boxShadow,
        cursor: isDragging.current ? 'grabbing' : 'grab',
        // GPU acceleration hints
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
      onDragStart={() => { 
        isDragging.current = true;
      }}
      onDragEnd={handleDragEnd}
      whileDrag={{ scale: liftScale }}
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
              x: (exitDirection === 'left' ? -1 : 1) * (500 + Math.abs(dragVelocity.current.x) * exitVelocityMultiplier),
              y: dragVelocity.current.y * exitVelocityMultiplier * 0.3,
              rotate: (exitDirection === 'left' ? -1 : 1) * (20 + Math.abs(dragVelocity.current.x) * 0.02),
              opacity: 0,
              transition: { 
                duration: 0.4, 
                ease: [0.32, 0.72, 0, 1] // Custom bezier for natural throw
              }
            }
          : undefined
      }
      className="absolute inset-0 touch-none"
    >
      {/* Discard Overlay (Gradient) */}
      <motion.div
        style={{ opacity: discardOpacity }}
        className="absolute inset-0 bg-gradient-to-br from-destructive/30 via-destructive/20 to-transparent rounded-lg z-10 pointer-events-none flex items-center justify-center"
      >
        <motion.div 
          style={{ scale: iconScale }}
          className="bg-destructive text-destructive-foreground rounded-full p-4 shadow-lg"
        >
          <X className="w-12 h-12" strokeWidth={3} />
        </motion.div>
      </motion.div>

      {/* Like Overlay (Gradient) */}
      <motion.div
        style={{ opacity: likeOpacity }}
        className="absolute inset-0 bg-gradient-to-bl from-primary/30 via-primary/20 to-transparent rounded-lg z-10 pointer-events-none flex items-center justify-center"
      >
        <motion.div 
          style={{ scale: iconScale }}
          className="bg-primary text-primary-foreground rounded-full p-4 shadow-lg"
        >
          <Heart className="w-12 h-12 fill-current" strokeWidth={3} />
        </motion.div>
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

          {/* Read Story Button */}
          <div className="pt-4 border-t">
            <Button
              onClick={handleReadStory}
              variant="default"
              size="lg"
              className="w-full gap-2"
            >
              <BookOpen className="w-4 h-4" />
              Read Full Story
            </Button>
            <p className="text-xs text-muted-foreground text-center mt-2">
              Swipe left to discard • Swipe right to like
            </p>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
};
