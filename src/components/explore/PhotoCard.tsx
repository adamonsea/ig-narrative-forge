import { motion, useMotionValue, useTransform, PanInfo } from 'framer-motion';
import { useState, useRef } from 'react';
import { optimizeThumbnailUrl } from '@/lib/imageOptimization';

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
  onDragStart: () => void;
  onDragEnd: (x: number, y: number) => void;
  onClick: () => void;
}

export function PhotoCard({
  story,
  position,
  index,
  totalCards,
  isAnimating,
  onDragStart,
  onDragEnd,
  onClick
}: PhotoCardProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);
  const dragStartPos = useRef({ x: 0, y: 0 });
  
  const x = useMotionValue(position.x);
  const y = useMotionValue(position.y);
  
  // Subtle lift effect when dragging
  const scale = useTransform(
    [x, y],
    () => isDragging ? 1.05 : 1
  );

  const thumbnailUrl = optimizeThumbnailUrl(story.cover_illustration_url);

  // Entry animation - staggered drop like cards falling
  const entryDelay = index * 0.02; // 20ms stagger
  
  const handleDragStart = (event: any, info: PanInfo) => {
    setIsDragging(true);
    dragStartPos.current = { x: info.point.x, y: info.point.y };
    onDragStart();
  };

  const handleDragEnd = (event: any, info: PanInfo) => {
    setIsDragging(false);
    
    // Calculate movement distance
    const dx = Math.abs(info.point.x - dragStartPos.current.x);
    const dy = Math.abs(info.point.y - dragStartPos.current.y);
    const movedDistance = Math.sqrt(dx * dx + dy * dy);
    
    // If barely moved (< 10px), treat as click
    if (movedDistance < 10) {
      onClick();
    } else {
      onDragEnd(x.get(), y.get());
    }
  };

  return (
    <motion.div
      className="absolute cursor-grab active:cursor-grabbing touch-none select-none"
      style={{
        x,
        y,
        rotate: position.rotation,
        zIndex: position.zIndex,
        scale,
      }}
      initial={isAnimating ? { 
        y: -200, 
        x: position.x + (Math.random() - 0.5) * 100,
        opacity: 0,
        rotate: position.rotation + (Math.random() - 0.5) * 30
      } : false}
      animate={{ 
        y: position.y, 
        x: position.x,
        opacity: 1,
        rotate: position.rotation
      }}
      transition={isAnimating ? {
        type: 'spring',
        stiffness: 200,
        damping: 20,
        delay: entryDelay,
        mass: 0.8
      } : {
        type: 'spring',
        stiffness: 300,
        damping: 25
      }}
      drag
      dragMomentum={true}
      dragElastic={0.1}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      whileDrag={{ 
        scale: 1.08,
        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.35)',
        zIndex: 9999
      }}
      whileHover={{ 
        scale: 1.02,
        transition: { duration: 0.2 }
      }}
    >
      {/* Polaroid-style card */}
      <div 
        className="bg-white rounded-sm shadow-lg overflow-hidden"
        style={{
          width: 160,
          padding: '6px 6px 24px 6px',
          boxShadow: isDragging 
            ? '0 25px 50px -12px rgba(0, 0, 0, 0.4)' 
            : '0 10px 25px -5px rgba(0, 0, 0, 0.2), 0 4px 10px -5px rgba(0, 0, 0, 0.1)'
        }}
      >
        {/* Image container */}
        <div className="relative w-full aspect-[4/3] bg-muted overflow-hidden">
          {!isLoaded && (
            <div className="absolute inset-0 bg-muted animate-pulse" />
          )}
          <img
            src={thumbnailUrl || story.cover_illustration_url}
            alt=""
            className={`w-full h-full object-cover transition-opacity duration-300 ${
              isLoaded ? 'opacity-100' : 'opacity-0'
            }`}
            loading="lazy"
            draggable={false}
            onLoad={() => setIsLoaded(true)}
          />
        </div>
        
        {/* Subtle date hint */}
        <div className="mt-1 text-center">
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
}
