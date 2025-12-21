import { useRef, useMemo, memo } from 'react';
import { motion, useMotionValue, useTransform, PanInfo, animate } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Heart, ThumbsDown } from 'lucide-react';
import { format } from 'date-fns';
import { getAnimationPresets, triggerHaptic } from '@/lib/deviceUtils';
import { optimizeImageUrl } from '@/lib/imageOptimization';

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

// Simplified torn edge - less complex for better performance
const tornEdgeClipPath = `polygon(
  0% 1%, 3% 0%, 8% 1%, 15% 0%, 22% 1%, 30% 0%, 38% 1%, 45% 0%, 52% 1%, 
  60% 0%, 68% 1%, 75% 0%, 82% 1%, 90% 0%, 97% 1%, 100% 0%,
  100% 99%, 97% 100%, 90% 99%, 82% 100%, 75% 99%, 68% 100%, 60% 99%, 
  52% 100%, 45% 99%, 38% 100%, 30% 99%, 22% 100%, 15% 99%, 8% 100%, 3% 99%, 0% 100%
)`;

const PageTurnCardComponent = ({ story, onSwipe, onTap, exitDirection, style }: PageTurnCardProps) => {
  const isDragging = useRef(false);
  const animationPresets = useMemo(() => getAnimationPresets(), []);
  const x = useMotionValue(0);
  
  // Device-adaptive effect values
  const liftScale = animationPresets.enableDynamicShadows ? 1.02 : 1.01;
  const maxTilt = animationPresets.enablePageCurl ? 8 : 4;
  
  // Natural paper tilt (rotateZ) - GPU accelerated
  const rotateZ = useTransform(x, [-200, 0, 200], [-maxTilt, 0, maxTilt]);
  
  // Shadow opacity instead of expensive boxShadow string interpolation - GPU accelerated
  const shadowOpacity = useTransform(x, [-200, 0, 200], [0.3, 0.15, 0.3]);

  // Overlay opacity for like/discard - GPU accelerated
  const likeOpacity = useTransform(x, [0, 100], [0, 1]);
  const discardOpacity = useTransform(x, [-100, 0], [1, 0]);

  const storyDate = useMemo(() => {
    const dateStr = story.article?.published_at || story.created_at;
    if (!dateStr) return new Date();
    const parsed = new Date(dateStr);
    return isNaN(parsed.getTime()) ? new Date() : parsed;
  }, [story.article?.published_at, story.created_at]);

  const formattedDate = useMemo(() => {
    try {
      return format(storyDate, 'd MMM');
    } catch {
      return '';
    }
  }, [storyDate]);

  const headline = useMemo(() => {
    return story.slides?.[0]?.content?.replace(/<[^>]*>/g, '') || story.title;
  }, [story.slides, story.title]);

  const handleDragEnd = (_event: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
    const threshold = 80;
    const isQuickFlick = Math.abs(info.velocity.x) > 450 && Math.abs(info.offset.x) > 20;

    if (Math.abs(info.offset.x) > threshold || isQuickFlick) {
      if (animationPresets.enableHaptics) {
        triggerHaptic('medium');
      }
      onSwipe(info.offset.x > 0 ? 'like' : 'discard');
    } else {
      // Snap back (use device-tuned spring)
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

  // Optimized image URL - resize for mobile viewport, WebP, 75% quality
  const optimizedCoverUrl = useMemo(() => 
    optimizeImageUrl(story.cover_illustration_url, { width: 400, quality: 75, format: 'webp' }),
    [story.cover_illustration_url]
  );

  return (
    <motion.div
      key={story.id}
      layout={false}
      style={{
        x,
        rotateZ,
        cursor: 'grab',
        willChange: 'transform, opacity',
        contain: 'layout style paint',
        ...style
      }}
      drag="x"
      dragConstraints={{ left: -300, right: 300 }}
      dragElastic={animationPresets.dragElastic}
      dragMomentum={false}
      dragTransition={{ 
        bounceStiffness: 600, 
        bounceDamping: 30 
      }}
      onDragStart={() => { isDragging.current = true; }}
      onDragEnd={handleDragEnd}
      whileDrag={{ 
        scale: liftScale,
        cursor: 'grabbing'
      }}
      initial={{ scale: 0.9, y: 50, opacity: 0 }}
      animate={{
        scale: 1,
        y: 0,
        opacity: 1,
        transition: { type: "spring", ...animationPresets.spring }
      }}
      exit={
        exitDirection
          ? {
              x: (exitDirection === 'left' ? -1 : 1) * 1200,
              rotate: (exitDirection === 'left' ? -1 : 1) * 18,
              opacity: 0,
              transition: { duration: 0.28, ease: [0.32, 0.72, 0, 1] }
            }
          : undefined
      }
      className="absolute inset-0 touch-none gpu-layer"
    >
      {/* GPU-accelerated shadow layer - opacity only, no boxShadow string interpolation */}
      <motion.div 
        style={{ opacity: shadowOpacity }}
        className="absolute inset-0 -z-10 pointer-events-none rounded-lg"
        aria-hidden="true"
      >
        <div 
          className="absolute inset-0 rounded-lg"
          style={{ 
            boxShadow: '0 25px 50px -12px rgba(139,119,101,0.4)',
            transform: 'translateZ(0)'
          }}
        />
      </motion.div>

      {/* Discard Overlay - simplified, no scale animation */}
      <motion.div
        style={{ opacity: discardOpacity }}
        className="absolute inset-0 bg-gradient-to-br from-destructive/20 via-destructive/10 to-transparent z-10 pointer-events-none flex items-center justify-center"
      >
        <div className="bg-destructive text-destructive-foreground rounded-full p-4 shadow-lg">
          <ThumbsDown className="w-12 h-12" strokeWidth={3} />
        </div>
      </motion.div>

      {/* Like Overlay - simplified, no scale animation */}
      <motion.div
        style={{ opacity: likeOpacity }}
        className="absolute inset-0 bg-gradient-to-bl from-primary/20 via-primary/10 to-transparent z-10 pointer-events-none flex items-center justify-center"
      >
        <div className="bg-primary text-primary-foreground rounded-full p-4 shadow-lg">
          <Heart className="w-12 h-12 fill-current" strokeWidth={3} />
        </div>
      </motion.div>

      {/* Newspaper Cutting Card */}
      <div 
        className="h-full overflow-hidden relative"
        style={{
          clipPath: tornEdgeClipPath,
          background: 'linear-gradient(145deg, #f8f5e9 0%, #f5f0e1 50%, #efe8d8 100%)',
        }}
      >
        {/* Subtle fold line - simplified */}
        <div 
          className="absolute left-1/2 top-0 bottom-0 w-px pointer-events-none z-10 opacity-10"
          style={{ background: 'linear-gradient(to bottom, transparent, #8b7765 50%, transparent)' }}
        />

        {/* Cover Image with sepia treatment - optimized */}
        {optimizedCoverUrl && (
          <div 
            className="relative w-full aspect-[4/3] overflow-hidden"
            style={{ 
              transform: 'translateZ(0)', 
              backfaceVisibility: 'hidden' 
            }}
          >
            <img
              src={optimizedCoverUrl}
              alt={story.title}
              className="w-full h-full object-cover sepia-card-image"
              loading="eager"
              draggable={false}
              decoding="async"
            />
          </div>
        )}

        {/* Content area */}
        <div className="p-4 space-y-3 relative z-20">
          {/* Newspaper dateline */}
          <div 
            className="text-xs tracking-wider uppercase"
            style={{ color: '#8b7765', fontFamily: 'Georgia, "Times New Roman", serif' }}
          >
            The Herald • {formattedDate}
          </div>

          {/* Headline - newspaper style */}
          <h2 
            className="text-xl font-bold leading-tight uppercase tracking-tight"
            style={{
              color: '#2c2416',
              fontFamily: 'Georgia, "Times New Roman", serif',
            }}
          >
            {headline}
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

export const PageTurnCard = memo(PageTurnCardComponent);
