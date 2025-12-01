import { motion, AnimatePresence } from 'framer-motion';
import { Flame } from 'lucide-react';

interface StreakIndicatorProps {
  streak: number;
}

export const StreakIndicator = ({ streak }: StreakIndicatorProps) => {
  if (streak < 3) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ scale: 0, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0, opacity: 0 }}
        transition={{ type: "spring", stiffness: 500, damping: 25 }}
        className="flex items-center gap-1 px-2 py-1 rounded-full bg-orange-500/10 border border-orange-500/20"
      >
        <Flame className="w-3 h-3 text-orange-500 fill-orange-500" />
        <span className="text-xs font-semibold text-orange-500">{streak}</span>
      </motion.div>
    </AnimatePresence>
  );
};
