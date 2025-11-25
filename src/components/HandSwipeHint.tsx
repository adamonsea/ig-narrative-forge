import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Pointer } from 'lucide-react';

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
          <motion.div
            animate={{ 
              x: [0, 30, 0],
              y: [0, -5, 0],
              rotate: [-15, 15, -15]
            }}
            transition={{ 
              duration: 1.2, 
              repeat: Infinity, 
              ease: "easeInOut" 
            }}
          >
            <div className="bg-white rounded-full p-3 shadow-lg border-2 border-black">
              <Pointer className="w-8 h-8 text-black" />
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
