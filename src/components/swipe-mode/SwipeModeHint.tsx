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
          {/* Discard Left Animation */}
          <motion.div
            animate={{ 
              x: [-150, -300],
              y: [0, 10],
              rotateZ: [0, -12],
              opacity: [1, 0]
            }}
            transition={{ 
              duration: 1,
              ease: "easeOut",
              delay: 0
            }}
            className="absolute bg-card border-2 shadow-xl px-8 py-12 rounded-2xl w-64"
          >
            <motion.div
              animate={{ scale: [1, 1.2, 1] }}
              transition={{ duration: 0.5, repeat: 1 }}
              className="absolute top-4 right-4 bg-destructive/20 p-3 rounded-full"
            >
              <X className="w-6 h-6 text-destructive" strokeWidth={3} />
            </motion.div>
          </motion.div>

          {/* Like Right Animation */}
          <motion.div
            animate={{ 
              x: [150, 300],
              y: [0, 10],
              rotateZ: [0, 12],
              opacity: [1, 0]
            }}
            transition={{ 
              duration: 1,
              ease: "easeOut",
              delay: 1.2
            }}
            className="absolute bg-card border-2 shadow-xl px-8 py-12 rounded-2xl w-64"
          >
            <motion.div
              animate={{ scale: [1, 1.2, 1] }}
              transition={{ duration: 0.5, repeat: 1, delay: 1.2 }}
              className="absolute top-4 right-4 bg-green-500/20 p-3 rounded-full"
            >
              <Heart className="w-6 h-6 text-green-500 fill-green-500" strokeWidth={3} />
            </motion.div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
