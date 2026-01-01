import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Trophy } from 'lucide-react';

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
          initial={{ opacity: 0, y: 20, scale: 0.9 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -10, scale: 0.9 }}
          transition={{ duration: 0.3, ease: "easeOut" }}
          className="fixed bottom-24 left-1/2 -translate-x-1/2 z-50 pointer-events-none"
        >
          <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-card border shadow-lg">
            <Trophy className="w-5 h-5 text-primary" />
            <span className="text-sm font-semibold">{swipeCount} stories!</span>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
