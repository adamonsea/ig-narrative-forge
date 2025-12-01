import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Flame } from 'lucide-react';

interface StreakIndicatorProps {
  streak: number;
  previousStreak: number;
}

const MILESTONE_THRESHOLDS = [3, 5, 10, 15, 20, 25, 30, 40, 50];

export const StreakIndicator = ({ streak, previousStreak }: StreakIndicatorProps) => {
  const [showStreak, setShowStreak] = useState(false);

  useEffect(() => {
    // Check if we just hit a milestone
    const hitMilestone = MILESTONE_THRESHOLDS.some(
      threshold => streak === threshold && previousStreak < threshold
    );

    if (hitMilestone) {
      setShowStreak(true);
      const timer = setTimeout(() => setShowStreak(false), 2000);
      return () => clearTimeout(timer);
    }
  }, [streak, previousStreak]);

  if (!showStreak) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ scale: 0, y: -20, opacity: 0 }}
        animate={{ scale: 1, y: 0, opacity: 1 }}
        exit={{ scale: 0.8, opacity: 0 }}
        transition={{ type: "spring", stiffness: 400, damping: 20 }}
        className="fixed top-24 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 px-4 py-2 rounded-full bg-orange-500/10 border-2 border-orange-500/30 shadow-lg backdrop-blur-sm"
      >
        <Flame className="w-5 h-5 text-orange-500 fill-orange-500 animate-pulse" />
        <span className="text-base font-bold text-orange-500">{streak} in a row!</span>
      </motion.div>
    </AnimatePresence>
  );
};
