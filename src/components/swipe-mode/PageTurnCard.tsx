import { useRef, useMemo } from 'react';
import { motion, useMotionValue, useTransform, PanInfo, animate } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Heart, ThumbsDown } from 'lucide-react';
import { format } from 'date-fns';
import { useDeviceOptimizations, getAnimationPresets, triggerHaptic } from '@/lib/deviceUtils';

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

// Torn edge clip-path for newspaper cutting effect
const tornEdgeClipPath = `polygon(
  0% 2%, 2% 0%, 5% 1%, 8% 0%, 12% 2%, 15% 0%, 18% 1%, 22% 0%, 25% 2%, 28% 0%, 
  32% 1%, 35% 0%, 38% 2%, 42% 0%, 45% 1%, 48% 0%, 52% 2%, 55% 0%, 58% 1%, 
  62% 0%, 65% 2%, 68% 0%, 72% 1%, 75% 0%, 78% 2%, 82% 0%, 85% 1%, 88% 0%, 
  92% 2%, 95% 0%, 98% 1%, 100% 2%,
  100% 98%, 98% 100%, 95% 99%, 92% 100%, 88% 98%, 85% 100%, 82% 99%, 78% 100%, 
  75% 98%, 72% 100%, 68% 99%, 65% 100%, 62% 98%, 58% 100%, 55% 99%, 52% 100%, 
  48% 98%, 45% 100%, 42% 99%, 38% 100%, 35% 98%, 32% 100%, 28% 99%, 25% 100%, 
  22% 98%, 18% 100%, 15% 99%, 12% 100%, 8% 98%, 5% 100%, 2% 99%, 0% 98%
)`;

