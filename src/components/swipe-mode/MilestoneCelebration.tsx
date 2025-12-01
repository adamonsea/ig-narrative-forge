import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface MilestoneCelebrationProps {
  swipeCount: number;
}

const MILESTONES = [10, 25, 50];

export const MilestoneCelebration = ({ swipeCount }: MilestoneCelebrationProps) => {
  const [showCelebration, setShowCelebration] = useState(false);
  const [lastMilestone, setLastMilestone] = useState<number | null>(null);

  useEffect(() => {
    // Check if we just hit a milestone
    const hitMilestone = MILESTONES.find(m => m === swipeCount);
    
    if (hitMilestone && hitMilestone !== lastMilestone) {
      setShowCelebration(true);
      setLastMilestone(hitMilestone);
      
      // Auto-dismiss after 2 seconds
      const timer = setTimeout(() => setShowCelebration(false), 2000);
      return () => clearTimeout(timer);
    }
  }, [swipeCount, lastMilestone]);

  return (
    <AnimatePresence>
      {showCelebration && (
        <motion.div
          initial={{ opacity: 0, scale: 0.8, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.8, y: -20 }}
          transition={{ duration: 0.3, ease: "easeOut" }}
          className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 pointer-events-none"
        >
          <div className="bg-primary text-primary-foreground px-6 py-4 rounded-xl shadow-xl flex items-center gap-3">
            <span className="text-3xl">🎉</span>
            <div>
              <p className="text-sm font-semibold">{swipeCount} stories!</p>
              <p className="text-xs opacity-90">Keep going!</p>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
