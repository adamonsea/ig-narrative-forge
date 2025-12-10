import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { PhotoCard } from './PhotoCard';
import { WeekStackSwitcher, groupStoriesByWeek } from './WeekStackSwitcher';
import { DismissedPile } from './DismissedPile';
import { triggerHaptic, getDevicePerformanceTier } from '@/lib/deviceUtils';

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
  const [highestZ, setHighestZ] = useState(0);
  const [selectedWeekIndex, setSelectedWeekIndex] = useState(0);
  const [dismissedStories, setDismissedStories] = useState<Story[]>([]);
  const [holdingCardId, setHoldingCardId] = useState<string | null>(null);
  
  const deviceTier = getDevicePerformanceTier();
  const isLegacy = deviceTier.includes('legacy') || deviceTier.includes('old');

  // Card dimensions
  const CARD_WIDTH = 160;
  const CARD_HEIGHT = 145;
  const PADDING = 20;

  // Group stories by week
  const weekGroups = useMemo(() => groupStoriesByWeek(stories), [stories]);
  
  // Current week's stories (excluding dismissed)
  const currentWeekStories = useMemo(() => {
    const weekData = weekGroups[selectedWeekIndex];
    if (!weekData) return [];
    return weekData.stories.filter(s => !dismissedStories.find(d => d.id === s.id));
  }, [weekGroups, selectedWeekIndex, dismissedStories]);

  // Week info for switcher
  const weeks = useMemo(() => weekGroups.map(g => g.week), [weekGroups]);

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

  // Generate positions when week changes or dimensions ready
  useEffect(() => {
    if (dimensions.width === 0 || dimensions.height === 0 || currentWeekStories.length === 0) return;

    const newPositions = new Map<string, CardPosition>();
    const centerX = dimensions.width / 2;
    const centerY = dimensions.height / 2;
    
    const safeWidth = dimensions.width - CARD_WIDTH - PADDING * 2;
    const safeHeight = dimensions.height - CARD_HEIGHT - PADDING * 2;

    currentWeekStories.forEach((story, index) => {
      // More recent stories closer to center
      const centerBias = Math.max(0, 1 - (index / currentWeekStories.length));
      const spread = 0.25 + (1 - centerBias) * 0.75;

      const angle = Math.random() * Math.PI * 2;
      const distance = spread * Math.min(safeWidth, safeHeight) / 2;
      
      const x = centerX - CARD_WIDTH / 2 + Math.cos(angle) * distance * (0.4 + Math.random() * 0.6);
      const y = centerY - CARD_HEIGHT / 2 + Math.sin(angle) * distance * (0.4 + Math.random() * 0.6);
      
      const clampedX = Math.max(PADDING, Math.min(x, safeWidth + PADDING));
      const clampedY = Math.max(PADDING, Math.min(y, safeHeight + PADDING));
      const rotation = (Math.random() - 0.5) * 35;

      newPositions.set(story.id, {
        x: clampedX,
        y: clampedY,
        rotation,
        zIndex: currentWeekStories.length - index
      });
    });

    setPositions(newPositions);
    setHighestZ(currentWeekStories.length);
    setIsAnimating(true);

    const timer = setTimeout(() => setIsAnimating(false), currentWeekStories.length * 15 + 400);
    return () => clearTimeout(timer);
  }, [dimensions, currentWeekStories, selectedWeekIndex]);

  const handleDragStart = useCallback((storyId: string) => {
    setHighestZ(prev => {
      const newZ = prev + 1;
      setPositions(prevPositions => {
        const newMap = new Map(prevPositions);
        const current = newMap.get(storyId);
        if (current) {
          newMap.set(storyId, { ...current, zIndex: newZ });
        }
        return newMap;
      });
      return newZ;
    });
  }, []);

  const handleDragEnd = useCallback((storyId: string, x: number, y: number) => {
    setPositions(prev => {
      const newMap = new Map(prev);
      const current = newMap.get(storyId);
      if (current) {
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
  }, [dimensions]);

  const handleLongPress = useCallback((storyId: string) => {
    setHoldingCardId(storyId);
    // Bring to absolute top
    setHighestZ(prev => {
      const newZ = prev + 10;
      setPositions(prevPositions => {
        const newMap = new Map(prevPositions);
        const current = newMap.get(storyId);
        if (current) {
          newMap.set(storyId, { ...current, zIndex: newZ, rotation: 0 });
        }
        return newMap;
      });
      return newZ;
    });
  }, []);

  const handleDoubleTap = useCallback((story: Story) => {
    // Dismiss to pile
    if (!isLegacy) triggerHaptic('light');
    setDismissedStories(prev => [...prev, story]);
  }, [isLegacy]);

  const handleFlick = useCallback((story: Story, velocityX: number, velocityY: number) => {
    // Animate off-screen then dismiss
    const position = positions.get(story.id);
    if (position) {
      setPositions(prev => {
        const newMap = new Map(prev);
        newMap.set(story.id, {
          ...position,
          x: position.x + velocityX * 0.5,
          y: position.y + velocityY * 0.5
        });
        return newMap;
      });
    }
    
    setTimeout(() => {
      setDismissedStories(prev => [...prev, story]);
    }, 150);
  }, [positions]);

  const handleRestore = useCallback((storyId: string) => {
    setDismissedStories(prev => prev.filter(s => s.id !== storyId));
  }, []);

  const handleRestoreAll = useCallback(() => {
    setDismissedStories([]);
  }, []);

  const handleWeekChange = useCallback((index: number) => {
    setSelectedWeekIndex(index);
    setIsAnimating(true);
  }, []);

  return (
    <div 
      ref={containerRef}
      className="absolute inset-0 overflow-hidden bg-gradient-to-br from-muted/30 to-background"
      style={{ 
        touchAction: 'none',
        willChange: 'transform',
      }}
    >
      {/* Subtle table texture */}
      <div className="absolute inset-0 opacity-[0.03] pointer-events-none" 
        style={{ 
          backgroundImage: 'url("data:image/svg+xml,%3Csvg width="60" height="60" viewBox="0 0 60 60" xmlns="http://www.w3.org/2000/svg"%3E%3Cg fill="none" fill-rule="evenodd"%3E%3Cg fill="%239C92AC" fill-opacity="0.4"%3E%3Cpath d="M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z"/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")'
        }} 
      />

      {/* Week stack switcher */}
      <WeekStackSwitcher
        weeks={weeks}
        selectedIndex={selectedWeekIndex}
        onSelectWeek={handleWeekChange}
      />
      
      <AnimatePresence mode="popLayout">
        {currentWeekStories.map((story, index) => {
          const position = positions.get(story.id);
          if (!position) return null;

          return (
            <PhotoCard
              key={story.id}
              story={story}
              position={position}
              index={index}
              totalCards={currentWeekStories.length}
              isAnimating={isAnimating}
              isHolding={holdingCardId === story.id}
              onDragStart={() => handleDragStart(story.id)}
              onDragEnd={(x, y) => handleDragEnd(story.id, x, y)}
              onLongPress={() => handleLongPress(story.id)}
              onDoubleTap={() => handleDoubleTap(story)}
              onFlick={(vx, vy) => handleFlick(story, vx, vy)}
              onClick={() => {
                setHoldingCardId(null);
                onCardClick(story);
              }}
            />
          );
        })}
      </AnimatePresence>

      {/* Dismissed pile */}
      <DismissedPile
        stories={dismissedStories}
        onRestore={handleRestore}
        onRestoreAll={handleRestoreAll}
      />
    </div>
  );
}
