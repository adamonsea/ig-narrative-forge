import { motion, useMotionValue, useSpring } from 'framer-motion';
import { useState, useRef, useCallback, memo, useEffect } from 'react';
import { optimizeThumbnailUrl } from '@/lib/imageOptimization';
import { triggerHaptic, getDevicePerformanceTier } from '@/lib/deviceUtils';

interface Story {
  id: string;
  title: string;
  cover_illustration_url: string;
  created_at: string;
}

interface CardPosition {
  x: number;
  y: number;
  rotation: number;
  zIndex: number;
}

interface PhotoCardProps {
  story: Story;
  position: CardPosition;
  index: number;
  totalCards: number;
  isAnimating: boolean;
  isHolding?: boolean;
  onDragStart: () => void;
  onDragEnd: (x: number, y: number) => void;
  onLongPress: () => void;
  onDoubleTap: () => void;
  onFlick: (velocityX: number, velocityY: number) => void;
  onClick: () => void;
}

// Gesture thresholds
const LONG_PRESS_DURATION = 400;
const HOVER_PREVIEW_DELAY = 800;

// Track whether current interaction is touch-based (not device capability)
// This allows hybrid devices like Surface Pro to use both touch and mouse
const PhotoCardComponent = ({
  story,
  position,
  index,
  isAnimating,
  isHolding = false,
  onDragStart,
  onDragEnd,
  onLongPress,
  onClick
}: PhotoCardProps) => {
  const deviceTier = getDevicePerformanceTier();
  const isLegacy = deviceTier.includes('legacy') || deviceTier.includes('old');
  const isDesktop = deviceTier === 'desktop';
  
  const [isDragging, setIsDragging] = useState(false);
  const [thumbnailLoaded, setThumbnailLoaded] = useState(false);
  const [placeholderLoaded, setPlaceholderLoaded] = useState(false);
  const [localHolding, setLocalHolding] = useState(false);
  const [isHovering, setIsHovering] = useState(false);
  
  const pressTimer = useRef<NodeJS.Timeout | null>(null);
  const hoverTimer = useRef<NodeJS.Timeout | null>(null);
  const touchStartPos = useRef({ x: 0, y: 0 });
  const mouseDownTime = useRef<number>(0);
  const hasMoved = useRef(false);
  const isCurrentInteractionTouch = useRef(false);
  
  const x = useMotionValue(position.x);
  const y = useMotionValue(position.y);
  
  // Dynamic scale based on state - larger scale for holding/preview (desktop uses hover)
  const showPreview = isHolding || localHolding || (isDesktop && isHovering);
  const targetScale = showPreview ? 1.6 : isDragging ? 1.06 : 1;
  
  // Use spring for smooth scale animation on release
  const scale = useSpring(targetScale, {
    stiffness: 300,
    damping: 25
  });
  
  // Update scale when state changes
  useEffect(() => {
    scale.set(targetScale);
  }, [targetScale, scale]);
  
  // Dynamic rotation - reset when holding for clear preview
  const dynamicRotation = showPreview ? 0 : position.rotation;

  // Progressive image URLs - tiny blur placeholder, then thumbnail
  const placeholderUrl = optimizeThumbnailUrl(story.cover_illustration_url)?.replace('width=200', 'width=20')?.replace('height=150', 'height=15') || '';
  const thumbnailUrl = optimizeThumbnailUrl(story.cover_illustration_url);
  const entryDelay = isLegacy ? 0 : index * 0.015;

  const clearPressTimer = useCallback(() => {
    if (pressTimer.current) {
      clearTimeout(pressTimer.current);
      pressTimer.current = null;
    }
  }, []);

  const clearHoverTimer = useCallback(() => {
    if (hoverTimer.current) {
      clearTimeout(hoverTimer.current);
      hoverTimer.current = null;
    }
  }, []);

  // Cleanup timers on unmount
  useEffect(() => {
    return () => {
      clearPressTimer();
      clearHoverTimer();
    };
  }, [clearPressTimer, clearHoverTimer]);

  // Prevent browser context menu on long press
  const handleContextMenu = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    e.stopPropagation();
    return false;
  }, []);

  // Touch start - begin long press timer
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    isCurrentInteractionTouch.current = true;
    const touch = e.touches[0];
    touchStartPos.current = { x: touch.clientX, y: touch.clientY };
    hasMoved.current = false;
    
    pressTimer.current = setTimeout(() => {
      if (!hasMoved.current) {
        setLocalHolding(true);
        if (!isLegacy) triggerHaptic('medium');
        onLongPress();
      }
    }, LONG_PRESS_DURATION);
  }, [isLegacy, onLongPress]);

  // Touch move - cancel long press if moved
  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    const touch = e.touches[0];
    const dx = Math.abs(touch.clientX - touchStartPos.current.x);
    const dy = Math.abs(touch.clientY - touchStartPos.current.y);
    
    if (dx > 10 || dy > 10) {
      hasMoved.current = true;
      clearPressTimer();
      setLocalHolding(false);
    }
  }, [clearPressTimer]);

  // Touch end - detect tap or end long press
  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    clearPressTimer();
    
    const wasHolding = localHolding;
    setLocalHolding(false);
    
    // If was holding, just close preview
    if (wasHolding) {
      return;
    }
    
    // If didn't move, it's a tap - open story
    if (!hasMoved.current && !isDragging) {
      e.preventDefault();
      if (!isLegacy) triggerHaptic('light');
      onClick();
    }
    
    // Reset touch flag after a short delay to allow mouse events if needed
    setTimeout(() => {
      isCurrentInteractionTouch.current = false;
    }, 100);
  }, [clearPressTimer, localHolding, isDragging, isLegacy, onClick]);

  // Drag handlers for framer-motion
  const handleDragStart = useCallback(() => {
    setIsDragging(true);
    hasMoved.current = true;
    clearPressTimer();
    clearHoverTimer();
    setLocalHolding(false);
    setIsHovering(false);
    onDragStart();
  }, [onDragStart, clearPressTimer, clearHoverTimer]);

  const handleDragEnd = useCallback(() => {
    setIsDragging(false);
    onDragEnd(x.get(), y.get());
  }, [onDragEnd, x, y]);

  // Desktop mouse handlers - also work on hybrid devices like Surface Pro
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (isCurrentInteractionTouch.current) return;
    mouseDownTime.current = Date.now();
    hasMoved.current = false;
    touchStartPos.current = { x: e.clientX, y: e.clientY };
  }, []);

  const handleMouseUp = useCallback((e: React.MouseEvent) => {
    if (isCurrentInteractionTouch.current) return;
    const pressDuration = Date.now() - mouseDownTime.current;
    
    // Quick click without movement = open story
    if (!hasMoved.current && pressDuration < 200 && !isDragging) {
      e.preventDefault();
      onClick();
    }
  }, [isDragging, onClick]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (isCurrentInteractionTouch.current) return;
    const dx = Math.abs(e.clientX - touchStartPos.current.x);
    const dy = Math.abs(e.clientY - touchStartPos.current.y);
    
    if (dx > 5 || dy > 5) {
      hasMoved.current = true;
    }
  }, []);

  // Desktop hover preview - also works on hybrid devices with mouse
  const handleMouseEnter = useCallback(() => {
    if (isCurrentInteractionTouch.current || isDragging) return;
    
    hoverTimer.current = setTimeout(() => {
      setIsHovering(true);
    }, HOVER_PREVIEW_DELAY);
  }, [isDragging]);

  const handleMouseLeave = useCallback(() => {
    clearHoverTimer();
    setIsHovering(false);
  }, [clearHoverTimer]);

  // GPU-accelerated styles
  const gpuStyles = {
    willChange: 'transform' as const,
    transform: 'translate3d(0, 0, 0)',
    backfaceVisibility: 'hidden' as const,
  };

  // Simplified animations for legacy devices
  const entryAnimation = isLegacy ? false : isAnimating ? { 
    y: -200, 
    x: position.x + (Math.random() - 0.5) * 80,
    opacity: 0,
    rotate: position.rotation + (Math.random() - 0.5) * 25
  } : false;

  const springTransition = isLegacy ? {
    type: 'tween' as const,
    duration: 0.15,
    ease: 'easeOut' as const
  } : isAnimating ? {
    type: 'spring' as const,
    stiffness: 180,
    damping: 18,
    delay: entryDelay,
    mass: 0.6
  } : {
    type: 'spring' as const,
    stiffness: 350,
    damping: 28
  };

  return (
    <motion.div
      className="absolute cursor-grab active:cursor-grabbing select-none"
      style={{
        x,
        y,
        rotate: dynamicRotation,
        zIndex: showPreview ? 9999 : position.zIndex,
        scale,
        touchAction: 'none',
        ...gpuStyles,
      }}
      initial={entryAnimation}
      animate={{ 
        y: position.y, 
        x: position.x,
        opacity: 1,
        rotate: dynamicRotation
      }}
      transition={springTransition}
      drag
      dragMomentum={!isLegacy}
      dragElastic={isLegacy ? 0.05 : 0.12}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onMouseDown={handleMouseDown}
      onMouseUp={handleMouseUp}
      onMouseMove={handleMouseMove}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onContextMenu={handleContextMenu}
      whileDrag={{ 
        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.35)',
        zIndex: 9999
      }}
    >
      {/* Preview hint when holding/hovering */}
      {showPreview && (
        <div className="absolute -bottom-10 left-1/2 -translate-x-1/2 bg-black/80 text-white text-[10px] px-2 py-1 rounded-full whitespace-nowrap z-10">
          {isDesktop ? 'Click to open' : 'Release to close preview'}
        </div>
      )}
      
      {/* Newspaper cutting card */}
      <div 
        className="relative overflow-visible transition-all duration-200"
        style={{
          width: 170,
          ...gpuStyles,
        }}
        onContextMenu={handleContextMenu}
      >
        {/* Torn edge SVG mask applied to the main card */}
        <div 
          className="relative overflow-hidden"
          style={{
            background: '#f5f0e1',
            clipPath: `polygon(
              0% 2%, 3% 0%, 8% 3%, 15% 1%, 22% 4%, 30% 0%, 38% 2%, 45% 1%, 52% 3%, 60% 0%, 68% 2%, 75% 1%, 82% 3%, 90% 0%, 95% 2%, 100% 1%,
              100% 98%, 97% 100%, 92% 97%, 85% 100%, 78% 98%, 70% 100%, 62% 97%, 55% 100%, 48% 98%, 40% 100%, 32% 97%, 25% 100%, 18% 98%, 10% 100%, 5% 97%, 0% 100%
            )`,
            boxShadow: showPreview
              ? '0 30px 50px -15px rgba(0, 0, 0, 0.4)'
              : isDragging 
                ? '0 20px 40px -10px rgba(0, 0, 0, 0.3)' 
                : '0 8px 20px -5px rgba(0, 0, 0, 0.15), 0 3px 8px -4px rgba(0, 0, 0, 0.1)',
          }}
        >
          {/* Paper texture overlay */}
          <div 
            className="absolute inset-0 pointer-events-none z-10 opacity-30"
            style={{
              backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E")`,
              mixBlendMode: 'multiply',
            }}
          />
          
          {/* Subtle fold line */}
          <div 
            className="absolute top-1/3 left-0 right-0 h-px pointer-events-none z-10 opacity-20"
            style={{
              background: 'linear-gradient(90deg, transparent 0%, rgba(139, 119, 101, 0.5) 20%, rgba(139, 119, 101, 0.5) 80%, transparent 100%)',
            }}
          />
          
          {/* Image container with sepia tint */}
          <div className="relative w-full aspect-[4/3] overflow-hidden">
            {/* Tiny blurred placeholder - loads first */}
            {placeholderUrl && !thumbnailLoaded && (
              <img
                src={placeholderUrl}
                alt=""
                className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-300 pointer-events-none ${
                  placeholderLoaded ? 'opacity-100' : 'opacity-0'
                }`}
                style={{ 
                  filter: 'blur(8px) sepia(15%) contrast(1.05)', 
                  transform: 'scale(1.1)' 
                }}
                draggable={false}
                onLoad={() => setPlaceholderLoaded(true)}
              />
            )}
            
            {/* Full thumbnail - swaps in when loaded */}
            <img
              src={thumbnailUrl || story.cover_illustration_url}
              alt=""
              className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-300 pointer-events-none ${
                thumbnailLoaded ? 'opacity-100' : 'opacity-0'
              }`}
              style={{ 
                filter: 'sepia(12%) contrast(1.02) brightness(0.98)' 
              }}
              loading="lazy"
              draggable={false}
              onLoad={() => setThumbnailLoaded(true)}
              onContextMenu={handleContextMenu}
            />
            
            {/* Loading shimmer when nothing loaded yet */}
            {!placeholderLoaded && !thumbnailLoaded && (
              <div className="absolute inset-0 bg-muted animate-pulse" />
            )}
          </div>
          
          {/* Newspaper-style headline and dateline */}
          <div className="px-2 py-2 pointer-events-none" style={{ background: '#f5f0e1' }}>
            {/* Dateline - newspaper style */}
            <div className="flex items-center gap-1 mb-1">
              <span 
                className="text-[8px] uppercase tracking-wider"
                style={{ 
                  color: '#8b7765',
                  fontFamily: 'Georgia, "Times New Roman", serif',
                }}
              >
                {new Date(story.created_at).toLocaleDateString('en-GB', { 
                  day: 'numeric', 
                  month: 'short',
                  year: 'numeric'
                })}
              </span>
            </div>
            
            {/* Headline - condensed newspaper style */}
            <h3 
              className="line-clamp-2 leading-tight"
              style={{
                fontFamily: 'Georgia, "Times New Roman", serif',
                fontSize: '11px',
                fontWeight: 700,
                letterSpacing: '-0.02em',
                color: '#1a1a1a',
                textTransform: 'uppercase',
              }}
            >
              {story.title}
            </h3>
          </div>
        </div>
        
        {/* Highlight ring for preview state */}
        {showPreview && (
          <div 
            className="absolute inset-0 rounded-sm pointer-events-none"
            style={{
              boxShadow: '0 0 0 2px rgba(99, 102, 241, 0.4)',
            }}
          />
        )}
      </div>
    </motion.div>
  );
};

// Memoize to prevent unnecessary re-renders
export const PhotoCard = memo(PhotoCardComponent);
