import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Hand } from 'lucide-react';

export const SwipeModeHint = () => {
  const [show, setShow] = useState(true);

  useEffect(() => {
    // Auto-dismiss after 2 seconds
    const timer = setTimeout(() => {
      setShow(false);
    }, 2000);

    return () => clearTimeout(timer);
  }, []);

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="absolute inset-0 z-50 flex items-center justify-center pointer-events-none"
        >
          <motion.div
            animate={{ 
              x: [-50, 50, 0],
              opacity: [1, 1, 0]
            }}
            transition={{ 
              duration: 1.5,
              ease: "easeInOut",
              times: [0, 0.5, 1]
            }}
            className="flex items-center gap-2 bg-background/90 backdrop-blur-sm px-6 py-3 rounded-full border shadow-lg"
          >
            <Hand className="w-5 h-5 text-muted-foreground" />
            <span className="text-sm font-medium text-muted-foreground">Swipe to like or discard</span>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
