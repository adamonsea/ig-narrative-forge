import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Flame } from 'lucide-react';

interface StreakIndicatorProps {
  streak: number;
  previousStreak: number;
}

// Only show at meaningful milestones to avoid being annoying
const MILESTONE_THRESHOLDS = [5, 10, 20, 30, 50];

export const StreakIndicator = ({ streak, previousStreak }: StreakIndicatorProps) => {
  const [isVisible, setIsVisible] = useState(false);
  // Capture the milestone value so it doesn't change while animating out
  const displayedStreakRef = useRef<number>(0);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    // Clear any pending hide timer when streak changes
    if (hideTimerRef.current) {
      clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }

    // Check if we just crossed a milestone threshold (going UP, not down)
    const hitMilestone = MILESTONE_THRESHOLDS.some(
      threshold => streak >= threshold && previousStreak < threshold
    );

    if (hitMilestone && streak > 0) {
      // Capture the current streak value for display
      displayedStreakRef.current = streak;
      setIsVisible(true);
      
      // Auto-hide after 1.5 seconds (quick, delightful, not lingering)
      hideTimerRef.current = setTimeout(() => {
        setIsVisible(false);
      }, 1500);
    }

    return () => {
      if (hideTimerRef.current) {
        clearTimeout(hideTimerRef.current);
      }
    };
  }, [streak, previousStreak]);

  return (
    <AnimatePresence mode="wait">
      {isVisible && displayedStreakRef.current > 0 && (
        <motion.div
          key={`streak-${displayedStreakRef.current}`}
          initial={{ opacity: 0, y: 30, scale: 0.8 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -20, scale: 0.9 }}
          transition={{ 
            duration: 0.25, 
            ease: [0.34, 1.56, 0.64, 1] // Bouncy ease
          }}
          className="fixed bottom-28 left-1/2 -translate-x-1/2 z-50 pointer-events-none"
        >
          <div className="flex items-center gap-2 px-5 py-3 rounded-full bg-gradient-to-r from-orange-500 to-amber-500 shadow-lg shadow-orange-500/25">
            <Flame className="w-5 h-5 text-white fill-white" />
            <span className="text-sm font-bold text-white">
              {displayedStreakRef.current} in a row!
            </span>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
