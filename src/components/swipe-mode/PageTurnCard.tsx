import { useRef, useMemo } from 'react';
import { motion, useMotionValue, useTransform, PanInfo, animate } from 'framer-motion';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Calendar, ExternalLink, Heart, ThumbsDown, BookOpen } from 'lucide-react';
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
  slides?: Array<{
    slide_number: number;
    content: string;
  }>;
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
  
  // Enhanced page curl effects with multi-layer depth
  const curlRightSize = useTransform(x, [0, 150], [0, 120]); // Bottom-left curl when swiping right
  const curlLeftSize = useTransform(x, [-150, 0], [120, 0]); // Bottom-right curl when swiping left
  const curlOpacity = useTransform(x, [-150, -50, 0, 50, 150], [0.85, 0.4, 0, 0.4, 0.85]);
  
  // Shadow depth grows with curl
  const curlShadowIntensity = useTransform(x, [-150, 0, 150], [0.25, 0, 0.25]);
  
  // Backside paper visibility
  const backsideOpacity = useTransform(x, [-150, -50, 0, 50, 150], [0.9, 0.3, 0, 0.3, 0.9]);

  const storyDate = story.article?.published_at
    ? new Date(story.article.published_at)
    : new Date(story.created_at);

  const sourceDomain = story.article?.source_url 
    ? new URL(story.article.source_url).hostname.replace('www.', '')
    : null;

  const handleDragEnd = (_event: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
    const threshold = 80;
    
    // Capture velocity for throw physics
    dragVelocity.current = { x: info.velocity.x, y: info.velocity.y };
    
    if (Math.abs(info.offset.x) > threshold) {
      if (info.offset.x > 0) {
        onSwipe('like');
      } else {
        onSwipe('discard');
      }
    } else {
      // Snap back to center with spring animation
      animate(x, 0, {
        type: "spring",
        stiffness: animationPresets.spring.stiffness,
        damping: animationPresets.spring.damping,
        mass: animationPresets.spring.mass,
      });
    }
    
    isDragging.current = false;
  };
  
  const handleReadStory = (e: React.MouseEvent | React.TouchEvent) => {
    e.stopPropagation();
    e.preventDefault();
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
      dragConstraints={{ left: -500, right: 500 }}
      dragElastic={0.2}
      onDragStart={() => {
        isDragging.current = true;
      }}
      onDrag={(_, info) => {
        // Update x position during drag to follow finger
        x.set(info.offset.x);
      }}
      onDragEnd={handleDragEnd}
      whileTap={{ scale: 1.02 }}
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
        className="absolute inset-0 bg-gradient-to-br from-destructive/20 via-destructive/10 to-transparent rounded-lg z-10 pointer-events-none flex items-center justify-center"
      >
        <motion.div 
          style={{ scale: iconScale }}
          className="bg-destructive text-destructive-foreground rounded-full p-4 shadow-lg"
        >
          <ThumbsDown className="w-12 h-12" strokeWidth={3} />
        </motion.div>
      </motion.div>

      {/* Like Overlay (Gradient) */}
      <motion.div
        style={{ opacity: likeOpacity }}
        className="absolute inset-0 bg-gradient-to-bl from-primary/20 via-primary/10 to-transparent rounded-lg z-10 pointer-events-none flex items-center justify-center"
      >
        <motion.div 
          style={{ scale: iconScale }}
          className="bg-primary text-primary-foreground rounded-full p-4 shadow-lg"
        >
          <Heart className="w-12 h-12 fill-current" strokeWidth={3} />
        </motion.div>
      </motion.div>

      {/* Enhanced Page Curl - Bottom Left (appears when swiping right/like) */}
      <motion.div
        style={{ 
          opacity: curlOpacity,
          width: curlRightSize,
          height: curlRightSize,
        }}
        className="absolute bottom-0 left-0 z-20 pointer-events-none"
      >
        {/* Shadow layer beneath curl */}
        <motion.div
          style={{ opacity: curlShadowIntensity }}
          className="absolute inset-0"
        >
          <div 
            className="w-full h-full"
            style={{
              clipPath: 'polygon(0 100%, 100% 100%, 0 0)',
              background: 'radial-gradient(ellipse at 0% 100%, rgba(0,0,0,0.3) 0%, rgba(0,0,0,0.15) 30%, transparent 70%)',
              filter: 'blur(8px)',
              transform: 'translate(4px, 4px) skew(-2deg, -2deg)',
            }}
          />
        </motion.div>
        
        {/* Paper backside (cream/off-white) */}
        <motion.div
          style={{ opacity: backsideOpacity }}
          className="absolute inset-0"
        >
          <div 
            className="w-full h-full"
            style={{
              clipPath: 'polygon(0 100%, 100% 100%, 0 0)',
              background: 'linear-gradient(135deg, hsl(40, 20%, 92%) 0%, hsl(40, 15%, 88%) 100%)',
              transform: 'translateZ(-1px)',
            }}
          />
        </motion.div>
        
        {/* Main curl surface with lighting */}
        <div 
          className="absolute inset-0"
          style={{
            clipPath: 'path("M 0 100 Q 30 70, 60 50 T 100 0 L 0 0 Z")',
            background: 'linear-gradient(135deg, rgba(0,0,0,0.12) 0%, rgba(0,0,0,0.04) 40%, rgba(255,255,255,0.95) 70%, rgba(255,255,255,1) 100%)',
            boxShadow: 'inset 0 -1px 3px rgba(0,0,0,0.1)',
            transformOrigin: 'bottom left',
            transform: 'rotateX(8deg) rotateZ(-2deg)',
          }}
        />
        
        {/* Highlight fold line */}
        <div
          className="absolute inset-0"
          style={{
            clipPath: 'path("M 0 100 Q 30 70, 60 50 T 100 0 L 98 5 Q 58 52, 28 72 T 0 98 Z")',
            background: 'linear-gradient(135deg, transparent 0%, rgba(255,255,255,0.9) 45%, rgba(255,255,255,0.6) 55%, transparent 100%)',
          }}
        />
      </motion.div>

      {/* Enhanced Page Curl - Bottom Right (appears when swiping left/discard) */}
      <motion.div
        style={{ 
          opacity: curlOpacity,
          width: curlLeftSize,
          height: curlLeftSize,
        }}
        className="absolute bottom-0 right-0 z-20 pointer-events-none"
      >
        {/* Shadow layer beneath curl */}
        <motion.div
          style={{ opacity: curlShadowIntensity }}
          className="absolute inset-0"
        >
          <div 
            className="w-full h-full"
            style={{
              clipPath: 'polygon(100% 100%, 0 100%, 100% 0)',
              background: 'radial-gradient(ellipse at 100% 100%, rgba(0,0,0,0.3) 0%, rgba(0,0,0,0.15) 30%, transparent 70%)',
              filter: 'blur(8px)',
              transform: 'translate(-4px, 4px) skew(2deg, -2deg)',
            }}
          />
        </motion.div>
        
        {/* Paper backside (cream/off-white) */}
        <motion.div
          style={{ opacity: backsideOpacity }}
          className="absolute inset-0"
        >
          <div 
            className="w-full h-full"
            style={{
              clipPath: 'polygon(100% 100%, 0 100%, 100% 0)',
              background: 'linear-gradient(225deg, hsl(40, 20%, 92%) 0%, hsl(40, 15%, 88%) 100%)',
              transform: 'translateZ(-1px)',
            }}
          />
        </motion.div>
        
        {/* Main curl surface with lighting */}
        <div 
          className="absolute inset-0"
          style={{
            clipPath: 'path("M 100 100 Q 70 70, 40 50 T 0 0 L 100 0 Z")',
            background: 'linear-gradient(225deg, rgba(0,0,0,0.12) 0%, rgba(0,0,0,0.04) 40%, rgba(255,255,255,0.95) 70%, rgba(255,255,255,1) 100%)',
            boxShadow: 'inset 0 -1px 3px rgba(0,0,0,0.1)',
            transformOrigin: 'bottom right',
            transform: 'rotateX(8deg) rotateZ(2deg)',
          }}
        />
        
        {/* Highlight fold line */}
        <div
          className="absolute inset-0"
          style={{
            clipPath: 'path("M 100 100 Q 70 70, 40 50 T 0 0 L 2 5 Q 42 52, 72 72 T 100 98 Z")',
            background: 'linear-gradient(225deg, transparent 0%, rgba(255,255,255,0.9) 45%, rgba(255,255,255,0.6) 55%, transparent 100%)',
          }}
        />
      </motion.div>

      {/* Story Card (matching feed design) */}
      <Card className="h-full shadow-lg overflow-hidden border">
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

        <CardContent className="p-4 space-y-3">
          {/* Title - use slide headline if available */}
          <h2 className="text-3xl font-bold line-clamp-3 leading-tight uppercase">
            {story.slides?.[0]?.content?.replace(/<[^>]*>/g, '') || story.title}
          </h2>

          {/* Date */}
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Calendar className="w-4 h-4" />
            <time dateTime={storyDate.toISOString()}>
              {format(storyDate, 'MMM d')}
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
          <div className="pt-3 border-t flex justify-center">
            <Button
              onClick={handleReadStory}
              onTouchEnd={handleReadStory}
              variant="default"
              size="lg"
              className="w-1/3 pointer-events-auto"
            >
              Read
            </Button>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
};
