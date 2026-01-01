import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Heart, X } from 'lucide-react';

const HINT_STORAGE_KEY = 'swipe-mode-hint-seen';

export const SwipeModeHint = () => {
  const [show, setShow] = useState(false);

  useEffect(() => {
    // Check if user has already seen the hint
    const hasSeenHint = localStorage.getItem(HINT_STORAGE_KEY);
    
    if (hasSeenHint) {
      return; // Don't show if already seen
    }

    // Show hint after a short delay
    const showTimer = setTimeout(() => setShow(true), 500);
    
    // Auto-dismiss after 3 seconds and mark as seen
    const hideTimer = setTimeout(() => {
      setShow(false);
      localStorage.setItem(HINT_STORAGE_KEY, 'true');
    }, 3500);

    return () => {
      clearTimeout(showTimer);
      clearTimeout(hideTimer);
    };
  }, []);

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ opacity: 0, y: 20, scale: 0.9 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -10, scale: 0.9 }}
          transition={{ duration: 0.3, ease: "easeOut" }}
          className="fixed bottom-24 left-1/2 -translate-x-1/2 z-50 pointer-events-none"
        >
          <div className="flex items-center gap-4 px-4 py-3 rounded-xl bg-card border shadow-lg">
            <div className="flex items-center gap-1.5 text-destructive">
              <X className="w-4 h-4" strokeWidth={2.5} />
              <span className="text-sm font-medium">Skip</span>
            </div>
            <div className="w-px h-4 bg-border" />
            <div className="flex items-center gap-1.5 text-green-600 dark:text-green-500">
              <Heart className="w-4 h-4 fill-current" strokeWidth={2.5} />
              <span className="text-sm font-medium">Like</span>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
