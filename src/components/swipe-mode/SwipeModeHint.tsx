import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Heart, X } from 'lucide-react';

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
          {/* Simple text hint with icons */}
          <div className="flex flex-col items-center gap-6 bg-background/95 backdrop-blur-sm px-8 py-6 rounded-2xl border-2 shadow-2xl max-w-[90vw]">
            <p className="text-lg font-semibold text-center">
              Swipe to Sort Stories
            </p>
            
            <div className="flex items-center gap-8">
              {/* Discard Left */}
              <motion.div
                animate={{ 
                  x: [-20, -40, -20],
                  rotateZ: [-8, -15, -8]
                }}
                transition={{ 
                  duration: 1.5,
                  ease: "easeInOut",
                  repeat: Infinity
                }}
                className="flex flex-col items-center gap-2"
              >
                <div className="bg-destructive/20 p-4 rounded-full">
                  <X className="w-8 h-8 text-destructive" strokeWidth={3} />
                </div>
                <span className="text-sm font-medium text-destructive">Pass</span>
              </motion.div>

              {/* Like Right */}
              <motion.div
                animate={{ 
                  x: [20, 40, 20],
                  rotateZ: [8, 15, 8]
                }}
                transition={{ 
                  duration: 1.5,
                  ease: "easeInOut",
                  repeat: Infinity,
                  delay: 0.75
                }}
                className="flex flex-col items-center gap-2"
              >
                <div className="bg-green-500/20 p-4 rounded-full">
                  <Heart className="w-8 h-8 text-green-500 fill-green-500" strokeWidth={3} />
                </div>
                <span className="text-sm font-medium text-green-600 dark:text-green-500">Like</span>
              </motion.div>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
