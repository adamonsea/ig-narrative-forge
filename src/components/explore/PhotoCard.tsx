import { motion, useMotionValue, useTransform } from 'framer-motion';
import { useState, useRef, useCallback, memo } from 'react';
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
  
  const [isDragging, setIsDragging] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);
  const [localHolding, setLocalHolding] = useState(false);
  
  const pressTimer = useRef<NodeJS.Timeout | null>(null);
  const touchStartPos = useRef({ x: 0, y: 0 });
  const hasMoved = useRef(false);
  
  const x = useMotionValue(position.x);
  const y = useMotionValue(position.y);
  
  // Dynamic scale based on state - larger scale for holding/preview
  const baseScale = isHolding || localHolding ? 1.35 : isDragging ? 1.06 : 1;
  const scale = useTransform([x, y], () => baseScale);
  
  // Dynamic rotation - reset when holding for clear preview
  const dynamicRotation = isHolding || localHolding ? 0 : position.rotation;

  const thumbnailUrl = optimizeThumbnailUrl(story.cover_illustration_url);
  const entryDelay = index * 0.015;

  const clearPressTimer = useCallback(() => {
    if (pressTimer.current) {
      clearTimeout(pressTimer.current);
      pressTimer.current = null;
    }
  }, []);

  // Prevent browser context menu on long press
  const handleContextMenu = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    e.stopPropagation();
    return false;
  }, []);

  // Touch start - begin long press timer
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
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
  }, [clearPressTimer, localHolding, isDragging, isLegacy, onClick]);

  // Drag handlers for framer-motion
  const handleDragStart = useCallback(() => {
    setIsDragging(true);
    hasMoved.current = true;
    clearPressTimer();
    setLocalHolding(false);
    onDragStart();
  }, [onDragStart, clearPressTimer]);

  const handleDragEnd = useCallback(() => {
    setIsDragging(false);
    onDragEnd(x.get(), y.get());
  }, [onDragEnd, x, y]);

  // GPU-accelerated styles
  const gpuStyles = {
    willChange: 'transform' as const,
    transform: 'translate3d(0, 0, 0)',
    backfaceVisibility: 'hidden' as const,
  };

  return (
    <motion.div
      className="absolute cursor-grab active:cursor-grabbing select-none"
      style={{
        x,
        y,
        rotate: dynamicRotation,
        zIndex: localHolding ? 9999 : position.zIndex,
        scale,
        touchAction: 'none',
        ...gpuStyles,
      }}
      initial={isAnimating ? { 
        y: -200, 
        x: position.x + (Math.random() - 0.5) * 80,
        opacity: 0,
        rotate: position.rotation + (Math.random() - 0.5) * 25
      } : false}
      animate={{ 
        y: position.y, 
        x: position.x,
        opacity: 1,
        rotate: dynamicRotation
      }}
      transition={isAnimating ? {
        type: 'spring',
        stiffness: 180,
        damping: 18,
        delay: entryDelay,
        mass: 0.6
      } : {
        type: 'spring',
        stiffness: 350,
        damping: 28
      }}
      drag
      dragMomentum={!isLegacy}
      dragElastic={isLegacy ? 0.05 : 0.12}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onContextMenu={handleContextMenu}
      whileDrag={{ 
        scale: 1.08,
        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.35)',
        zIndex: 9999
      }}
      whileHover={!isLegacy ? { 
        scale: 1.02,
        transition: { duration: 0.15 }
      } : undefined}
    >
      {/* Preview hint when holding */}
      {localHolding && (
        <div className="absolute -bottom-10 left-1/2 -translate-x-1/2 bg-black/80 text-white text-[10px] px-2 py-1 rounded-full whitespace-nowrap z-10">
          Release to close preview
        </div>
      )}
      
      {/* Polaroid-style card */}
      <div 
        className={`bg-white rounded-sm overflow-hidden transition-all duration-200 ${
          localHolding ? 'ring-2 ring-primary/40' : ''
        }`}
        style={{
          width: 160,
          padding: '6px 6px 24px 6px',
          boxShadow: localHolding
            ? '0 45px 70px -15px rgba(0, 0, 0, 0.55), 0 0 40px rgba(99, 102, 241, 0.2)'
            : isDragging 
              ? '0 25px 50px -12px rgba(0, 0, 0, 0.4)' 
              : '0 10px 25px -5px rgba(0, 0, 0, 0.2), 0 4px 10px -5px rgba(0, 0, 0, 0.1)',
          ...gpuStyles,
        }}
        onContextMenu={handleContextMenu}
      >
        {/* Image container */}
        <div className="relative w-full aspect-[4/3] bg-muted overflow-hidden">
          {!isLoaded && (
            <div className="absolute inset-0 bg-muted animate-pulse" />
          )}
          <img
            src={thumbnailUrl || story.cover_illustration_url}
            alt=""
            className={`w-full h-full object-cover transition-opacity duration-200 pointer-events-none ${
              isLoaded ? 'opacity-100' : 'opacity-0'
            }`}
            loading="lazy"
            draggable={false}
            onLoad={() => setIsLoaded(true)}
            onContextMenu={handleContextMenu}
          />
        </div>
        
        {/* Date hint */}
        <div className="mt-1 text-center pointer-events-none">
          <span className="text-[9px] text-neutral-400 font-mono">
            {new Date(story.created_at).toLocaleDateString('en-GB', { 
              day: 'numeric', 
              month: 'short' 
            })}
          </span>
        </div>
      </div>
    </motion.div>
  );
};

// Memoize to prevent unnecessary re-renders
export const PhotoCard = memo(PhotoCardComponent);
