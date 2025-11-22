import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { MoveRight } from 'lucide-react';

interface HandSwipeHintProps {
  topicSlug: string;
}

export const HandSwipeHint = ({ topicSlug }: HandSwipeHintProps) => {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    // Check if hint has been shown before for this topic
    const storageKey = `feed_swipe_hint_shown_${topicSlug}`;
    const hasBeenShown = localStorage.getItem(storageKey);

    if (!hasBeenShown) {
      // Show hint after a brief delay
      const showTimer = setTimeout(() => {
        setIsVisible(true);
      }, 500);

      // Auto-dismiss after 3 seconds
      const hideTimer = setTimeout(() => {
        setIsVisible(false);
        localStorage.setItem(storageKey, 'true');
      }, 3500);

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
          <div className="flex flex-col items-center gap-2 px-6 py-4 rounded-2xl bg-gradient-to-br from-purple-dark/90 to-purple-bright/90 backdrop-blur-sm shadow-lg border border-white/20">
            <motion.div
              animate={{ x: [0, 20, 0] }}
              transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
              className="flex items-center gap-2 text-white"
            >
              <span className="text-2xl">👆</span>
              <MoveRight className="w-6 h-6" />
            </motion.div>
            <p className="text-white text-sm font-medium whitespace-nowrap">Swipe to explore</p>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