export const PageTurnCard = ({ story, onSwipe, onTap, exitDirection, style }: PageTurnCardProps) => {
  const isDragging = useRef(false);
  const optimizations = useDeviceOptimizations();
  const animationPresets = useMemo(() => getAnimationPresets(), []);
  const x = useMotionValue(0);
  const dragVelocity = useRef({ x: 0, y: 0 });
  
  // Device-adaptive effect values based on tier
  const liftScale = animationPresets.enableDynamicShadows ? 1.03 : 1.01;
  const maxTilt = animationPresets.enablePageCurl ? 12 : 5;
  const shadowDepth = animationPresets.enableDynamicShadows ? 30 : 10;
  const exitVelocityMultiplier = animationPresets.swipeVelocityMultiplier;
  
  // Natural paper tilt (rotateZ) instead of flip
  const rotateZ = useTransform(
    x, 
    [-200, 0, 200], 
    [-maxTilt, 0, maxTilt]
  );
  
  // Subtle vertical lift as paper tilts
  const y = useTransform(x, [-200, 0, 200], [10, 0, 10]);
  
  // Shadow deepens as card lifts - softer newspaper shadow
  const boxShadow = useTransform(
    x,
    [-200, 0, 200],
    [
      `0 ${shadowDepth}px ${shadowDepth * 2}px -${shadowDepth / 2}px rgba(139,119,101,0.25)`,
      `0 8px 24px -4px rgba(139,119,101,0.15)`,
      `0 ${shadowDepth}px ${shadowDepth * 2}px -${shadowDepth / 2}px rgba(139,119,101,0.25)`
    ]
  );

  // Overlay opacity for like/discard with gradient effect
  const likeOpacity = useTransform(x, [0, 100], [0, 1]);
  const discardOpacity = useTransform(x, [-100, 0], [1, 0]);
  
  // Icon scale pulses near threshold
  const iconScale = useTransform(x, [-150, -100, 100, 150], [1.2, 1, 1, 1.2]);
  
  // Realistic page curl effects with depth
  const rightCurlOpacity = useTransform(x, [0, 100], [0, 0.8]);
  const leftCurlOpacity = useTransform(x, [-100, 0], [0.8, 0]);
  const rightCurlSize = useTransform(x, [0, 150], [0, 80]);
  const leftCurlSize = useTransform(x, [-150, 0], [80, 0]);

  const storyDate = (() => {
    const dateStr = story.article?.published_at || story.created_at;
    if (!dateStr) return new Date();
    const parsed = new Date(dateStr);
    return isNaN(parsed.getTime()) ? new Date() : parsed;
  })();

  // Safe date formatting wrapper
  const formatSafe = (date: Date, formatStr: string) => {
    try {
      return format(date, formatStr);
    } catch {
      return '';
    }
  };

  const handleDragEnd = (_event: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
    // Velocity-weighted threshold: faster swipes require less distance
    const baseThreshold = 80;
    const velocityBoost = Math.min(Math.abs(info.velocity.x) / 1000, 0.4) * animationPresets.swipeVelocityMultiplier;
    const effectiveThreshold = baseThreshold * (1 - velocityBoost);
    
    // Capture velocity for throw physics
    dragVelocity.current = { x: info.velocity.x, y: info.velocity.y };
    
    if (Math.abs(info.offset.x) > effectiveThreshold) {
      // Haptic feedback on successful swipe
      if (animationPresets.enableHaptics) {
        triggerHaptic('medium');
      }
      
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
        style={{ opacity: discardOpacity, clipPath: tornEdgeClipPath }}
        className="absolute inset-0 bg-gradient-to-br from-destructive/20 via-destructive/10 to-transparent z-10 pointer-events-none flex items-center justify-center"
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
        style={{ opacity: likeOpacity, clipPath: tornEdgeClipPath }}
        className="absolute inset-0 bg-gradient-to-bl from-primary/20 via-primary/10 to-transparent z-10 pointer-events-none flex items-center justify-center"
      >
        <motion.div 
          style={{ scale: iconScale }}
          className="bg-primary text-primary-foreground rounded-full p-4 shadow-lg"
        >
          <Heart className="w-12 h-12 fill-current" strokeWidth={3} />
        </motion.div>
      </motion.div>

      {/* Realistic Page Curl - Only rendered on capable devices */}
      {animationPresets.enablePageCurl && (
        <>
          {/* Page Curl - Bottom Left (appears when swiping right/liking) */}
          <motion.div
            className="absolute bottom-0 left-0 pointer-events-none"
            style={{
              width: rightCurlSize,
              height: rightCurlSize,
              opacity: rightCurlOpacity,
              zIndex: 20,
            }}
          >
            {animationPresets.enableDynamicShadows && (
              <div
                className="absolute inset-0"
                style={{
                  clipPath: 'path("M 0 100 Q 0 60, 20 80 Q 40 100, 100 100 Z")',
                  background: 'linear-gradient(135deg, rgba(139,119,101,0.2) 0%, transparent 70%)',
                  filter: 'blur(2px)',
                }}
              />
            )}
            <div
              className="absolute inset-0"
              style={{
                clipPath: 'path("M 0 100 Q 0 70, 15 85 Q 30 100, 100 100 Z")',
                background: 'linear-gradient(135deg, #f8f5e9 0%, #efe8d8 100%)',
                boxShadow: animationPresets.enableDynamicShadows ? '2px 2px 8px rgba(139,119,101,0.15)' : 'none',
              }}
            />
          </motion.div>

          {/* Page Curl - Bottom Right (appears when swiping left/discarding) */}
          <motion.div
            className="absolute bottom-0 right-0 pointer-events-none"
            style={{
              width: leftCurlSize,
              height: leftCurlSize,
              opacity: leftCurlOpacity,
              zIndex: 20,
            }}
          >
            {animationPresets.enableDynamicShadows && (
              <div
                className="absolute inset-0"
                style={{
                  clipPath: 'path("M 100 100 Q 100 60, 80 80 Q 60 100, 0 100 Z")',
                  background: 'linear-gradient(225deg, rgba(139,119,101,0.2) 0%, transparent 70%)',
                  filter: 'blur(2px)',
                }}
              />
            )}
            <div
              className="absolute inset-0"
              style={{
                clipPath: 'path("M 100 100 Q 100 70, 85 85 Q 70 100, 0 100 Z")',
                background: 'linear-gradient(225deg, #f8f5e9 0%, #efe8d8 100%)',
                boxShadow: animationPresets.enableDynamicShadows ? '-2px 2px 8px rgba(139,119,101,0.15)' : 'none',
              }}
            />
          </motion.div>
        </>
      )}

      {/* Newspaper Cutting Card */}
      <div 
        className="h-full overflow-hidden relative"
        style={{
          clipPath: tornEdgeClipPath,
          background: 'linear-gradient(145deg, #f8f5e9 0%, #f5f0e1 50%, #efe8d8 100%)',
        }}
      >
        {/* Paper texture overlay */}
        <div 
          className="absolute inset-0 pointer-events-none opacity-30 z-10"
          style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")`,
          }}
        />
        
        {/* Subtle fold line */}
        <div 
          className="absolute left-1/2 top-0 bottom-0 w-px pointer-events-none z-10"
          style={{
            background: 'linear-gradient(to bottom, transparent 0%, rgba(139,119,101,0.1) 20%, rgba(139,119,101,0.15) 50%, rgba(139,119,101,0.1) 80%, transparent 100%)',
          }}
        />

        {/* Cover Image with sepia treatment */}
        {story.cover_illustration_url && (
          <div className="relative w-full aspect-[4/3] overflow-hidden">
            <img
              src={story.cover_illustration_url}
              alt={story.title}
              className="w-full h-full object-cover"
              style={{ 
                filter: 'sepia(12%) contrast(1.02) brightness(0.98)' 
              }}
              loading="eager"
            />
          </div>
        )}

        {/* Content area */}
        <div className="p-4 space-y-3 relative z-20">
          {/* Newspaper dateline */}
          <div 
            className="text-xs tracking-wider uppercase"
            style={{ 
              color: '#8b7765',
              fontFamily: 'Georgia, "Times New Roman", serif',
            }}
          >
            The Herald • {formatSafe(storyDate, 'd MMM')}
          </div>

          {/* Headline - newspaper style */}
          <h2 
            className="text-xl font-bold leading-tight uppercase tracking-tight"
            style={{
              color: '#2c2416',
              fontFamily: 'Georgia, "Times New Roman", serif',
              textShadow: '0.5px 0.5px 0 rgba(139,119,101,0.1)',
            }}
          >
            {story.slides?.[0]?.content?.replace(/<[^>]*>/g, '') || story.title}
          </h2>

          {/* Read Story Button */}
          <div className="pt-3 border-t border-[#d4c9b8] flex justify-center">
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
        </div>
      </div>
    </motion.div>
  );
};
