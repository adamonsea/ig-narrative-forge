import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowRight } from 'lucide-react';

interface HandSwipeHintProps {
  topicSlug: string;
}

export const HandSwipeHint = ({ topicSlug }: HandSwipeHintProps) => {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    // Track visit count for this topic
    const storageKey = `feed_swipe_hint_count_${topicSlug}`;
    const visitCount = parseInt(localStorage.getItem(storageKey) || '0', 10);

    if (visitCount < 3) {
      // Show hint after a brief delay
      const showTimer = setTimeout(() => {
        setIsVisible(true);
      }, 500);

      // Auto-dismiss after 3.5 seconds and increment counter
      const hideTimer = setTimeout(() => {
        setIsVisible(false);
        localStorage.setItem(storageKey, String(visitCount + 1));
      }, 4000);

      return () => {
        clearTimeout(showTimer);
        clearTimeout(hideTimer);
      };
    }
  }, [topicSlug]);

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.9 }}
          transition={{ duration: 0.3 }}
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 pointer-events-none"
        >
          <div className="flex flex-col items-center gap-4">
            {/* Animated Card Mock */}
            <div className="relative">
              {/* Back card - moves less */}
              <motion.div
                animate={{ 
                  x: [0, -30, 0]
                }}
                transition={{ 
                  duration: 1.5, 
                  repeat: Infinity, 
                  ease: "easeInOut" 
                }}
                className="absolute top-2 left-2 w-32 h-40 bg-muted rounded-xl shadow-lg border-2 border-border opacity-60"
              />
              
              {/* Front card - moves more */}
              <motion.div
                animate={{ 
                  x: [0, -50, 0]
                }}
                transition={{ 
                  duration: 1.5, 
                  repeat: Infinity, 
                  ease: "easeInOut" 
                }}
                className="relative w-32 h-40 bg-card rounded-xl shadow-2xl border-2 border-primary/50"
              >
                <div className="p-3 space-y-2">
                  <div className="h-2 w-3/4 bg-foreground/20 rounded" />
                  <div className="h-2 w-full bg-foreground/20 rounded" />
                  <div className="h-2 w-2/3 bg-foreground/20 rounded" />
                </div>
              </motion.div>
            </div>

            {/* Instruction Text */}
            <div className="flex items-center gap-2 bg-primary/95 backdrop-blur-sm px-4 py-2 rounded-full shadow-lg">
              <span className="text-primary-foreground font-semibold text-sm">
                Swipe for more
              </span>
              <ArrowRight className="w-4 h-4 text-primary-foreground" />
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
