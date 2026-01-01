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
        initial={{ opacity: 0, y: 20, scale: 0.9 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: -10, scale: 0.9 }}
        transition={{ duration: 0.3, ease: "easeOut" }}
        className="fixed bottom-24 left-1/2 -translate-x-1/2 z-50 pointer-events-none"
      >
        <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-card border shadow-lg">
          <Flame className="w-5 h-5 text-orange-500 fill-orange-500" />
          <span className="text-sm font-semibold">{streak} in a row!</span>
        </div>
      </motion.div>
    </AnimatePresence>
  );
};
