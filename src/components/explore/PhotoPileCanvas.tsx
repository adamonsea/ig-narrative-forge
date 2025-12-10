import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { PhotoCard } from './PhotoCard';

interface Story {
  id: string;
  title: string;
  cover_illustration_url: string;
  created_at: string;
}

interface PhotoPileCanvasProps {
  stories: Story[];
  onCardClick: (story: Story) => void;
}

interface CardPosition {
  x: number;
  y: number;
  rotation: number;
  zIndex: number;
}

export function PhotoPileCanvas({ stories, onCardClick }: PhotoPileCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [positions, setPositions] = useState<Map<string, CardPosition>>(new Map());
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
  const [isAnimating, setIsAnimating] = useState(true);
  const [highestZ, setHighestZ] = useState(stories.length);

  // Card dimensions
  const CARD_WIDTH = 160;
  const CARD_HEIGHT = 120;
  const PADDING = 20;

  // Calculate container dimensions
  useEffect(() => {
    const updateDimensions = () => {
      if (containerRef.current) {
        setDimensions({
          width: containerRef.current.offsetWidth,
          height: containerRef.current.offsetHeight
        });
      }
    };

    updateDimensions();
    window.addEventListener('resize', updateDimensions);
    return () => window.removeEventListener('resize', updateDimensions);
  }, []);

  // Generate initial scattered positions when dimensions are ready
  useEffect(() => {
    if (dimensions.width === 0 || dimensions.height === 0 || stories.length === 0) return;

    const newPositions = new Map<string, CardPosition>();
    const centerX = dimensions.width / 2;
    const centerY = dimensions.height / 2;
    
    // Calculate safe area for card placement
    const safeWidth = dimensions.width - CARD_WIDTH - PADDING * 2;
    const safeHeight = dimensions.height - CARD_HEIGHT - PADDING * 2;

    stories.forEach((story, index) => {
      // More recent stories closer to center (they're already sorted desc by created_at)
      const centerBias = Math.max(0, 1 - (index / stories.length));
      const spread = 0.3 + (1 - centerBias) * 0.7; // 30% to 100% spread

      // Random position with center bias for recent stories
      const angle = Math.random() * Math.PI * 2;
      const distance = spread * Math.min(safeWidth, safeHeight) / 2;
      
      const x = centerX - CARD_WIDTH / 2 + Math.cos(angle) * distance * (0.5 + Math.random() * 0.5);
      const y = centerY - CARD_HEIGHT / 2 + Math.sin(angle) * distance * (0.5 + Math.random() * 0.5);
      
      // Clamp to safe bounds
      const clampedX = Math.max(PADDING, Math.min(x, safeWidth + PADDING));
      const clampedY = Math.max(PADDING, Math.min(y, safeHeight + PADDING));

      // Random rotation (-20 to 20 degrees)
      const rotation = (Math.random() - 0.5) * 40;

      newPositions.set(story.id, {
        x: clampedX,
        y: clampedY,
        rotation,
        zIndex: stories.length - index // Most recent on top
      });
    });

    setPositions(newPositions);
    setIsAnimating(true);

    // Allow animations to complete
    const timer = setTimeout(() => setIsAnimating(false), stories.length * 20 + 500);
    return () => clearTimeout(timer);
  }, [dimensions, stories]);

  const handleDragStart = (storyId: string) => {
    // Bring dragged card to front
    const newZ = highestZ + 1;
    setHighestZ(newZ);
    
    setPositions(prev => {
      const newMap = new Map(prev);
      const current = newMap.get(storyId);
      if (current) {
        newMap.set(storyId, { ...current, zIndex: newZ });
      }
      return newMap;
    });
  };

  const handleDragEnd = (storyId: string, x: number, y: number) => {
    setPositions(prev => {
      const newMap = new Map(prev);
      const current = newMap.get(storyId);
      if (current) {
        // Clamp to bounds
        const safeWidth = dimensions.width - CARD_WIDTH - PADDING * 2;
        const safeHeight = dimensions.height - CARD_HEIGHT - PADDING * 2;
        
        newMap.set(storyId, {
          ...current,
          x: Math.max(PADDING, Math.min(x, safeWidth + PADDING)),
          y: Math.max(PADDING, Math.min(y, safeHeight + PADDING))
        });
      }
      return newMap;
    });
  };

  return (
    <div 
      ref={containerRef}
      className="absolute inset-0 overflow-hidden bg-gradient-to-br from-muted/30 to-background"
      style={{ touchAction: 'none' }}
    >
      {/* Subtle table texture */}
      <div className="absolute inset-0 opacity-[0.03]" 
        style={{ 
          backgroundImage: 'url("data:image/svg+xml,%3Csvg width="60" height="60" viewBox="0 0 60 60" xmlns="http://www.w3.org/2000/svg"%3E%3Cg fill="none" fill-rule="evenodd"%3E%3Cg fill="%239C92AC" fill-opacity="0.4"%3E%3Cpath d="M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z"/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")'
        }} 
      />
      
      <AnimatePresence>
        {stories.map((story, index) => {
          const position = positions.get(story.id);
          if (!position) return null;

          return (
            <PhotoCard
              key={story.id}
              story={story}
              position={position}
              index={index}
              totalCards={stories.length}
              isAnimating={isAnimating}
              onDragStart={() => handleDragStart(story.id)}
              onDragEnd={(x, y) => handleDragEnd(story.id, x, y)}
              onClick={() => onCardClick(story)}
            />
          );
        })}
      </AnimatePresence>
    </div>
  );
}
